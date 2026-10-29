// The world meanwhile - the runner (docs/DESIGN - THE WORLD MEANWHILE.md,
// phases 1-2). After each reply it looks for ripples in the chat's records
// (quests ended, deaths, secrets out, oaths broken, beliefs shaken) with
// no model call. A pass then moves the world: at the Quiet level the
// planner's DAY pass carries the world's part (worldForDay); at Lively and
// Turbulent the planner runs a WORLD pass of its own when worldDueNow says
// so (src/planner/run.js runWorld), with what worldMoves prepares. What
// surfaces as a happening goes on the agenda, an approach too (so the day
// plan makes a moment of it), and a quest hook goes to GM ideas. Before
// each reply the director gets the MEANWHILE lines (meanwhileFor), and its
// HEARD lines come back to takeHeard. Never throws.

import { LOG_PREFIX } from '../constants.js';
import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { listEntries, allKnowledge, playerIdOf, getParents, isCanonOnly } from '../library/library.js';
import { listRelations, relationsFor } from '../library/relations-edit.js';
import { relationsOf } from '../library/relations.js';
import { libraryMemberships } from '../library/faction-sync.js';
import { pathOf } from '../library/hierarchy.js';
import { isPower } from '../library/powers.js';
import { questBoard } from '../quests/sync.js';
import { deadIds } from '../state/death.js';
import { addHappening } from '../planner/model.js';
import {
    limitsOf, worldOn, findRipples, addRipple, waitingRipples, stakeholders, openSchemes, applyWorld, stirOf, worldDue, markPass,
    meanwhileSection, markShown, settleSurfaced, dismissScheme, holdScheme, leaveAlone, hearScheme, quietWorld, offscreenOf,
} from './model.js';
import { worldPart } from './prompts.js';

const worldSettings = () => getSettings().world ?? { level: 'off', surfacing: 'all' };

// Whether the world moves: the planner is on (it carries the world) and
// the level is not Off.
export const isWorldOn = () => getSettings().planner?.enabled === true && worldOn(worldSettings().level);
// Whether it has a WORLD pass of its own (Lively, Turbulent).
export const hasOwnPass = () => isWorldOn() && limitsOf(worldSettings().level)?.ownPass === true;

const lower = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const namesOf = (e) => [e.name, ...(e.aliases ?? e.base?.aliases ?? [])].map(lower).filter(Boolean);

// The people and factions the world can move, with their ties: relationships
// both ways, and reference fields both ways (relationsOf).
async function worldCast(chatId, settingId) {
    const characters = (await listEntries(chatId, settingId, 'character').catch(() => [])).filter((c) => !isPower(c));
    const factions = await listEntries(chatId, settingId, 'faction').catch(() => []);
    const entries = [...characters.map((c) => ({ ...c, type: 'character' })), ...factions.map((f) => ({ ...f, type: 'faction' }))];
    const relations = listRelations(settingId);
    const ties = new Map(entries.map((e) => [e.id, []]));
    for (const e of entries) {
        for (const r of relationsFor(e.id, relations)) ties.get(e.id).push({ otherId: r.otherId, kind: r.kind });
        const refs = relationsOf(e, entries);
        for (const o of refs.outgoing) for (const id of o.ids) ties.get(e.id).push({ otherId: id, kind: o.label });
        for (const i of refs.incoming) ties.get(e.id).push({ otherId: i.id, kind: `${i.label} (them)` });
    }
    const memberships = libraryMemberships(factions, relations);
    const byId = new Map(entries.map((e) => [e.id, e]));
    return {
        entries,
        characters,
        tiesOf: (id) => ties.get(id) ?? [],
        memberships,
        nameOf: (id) => byId.get(id)?.name ?? '',
        resolve: (name) => entries.find((e) => namesOf(e).includes(lower(name)))?.id ?? null,
        byId,
    };
}

