// Structured events - the runner (the pure half: src/events/model.js; the
// design: docs/DESIGN - STRUCTURED EVENTS.md). The event lives in the chat
// document (doc.event; finished ones in doc.eventsDone; planned ones waiting
// for their day in doc.eventsComing). The director's briefing calls
// eventForBriefing() before it writes - which starts an event whose day has
// come and moves the event on when its stage ended in an earlier reply -
// eventAfterMove() once the scene has moved (a crawl's room), and
// eventAfterFight() once the fight is known. The user plans, starts and
// steps in from the GM Plan tab. No model calls of its own (a generated
// event is src/events/generate.js, one call when it is made).

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { addHappening } from '../planner/model.js';
import {
    arenaFromSetup, startEvent, beginReply, afterFight, afterMove, markStage, isRunning, normalizeEvent, currentStage, rooms,
    waitToSet, setWaitUntil, roomToWatch, setRoomTrigger, scheduleOn, KIND_LABEL,
} from './model.js';

export const EVENTS_EVENT = 'scenario_builder_events_changed';

function emit(chatKey) {
    try {
        SillyTavern.getContext().eventSource.emit(EVENTS_EVENT, chatKey);
    } catch {
        // No event bus (tests).
    }
}

export const getEvent = (chatKey) => getChatDoc(chatKey).event;
export const getComingEvents = (chatKey) => getChatDoc(chatKey).eventsComing;

// Writes the chat's event; a finished one makes way (kept in eventsDone).
function save(chatKey, event, { retire = false } = {}) {
    updateChatDoc(chatKey, (d) => {
        if (retire && d.event && !isRunning(d.event) && d.event.status !== 'planned') d.eventsDone = [...d.eventsDone, d.event];
        d.event = event;
    });
    emit(chatKey);
    return getChatDoc(chatKey).event;
}

// An event set up (from src/events/model.js's setups), not yet begun.
// startDay: the story's day it begins by itself - it waits in eventsComing
// and is on the calendar's agenda; without one it replaces a plan (never a
// running event) and the user starts it.
export function planEvent(chatKey, event, { startDay = null } = {}) {
    const e = normalizeEvent(event);
    if (!e || e.status !== 'planned') throw new Error('That event has nothing in it to run.');
    if (Number.isInteger(startDay) && startDay > 0) {
        const dated = scheduleOn(e, startDay);
        updateChatDoc(chatKey, (d) => {
            d.eventsComing = [...d.eventsComing.filter((x) => x.id !== dated.id), dated];
            d.gm.agenda = d.gm.agenda.filter((x) => x.source !== `event:${dated.id}`);
            addHappening(d.gm, { id: newLocalId('ag'), day: startDay, text: `${dated.name} begins (a ${KIND_LABEL[dated.kind]})`, source: `event:${dated.id}` });
        });
        emit(chatKey);
        return dated;
    }
    if (isRunning(getEvent(chatKey))) throw new Error('An event is under way - end it first.');
    return save(chatKey, e, { retire: true });
}

// An arena set up, not yet begun (replaces a plan; never a running event).
// setup: { name, placeId, opponents: [{ name, objectId }], intro, close, prize }.
export function planArena(chatKey, setup) {
    if (isRunning(getEvent(chatKey))) throw new Error('An event is under way - end it first.');
    const event = arenaFromSetup(setup);
    if (!event) throw new Error('An arena needs at least one opponent.');
    return save(chatKey, event, { retire: true });
}

export function startPlannedEvent(chatKey) {
    const doc = getChatDoc(chatKey);
    if (doc.event?.status !== 'planned') return doc.event;
    return save(chatKey, startEvent(doc.event, doc.turn));
}

export function discardPlannedEvent(chatKey) {
    if (getEvent(chatKey)?.status === 'planned') save(chatKey, null);
}

function dropAgenda(d, id) {
    d.gm.agenda = d.gm.agenda.map((x) => (x.source === `event:${id}` && (x.status === 'coming' || x.status === 'planned') ? { ...x, status: 'done' } : x));
}

// A coming event taken off the calendar.
export function removeComingEvent(chatKey, id) {
    updateChatDoc(chatKey, (d) => {
        d.eventsComing = d.eventsComing.filter((x) => x.id !== id);
        d.gm.agenda = d.gm.agenda.filter((x) => x.source !== `event:${id}`);
    });
    emit(chatKey);
}

