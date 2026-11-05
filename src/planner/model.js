// The GM planner - the pure half (docs/DESIGN - GM PLANNER.md). The data
// the planner keeps per chat (chat document `gm`), the user's guidance
// queue, the pace signals and aim (§6.1), which background passes are due
// (§4), and the private GM PLAN section the director reads (§6). No
// SillyTavern imports, so all of it is unit-tested.
//
// gm: {
//   day: { day, madeAt, madeTurn, moments: [moment], agendas: [{ who, wants, will, hidden }],
//          offscreen: [text] } | null          the plan for one in-game day
//     moment = { id, text, when, trigger, ties: [name], source, droppable,
//                status: 'pending' | 'done' | 'skipped', note }
//   queue: [{ id, text, urgency: 'soon' | 'today' | 'whenever', status: 'waiting' |
//             'planned' | 'done' | 'withdrawn', at, plannedAs: [momentId], doneAt }]
//   inspirations: [{ id, title, text, motifs: [text], at, error }]
//   log: [{ pass, at, ms, outcome, error }]     the last LOG_LIMIT passes
//   counters: { sinceCheck, turn, lastCheck }   replies since the last CHECK; replies seen;
//                                               when the last CHECK or DAY pass ran (ISO)
//   pace: { sceneKey, sceneReplies, idleReplies, baselineWords, hold }
//   checkWanted                                 a beat was skipped: CHECK on the next pass
//   peeked: [momentId]                          spoilers the user looked at one by one
//   shape                                       story shape id (src/planner/shapes.js); '' = none chosen
//   outline: { premise, themes: [text], acts: [{ id, title, beats: [beat] }],
//              seeds: [seed], updatedAt, madeTurn } | null
//     seed = { id, text, payoff, status: 'open' | 'planted' | 'dropped', plantedAt }
//              plantedAt: the chat index of the reply that planted it (-1 not known)
//     beat = { id, text, ties: [name], status: 'pending' | 'active' | 'done' | 'skipped',
//              locked, by: 'planner' | 'user', note, since, doneAt }
//              since: the chat index it was under way from (-1 not known);
//              doneAt: the chat index of the message it was called done at
//              (-1 not known, or the user's call)
//   tension: [{ at, index, threat, uncertainty, emotional, overall, reason, source }]
//                                               readings, oldest first (Archivist's, or the
//                                               planner's own without it); the last TENSION_LIMIT
//   outlineWanted                               Archivist compiled: OUTLINE on the next pass
//   volume: { number, startedTurn, startedDay, startedIndex, direction,
//             chronicle: [{ at, day, text }] }  the volume under way (§5.1): where it began
//                                               (reply count, in-game day, message index), the
//                                               user's steer for its first outline, and one line
//                                               per beat or moment the story played out
//   volumes: [{ number, title, shape, premise, themes, recap, threads: [text],
//               beats: [{ text, status }], startedTurn, endedTurn, startedDay, endedDay,
//               startedIndex, endedIndex, endedAt, closedEarly, editedByUser }]
//                                               finished volumes, oldest first
//   ideas: [idea]                               the IDEAS pass's proposals (§3.4)
//     idea = { id, kind: 'quest' | 'enrich' | 'happening' | 'seed', name, text, why,
//              ties: [name], target (enrich: the quest's name), objectives: [text],
//              inDays and when (happening), status: 'proposed' | 'accepted' | 'dismissed', at }
//   dismissedIdeas: [key]                       ideas the user turned down: never proposed again
//   agenda: [{ id, day, when, text, ties, source, status: 'coming' | 'planned' | 'done' | 'passed', at, late }]
//                                               dated happenings (§3.3): `day` is the story's
//                                               day count (canonical.day); source 'promise':
//                                               set by the story (SET lines); late: the days
//                                               it has been put off
//   join: { act, note }                         a story already under way: the chapter (act
//                                               index, -1 = let the planner judge) it is in
//                                               now, and the user's note on the story so far
//   world                                       the world meanwhile (src/world/model.js)
// }
import { normalizeTriggers, triggerLines } from '../triggers/model.js';
import { emptyWorld, normalizeWorld } from '../world/model.js';

export const URGENCIES = Object.freeze([['soon', 'Soon'], ['today', 'Today'], ['whenever', 'Whenever it fits']]);
export const LEVELS = Object.freeze([['light', 'Light'], ['moderate', 'Moderate'], ['heavy', 'Heavy']]);
export const PACINGS = Object.freeze([['off', 'Off'], ['gentle', 'Gentle'], ['brisk', 'Brisk'], ['fast', 'Fast']]);

// Background passes per level (§4): CHECK every n replies (0: only when
// the director reports a skipped beat); a day plan is re-made as "the rest
// of the day" after dayExpire replies; OUTLINE every n replies (0: on
// demand), and after Archivist compiles (compile).
export const LEVEL_CADENCE = Object.freeze({
    light: { check: 0, dayExpire: 40, outline: 0, compile: false, ideas: 0 },
    moderate: { check: 3, dayExpire: 25, outline: 15, compile: true, ideas: 20 },
    heavy: { check: 1, dayExpire: 15, outline: 8, compile: true, ideas: 10 },
});
// The first outline once the story has had this many replies to show what
// it is about (or on demand).
export const FIRST_OUTLINE_AFTER = 5;

const LOG_LIMIT = 30;
const QUEUE_DONE_LIMIT = 20;
const INSPIRATION_LIMIT = 12;
const INSPIRATION_CHARS = 12000;
const MOMENT_LIMIT = 8;
const BEAT_LIMIT = 10;
const TENSION_LIMIT = 50;
const BEAT_STATUSES = ['pending', 'active', 'done', 'skipped'];

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const clean = (v) => str(v).replace(/\s+/g, ' ').trim();
// Text with its paragraphs kept (a blank line between them): a volume's steer.
const paragraphs = (v) => str(v).replace(/\r/g, '').split(/\n\s*\n/).map(clean).filter(Boolean).join('\n\n');
const strList = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
const int = (v, fallback = 0) => (Number.isInteger(v) && v >= 0 ? v : fallback);
// A chat index, or -1 when not known.
const chatIndex = (v) => int(v, -1);

export function emptyGm() {
    return {
        day: null, queue: [], inspirations: [], log: [],
        counters: { sinceCheck: 0, turn: 0, lastCheck: '', sinceOutline: 0, lastCompiled: '', sinceIdeas: 0 },
        pace: emptyPace(),
        checkWanted: false,
        peeked: [],
        shape: '',
        outline: null,
        tension: [],
        outlineWanted: false,
        triggers: [],
        join: { act: -1, note: '' },
        volume: emptyVolume(1),
        volumes: [],
        ideas: [],
        dismissedIdeas: [],
        agenda: [],
        world: emptyWorld(),
        newcomer: null,
        settled: [],
    };
}

function emptyPace() {
    return { sceneKey: '', sceneReplies: 0, idleReplies: 0, baselineWords: 0, hold: false };
}

function normalizeMoment(m, i) {
    if (!isObject(m) || !clean(m.text)) return null;
    return {
        id: clean(m.id) || `m${i + 1}`,
        text: clean(m.text),
        when: clean(m.when),
        trigger: clean(m.trigger),
        ties: strList(m.ties),
        source: clean(m.source),
        droppable: m.droppable !== false,
        status: ['pending', 'done', 'skipped'].includes(m.status) ? m.status : 'pending',
        note: clean(m.note),
    };
}

function normalizeDay(d) {
    if (!isObject(d) || !Number.isInteger(d.day)) return null;
    return {
        day: d.day,
        madeAt: str(d.madeAt),
        madeTurn: int(d.madeTurn),
        // The outline's beat when the plan was made: a new beat makes the
        // rest of the day again (duePasses).
        beatId: str(d.beatId),
        moments: (Array.isArray(d.moments) ? d.moments : []).map(normalizeMoment).filter(Boolean).slice(0, MOMENT_LIMIT),
        agendas: (Array.isArray(d.agendas) ? d.agendas : []).filter((a) => isObject(a) && clean(a.who))
            .map((a) => ({ who: clean(a.who), wants: clean(a.wants), will: clean(a.will), hidden: clean(a.hidden) })).slice(0, 8),
        offscreen: strList(d.offscreen).slice(0, 6),
    };
}

function normalizeRequest(r) {
    if (!isObject(r) || !clean(r.text) || !clean(r.id)) return null;
    return {
        id: clean(r.id),
        text: clean(r.text).slice(0, 500),
        urgency: URGENCIES.some(([u]) => u === r.urgency) ? r.urgency : 'whenever',
        status: ['waiting', 'planned', 'done', 'withdrawn'].includes(r.status) ? r.status : 'waiting',
        at: str(r.at),
        plannedAs: strList(r.plannedAs),
        doneAt: str(r.doneAt),
    };
}

function normalizeInspiration(x) {
    if (!isObject(x) || !clean(x.id) || !str(x.text).trim()) return null;
    return { id: clean(x.id), title: clean(x.title), text: str(x.text).slice(0, INSPIRATION_CHARS), motifs: strList(x.motifs).slice(0, 12), at: str(x.at), error: clean(x.error) };
}

export function normalizeGm(value) {
    const g = isObject(value) ? value : {};
    const p = isObject(g.pace) ? g.pace : {};
    const c = isObject(g.counters) ? g.counters : {};
    const queue = (Array.isArray(g.queue) ? g.queue : []).map(normalizeRequest).filter(Boolean);
    return {
        day: normalizeDay(g.day),
        queue: trimQueue(queue),
        inspirations: (Array.isArray(g.inspirations) ? g.inspirations : []).map(normalizeInspiration).filter(Boolean).slice(0, INSPIRATION_LIMIT),
        log: (Array.isArray(g.log) ? g.log : []).filter((l) => isObject(l) && clean(l.pass)).slice(-LOG_LIMIT),
        counters: { sinceCheck: int(c.sinceCheck), turn: int(c.turn), lastCheck: str(c.lastCheck), sinceOutline: int(c.sinceOutline), lastCompiled: str(c.lastCompiled), sinceIdeas: int(c.sinceIdeas) },
        pace: { sceneKey: str(p.sceneKey), sceneReplies: int(p.sceneReplies), idleReplies: int(p.idleReplies), baselineWords: Number.isFinite(p.baselineWords) && p.baselineWords > 0 ? p.baselineWords : 0, hold: p.hold === true },
        checkWanted: g.checkWanted === true,
        peeked: strList(g.peeked).slice(-40),
        shape: clean(g.shape),
        outline: normalizeOutline(g.outline),
        tension: (Array.isArray(g.tension) ? g.tension : []).map(normalizeReading).filter(Boolean).slice(-TENSION_LIMIT),
        outlineWanted: g.outlineWanted === true,
        join: { act: Number.isInteger(g.join?.act) && g.join.act >= 0 ? g.join.act : -1, note: str(g.join?.note).trim().slice(0, 4000) },
        volume: normalizeVolume(g.volume),
        volumes: (Array.isArray(g.volumes) ? g.volumes : []).map(normalizeVolumeRecord).filter(Boolean),
        ideas: trimIdeas((Array.isArray(g.ideas) ? g.ideas : []).map(normalizeIdea).filter(Boolean)),
        dismissedIdeas: strList(g.dismissedIdeas).slice(-DISMISSED_LIMIT),
        agenda: trimAgenda((Array.isArray(g.agenda) ? g.agenda : []).map(normalizeHappening).filter(Boolean)),
        // Story triggers (src/triggers/): conditions watched through State Engine variables.
        triggers: normalizeTriggers(g.triggers),
        // The world meanwhile (src/world/model.js): schemes off scene.
        world: normalizeWorld(g.world),
        // The active beat's newcomer still awaited: since which turn.
        newcomer: isObject(g.newcomer) && clean(g.newcomer.beatId) ? { beatId: clean(g.newcomer.beatId), since: int(g.newcomer.since) } : null,
        // What the story has settled (settledSection).
        settled: (Array.isArray(g.settled) ? g.settled : []).map(normalizeSettled).filter(Boolean).slice(-SETTLED_LIMIT),
    };
}