// After a reply: what has happened that others would react to. The first
// look only records what is there.
export async function noteRipples(chatId, chatKey, settingId) {
    try {
        if (!isWorldOn() || !settingId) return;
        const doc = getChatDoc(chatKey);
        const cast = await worldCast(chatId, settingId);
        const quests = (await questBoard(chatId, chatKey, settingId).catch(() => [])).map((q) => ({ id: q.id, name: q.name, status: q.status, involved: q.involved }));
        const knowledge = await allKnowledge(settingId, cast.nameOf);
        const { ripples, seen } = findRipples(doc.gm.world.seen, { quests, dead: doc.dead, knowledge, beliefsSeen: doc.beliefsSeen }, { nameOf: cast.nameOf });
        updateChatDoc(chatKey, (d) => {
            d.gm.world.seen = seen;
            for (const r of ripples) addRipple(d.gm.world, { ...r, id: newLocalId('r'), day: d.canonical.day });
            settleSurfaced(d.gm.world, d.canonical.day);
        });
        if (ripples.length) console.info(LOG_PREFIX, `the world noticed ${ripples.length} thing${ripples.length === 1 ? '' : 's'} to react to`);
    } catch (err) {
        console.warn(LOG_PREFIX, 'the world could not look for ripples', err);
    }
}

// A rumour or happening of the user's own, for the world to react to.
export function addUserRipple(chatKey, text) {
    let made = null;
    updateChatDoc(chatKey, (d) => { made = addRipple(d.gm.world, { id: newLocalId('r'), kind: 'user', text, day: d.canonical.day, reach: 'local' }); });
    return made;
}

// Whether the WORLD pass is due now (Lively, Turbulent): '' when not.
export function worldDueNow(chatKey) {
    try {
        if (!hasOwnPass()) return '';
        const doc = getChatDoc(chatKey);
        return worldDue(doc.gm.world, { level: worldSettings().level, day: doc.canonical.day, turn: doc.gm.counters.turn });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not tell whether the world should move', err);
        return '';
    }
}

// Everything a pass needs to move the world: { part, apply(answer) ->
// { moved, started, surfaced, extras } }, or null when the world is off or
// has nothing to move (then the day is marked moved, so no pass waits on
// it). part goes into the DAY prompt as `world`, or the WORLD prompt
// (ownPass). apply takes the answer in: schemes, the log, surfaced lines,
// happenings and approaches on the agenda; hooks are left in extras for
// the planner (src/planner/run.js) to propose or create.
export async function worldMoves(chatId, chatKey, settingId, { aim = null, userName = '', ownPass = false } = {}) {
    try {
        if (!isWorldOn() || !settingId) return null;
        const { level, surfacing } = worldSettings();
        const limits = limitsOf(level);
        const doc = getChatDoc(chatKey);
        const world = doc.gm.world;
        const day = doc.canonical.day;
        const cast = await worldCast(chatId, settingId);
        const knowledge = await allKnowledge(settingId, cast.nameOf).catch(() => []);
        const ripples = waitingRipples(world);
        const schemes = openSchemes(world).filter((s) => !s.held);
        const schemers = [...new Set(schemes.flatMap((s) => s.who))];
        const playerId = playerIdOf(settingId, cast.characters);
        const found = stakeholders(ripples, {
            entries: cast.entries, tiesOf: cast.tiesOf, memberships: cast.memberships, knowledge,
            present: doc.canonical.castIds, playerId, skip: [...deadIds(doc), ...world.leftAlone], schemers, limit: limits.stakeholders,
        }).map((s) => {
            const base = cast.byId.get(s.id)?.base ?? {};
            return { ...s, role: base.role ?? '', goals: base.goals ?? '', personality: base.personality ?? base.description ?? '' };
        });
        const canonOnly = isCanonOnly(settingId);
        const part = worldPart({
            ripples, stakeholders: found, schemes, day,
            daysPassed: world.lastDay === null ? 1 : day - world.lastDay,
            limits: stirOf(limits, { aim: aim?.word ?? '', day, quietUntil: world.quietUntil }),
            aim, surfacing, canonOnly, userName, ownPass,
        });
        if (!part.text) {
            updateChatDoc(chatKey, (d) => markPass(d.gm.world, { day: d.canonical.day, turn: d.gm.counters.turn }));
            return null;
        }
        const places = await listEntries(chatId, settingId, 'location').catch(() => []);
        const placeOf = (name) => places.find((p) => namesOf(p).includes(lower(name)))?.id ?? '';
        const ids = [...new Set([...found.map((s) => s.id), ...schemers])];
        const apply = (answer) => {
            let counts = null;
            updateChatDoc(chatKey, (d) => {
                counts = applyWorld(d.gm.world, answer ?? { schemes: [] }, {
                    day: d.canonical.day, turn: d.gm.counters.turn, resolve: cast.resolve, nameOf: cast.nameOf, placeOf, limits,
                    aim: aim?.word ?? '', surfacing, ids, canonOnly, agenda: ownPass, newId: newLocalId,
                });
                for (const x of counts.extras.filter((e) => e.way === 'happening')) addHappening(d.gm, { id: newLocalId('ag'), text: x.text, day: x.day, ties: x.ties, source: 'world' });
                // The day plan's off-screen lines are the world's moves today.
                if (d.gm.day && d.gm.day.day === d.canonical.day) d.gm.day.offscreen = offscreenOf(d.gm.world, d.canonical.day);
            });
            return counts;
        };
        return { part, apply };
    } catch (err) {
        console.warn(LOG_PREFIX, 'the world could not get ready to move', err);
        return null;
    }
}