// A coming event begun now instead of on its day.
export function startComingNow(chatKey, id) {
    const doc = getChatDoc(chatKey);
    const e = doc.eventsComing.find((x) => x.id === id);
    if (!e) return null;
    if (isRunning(doc.event)) throw new Error('An event is under way - end it first.');
    updateChatDoc(chatKey, (d) => { d.eventsComing = d.eventsComing.filter((x) => x.id !== id); dropAgenda(d, id); });
    save(chatKey, e, { retire: true });
    return startPlannedEvent(chatKey);
}

// The user's hand: 'won' | 'lost' | 'skip' | 'end'.
export function markEventStage(chatKey, action) {
    const doc = getChatDoc(chatKey);
    return save(chatKey, markStage(doc.event, action, doc.turn));
}

// The crawl room the scene is in: the location itself, or the nearest room
// it is inside (a niche in the crypt). -> a room's placeId or ''.
export function roomOf(event, locationId, parents = {}) {
    if (!locationId) return '';
    const ids = new Set(rooms(event).map((r) => r.placeId));
    for (let id = locationId, n = 0; id && n < 20; id = parents[id], n++) if (ids.has(id)) return id;
    return '';
}

// The rooms reachable from a crawl's room: by the setting's routes between
// its rooms, else the rooms before and after it in the list.
export function waysFrom(event, placeId, routes = []) {
    const list = rooms(event);
    const ids = new Set(list.map((r) => r.placeId));
    const linked = (routes ?? []).filter((r) => (r.from === placeId && ids.has(r.to)) || (r.to === placeId && ids.has(r.from)))
        .map((r) => (r.from === placeId ? r.to : r.from));
    if (linked.length) return [...new Set(linked)];
    const at = list.findIndex((r) => r.placeId === placeId);
    return at < 0 ? [] : [list[at - 1], list[at + 1]].filter(Boolean).map((r) => r.placeId);
}

async function library() {
    return import('../library/library.js');
}

// A planned event whose day has come begins (when no other is under way or
// waiting to be started by the user).
function startDue(chatKey) {
    const doc = getChatDoc(chatKey);
    if (isRunning(doc.event) || doc.event?.status === 'planned') return;
    const due = doc.eventsComing.find((e) => Number.isInteger(e.startDay) && e.startDay <= doc.canonical.day);
    if (!due) return;
    updateChatDoc(chatKey, (d) => { d.eventsComing = d.eventsComing.filter((x) => x.id !== due.id); dropAgenda(d, due.id); });
    save(chatKey, startEvent(due, doc.turn), { retire: true });
    console.info(LOG_PREFIX, `${due.name} begins: its day has come`);
}

// Before a briefing: the event as this reply begins - a dated one started,
// a wait's end on the calendar worked out, a crawl's room found from the
// scene and its puzzle watched (a story trigger). -> the event or null.
export async function eventForBriefing(chatId, chatKey, settingId = null) {
    try {
        startDue(chatKey);
        const doc = getChatDoc(chatKey);
        if (!isRunning(doc.event)) return doc.event;
        const ctx = { now: Number.isFinite(doc.canonical.time) ? doc.canonical.time : null };
        if (doc.event.kind === 'crawl') {
            const lib = settingId ? await library() : null;
            ctx.roomId = roomOf(doc.event, doc.canonical.locationId, lib ? lib.getParents(settingId) : {});
            ctx.fired = doc.gm.triggers.filter((t) => t.status === 'fired' || t.status === 'done').map((t) => t.id);
        }
        let next = beginReply(doc.event, doc.turn, ctx);
        if (waitToSet(next)) {
            let until = null;
            if (settingId && Number.isFinite(ctx.now)) {
                const { momentAfter } = await import('../calendar/clock.js');
                until = await momentAfter(settingId, ctx.now, waitToSet(next).waitFor).catch(() => null);
            }
            // Unreadable: it ends with the next reply.
            next = setWaitUntil(next, until ?? ctx.now);
        }
        next = await watchRoom(chatId, chatKey, next);
        if (JSON.stringify(next) !== JSON.stringify(normalizeEvent(doc.event))) save(chatKey, next);
        return next;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not move the event on', err);
        return getChatDoc(chatKey).event;
    }
}