function normalizeBeat(b, i) {
    if (!isObject(b) || !clean(b.text)) return null;
    return {
        id: clean(b.id) || `b${i + 1}`,
        text: clean(b.text).slice(0, 400),
        ties: strList(b.ties).slice(0, 6),
        status: BEAT_STATUSES.includes(b.status) ? b.status : 'pending',
        locked: b.locked === true,
        by: b.by === 'user' ? 'user' : 'planner',
        note: clean(b.note),
        since: chatIndex(b.since),
        doneAt: chatIndex(b.doneAt),
    };
}

const SEED_LIMIT = 8;
const SEED_STATUSES = Object.freeze(['open', 'planted', 'dropped']);

function normalizeSeed(x, i) {
    return {
        id: clean(x.id) || `s${i + 1}`,
        text: clean(x.text),
        payoff: clean(x.payoff),
        status: SEED_STATUSES.includes(x.status) ? x.status : 'open',
        plantedAt: chatIndex(x.plantedAt),
    };
}

// The outline's seeds with new ones added: an outline review keeps every
// seed it had (an accepted seed idea is the user's) and what became of it,
// adds those it has not got, and lets the oldest settled ones go first.
function mergeSeeds(old, fresh) {
    const out = old.map((x, i) => normalizeSeed(x, i));
    let n = out.reduce((top, x) => Math.max(top, Number(/^s(\d+)$/.exec(x.id)?.[1] ?? 0)), 0);
    for (const x of fresh) {
        if (!isObject(x) || !clean(x.text) || out.some((o) => sameBeat(o.text, x.text))) continue;
        out.push(normalizeSeed({ text: x.text, payoff: x.payoff, id: `s${++n}` }, 0));
    }
    while (out.length > SEED_LIMIT) {
        const gone = out.findIndex((x) => x.status !== 'open');
        out.splice(gone >= 0 ? gone : 0, 1);
    }
    return out;
}

function normalizeOutline(o) {
    if (!isObject(o) || !Array.isArray(o.acts)) return null;
    let n = 0;
    const acts = o.acts.filter(isObject).map((a, i) => ({
        id: clean(a.id) || `a${i + 1}`,
        title: clean(a.title),
        beats: (Array.isArray(a.beats) ? a.beats : []).map((b) => normalizeBeat(b, n++)).filter(Boolean).slice(0, BEAT_LIMIT),
    }));
    if (!acts.length) return null;
    return {
        premise: clean(o.premise).slice(0, 1200),
        themes: strList(o.themes).slice(0, 8),
        acts,
        seeds: (Array.isArray(o.seeds) ? o.seeds : []).filter((x) => isObject(x) && clean(x.text))
            .map((x, i) => normalizeSeed(x, i)).slice(0, SEED_LIMIT),
        updatedAt: str(o.updatedAt),
        madeTurn: int(o.madeTurn),
    };
}

const score = (v) => (Number.isFinite(v) ? Math.round(Math.min(5, Math.max(0, v)) * 10) / 10 : null);

function normalizeReading(r) {
    if (!isObject(r)) return null;
    const parts = { threat: score(r.threat), uncertainty: score(r.uncertainty), emotional: score(r.emotional) };
    const known = Object.values(parts).filter((v) => v !== null);
    const overall = score(r.overall) ?? (known.length ? score(known.reduce((a, b) => a + b, 0) / known.length) : null);
    if (overall === null) return null;
    return { at: str(r.at), index: Number.isInteger(r.index) ? r.index : null, ...parts, overall, reason: clean(r.reason).slice(0, 300), source: r.source === 'archivist' ? 'archivist' : 'planner' };
}

// Finished and withdrawn requests are kept a while, then dropped.
function trimQueue(queue) {
    const open = queue.filter((r) => r.status === 'waiting' || r.status === 'planned');
    const closed = queue.filter((r) => r.status === 'done' || r.status === 'withdrawn').slice(-QUEUE_DONE_LIMIT);
    return queue.filter((r) => open.includes(r) || closed.includes(r));
}

export function addLog(gm, entry) {
    gm.log = [...gm.log, { pass: entry.pass, at: entry.at ?? new Date().toISOString(), ms: entry.ms ?? 0, outcome: clean(entry.outcome), error: clean(entry.error) }].slice(-LOG_LIMIT);
}

// ---------------------------------------------------------------- queue

export function addRequest(gm, { id, text, urgency = 'whenever', at = '' }) {
    const r = normalizeRequest({ id, text, urgency, at, status: 'waiting' });
    if (r) gm.queue = trimQueue([...gm.queue, r]);
    return r;
}

// The user takes a moment, an agenda or an off-screen line out of
// today's plan. A request the moment answered waits again once nothing in
// the plan answers it. -> true if gone.
export function removeFromDay(gm, kind, key) {
    const day = gm.day;
    if (!day) return false;
    if (kind === 'moment') {
        if (!day.moments.some((m) => m.id === key)) return false;
        day.moments = day.moments.filter((m) => m.id !== key);
        for (const r of gm.queue) {
            if (r.status !== 'planned' || !r.plannedAs?.includes(key)) continue;
            r.plannedAs = r.plannedAs.filter((id) => id !== key);
            if (!r.plannedAs.length) r.status = 'waiting';
        }
        return true;
    }
    const field = kind === 'agenda' ? 'agendas' : kind === 'offscreen' ? 'offscreen' : '';
    if (!field || !day[field]?.[key]) return false;
    day[field] = day[field].filter((_, i) => i !== key);
    return true;
}

export function setRequestStatus(gm, id, status, extra = {}) {
    gm.queue = trimQueue(gm.queue.map((r) => (r.id === id ? { ...r, status, ...extra } : r)));
}

export const openRequests = (gm) => gm.queue.filter((r) => r.status === 'waiting' || r.status === 'planned');
export const waitingRequests = (gm) => gm.queue.filter((r) => r.status === 'waiting');

// A request is done when every moment planned for it is done (any one
// done is enough when the others were skipped).
export function settleRequests(gm) {
    const byId = new Map((gm.day?.moments ?? []).map((m) => [m.id, m]));
    for (const r of gm.queue) {
        if (r.status !== 'planned' || !r.plannedAs.length) continue;
        const moments = r.plannedAs.map((id) => byId.get(id)).filter(Boolean);
        // The day it was planned for has gone: back in the queue.
        if (!moments.length) { r.status = 'waiting'; r.plannedAs = []; continue; }
        if (moments.some((m) => m.status === 'done') && moments.every((m) => m.status !== 'pending')) { r.status = 'done'; r.doneAt = new Date().toISOString(); }
        else if (moments.every((m) => m.status === 'skipped')) { r.status = 'waiting'; r.plannedAs = []; }
    }
}

// ---------------------------------------------------------------- day plan

// Takes a DAY pass's answer in as the day's plan. Requests it planned for
// are marked; ids are the planner's own (m1, m2...).
export function setDayPlan(gm, plan, { day, turn, at = new Date().toISOString() }) {
    const moments = (plan.moments ?? []).map((m, i) => normalizeMoment({ ...m, id: `m${i + 1}`, status: 'pending', source: m.happening && gm.agenda.some((x) => x.id === m.happening) ? `agenda:${m.happening}` : m.source }, i)).filter(Boolean).slice(0, MOMENT_LIMIT);
    gm.day = normalizeDay({ day, madeAt: at, madeTurn: turn, beatId: activeBeat(gm.outline)?.id ?? '', moments, agendas: plan.agendas, offscreen: plan.offscreen });
    // Requests planned for an earlier day that never happened wait again.
    for (const r of gm.queue) if (r.status === 'planned') { r.status = 'waiting'; r.plannedAs = []; }
    planRequests(gm, plan.requests, moments);
    // What the story set for today, or keeps putting off, is in the day
    // whether the plan made room for it or not: a plan written around the
    // latest chat left Adam's promised test out and sent Vex instead.
    const linked = new Set(gm.day.moments.map((m) => m.source));
    const missing = dueToday(gm, day).filter((x) => !linked.has(`agenda:${x.id}`));
    for (const x of missing) {
        const n = gm.day.moments.length;
        const m = normalizeMoment({ id: `m${n + 1}`, text: x.text, when: x.when || 'any time', ties: x.ties, source: `agenda:${x.id}`, droppable: false }, n);
        if (m) gm.day.moments.push(m);
    }
    if (missing.length) settleAgenda(gm);
    gm.peeked = [];
}

// [{ request: id, moments: [index from 1] }] -> requests marked planned.
function planRequests(gm, requests, moments) {
    for (const link of requests ?? []) {
        const r = gm.queue.find((x) => x.id === clean(link?.request) && x.status === 'waiting');
        const ids = (Array.isArray(link?.moments) ? link.moments : []).map((n) => moments[Number(n) - 1]?.id).filter(Boolean);
        if (r && ids.length) { r.status = 'planned'; r.plannedAs = ids; }
    }
}

// The names in `ties` the texts never show: none of a name's words (three
// letters or more) stands in them as a word. The player's own name aside.
// A moment can't have played out with someone in it who never turned up,
// and a beat's person no message names is still to come into the story.
const NAME_WORD = /[\p{L}\p{N}'’-]{3,}/gu;
const NOT_NAME = new Set(['the', 'and', 'of', 'von', 'van', 'del', 'der', 'des']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function unseenTies(ties, texts, player = '') {
    const all = strList(Array.isArray(texts) ? texts : [texts]).join('\n');
    const own = clean(player).toLowerCase();
    return strList(ties).filter((name) => {
        if (own && name.toLowerCase() === own) return false;
        const words = (name.match(NAME_WORD) ?? []).filter((w) => !NOT_NAME.has(w.toLowerCase()));
        if (!words.length) return false;
        return !words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, 'iu').test(all));
    });
}