// The world's part of the DAY pass (Quiet only - Lively and Turbulent move
// in their own pass).
export async function worldForDay(chatId, chatKey, settingId, opts = {}) {
    if (hasOwnPass()) return null;
    return worldMoves(chatId, chatKey, settingId, { ...opts, ownPass: false });
}

// The MEANWHILE section for the director ('' when off or nothing fits).
// opts: { aim: the tension aim word, quiet: the scene is tense or the
// user is lingering, userIndex: the player's message the reply answers }.
export function meanwhileFor(chatKey, settingId, { aim = '', quiet = false, lead = false, userIndex = null } = {}) {
    try {
        if (!isWorldOn()) return '';
        const doc = getChatDoc(chatKey);
        const locationId = doc.canonical.locationId;
        const placeIds = locationId && settingId ? pathOf(getParents(settingId), locationId) : locationId ? [locationId] : [];
        const { text, ids } = meanwhileSection(doc.gm.world, { day: doc.canonical.day, userIndex, placeIds, present: doc.canonical.castIds, aim, quiet, lead });
        if (ids.length) updateChatDoc(chatKey, (d) => markShown(d.gm.world, ids, userIndex));
        return text;
    } catch (err) {
        console.warn(LOG_PREFIX, 'no MEANWHILE for the director', err);
        return '';
    }
}

// The director's HEARD lines: [{ id, how }].
export function takeHeard(chatKey, heard) {
    if (!heard?.length) return;
    try {
        updateChatDoc(chatKey, (d) => { for (const h of heard) hearScheme(d.gm.world, h.id, h.how, { day: d.canonical.day }); });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not take in what the player character heard', err);
    }
}

// The user's controls on the World card and /sb-world.
export function endScheme(chatKey, id) {
    let done = false;
    updateChatDoc(chatKey, (d) => { done = dismissScheme(d.gm.world, id); });
    return done;
}

export function pauseScheme(chatKey, id, paused) {
    let done = false;
    updateChatDoc(chatKey, (d) => { done = holdScheme(d.gm.world, id, paused); });
    return done;
}

export function leaveBe(chatKey, ids, on = true) {
    updateChatDoc(chatKey, (d) => leaveAlone(d.gm.world, ids, on));
}

// Quiets the world for `days` in-game days, starting today (0: let it stir).
export function quietFor(chatKey, days) {
    updateChatDoc(chatKey, (d) => quietWorld(d.gm.world, d.canonical.day, Math.max(0, Math.round(days) || 0)));
}

export function setWorldLevel(level) {
    getSettings().world.level = limitsOf(level) ? level : 'off';
    saveSettings();
}

export function setWorldSurfacing(value) {
    getSettings().world.surfacing = ['all', 'talk', 'log'].includes(value) ? value : 'all';
    saveSettings();
}