// A crawl room with a puzzle or trap: a story trigger watches for it.
async function watchRoom(chatId, chatKey, event) {
    const room = roomToWatch(event);
    if (!room || !chatId) return event;
    const { armTrigger } = await import('../triggers/run.js');
    const t = await armTrigger(chatId, chatKey, { kind: 'story', when: room.clearWhen, then: `That clears ${room.title} of ${event.name}: the way on is open.`, source: 'event' });
    return t ? setRoomTrigger(event, t.id) : event;
}

// After the briefing moved the scene: a crawl's room follows it, so the
// narrator hears what waits in a room entered in this reply.
export async function eventAfterMove(chatId, chatKey, settingId) {
    try {
        const doc = getChatDoc(chatKey);
        if (!isRunning(doc.event) || doc.event.kind !== 'crawl' || !settingId) return;
        const lib = await library();
        let next = afterMove(doc.event, doc.turn, roomOf(doc.event, doc.canonical.locationId, lib.getParents(settingId)));
        next = await watchRoom(chatId, chatKey, next);
        if (JSON.stringify(next) !== JSON.stringify(normalizeEvent(doc.event))) save(chatKey, next);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not follow the move in the event', err);
    }
}

// The ways on from a crawl's room, for the director (stage placeIds).
export async function eventWays(settingId, event) {
    const s = currentStage(event);
    if (event?.kind !== 'crawl' || !s || !settingId) return [];
    const { listRoutes } = await import('../library/routes.js');
    return waysFrom(event, s.placeId, listRoutes(settingId));
}

// After a briefing: a bout (or a room's foes) decided by the fight.
export function eventAfterFight(chatKey, fight) {
    const doc = getChatDoc(chatKey);
    if (!isRunning(doc.event)) return;
    const next = afterFight(doc.event, fight, doc.turn);
    if (JSON.stringify(next) !== JSON.stringify(normalizeEvent(doc.event))) save(chatKey, next);
}

// A crawl's rooms that are not places yet (a generated crawl, or names typed
// in): made as locations inside the dungeon, joined by routes in the order
// given (or as `leadsTo` says). rooms: [{ placeId, name, leadsTo: [name] }].
// -> the rooms with their placeIds. Throws when the setting is fixed canon.
export async function makeRooms(chatId, settingId, dungeonId, rooms) {
    const lib = await library();
    const { addRoute, routeBetween, listRoutes } = await import('../library/routes.js');
    const missing = rooms.filter((r) => !r.placeId && String(r.name ?? '').trim());
    if (missing.length && lib.isCanonOnly(settingId)) throw new Error('This setting is fixed canon: the rooms must be places it already has.');
    const out = [];
    for (const r of rooms) {
        if (r.placeId || !String(r.name ?? '').trim()) { out.push(r); continue; }
        const hit = (await lib.findSimilar(chatId, settingId, 'location', r.name).catch(() => []))[0];
        const parents = lib.getParents(settingId);
        if (hit && (!dungeonId || parents[hit.id] === dungeonId)) { out.push({ ...r, placeId: hit.id }); continue; }
        const made = await lib.createEntry(chatId, settingId, 'location', { name: r.name, description: r.note || '' }, { origin: 'director' });
        if (!made) throw new Error(`State Engine would not make the room "${r.name}".`);
        if (dungeonId) lib.setParent(settingId, made.id, dungeonId);
        out.push({ ...r, placeId: made.id });
    }
    const byName = new Map(out.map((r) => [String(r.name ?? '').trim().toLowerCase(), r.placeId]));
    const link = (a, b) => {
        if (a && b && a !== b && !routeBetween(a, b, listRoutes(settingId))) addRoute(settingId, { from: a, to: b, travel: 'a minute', note: 'a passage' });
    };
    const anyWays = out.some((r) => (r.leadsTo ?? []).length);
    for (const [i, r] of out.entries()) {
        if (!missing.includes(rooms[i])) continue;
        if (anyWays) for (const n of r.leadsTo ?? []) link(r.placeId, byName.get(String(n).trim().toLowerCase()));
        else if (i > 0) link(out[i - 1].placeId, r.placeId);
    }
    return out;
}