// A CHECK pass's answer: { done: [id], skipped: [{ id, why }], add: [moment],
// requests: [{ request, moments: [index into add, from 1] }] }. seen: the
// chat the pass read (with `player`); a moment it calls done whose people
// that chat never shows stays pending - the model said so, the story did not.
export function applyCheck(gm, check, { seen = null, player = '' } = {}) {
    if (!gm.day) return;
    const mark = (id, status, note) => {
        const m = gm.day.moments.find((x) => x.id === clean(id));
        if (status === 'done' && m && seen && unseenTies(m.ties, seen, player).length) return;
        if (m && m.status === 'pending') {
            m.status = status;
            if (note) m.note = clean(note);
            if (status === 'done') addChronicle(gm, m.note && !sameBeat(m.note, m.text) ? `${m.text} (${m.note})` : m.text);
        }
    };
    for (const id of check.done ?? []) mark(typeof id === 'object' ? id?.id : id, 'done', typeof id === 'object' ? id?.how : '');
    for (const s of check.skipped ?? []) mark(typeof s === 'object' ? s?.id : s, 'skipped', typeof s === 'object' ? s?.why : '');
    const start = gm.day.moments.length;
    // Never a moment the plan already has, played out or not, in other words.
    const fresh = (check.add ?? []).filter((m, i, all) => clean(m?.text) && !gm.day.moments.some((x) => sameBeat(x.text, m.text))
        && !all.slice(0, i).some((y) => sameBeat(clean(y?.text), m.text)));
    const added = fresh.map((m, i) => normalizeMoment({ ...m, id: `m${start + i + 1}`, status: 'pending' }, start + i)).filter(Boolean);
    gm.day.moments = [...gm.day.moments, ...added].slice(-MOMENT_LIMIT);
    planRequests(gm, check.requests, added);
    settleRequests(gm);
    settleAgenda(gm);
}

// The director's BEAT lines: [{ id, status: 'done' | 'skipped', note }].
// seen: the chat and the director's briefing - a moment done there has
// its people in them (as applyCheck).
// -> true when a beat was skipped (the plan needs a CHECK).
export function applyBeats(gm, beats, { seen = null, player = '', index = -1 } = {}) {
    if (!beats?.length) return false;
    // A seed planted in passing, or one the story has left no room for.
    for (const b of beats.filter((x) => /^s\d+$/i.test(clean(x.id)))) {
        const x = openSeeds(gm).find((o) => o.id.toLowerCase() === clean(b.id).toLowerCase());
        if (!x) continue;
        x.status = b.status === 'done' ? 'planted' : 'dropped';
        x.plantedAt = b.status === 'done' ? chatIndex(index) : -1;
    }
    // A DUE TODAY happening (its agenda id) played out, or no longer able
    // to happen; the day's moment for it goes with it.
    for (const b of beats.filter((x) => /^ag_/i.test(clean(x.id)))) {
        const x = gm.agenda.find((a) => a.id.toLowerCase() === clean(b.id).toLowerCase() && (a.status === 'coming' || a.status === 'planned'));
        if (!x || (b.status === 'done' && seen && unseenTies(x.ties, seen, player).length)) continue;
        x.status = b.status === 'done' ? 'done' : 'passed';
        for (const m of gm.day?.moments ?? []) if (m.source === `agenda:${x.id}` && m.status === 'pending') { m.status = b.status === 'done' ? 'done' : 'skipped'; m.note = clean(b.note); }
        if (x.status === 'done') addChronicle(gm, clean(b.note) && !sameBeat(b.note, x.text) ? `${x.text} (${clean(b.note)})` : x.text);
    }
    if (!gm.day) return false;
    let skipped = false;
    for (const b of beats) {
        const m = gm.day.moments.find((x) => x.id === clean(b.id).toLowerCase());
        if (!m || m.status !== 'pending') continue;
        if (b.status === 'done' && seen && unseenTies(m.ties, seen, player).length) continue;
        m.status = b.status === 'done' ? 'done' : 'skipped';
        m.note = clean(b.note);
        if (m.status === 'skipped') skipped = true;
        else addChronicle(gm, m.note && !sameBeat(m.note, m.text) ? `${m.text} (${m.note})` : m.text);
    }
    settleRequests(gm);
    settleAgenda(gm);
    if (skipped) gm.checkWanted = true;
    return skipped;
}

// ---------------------------------------------------------------- pace (§6.1)

const words = (text) => (str(text).match(/[\p{L}\p{N}']+/gu) ?? []).length;
// Out of character asks to stay: "[stay]", "(ooc: linger here)".
const HOLD = /[[(]\s*(?:ooc\s*:?\s*)?(?:stay|linger|hold|don'?t rush|slow down)\b[^\])]*[\])]/i;

// What the user's post shows: dialogue ("..."), a question, a deliberate
// action.
export function postSignals(text) {
    const t = str(text);
    return {
        words: words(t),
        dialogue: /["“”«»]/.test(t),
        question: /\?/.test(t),
        hold: HOLD.test(t),
    };
}

// Pace bookkeeping after a reply. `scene`: { key } - what identifies the
// scene (place + title); a change starts the count again. `active`: the
// reply changed something (someone came or went, a beat was done, the
// scene moved). `userText`: the user's latest post.
export function trackPace(gm, { sceneKey, active, userText }) {
    const p = gm.pace;
    if (sceneKey !== p.sceneKey) { p.sceneKey = sceneKey; p.sceneReplies = 0; p.idleReplies = 0; p.hold = false; }
    p.sceneReplies += 1;
    p.idleReplies = active ? 0 : p.idleReplies + 1;
    const s = postSignals(userText);
    if (s.hold) p.hold = true;
    if (s.words > 0) p.baselineWords = p.baselineWords ? Math.round((p.baselineWords * 0.8 + s.words * 0.2) * 10) / 10 : s.words;
}

const PACE_RULES = Object.freeze({
    gentle: { idle: 4, passive: 2, longScene: 30 },
    brisk: { idle: 3, passive: 2, longScene: 18 },
    fast: { idle: 2, passive: 1, longScene: 10 },
});

// -> { aim: 'linger' | 'steady' | 'move on', why }
// recentUser: the user's last few posts, oldest first. tense: a fight or
// confrontation is under way (never moved on from). pull: the plan wants
// the story somewhere else or later.
export function paceAim(gm, { level = 'gentle', recentUser = [], tense = false, pull = false } = {}) {
    if (level === 'off') return { aim: 'steady', why: '' };
    const rules = PACE_RULES[level] ?? PACE_RULES.gentle;
    const p = gm.pace;
    if (p.hold) return { aim: 'linger', why: 'the user asked to stay with this scene' };
    const posts = recentUser.map(postSignals);
    const last = posts[posts.length - 1];
    if (!last) return { aim: 'steady', why: '' };
    const base = p.baselineWords || last.words;
    const passive = (s) => !s.dialogue && !s.question && s.words < Math.max(12, base * 0.5);
    let passiveRun = 0;
    for (let i = posts.length - 1; i >= 0 && passive(posts[i]); i--) passiveRun++;
    // The user is in the middle of something: never cut it short.
    if (last.question || last.dialogue || tense) {
        return p.idleReplies < 2 && (last.words >= base * 0.7 || last.dialogue) ? { aim: 'linger', why: 'the user is engaged in the scene' } : { aim: 'steady', why: '' };
    }
    const idle = p.idleReplies >= rules.idle;
    const long = p.sceneReplies >= rules.longScene;
    if (passiveRun >= rules.passive && (idle || long || pull)) {
        return { aim: 'move on', why: [idle ? 'nothing has changed for a while' : '', long ? 'the scene has run long' : '', pull ? 'the plan has something waiting elsewhere or later' : '', 'the user\'s posts are short'].filter(Boolean).join('; ') };
    }
    if (idle && long) return { aim: 'move on', why: 'the scene has run its course' };
    return { aim: 'steady', why: '' };
}

// ---------------------------------------------------------------- cadence (§4)

// Which passes are due after a reply, in the order to run them: OUTLINE
// first (the day plan follows the story's direction), then DAY or CHECK
// (DAY replaces CHECK: a new plan needs no check). OUTLINE only once a
// story shape is chosen.
export function duePasses(gm, { day, turn, level = 'moderate', checkEvery = null, dayExpire = null, outlineEvery = null, ideasEvery: ideasEveryOverride = null } = {}) {
    const cadence = LEVEL_CADENCE[level] ?? LEVEL_CADENCE.moderate;
    const out = [];
    if (gm.shape && !volumeComplete(gm.outline)) {
        const often = Number.isInteger(outlineEvery) ? outlineEvery : cadence.outline;
        if (!gm.outline ? turn >= FIRST_OUTLINE_AFTER
            : (often > 0 && gm.counters.sinceOutline >= often) || (cadence.compile && gm.outlineWanted)) out.push('outline');
    }
    const ideasEvery = Number.isInteger(ideasEveryOverride) ? ideasEveryOverride : cadence.ideas;
    if (ideasEvery > 0 && gm.counters.sinceIdeas >= ideasEvery) out.push('ideas');
    const every = Number.isInteger(checkEvery) ? checkEvery : cadence.check;
    const expire = Number.isInteger(dayExpire) ? dayExpire : cadence.dayExpire;
    if (!gm.day || gm.day.day !== day || (expire > 0 && turn - gm.day.madeTurn >= expire)) return [...out, 'day'];
    // The story moved to a new beat since the plan was made: the rest of
    // the day is planned again around it (Assassins Inc: the plan kept
    // steering to Doc and Galice while the beat was Adam's match between
    // Cyril and Inji).
    if (planBehindBeat(gm)) return [...out, 'day'];
    const pending = gm.day.moments.some((m) => m.status === 'pending');
    // Every moment played out (a day the clock has not left): a fresh plan,
    // not a finished one shown on and on.
    if (gm.day.moments.length && !pending && turn - gm.day.madeTurn >= 2) return [...out, 'day'];
    // A request newer than the last pass: once, not after every reply.
    if (gm.checkWanted || waitingRequests(gm).some((r) => r.at > gm.counters.lastCheck)) return [...out, 'check'];
    if (every > 0 && gm.counters.sinceCheck >= every && pending) return [...out, 'check'];
    return out;
}

// Whether today's plan was made for an earlier beat than the active one.
export function planBehindBeat(gm) {
    const beat = activeBeat(gm.outline);
    return !!beat && !!gm.day && gm.day.beatId !== beat.id;
}

// ---------------------------------------------------------------- the director's section (§6)

// The private GM PLAN section, or '' when there is nothing to say.
// pace: paceAim(); aim: shapes.js tensionAim(); story: { shape (label),
// act (title), next (the beat after this one) } for the outline's line;
// motifs: [text].
// newcomers: the beat's people the story has not shown since it began
// (unseenTies); returning: those of them the story has shown before;
// waited: replies they have been awaited (newcomerWait) - past FIRM_AFTER
// they come in this reply.
export const FIRM_AFTER = 3;
export function planSection(gm, { pace = null, aim = null, story = null, motifs = [], newcomers = [], returning = [], waited = 0 } = {}) {
    const lines = [];
    const beat = activeBeat(gm.outline);
    if (beat) lines.push(`- Story: ${story?.shape ? `${story.shape}, ` : ''}${story?.act ? `in "${story.act}" - ` : ''}the beat now: ${beat.text}${story?.next ? ` (then: ${story.next})` : ''}. When the scene opens a way to it - the player character asks what comes next, a talk winds down - the beat is the answer.`);
    const due = beat ? strList(newcomers) : [];
    const back = new Set(strList(returning).map((n) => n.toLowerCase()));
    const fresh = due.filter((n) => !back.has(n.toLowerCase()));
    const again = due.filter((n) => back.has(n.toLowerCase()));
    // Someone the story has shown before comes back as who they are.
    const knownLine = again.length ? ` ${again.join(' and ')} ${again.length === 1 ? 'has' : 'have'} been in the story before: they know whom they have met and pick up where they left off.` : '';
    if (due.length && waited >= FIRM_AFTER) lines.push(`- Now: ${due.join(' and ')} come${due.length === 1 ? 's' : ''} into the story in this reply - the beat has waited ${waited} replies for ${due.length === 1 ? 'them' : 'them all'}. Open the reply with ${due.length === 1 ? 'them' : 'each'} reaching the player character where they are: walking in, or sending for them, with a reason that fits the beat now. Not elsewhere, not later, not only talked about.${knownLine}`);
    else if (due.length) lines.push(`- ${[fresh.length ? `Not yet in the story: ${fresh.join(', ')}.` : '', again.length ? `Away from the story since this beat began: ${again.join(', ')}.` : ''].filter(Boolean).join(' ')} The beat now needs ${due.length === 1 ? 'them' : 'each of them'} to reach the player character in person - in this reply where the scene leaves any room: they arrive where the player character is, walk in on the scene, or send for them. This brings someone to the scene; it does not move it. A talk elsewhere, out of the player character's sight, does not count.${knownLine}`);
    if (aim) lines.push(aimLine(aim, story?.act));
    if (pace && pace.aim !== 'steady') {
        lines.push(pace.aim === 'move on'
            ? `- Pace: move on - ${pace.why}. Close this scene and lead straight into the next one; never leave the player character alone with nothing to answer. Let the scene wind down from the world's side and pass time with a TIME line if the next scene starts later. Then open the next scene by bringing something to the player character: pull on an open thread or the beat now; bring in someone who belongs at this place and has a reason to seek them out, new to the story if need be; or let something from MEANWHILE reach them as news, a rumour, a find or a visitor. End with that in front of them - someone to answer, a question, somewhere to go - and the choice theirs. Never decide for the player character.`
            : `- Pace: linger - ${pace.why}. Give the scene room; let time move only as the story says.`);
    }
    // What the story set or keeps putting off has its own DUE TODAY lines
    // (dueSection): not repeated here.
    const dueIds = new Set(gm.agenda.filter((x) => (x.status === 'coming' || x.status === 'planned') && pressing(x)).map((x) => `agenda:${x.id}`));
    // Moments planned for an earlier beat lead away from this one: none
    // until the day is planned again.
    const coming = planBehindBeat(gm) ? [] : (gm.day?.moments ?? []).filter((m) => m.status === 'pending' && !dueIds.has(m.source)).slice(0, 2);
    for (const m of coming) lines.push(`- Coming up [${m.id}]: ${m.text}${m.when ? ` (${m.when}${m.trigger ? `; ${m.trigger}` : ''})` : m.trigger ? ` (${m.trigger})` : ''}`);
    const agendas = (gm.day?.agendas ?? []).slice(0, 4);
    if (agendas.length) lines.push(`- Agendas: ${agendas.map((a) => `${a.who} wants ${a.wants}${a.will ? `, and will ${a.will}` : ''}${a.hidden ? ` (hidden: ${a.hidden})` : ''}`).join('; ')}.`);
    const off = (gm.day?.offscreen ?? []).slice(0, 2);
    if (off.length) lines.push(`- Off-screen: ${off.join('; ')}.`);
    const soon = gm.queue.filter((r) => r.status === 'waiting' && r.urgency === 'soon').slice(0, 2);
    for (const r of soon) lines.push(`- The user would like: ${r.text} - work it in where it is natural.`);
    const seed = openSeeds(gm)[0];
    if (seed) lines.push(`- Plant when there is room [${seed.id}]: ${seed.text}${seed.payoff ? ` (it pays off later: ${seed.payoff})` : ''} - a small touch in passing, never the point of the scene, and never say what it is for.`);
    const m = motifs.filter(Boolean).slice(0, 3);
    if (m.length) lines.push(`- Motifs to echo, as images rather than events: ${m.join('; ')}.`);
    if (!lines.length) return '';
    return ['GM PLAN (private - never mention it; it guides what you choose, it is not a script. The scene as it stands comes first: use the plan only where it fits the place, the people present and what they are doing now - never move the scene, rename the place or change what people are doing to fit it. A coming moment happens only where the player leaves room for it; drop one that no longer fits.)', ...lines].join('\n');
}

// The tension aim as the director reads it. Building reaches the player
// character - trouble only out of their sight builds nothing for them -
// and the further short of the shape the story is, the plainer it is said.
const FAR_SHORT = 1;
function aimLine(aim, act) {
    const line = `- Aim: ${aim.word} (${aim.lean}) - ${aim.why}.`;
    if (aim.word !== 'build') return line;
    const reach = ' Bring it to the player character: it happens to them, in front of them or reaches them as word, not only out of their sight.';
    const far = aim.short >= FAR_SHORT ? ` The story is well short of where ${act ? `"${act}"` : 'this part of it'} wants it: this reply needs a real turn, not more of the same.` : '';
    return line + reach + far;
}

// The fired story triggers the game master must play now (src/triggers/),
// for the player's message `userIndex`. '' when none.
export function triggerSection(gm, userIndex) {
    const lines = triggerLines(gm.triggers, userIndex);
    return lines.length ? ['TRIGGERED (private - what the story has set off; it happens now):', ...lines].join('\n') : '';
}

// The motifs for this chat: the inspirations' distilled motifs, a few from
// each, in turn.
export function motifsOf(gm, max = 6) {
    const lists = gm.inspirations.map((x) => x.motifs).filter((l) => l.length);
    const out = [];
    for (let i = 0; out.length < max && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && out.length < max) out.push(l[i]);
    return out;
}

// What is veiled while spoilers are hidden: a moment's or agenda's text,
// unless the user peeked at it.
export const isVeiled = (gm, id, showSpoilers) => !showSpoilers && !gm.peeked.includes(id);

// ---------------------------------------------------------------- the outline (§3.1)

export const beatsOf = (outline) => (outline?.acts ?? []).flatMap((a) => a.beats);
export const activeBeat = (outline) => beatsOf(outline).find((b) => b.status === 'active') ?? null;
const beatNumber = (id) => Number(/^b(\d+)$/.exec(id)?.[1] ?? 0);

// The act holding the active beat (or the first with a beat still to
// come): { act, index } or null.
export function currentAct(outline) {
    const acts = outline?.acts ?? [];
    let index = acts.findIndex((a) => a.beats.some((b) => b.status === 'active'));
    if (index < 0) index = acts.findIndex((a) => a.beats.some((b) => b.status === 'pending'));
    if (index < 0) index = Math.max(0, acts.length - 1);
    return acts[index] ? { act: acts[index], index } : null;
}

// The story's position, 0-1: beats done (half for the active one) out of
// the beats that count (skipped ones don't).
export function positionOf(outline) {
    const beats = beatsOf(outline).filter((b) => b.status !== 'skipped');
    if (!beats.length) return 0;
    const done = beats.filter((b) => b.status === 'done').length + (beats.some((b) => b.status === 'active') ? 0.5 : 0);
    return Math.round((done / beats.length) * 1000) / 1000;
}

// One active beat at most; with none, the first beat still to come.
function settleActive(outline) {
    const beats = beatsOf(outline);
    const active = beats.filter((b) => b.status === 'active');
    for (const b of active.slice(1)) b.status = 'pending';
    if (!active.length) {
        const next = beats.find((b) => b.status === 'pending');
        if (next) next.status = 'active';
    }
}

const past = (b) => b.status === 'done' || b.status === 'skipped';

// Whether two beats are the same beat in other words ("Graxx proposes a
// deal: ... with him" and "... with him, sparking tension among allies"):
// most of the shorter one's distinctive words are in the longer one.
const BEAT_STOP = new Set('the and for with from into onto that this their them they his her its him she are was were has have had will would can could must about over under after before while then than when where which who whom what how also just only very more most some any all each other another again'.split(' '));
const beatWords = (text) => new Set((clean(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.replace(/(?:'s|s)$/, '')).filter((w) => w.length >= 3 && !BEAT_STOP.has(w)));
export function sameBeat(a, b) {
    const wa = beatWords(a);
    const wb = beatWords(b);
    if (!wa.size || !wb.size) return false;
    const shared = [...wa].filter((w) => wb.has(w)).length;
    const small = Math.min(wa.size, wb.size);
    return shared / small >= 0.7 && (2 * shared) / (wa.size + wb.size) >= 0.5;
}

// Takes an OUTLINE pass's answer in. parsed: { premise, themes, acts:
// [{ title, beats: [{ id?, text, ties, status }] }], seeds }. What the
// story has done stays done; locked beats (the user's) keep their words;
// beats the answer leaves out are dropped unless done, skipped or locked.
// keepLocked false (a regenerate that starts afresh): locked beats still
// to come are dropped too - only what the story has done is kept.
// review: the pass brought an outline up to date (not written afresh).
// unseen(beat): the names a beat ties in that the chat never showed - a
// review never calls such a beat done. index: the chat index of the
// latest message, kept on each beat called done (a swipe of it undoes it).
export function setOutline(gm, parsed, { turn = 0, at = new Date().toISOString(), keepLocked = true, review = false, unseen = () => [], index = -1 } = {}) {
    const wasDone = new Set(beatsOf(gm.outline).filter((b) => b.status === 'done').map((b) => b.id));
    // A skipped beat never happened: it is not history, and a rewrite that
    // leaves it out drops it (an old outline's "Maziel attacks" would sit
    // at the top of the new chapter, read as something already played).
    const kept = (b) => (keepLocked && b.locked) || b.status === 'done';
    const old = new Map(beatsOf(gm.outline).filter((b) => keepLocked || past(b)).map((b) => [b.id, b]));
    const used = new Set();
    let next = Math.max(0, ...[...old.keys()].map(beatNumber)) + 1;
    const everyOld = beatsOf(gm.outline);
    // The chapters the story has finished (every beat played out or
    // skipped, and a later one under way): nothing new goes into them.
    const nowAt = currentAct(gm.outline)?.index ?? 0;
    const finished = (i) => i < nowAt && (gm.outline?.acts?.[i]?.beats ?? []).every(past);
    const taken = [];
    const acts = (parsed.acts ?? []).map((a, i) => {
        const beats = [];
        for (const raw of a.beats ?? []) {
            let prev = raw.id ? old.get(clean(raw.id)) : null;
            // An answer that lost a beat's id: the same beat in other words
            // is that beat - never a new copy of one already played out
            // (which would come back as a fresh, active beat).
            if (!prev || used.has(prev.id)) {
                // (A skipped beat planned again is a new beat, not still skipped.)
                const like = everyOld.find((b) => !used.has(b.id) && b.status !== 'skipped' && sameBeat(b.text, raw.text));
                if (like) prev = old.get(like.id) ?? null;
                else if (everyOld.some((b) => b.status === 'done' && sameBeat(b.text, raw.text))) continue;
            }
            // The answer naming a skipped beat is only echoing the old
            // outline: it is dropped, not kept as if it were history.
            if (prev?.status === 'skipped' && !(keepLocked && prev.locked)) { used.add(prev.id); continue; }
            if (!prev && finished(i)) continue;
            if (prev && !used.has(prev.id)) {
                used.add(prev.id);
                const said = BEAT_STATUSES.includes(raw.status) ? raw.status : prev.status;
                const status = past(prev) ? prev.status : said === 'done' && unseen(prev).length ? prev.status : said;
                const keepWords = prev.locked || past(prev);
                beats.push({ ...prev, text: keepWords ? prev.text : clean(raw.text) || prev.text, ties: keepWords ? prev.ties : strList(raw.ties).slice(0, 6), status });
            } else if (review && raw.status === 'done') {
                // A review marks beats done; it never makes history up -
                // a new "done" beat is an everyday moment written down
                // ("Arin takes first watch"), and it eats the chapter.
                continue;
            } else if (!taken.some((t) => sameBeat(t, raw.text))) {
                // Never the same new beat twice in one answer.
                const b = normalizeBeat({ ...raw, id: `b${next++}`, locked: false, by: 'planner' }, 0);
                if (b) { beats.push(b); taken.push(b.text); }
            }
        }
        // History and the user's beats are never lost: back in their act,
        // what is past before what is still to come.
        const oldAct = gm.outline?.acts?.[i];
        for (const b of oldAct?.beats ?? []) {
            if (used.has(b.id) || !kept(b)) continue;
            used.add(b.id);
            const before = past(b) ? beats.findIndex((x) => !past(x)) : -1;
            if (before >= 0) beats.splice(before, 0, b); else beats.push(b);
        }
        return { id: `a${i + 1}`, title: clean(a.title) || clean(oldAct?.title) || `Act ${i + 1}`, beats: beats.slice(0, BEAT_LIMIT) };
    });
    // A review that comes back with fewer chapters than the outline had (an
    // answer cut short and salvaged, or a model that wrote only the act
    // under way) has not planned the rest away: those chapters stay as they
    // were, beats still to come and all. Assassins Inc lost chapters 2-4
    // this way, one review at a time.
    if (review) {
        const oldActs = gm.outline?.acts ?? [];
        for (let i = acts.length; i < oldActs.length; i++) {
            const beats = oldActs[i].beats.filter((b) => !used.has(b.id) && b.status !== 'skipped');
            for (const b of beats) used.add(b.id);
            acts.push({ id: `a${i + 1}`, title: oldActs[i].title || `Act ${i + 1}`, beats: beats.slice(0, BEAT_LIMIT) });
        }
    }
    // Kept beats of acts the answer no longer has go to the last act.
    for (const b of old.values()) {
        if (used.has(b.id) || !kept(b) || !acts.length) continue;
        acts[acts.length - 1].beats.push(b);
    }
    gm.outline = normalizeOutline({
        premise: clean(parsed.premise) || gm.outline?.premise || '',
        themes: parsed.themes?.length ? parsed.themes : gm.outline?.themes ?? [],
        acts,
        seeds: mergeSeeds(gm.outline?.seeds ?? [], parsed.seeds ?? []),
        updatedAt: at,
        madeTurn: turn,
    });
    if (gm.outline) settleActive(gm.outline);
    for (const b of beatsOf(gm.outline)) {
        if (b.status !== 'done' || wasDone.has(b.id)) continue;
        b.doneAt = chatIndex(index);
        if (!b.locked) addChronicle(gm, `Beat: ${b.text}`, { at });
    }
}

// The user's own changes. An edited or added beat is locked: the planner
// keeps its words.
export function editBeat(gm, id, text) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (b && clean(text)) { b.text = clean(text).slice(0, 400); b.by = 'user'; b.locked = true; }
}

export function lockBeat(gm, id, locked) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (b) b.locked = locked === true;
}

export function removeBeat(gm, id) {
    if (!gm.outline) return;
    for (const a of gm.outline.acts) a.beats = a.beats.filter((b) => b.id !== id || b.status === 'done');
    settleActive(gm.outline);
}

export function addBeat(gm, actId, text) {
    const act = gm.outline?.acts.find((a) => a.id === actId);
    if (!act || !clean(text) || act.beats.length >= BEAT_LIMIT) return null;
    const beat = normalizeBeat({ id: `b${Math.max(0, ...beatsOf(gm.outline).map((b) => beatNumber(b.id))) + 1}`, text, status: 'pending', locked: true, by: 'user' }, 0);
    act.beats.push(beat);
    settleActive(gm.outline);
    return beat;
}

// A regenerated beat (the BEAT pass): new words from the planner, so it is
// no longer the user's or locked.
export function replaceBeat(gm, id, { text, ties = [] }) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (!b || !clean(text) || past(b)) return false;
    Object.assign(b, { text: clean(text).slice(0, 400), ties: strList(ties).slice(0, 6), by: 'planner', locked: false, note: '' });
    return true;
}

// A beat the story has played out (the user says so, or a pass does).
// A story joined in progress: every beat of the chapters before `act` has
// played out, and the story is now in chapter `act` - its first beat still
// to come is the active one. Nothing the story has done is undone.
export function startAt(gm, act) {
    const acts = gm.outline?.acts ?? [];
    if (!Number.isInteger(act) || act < 0 || act >= acts.length) return;
    acts.forEach((a, i) => {
        for (const b of a.beats) {
            if (i < act && (b.status === 'pending' || b.status === 'active')) b.status = 'done';
            if (i >= act && b.status === 'active') b.status = 'pending';
        }
    });
    const first = acts.slice(act).flatMap((a) => a.beats).find((b) => b.status === 'pending');
    if (first) first.status = 'active';
}

// A skipped beat brought back by the user: still to come again.
// A skipped beat back as one still to come; a beat wrongly called done
// back as the beat now, and out of the chronicle.
export function restoreBeat(gm, id) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (!b || (b.status !== 'skipped' && b.status !== 'done')) return;
    const wasDone = b.status === 'done';
    reopen(b);
    if (wasDone) {
        gm.volume.chronicle = gm.volume.chronicle.filter((c) => c.text !== `Beat: ${b.text}`);
        for (const x of beatsOf(gm.outline)) if (x.status === 'active') reopen(x);
        b.status = 'active';
    }
    settleActive(gm.outline);
}

// A beat back as one still to come: it is under way afresh once it is the
// beat now, and only what the story shows from then on counts for it.
function reopen(b) {
    b.status = 'pending';
    b.note = '';
    b.since = -1;
    b.doneAt = -1;
}

// The beat under way is under way from chat index `at` on: kept the first
// time it is seen active, so a beat's people count only once it began -
// Inji Miyama, named in the story's first hundred messages, made the
// combat assessment against him "done" without his ever turning up for it.
export function stampBeats(gm, at) {
    if (!Number.isInteger(at) || at < 0) return;
    for (const b of beatsOf(gm.outline)) if (b.status === 'active' && !(b.since >= 0)) b.since = at;
}

// The chat index a beat's people are looked for from: a little before it
// was under way (BEAT_LEAD messages), or - not known - since the volume
// began. Who was there as it began counts: Adam set the combat assessment
// going at his desk, the beat was called under way a few replies into the
// simulation, and the plan sent him striding into the middle of it.
export const BEAT_LEAD = 20;
export const beatFrom = (gm, beat) => (beat?.since >= 0 ? Math.max(0, beat.since - BEAT_LEAD) : gm.volume?.startedIndex ?? 0);

// A message at `fromIndex` or later was swiped, edited or deleted: the
// beats called done at it did not happen. They are under way again and
// out of the chronicle. -> the ids put back.
export function undoBeatsFrom(gm, fromIndex) {
    if (!Number.isInteger(fromIndex) || fromIndex < 0) return [];
    const back = beatsOf(gm.outline).filter((b) => b.status === 'done' && b.doneAt >= fromIndex);
    if (!back.length) return [];
    const lines = new Set(back.map((b) => `Beat: ${b.text}`));
    gm.volume.chronicle = gm.volume.chronicle.filter((c) => !lines.has(c.text));
    for (const b of beatsOf(gm.outline)) if (b.status === 'active') reopen(b);
    for (const b of back) reopen(b);
    settleActive(gm.outline);
    return back.map((b) => b.id);
}

// Beats called done whose people the chat never showed did not happen: a
// pass read a moment the director only meant to play ("Adam strides into
// the common room") as history, and the outline moved on without him.
// They are under way again, and the chronicle forgets every line about
// someone who never turned up. texts: the chat, or (beat) => the chat
// since that beat was under way - then `whole` is the whole chat, and only
// lines about someone it never shows go (Inji, away from the beat, still
// came into the story before it). -> the names put back, [] when nothing
// was wrong.
export function undoUnseenBeats(gm, texts, player = '', whole = null) {
    const back = [];
    for (const b of beatsOf(gm.outline)) {
        if (b.status !== 'done') continue;
        const missing = unseenTies(b.ties, typeof texts === 'function' ? texts(b) : texts, player);
        if (!missing.length) continue;
        reopen(b);
        back.push(...missing);
    }
    const missing = [...new Set(back)];
    if (!missing.length) return [];
    const undone = new Set(beatsOf(gm.outline).filter((b) => b.status === 'pending').map((b) => `Beat: ${b.text}`));
    const never = typeof texts === 'function' ? (whole ? unseenTies(missing, whole, player) : []) : missing;
    const namesMissing = (text) => never.some((n) => !unseenTies([n], text).length);
    gm.volume.chronicle = gm.volume.chronicle.filter((c) => !undone.has(c.text) && !namesMissing(c.text));
    for (const b of beatsOf(gm.outline)) if (b.status === 'active') reopen(b);
    settleActive(gm.outline);
    return missing;
}

// A newcomer the active beat is waiting on: since which turn, so the
// director's line grows firmer the longer they keep not turning up.
// -> replies waited (0 the first time).
export function newcomerWait(gm, beatId, turn) {
    if (!beatId) { gm.newcomer = null; return 0; }
    if (gm.newcomer?.beatId !== beatId) gm.newcomer = { beatId, since: turn };
    return Math.max(0, turn - gm.newcomer.since);
}

// index: the chat index of the message the story played it out at (-1:
// the user's call, which no swipe takes back).
export function finishBeat(gm, id, { index = -1 } = {}) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (!b || b.status === 'done') return;
    b.status = 'done';
    b.doneAt = chatIndex(index);
    addChronicle(gm, `Beat: ${b.text}`);
    settleActive(gm.outline);
}

// ---------------------------------------------------------------- tension (§5)

// Archivist's readings (its compiled tension), merged into ours by message
// index: a Rebuild that starts its graph over keeps our copy of the past.
// -> true when something changed.
export function mergeArchivistTension(gm, readings) {
    const fresh = (readings ?? []).map((r) => normalizeReading({ ...r, index: r.message_index ?? r.index, source: 'archivist' })).filter(Boolean);
    if (!fresh.length) return false;
    const list = gm.tension.filter((r) => r.source === 'archivist');
    const byIndex = new Map(list.filter((r) => r.index !== null).map((r) => [r.index, r]));
    let changed = list.length !== gm.tension.length;
    for (const r of fresh) {
        const prev = r.index !== null ? byIndex.get(r.index) : null;
        if (prev && prev.overall === r.overall && prev.reason === r.reason) continue;
        if (prev) Object.assign(prev, r); else { list.push(r); if (r.index !== null) byIndex.set(r.index, r); }
        changed = true;
    }
    if (changed) gm.tension = list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).slice(-TENSION_LIMIT);
    return changed;
}

// The planner's own reading (a CHECK pass), when Archivist gives none.
export function addOwnReading(gm, reading, { index = null, at = new Date().toISOString() } = {}) {
    const r = normalizeReading({ ...reading, index, at, source: 'planner' });
    if (r) gm.tension = [...gm.tension.filter((x) => x.source === 'planner'), r].slice(-TENSION_LIMIT);
    return r;
}

// -> { now, recent } (recent: the readings before now, oldest first).
export function tensionNow(gm) {
    const list = volumeReadings(gm);
    return { now: list[list.length - 1] ?? null, recent: list.slice(-8, -1) };
}

// ---------------------------------------------------------------- volumes (§5.1)

const CHRONICLE_LIMIT = 80;
const RECAP_CHARS = 8000;

function emptyVolume(number, start = {}) {
    return { number, startedTurn: start.turn ?? 0, startedDay: start.day ?? 1, startedIndex: start.index ?? 0, direction: '', outlineWish: '', chronicle: [] };
}

function normalizeVolume(v) {
    if (!isObject(v)) return emptyVolume(1);
    return {
        number: Number.isInteger(v.number) && v.number > 0 ? v.number : 1,
        startedTurn: int(v.startedTurn),
        startedDay: Number.isInteger(v.startedDay) && v.startedDay > 0 ? v.startedDay : 1,
        startedIndex: int(v.startedIndex),
        direction: paragraphs(v.direction).slice(0, 4000),
        // What the user asked of the last regenerate: asked of every outline
        // pass of the volume after it.
        outlineWish: paragraphs(v.outlineWish).slice(0, 4000),
        chronicle: (Array.isArray(v.chronicle) ? v.chronicle : []).filter((c) => isObject(c) && clean(c.text))
            .map((c) => ({ at: str(c.at), day: Number.isInteger(c.day) ? c.day : null, text: clean(c.text).slice(0, 300) })).slice(-CHRONICLE_LIMIT),
    };
}

function normalizeVolumeRecord(r) {
    if (!isObject(r) || !Number.isInteger(r.number)) return null;
    return {
        number: r.number,
        title: clean(r.title).slice(0, 120) || `Volume ${r.number}`,
        shape: clean(r.shape),
        premise: clean(r.premise).slice(0, 1200),
        themes: strList(r.themes).slice(0, 8),
        recap: str(r.recap).trim().slice(0, RECAP_CHARS),
        threads: strList(r.threads).slice(0, 12),
        beats: (Array.isArray(r.beats) ? r.beats : []).filter((b) => isObject(b) && clean(b.text))
            .map((b) => ({ text: clean(b.text).slice(0, 300), status: ['done', 'skipped', 'not reached'].includes(b.status) ? b.status : 'not reached' })).slice(0, 60),
        startedTurn: int(r.startedTurn), endedTurn: int(r.endedTurn),
        startedDay: int(r.startedDay, 1), endedDay: int(r.endedDay, 1),
        startedIndex: int(r.startedIndex), endedIndex: int(r.endedIndex),
        endedAt: str(r.endedAt),
        closedEarly: r.closedEarly === true,
        editedByUser: r.editedByUser === true,
    };
}

// Takes a line out of the volume's chronicle - the user's call, for one
// the story never played out. Its text guards against a list that moved on.
export function removeChronicle(gm, index, text) {
    const line = gm.volume.chronicle[index];
    if (!line || (text !== undefined && line.text !== clean(text))) return false;
    gm.volume.chronicle = gm.volume.chronicle.filter((_, i) => i !== index);
    return true;
}

// One line in the volume's chronicle: something the story played out.
export function addChronicle(gm, text, { day = gm.day?.day ?? null, at = new Date().toISOString() } = {}) {
    if (!clean(text)) return;
    const last = gm.volume.chronicle[gm.volume.chronicle.length - 1];
    if (last && last.text === clean(text)) return;
    gm.volume.chronicle = [...gm.volume.chronicle, { at, day, text: clean(text).slice(0, 300) }].slice(-CHRONICLE_LIMIT);
}

// A volume is complete when every beat of its last chapter has played out
// (done or skipped).
export function volumeComplete(outline) {
    const acts = outline?.acts ?? [];
    const last = acts[acts.length - 1];
    return !!last && last.beats.length > 0 && last.beats.every((b) => b.status === 'done' || b.status === 'skipped');
}

// The tension readings taken in the volume under way: Archivist's by
// message index, the planner's own by reply count.
export function volumeReadings(gm) {
    const v = gm.volume;
    return gm.tension.filter((r) => r.index === null || (r.source === 'archivist' ? r.index >= v.startedIndex : r.index >= v.startedTurn));
}

// Files the volume under way away. recap: a RECAP pass's answer (or the
// user's own) { title, recap, threads }; end: { turn, day, index, shape
// (label), closedEarly }. -> the record.
export function closeVolume(gm, recap, end = {}) {
    const v = gm.volume;
    const record = normalizeVolumeRecord({
        number: v.number,
        title: recap.title,
        shape: end.shape ?? '',
        premise: gm.outline?.premise ?? '',
        themes: gm.outline?.themes ?? [],
        recap: recap.recap,
        threads: recap.threads,
        beats: beatsOf(gm.outline).map((b) => ({ text: b.text, status: b.status === 'done' || b.status === 'skipped' ? b.status : 'not reached' })),
        startedTurn: v.startedTurn, endedTurn: end.turn ?? gm.counters.turn,
        startedDay: v.startedDay, endedDay: end.day ?? v.startedDay,
        startedIndex: v.startedIndex, endedIndex: end.index ?? v.startedIndex,
        endedAt: end.at ?? new Date().toISOString(),
        closedEarly: end.closedEarly === true || !volumeComplete(gm.outline),
    });
    gm.volumes = [...gm.volumes.filter((x) => x.number !== record.number), record].sort((a, b) => a.number - b.number);
    return record;
}

// Begins the next volume: a new outline on `shape` (the planner writes it on
// its next pass), with the user's steer. The day plan, the queue, the
// inspirations and pacing carry on.
export function startVolume(gm, { shape = gm.shape, direction = '', turn = gm.counters.turn, day = 1, index = 0 } = {}) {
    const number = Math.max(gm.volume.number, ...gm.volumes.map((x) => x.number)) + 1;
    gm.volume = { ...emptyVolume(number, { turn, day, index }), direction: paragraphs(direction).slice(0, 4000) };
    gm.shape = clean(shape);
    gm.outline = null;
    // The day goes on, but what the last volume's plan played out does not
    // carry over: only moments still to come stay (none left - a new plan).
    if (gm.day) {
        gm.day.moments = gm.day.moments.filter((m) => m.status === 'pending');
        if (!gm.day.moments.length) gm.day = null;
    }
    gm.join = { act: -1, note: '' };
    gm.outlineWanted = false;
    gm.counters.sinceOutline = 0;
    gm.peeked = [];
}

// The user's edits to a finished volume: title, recap, threads.
export function editVolume(gm, number, patch) {
    const v = gm.volumes.find((x) => x.number === number);
    if (!v) return;
    if (typeof patch.title === 'string' && clean(patch.title)) v.title = clean(patch.title).slice(0, 120);
    if (typeof patch.recap === 'string') v.recap = patch.recap.trim().slice(0, RECAP_CHARS);
    if (Array.isArray(patch.threads)) v.threads = strList(patch.threads).slice(0, 12);
    v.editedByUser = true;
}

const firstParagraph = (text) => str(text).trim().split(/\n\s*\n/)[0]?.trim() ?? '';

// The earlier volumes for the passes' prompts: the latest recap in full,
// earlier ones by their first paragraph, and the threads carried forward.
// full false: the short form (the latest recap's first paragraph only).
export function previousVolumesText(gm, { full = true } = {}) {
    const list = gm.volumes;
    if (!list.length) return '';
    const latest = list[list.length - 1];
    const lines = [];
    for (const v of list.slice(0, -1)) lines.push(`Volume ${v.number}, "${v.title}": ${firstParagraph(v.recap)}`);
    lines.push(`Volume ${latest.number}, "${latest.title}" (the volume before this one): ${full ? latest.recap : firstParagraph(latest.recap)}`);
    if (latest.threads.length) lines.push('Threads carried forward:', ...latest.threads.map((t) => `- ${t}`));
    return lines.join('\n');
}

// The whole story so far as Markdown: every finished volume's recap, in
// order - and, with `inProgress`, the volume under way: its direction and
// what its chronicle has so far.
export function storyMarkdown(gm, title = 'The story so far', { inProgress = false } = {}) {
    const out = [`# ${title}`, ''];
    for (const v of gm.volumes) {
        out.push(`## Volume ${v.number}: ${v.title}`, '');
        const meta = [v.shape, `days ${v.startedDay}-${v.endedDay}`, v.closedEarly ? 'closed early' : ''].filter(Boolean).join(' · ');
        if (meta) out.push(`*${meta}*`, '');
        out.push(v.recap || '(no recap)', '');
        if (v.threads.length) out.push('**Threads carried forward:**', ...v.threads.map((t) => `- ${t}`), '');
    }
    const now = gm.volume;
    if (inProgress && (now?.chronicle?.length || now?.direction)) {
        out.push(`## Volume ${now.number} (under way)`, '', '*Not finished yet - what has happened so far.*', '');
        if (now.direction) out.push(now.direction, '');
        if (now.chronicle.length) out.push(...now.chronicle.map((c) => `- ${Number.isInteger(c.day) ? `Day ${c.day}: ` : ''}${c.text}`), '');
    }
    return out.join('\n').trim() + '\n';
}

// Whether there is any story to save yet.
export function hasStory(gm) {
    return gm.volumes.length > 0 || gm.volume.chronicle.length > 0;
}

// ---------------------------------------------------------------- ideas (§3.4)

// event: a structured event the story points to (a tournament at midsummer, a
// dungeon to delve) - set up when taken up and put on the calendar (src/events/).
// faction: a breakaway from a faction that split off scene (src/world/).
export const IDEA_KINDS = Object.freeze(['quest', 'enrich', 'happening', 'seed', 'event', 'faction']);
const IDEA_LIMIT = 30;
const DISMISSED_LIMIT = 120;
const AGENDA_LIMIT = 40;

function normalizeIdea(x) {
    if (!isObject(x) || !clean(x.id) || !IDEA_KINDS.includes(x.kind) || !(clean(x.text) || clean(x.name))) return null;
    return {
        id: clean(x.id),
        kind: x.kind,
        name: clean(x.name).slice(0, 120),
        text: clean(x.text).slice(0, 800),
        why: clean(x.why).slice(0, 300),
        ties: strList(x.ties).slice(0, 6),
        target: clean(x.target).slice(0, 120),
        objectives: strList(x.objectives).slice(0, 5),
        inDays: Number.isInteger(x.inDays) && x.inDays >= 0 ? Math.min(x.inDays, 365) : null,
        when: clean(x.when).slice(0, 40),
        eventKind: ['arena', 'tournament', 'crawl', 'programme'].includes(x.eventKind) ? x.eventKind : '',
        status: ['proposed', 'accepted', 'dismissed'].includes(x.status) ? x.status : 'proposed',
        at: str(x.at),
    };
}

// Every open proposal is kept; decided ones only for a while.
function trimIdeas(list) {
    const open = list.filter((i) => i.status === 'proposed');
    const done = list.filter((i) => i.status !== 'proposed').slice(-Math.max(0, IDEA_LIMIT - open.length));
    return list.filter((i) => open.includes(i) || done.includes(i));
}

const keyText = (v) => clean(v).toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);

// What makes two ideas the same: their kind and name (or, without one, the
// start of the text; an enrichment also its quest).
export function ideaKey(idea) {
    return `${idea.kind}:${idea.kind === 'enrich' ? `${keyText(idea.target)}:` : ''}${keyText(idea.name) || keyText(idea.text)}`;
}

// Takes an IDEAS pass's ideas in as proposals, leaving out those the user
// turned down and those already proposed. -> the ones added.
export function addIdeas(gm, ideas, { at = new Date().toISOString(), newId = () => `idea_${Math.random().toString(36).slice(2, 10)}` } = {}) {
    const known = new Set([...gm.dismissedIdeas, ...gm.ideas.filter((i) => i.status !== 'dismissed').map(ideaKey)]);
    const added = [];
    for (const raw of ideas ?? []) {
        const idea = normalizeIdea({ ...raw, id: newId(), status: 'proposed', at });
        if (!idea) continue;
        const key = ideaKey(idea);
        if (known.has(key)) continue;
        known.add(key);
        added.push(idea);
    }
    gm.ideas = trimIdeas([...gm.ideas, ...added]);
    return added;
}

// The user's decision on a proposal. A dismissed idea is never proposed
// again.
export function resolveIdea(gm, id, status) {
    const idea = gm.ideas.find((i) => i.id === id);
    if (!idea || !['accepted', 'dismissed'].includes(status)) return null;
    idea.status = status;
    if (status === 'dismissed') gm.dismissedIdeas = [...new Set([...gm.dismissedIdeas, ideaKey(idea)])].slice(-DISMISSED_LIMIT);
    gm.ideas = trimIdeas(gm.ideas);
    return idea;
}

export function editIdea(gm, id, patch) {
    const idea = gm.ideas.find((i) => i.id === id);
    if (!idea) return;
    if (typeof patch.name === 'string') idea.name = clean(patch.name).slice(0, 120);
    if (typeof patch.text === 'string' && clean(patch.text)) idea.text = clean(patch.text).slice(0, 800);
    if (Array.isArray(patch.objectives)) idea.objectives = strList(patch.objectives).slice(0, 5);
}

export const openIdeas = (gm) => gm.ideas.filter((i) => i.status === 'proposed');

// ---------------------------------------------------------------- the agenda (§3.3)

function normalizeHappening(x) {
    if (!isObject(x) || !clean(x.id) || !clean(x.text) || !Number.isInteger(x.day)) return null;
    return {
        id: clean(x.id),
        day: x.day,
        when: clean(x.when).slice(0, 40),
        text: clean(x.text).slice(0, 400),
        ties: strList(x.ties).slice(0, 6),
        source: clean(x.source),
        status: ['coming', 'planned', 'done', 'passed'].includes(x.status) ? x.status : 'coming',
        at: str(x.at),
        late: int(x.late),
    };
}

function trimAgenda(list) {
    const open = list.filter((x) => x.status === 'coming' || x.status === 'planned');
    const done = list.filter((x) => x.status === 'done' || x.status === 'passed').slice(-Math.max(0, AGENDA_LIMIT - open.length));
    return list.filter((x) => open.includes(x) || done.includes(x)).sort((a, b) => a.day - b.day);
}

// Puts a happening on the agenda: `day` is the story's day count.
export function addHappening(gm, { id, text, day, when = '', ties = [], source = 'ideas', at = new Date().toISOString() }) {
    const h = normalizeHappening({ id, text, day, when, ties, source, at, status: 'coming' });
    if (h) gm.agenda = trimAgenda([...gm.agenda, h]);
    return h;
}

export function removeHappening(gm, id) {
    gm.agenda = gm.agenda.filter((x) => x.id !== id);
}

// The happenings to bring into the plan of `day`: due on it or within
// `ahead` days, still to come.
export function dueHappenings(gm, day, ahead = 1) {
    return gm.agenda.filter((x) => (x.status === 'coming' || x.status === 'planned') && x.day >= day && x.day <= day + ahead);
}

// The agenda follows the day plan: a happening a moment is planned for is
// planned, one played out is done. One whose day went by without it is put
// off to today, later each time (`late`) - the Medina Syndicate's try at
// Cyril was dated to a day the calendar skipped past, and fizzled out
// unseen. Only a dated event's opening (a festival begins on its day) and
// one put off past MAX_LATE days pass. `today`: the story's day count,
// when known.
export const MAX_LATE = 7;
const carries = (x) => !x.source.startsWith('event:');
export function settleAgenda(gm, today = null) {
    const moments = gm.day?.moments ?? [];
    for (const x of gm.agenda) {
        if (x.status === 'done' || x.status === 'passed') continue;
        const mine = moments.filter((m) => m.source === `agenda:${x.id}`);
        if (mine.some((m) => m.status === 'done')) x.status = 'done';
        else if (Number.isInteger(today) && x.day < today) {
            const late = x.late + (today - x.day);
            if (!carries(x) || late > MAX_LATE) x.status = 'passed';
            else Object.assign(x, { day: today, late, status: mine.some((m) => m.status === 'pending') ? 'planned' : 'coming' });
        } else if (mine.some((m) => m.status === 'pending')) x.status = 'planned';
        else if (x.status === 'planned' && !mine.length) x.status = 'coming';
    }
    gm.agenda = trimAgenda(gm.agenda);
}

// A happening that must not slip: one the story set, or one already put off.
export const pressing = (x) => x.source === 'promise' || x.late > 0;
const isOpen = (x) => x.status === 'coming' || x.status === 'planned';
// The days it has been put off by `today` - counted here too, as the
// agenda is settled only while the planner is on.
const lateOn = (x, today) => x.late + Math.max(0, today - x.day);

// The happenings pressing on `today` (due, and set by the story or put
// off), each with the days it has been put off: [{ ...happening, late }].
export function dueToday(gm, today) {
    if (!Number.isInteger(today)) return [];
    return gm.agenda.map((x) => ({ ...x, late: lateOn(x, today) }))
        .filter((x) => isOpen(x) && x.day <= today && pressing(x) && (!carries(x) ? x.day === today : x.late <= MAX_LATE));
}

// How firmly a happening put off `late` days is said: firmer each day.
export function lateWords(late) {
    if (late >= 3) return `put off ${late} days already - it happens now: open this reply with it`;
    if (late === 2) return 'put off twice already - bring it in this reply wherever the scene leaves any room';
    if (late === 1) return 'put off once already - it happens today, before the day is out';
    return '';
}

// ---------------------------------------------------------------- what the story has settled

// What the story has settled and must not undo or argue again: what a scene
// really was (the Novakorp run was a training simulation, nothing real was
// taken), and what was agreed or refused (Adam agreed Cyril is not sent
// against Omicron Innovations). Assassins Inc lost both: the chat that
// settled them scrolled out of every prompt, and Adam asked again. The user
// adds them on the GM Plan tab; the director adds one with a SETTLED line.
// { id, text, source: 'user' | 'director', at } - the newest last.
export const SETTLED_LIMIT = 12;
const normalizeSettled = (x) => (isObject(x) && clean(x.id) && clean(x.text)
    ? { id: clean(x.id), text: clean(x.text).slice(0, 300), source: x.source === 'director' ? 'director' : 'user', at: str(x.at), touched: Number.isInteger(x.touched) ? x.touched : null } : null);

// How many replies a line the director settled lasts without the story
// touching it again; the user's own never go.
export const SETTLED_RETIRE = 40;

// Why a line the director offers is not settled, or ''. Assassins Inc's
// list filled with the director's: "this little meet-up", "this terminal"
// (clear only in the scene that wrote them), "Adam and Galice's intentions
// for the simulation trial remain unclear" (open, not settled), and the
// simulation said three more times - and the note that carried them every
// reply kept the trial in front of Adam, who asked for a report on it.
const POINTS = /\b(?:this|these|those)\s+[\p{L}-]+/iu;
const OPEN = /\b(?:unclear|uncertain|unknown|undecided|unresolved|to be seen|to be determined|not yet (?:known|decided|clear)|remains? (?:open|a mystery|in question))\b/i;
export function unsettledReason(text) {
    const t = clean(text);
    if (POINTS.test(t)) return 'points at something in the scene ("this ...")';
    if (OPEN.test(t)) return 'says something is still open';
    return '';
}

// The settled lines worth keeping to: the user's always; the director's
// unless unsettledReason() turns them away (older ones, written before the
// check, are retired on the next reply: retireSettled()).
export function keptSettled(list = []) {
    return (list ?? []).filter((s) => s?.source !== 'director' || !unsettledReason(s.text));
}

// -> the new entry, or null (empty, one already says it, or - from the
// director - not settled at all: unsettledReason()). The user's own are
// kept over the director's when the list is full.
export function addSettled(gm, { id, text, source = 'user', at = new Date().toISOString(), turn = null }) {
    const x = normalizeSettled({ id, text, source, at, touched: turn });
    if (!x || gm.settled.some((s) => sameBeat(s.text, x.text))) return null;
    if (x.source === 'director' && unsettledReason(x.text)) return null;
    let list = [...gm.settled, x];
    while (list.length > SETTLED_LIMIT) {
        const drop = list.findIndex((s) => s.source === 'director');
        list = list.filter((_, i) => i !== (drop >= 0 ? drop : 0));
    }
    gm.settled = list;
    return gm.settled.includes(x) ? x : null;
}

export function removeSettled(gm, id) {
    const before = gm.settled.length;
    gm.settled = gm.settled.filter((s) => s.id !== id);
    return gm.settled.length < before;
}

// The director's SETTLED IN THE STORY section. '' when there is nothing.
export function settledSection(gm) {
    const list = keptSettled(gm.settled);
    if (!list.length) return '';
    return ['SETTLED IN THE STORY (private - what the story has made true or agreed; keep to it. It is done with: no one acts as if it were otherwise, and no one argues it, asks for it or brings it up again unless someone else does or the story itself gives them a new reason):', ...list.map((s) => `- ${s.text}`)].join('\n');
}

// The settled lines for the in-chat note: only those the latest messages
// touch - a name in the line (a capitalised word, not the player's), or two
// words in common besides the player's names. The director sees them all
// every reply. Six at most, the user's first, then the newest. Listed every
// reply whatever was going on, the Novakorp simulation - the user's own
// line among them - kept Novakorp on Adam's mind.
// list: gm.settled; recentText: the latest messages; skipWords: the
// player's names.
export function settledNow(list = [], { recentText = '', skipWords = [], max = 6 } = {}) {
    const touched = new Set(touchedSettled(list, { recentText, skipWords, all: true }));
    const kept = keptSettled(list).filter((s) => touched.has(s.id));
    const users = kept.filter((s) => s.source !== 'director');
    const director = kept.filter((s) => s.source === 'director').reverse();
    return [...users, ...director].slice(0, max).map((s) => s.text);
}

// The ids of the lines the latest messages touch (settledNow()) - the
// director's only, unless `all`.
export function touchedSettled(list = [], { recentText = '', skipWords = [], all = false } = {}) {
    const skip = new Set(skipWords.flatMap((n) => [...beatWords(n)]));
    const recent = beatWords(recentText);
    const named = (text) => [...beatWords((String(text ?? '').match(/(?<![\p{L}'’])\p{Lu}[\p{L}-]+/gu) ?? []).join(' '))];
    const touches = (text) => {
        const shared = [...beatWords(text)].filter((w) => !skip.has(w) && recent.has(w));
        return shared.length >= 2 || named(text).some((w) => shared.includes(w));
    };
    return keptSettled(list).filter((s) => (all || s.source === 'director') && touches(s.text)).map((s) => s.id);
}

// Ages the director's settled lines: those `touchedIds` now count from
// `turn`; one not touched for SETTLED_RETIRE replies goes, as does one
// turned away (unsettledReason) - no pruning by hand. A line with no count
// yet starts from `turn`. The user's own are never retired.
// -> { changed, retired: [text] }
export function retireSettled(gm, turn, touchedIds = [], after = SETTLED_RETIRE) {
    if (!Number.isInteger(turn)) return { changed: false, retired: [] };
    const touched = new Set(touchedIds);
    let changed = false;
    const retired = [];
    gm.settled = (gm.settled ?? []).filter((s) => {
        if (s.source !== 'director') return true;
        if (unsettledReason(s.text) || (Number.isInteger(s.touched) && turn - s.touched > after && !touched.has(s.id))) {
            retired.push(s.text);
            changed = true;
            return false;
        }
        if (touched.has(s.id) ? s.touched !== turn : !Number.isInteger(s.touched)) {
            s.touched = turn;
            changed = true;
        }
        return true;
    });
    return { changed, retired };
}

// The director's DUE TODAY section - what the story set, and what keeps
// being put off - and what the story set for later days. Planner on or
// off; '' when there is nothing.
export function dueSection(gm, today) {
    const due = dueToday(gm, today).sort((a, b) => b.late - a.late);
    const later = Number.isInteger(today) ? gm.agenda.filter((x) => isOpen(x) && x.source === 'promise' && x.day > today).slice(0, 4) : [];
    if (!due.length && !later.length) return '';
    const lines = [];
    if (due.length) {
        lines.push('DUE TODAY (private - set earlier in the story, or put off before; it happens today. Those who set it keep it in person - nobody stands in for them, and it is not swapped for something else - unless the story shows a real reason they cannot; then it is put off, never forgotten):');
        for (const x of due) lines.push(`- [${x.id}] ${x.text}${x.when ? ` (${x.when})` : ''}${lateWords(x.late) ? ` - ${lateWords(x.late)}` : ''}`);
    }
    if (later.length) {
        lines.push('SET FOR LATER (private - what the story has set for coming days; those involved remember it and work toward it):');
        for (const x of later) lines.push(`- ${x.day - today === 1 ? 'tomorrow' : `in ${x.day - today} days`}${x.when ? `, ${x.when}` : ''}: ${x.text}`);
    }
    return lines.join('\n');
}

// When a SET line's time falls, from the day it was said: { inDays, part }.
// "tomorrow morning" -> 1, morning; "at dawn" said in the evening -> the
// next dawn; nothing readable -> later today. nowPart: the time of day now.
const PARTS = ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'];
const NUMBER = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, few: 3, several: 3, couple: 2 };
export function readWhen(text, nowPart = '') {
    const t = clean(text).toLowerCase();
    const said = /\bnoon\b/.test(t) ? 'midday' : /\b(?:tonight|midnight)\b/.test(t) ? 'night' : PARTS.find((p) => new RegExp(`\\b${p}\\b`).test(t)) ?? '';
    const count = (w) => (/^\d+$/.test(w) ? Number(w) : NUMBER[w] ?? 1);
    const span = t.match(/\b(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|few|several|couple)\s+(?:of\s+)?(day|week)s?\b/);
    let inDays = null;
    if (/\bday after tomorrow\b/.test(t)) inDays = 2;
    else if (/\b(?:tomorrow|overnight)\b|\b(?:next|following)\s+(?:day|dawn|morning|midday|afternoon|evening|night)\b/.test(t)) inDays = 1;
    else if (/\bnext week\b/.test(t)) inDays = 7;
    else if (span) inDays = Math.min(60, count(span[1]) * (span[2] === 'week' ? 7 : 1));
    else if (/\b(?:today|tonight|this\s+(?:dawn|morning|midday|afternoon|evening)|later|soon|hours?|minutes?)\b/.test(t)) inDays = 0;
    // A bare time of day already gone by today is the next one.
    if (inDays === null) inDays = said && PARTS.indexOf(said) < PARTS.indexOf(clean(nowPart).toLowerCase()) ? 1 : 0;
    return { inDays, part: said };
}

// Takes a SET line in: a happening the story set for `day`. The same one
// set again (in other words) for another time is moved there, as the story
// moved it - not put off. -> the happening, or null.
export function setByStory(gm, { id, text, day, when = '', ties = [], at = new Date().toISOString() }) {
    if (!clean(text) || !Number.isInteger(day)) return null;
    const same = gm.agenda.find((x) => isOpen(x) && sameBeat(x.text, text));
    if (same) {
        if (same.day !== day || (clean(when) && same.when !== clean(when))) Object.assign(same, { day, when: clean(when).slice(0, 40) || same.when, late: 0, status: 'coming' });
        gm.agenda = trimAgenda(gm.agenda);
        return same;
    }
    return addHappening(gm, { id, text, day, when, ties, source: 'promise', at });
}

// A seed for the outline (an accepted seed idea, or a silent one).
export function addSeed(gm, { text, payoff = '' }) {
    if (!gm.outline || !clean(text)) return false;
    gm.outline.seeds = mergeSeeds(gm.outline.seeds, [{ text, payoff }]);
    return true;
}

// The seeds the director is to plant, oldest first.
export const openSeeds = (gm) => (gm.outline?.seeds ?? []).filter((x) => x.status === 'open');

// Seeds planted by the reply at `fromIndex` or later are open again (a
// swipe or an edit took that reply back). -> their ids.
export function unplantSeedsFrom(gm, fromIndex) {
    if (!Number.isInteger(fromIndex) || fromIndex < 0) return [];
    const back = (gm.outline?.seeds ?? []).filter((x) => x.status === 'planted' && x.plantedAt >= fromIndex);
    for (const x of back) { x.status = 'open'; x.plantedAt = -1; }
    return back.map((x) => x.id);
}

// At most `max` pairs, spread over everyone in them: each one once before
// anyone twice. Taken in list order, the rivalries were all one faction's -
// the one with 38 ties of its 147 (Omicron Innovations), and every idea
// grew out of it.
function spreadPairs(pairs, max) {
    const used = new Map();
    const picked = [];
    for (const round of [1, 2, Infinity]) {
        for (const r of pairs) {
            if (picked.length >= max) return picked;
            if (picked.includes(r) || Math.max(used.get(r.from) ?? 0, used.get(r.to) ?? 0) >= round) continue;
            picked.push(r);
            for (const id of [r.from, r.to]) used.set(id, (used.get(id) ?? 0) + 1);
        }
    }
    return picked;
}

// The factions the story has hardly touched, for the planner to bring in:
// fewest quests about them and mentions in the chat first, and never one
// the story already uses at half the rate of the most used. Without them a
// faction no quest or rivalry named was never thought of - five of nine
// in Assassins Inc, while every job went back to Omicron. factions: [{ id,
// name, description }]; questTexts: [text] (every quest's name and
// description); chatText; relations: the setting's; nameOf(id) -> name.
// -> [{ name, description, ties: [text] }], at most `limit`.
export function factionsOutOfPlay({ factions = [], questTexts = [], chatText = '', relations = [], nameOf = () => '', limit = 4 } = {}) {
    const core = (name) => clean(name).replace(/^the\s+/i, '');
    const count = (text, name) => {
        const n = core(name);
        if (n.length < 3) return 0;
        return (String(text ?? '').match(new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu')) ?? []).length;
    };
    const used = (Array.isArray(factions) ? factions : []).filter((f) => clean(f?.name)).map((f) => ({
        f,
        score: 3 * questTexts.filter((t) => count(t, f.name) > 0).length + count(chatText, f.name),
    }));
    if (!used.length) return [];
    const most = Math.max(...used.map((u) => u.score));
    // Their ties to anyone but the most used faction first: a lead that
    // points somewhere new.
    const top = new Set(used.filter((u) => most > 0 && u.score === most).map((u) => u.f.id));
    const toTop = (r) => (top.has(r.from) || top.has(r.to) ? 1 : 0);
    return used.filter((u) => most === 0 || u.score < most / 2).sort((a, b) => a.score - b.score).slice(0, limit).map(({ f }) => ({
        name: clean(f.name),
        description: clean(f.description).slice(0, 200),
        ties: (Array.isArray(relations) ? relations : []).filter((r) => r?.from === f.id || r?.to === f.id).sort((a, b) => toTop(a) - toTop(b)).slice(0, 2)
            .map((r) => ({ other: clean(nameOf(r.from === f.id ? r.to : r.from)), kind: clean(r.kind) }))
            .filter((t) => t.other).map((t) => `tied to ${t.other}${t.kind ? ` (${t.kind})` : ''}`),
    }));
}

// The world's frictions for the IDEAS pass: relationships gone sour or
// volatile (Archivist's relationship map), the user's rivals and enemies,
// secrets still kept, oaths pending or broken. cells: Archivist's
// relationship_map cells; relations: the setting's; knowledge: allKnowledge()
// items (people as { name }); nameOf(id) -> name. -> [text], at most 12.
export function frictionLines({ cells = [], relations = [], knowledge = [], nameOf = () => '' } = {}) {
    const out = [];
    const sour = (Array.isArray(cells) ? cells : [])
        .filter((c) => c && clean(c.from?.name) && clean(c.to?.name) && (Number(c.polarity) <= -1 || c.trend === 'volatile'))
        .sort((a, b) => Number(a.polarity) - Number(b.polarity))
        .slice(0, 6);
    for (const c of sour) out.push(`${clean(c.from.name)} sees ${clean(c.to.name)} as ${clean(c.polarity_label) || 'a problem'}${clean(c.type) ? ` (${clean(c.type)})` : ''}${clean(c.trend) && c.trend !== 'stable' ? `, ${clean(c.trend)}` : ''}`);
    for (const r of spreadPairs((Array.isArray(relations) ? relations : []).filter((x) => ['rival', 'enemy'].includes(x?.kind)), 4)) {
        const a = clean(nameOf(r.from));
        const b = clean(nameOf(r.to));
        if (a && b) out.push(`${a} and ${b}: ${r.kind === 'enemy' ? 'enemies' : 'rivals'}${clean(r.note) ? ` - ${clean(r.note)}` : ''}`);
    }
    const names = (list) => (Array.isArray(list) ? list : []).map((p) => clean(p?.name)).filter(Boolean).join(', ');
    let told = 0;
    for (const k of Array.isArray(knowledge) ? knowledge : []) {
        if (told >= 4 || !clean(k?.text)) continue;
        if (k.kind === 'secret' && k.status === 'kept') { out.push(`A secret${names(k.knownBy) ? ` known to ${names(k.knownBy)}` : ''}: ${clean(k.text)}`); told++; }
        if (k.kind === 'oath' && (k.status === 'pending' || k.status === 'broken')) { out.push(`An oath ${k.status === 'broken' ? 'broken' : 'not yet kept'}${names(k.madeBy) ? ` by ${names(k.madeBy)}` : ''}: ${clean(k.text)}`); told++; }
        // A belief that is not so: a reunion, a reveal waiting to happen.
        if (k.kind === 'belief' && k.status === 'held') { out.push(`Believed by ${k.everyone ? 'most people' : names(k.heldBy) || 'some'}, but not so${names(k.knownBy) ? ` (the truth known to ${names(k.knownBy)})` : ''}: ${clean(k.text)}`); told++; }
    }
    return out.slice(0, 12);
}
