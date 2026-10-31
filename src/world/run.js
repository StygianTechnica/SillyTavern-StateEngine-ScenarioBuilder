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
//
// Phase 3 (src/world/situations.js): the passes also see the situations,
// faction conditions and changes so far, and may change the world - a
// place, where someone is, how they are, a stance, a split, a death - as
// the user's settings allow (some wait for their say-so on the World
// card). After each reply the player character's contact with the people,
// factions and places of the scene is noted; before each reply the
// director gets THE WORLD HERE NOW (worldHereFor).

import { LOG_PREFIX } from '../constants.js';
import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { listEntries, allKnowledge, playerIdOf, getParents, isCanonOnly, updateEntry, getEntry, mayAddGeneratedDetail } from '../library/library.js';
import { listRelations, relationsFor } from '../library/relations-edit.js';
import { relationsOf } from '../library/relations.js';
import { libraryMemberships } from '../library/faction-sync.js';
import { pathOf } from '../library/hierarchy.js';
import { isPower } from '../library/powers.js';
import { questBoard } from '../quests/sync.js';
import { deadIds, isDead, markDead } from '../state/death.js';
import { mayDie, stanceFor } from '../director/combat.js';
import { addHappening } from '../planner/model.js';
import {
    limitsOf, worldOn, findRipples, addRipple, waitingRipples, stakeholders, openSchemes, applyWorld, stirOf, worldDue, markPass,
    meanwhileSection, markShown, settleSurfaced, dismissScheme, holdScheme, leaveAlone, hearScheme, quietWorld, offscreenOf,
} from './model.js';
import {
    openSituations, lastingLines, settleChanges, noteContact, worldHereSection, endSituation, answerPending, undoChange, canonizePlace, uncanonize,
} from './situations.js';
import { worldPart } from './prompts.js';

const worldSettings = () => ({ level: 'off', surfacing: 'all', places: 'on', deaths: 'ask', ...(getSettings().world ?? {}) });

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

// The places the scene is in (the place, then those it is in).
function scenePlaces(settingId, locationId) {
    return locationId && settingId ? [...pathOf(getParents(settingId), locationId)] : locationId ? [locationId] : [];
}

// Who and what the scene touches (§4.1): the people here, the factions they
// belong to, the factions tied to the places it is in, and - for "since you
// were last here" - people and factions the player names. -> [id]
async function touchedIds(chatId, settingId, cast, { castIds = [], placeIds = [], playerId = '', userText = '' } = {}) {
    const ids = new Set(castIds.filter((id) => id !== playerId));
    for (const id of castIds) for (const f of cast.memberships.get(id) ?? []) ids.add(f);
    if (placeIds.length) {
        const places = await listEntries(chatId, settingId, 'location').catch(() => []);
        const at = new Set(placeIds);
        const all = [...cast.entries, ...places];
        for (const f of cast.entries.filter((e) => e.type === 'faction')) {
            if (relationsOf(f, all).outgoing.some((o) => o.ids.some((id) => at.has(id)))) ids.add(f.id);
        }
        for (const p of places.filter((x) => at.has(x.id))) {
            for (const o of relationsOf(p, all).outgoing) for (const id of o.ids) if (cast.byId.get(id)?.type === 'faction') ids.add(id);
        }
    }
    const said = lower(userText);
    if (said) {
        for (const e of cast.entries) if (e.id !== playerId && namesOf(e).some((n) => n.length >= 4 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(said))) ids.add(e.id);
    }
    return [...ids];
}

// After a reply: what has happened that others would react to. The first
// look only records what is there. Also notes the player character's
// contact with the scene, and lets faded changes go.
export async function noteRipples(chatId, chatKey, settingId) {
    try {
        if (!isWorldOn() || !settingId) return;
        const doc = getChatDoc(chatKey);
        const cast = await worldCast(chatId, settingId);
        const quests = (await questBoard(chatId, chatKey, settingId).catch(() => [])).map((q) => ({ id: q.id, name: q.name, status: q.status, involved: q.involved }));
        const knowledge = await allKnowledge(settingId, cast.nameOf);
        const { ripples, seen } = findRipples(doc.gm.world.seen, { quests, dead: doc.dead, knowledge, beliefsSeen: doc.beliefsSeen }, { nameOf: cast.nameOf });
        const placeIds = scenePlaces(settingId, doc.canonical.locationId);
        const contact = [...placeIds, ...await touchedIds(chatId, settingId, cast, { castIds: doc.canonical.castIds, placeIds, playerId: playerIdOf(settingId, cast.characters) })];
        updateChatDoc(chatKey, (d) => {
            d.gm.world.seen = seen;
            for (const r of ripples) addRipple(d.gm.world, { ...r, id: newLocalId('r'), day: d.canonical.day });
            settleSurfaced(d.gm.world, d.canonical.day);
            settleChanges(d.gm.world, d.canonical.day);
            noteContact(d.gm.world, contact, { day: d.canonical.day, turn: d.turn });
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

// Romance someone away would mind (the director's ROMANCE line - src/
// director/jealousy.js): word of it may reach them, and they may act.
export function noteHeartRipple(chatKey, { text, ties = [] }) {
    try {
        if (!isWorldOn()) return;
        updateChatDoc(chatKey, (d) => { addRipple(d.gm.world, { id: newLocalId('r'), kind: 'heart', text, day: d.canonical.day, ties: ties.filter(Boolean), reach: 'local' }); });
    } catch (err) {
        console.warn(LOG_PREFIX, 'the world could not note what someone would mind', err);
    }
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
        const { level, surfacing, places: placesMode, deaths } = worldSettings();
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
        const places = await listEntries(chatId, settingId, 'location').catch(() => []);
        const placeById = new Map(places.map((p) => [p.id, p.name]));
        const nameOf = (id) => cast.nameOf(id) || placeById.get(id) || '';
        const part = worldPart({
            ripples, stakeholders: found, schemes, day,
            daysPassed: world.lastDay === null ? 1 : day - world.lastDay,
            limits: stirOf(limits, { aim: aim?.word ?? '', day, quietUntil: world.quietUntil }),
            aim, surfacing, canonOnly, userName, ownPass,
            lasting: lastingLines(world, { nameOf }),
            situationsOpen: openSituations(world).length,
            changes: { places: placesMode, deaths },
        });
        if (!part.text) {
            updateChatDoc(chatKey, (d) => markPass(d.gm.world, { day: d.canonical.day, turn: d.gm.counters.turn }));
            return null;
        }
        const placeOf = (name) => places.find((p) => namesOf(p).includes(lower(name)))?.id ?? '';
        const ids = [...new Set([...found.map((s) => s.id), ...schemers])];
        // What a scheme may change, and who it may never touch (§2): no one
        // in the scene, not the place the scene is in, not the player
        // character; a death never for a plot device, an unkillable one, or
        // anyone the chat's stance spares.
        const stance = stanceFor(doc, getSettings());
        const changes = {
            places: placesMode, deaths, present: doc.canonical.castIds, placeIds: doc.canonical.locationId ? [doc.canonical.locationId] : [], playerId,
            isPerson: (id) => cast.byId.get(id)?.type === 'character',
            isFaction: (id) => cast.byId.get(id)?.type === 'faction',
            mayKill: (id) => { const e = cast.byId.get(id); return !!e && !isDead(getChatDoc(chatKey), id) && mayDie(e, { stance }); },
        };
        const apply = (answer) => {
            let counts = null;
            updateChatDoc(chatKey, (d) => {
                counts = applyWorld(d.gm.world, answer ?? { schemes: [] }, {
                    day: d.canonical.day, turn: d.gm.counters.turn, resolve: cast.resolve, nameOf, placeOf, limits,
                    aim: aim?.word ?? '', surfacing, ids, canonOnly, agenda: ownPass, changes, newId: newLocalId,
                });
                for (const x of counts.extras.filter((e) => e.way === 'happening')) addHappening(d.gm, { id: newLocalId('ag'), text: x.text, day: x.day, ties: x.ties, source: 'world' });
                // The day plan's off-screen lines are the world's moves today.
                if (d.gm.day && d.gm.day.day === d.canonical.day) d.gm.day.offscreen = offscreenOf(d.gm.world, d.canonical.day);
            });
            // Deaths the user allows without asking (§2).
            for (const x of counts.extras.filter((e) => e.way === 'death')) void worldDeath(chatId, chatKey, x);
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

// THE WORLD HERE NOW for the director (src/world/situations.js
// worldHereSection): the changed place, the situations touching it or the
// people here, and what has become of a faction or person the player
// character has come back to. Facts, so shown even while the scene is
// tense. '' when off or nothing applies.
export async function worldHereFor(chatId, chatKey, settingId, { userText = '' } = {}) {
    try {
        if (!isWorldOn() || !settingId) return '';
        const doc = getChatDoc(chatKey);
        const world = doc.gm.world;
        const lasting = Object.keys(world.overlays.places).length || openSituations(world).length || Object.keys(world.overlays.people).length
            || Object.keys(world.conditions).length || world.log.length;
        if (!lasting) return '';
        const cast = await worldCast(chatId, settingId);
        const placeIds = scenePlaces(settingId, doc.canonical.locationId);
        const playerId = playerIdOf(settingId, cast.characters);
        const touched = (await touchedIds(chatId, settingId, cast, { castIds: doc.canonical.castIds, placeIds, playerId, userText }))
            .map((id) => ({ id, name: cast.nameOf(id) })).filter((t) => t.name);
        return worldHereSection(world, { day: doc.canonical.day, turn: doc.turn, placeIds, present: doc.canonical.castIds, touched, nameOf: cast.nameOf });
    } catch (err) {
        console.warn(LOG_PREFIX, 'no WORLD HERE NOW for the director', err);
        return '';
    }
}

// A death off scene (§2), allowed by the user or their setting: the dead
// stay dead (src/state/death.js); the log says so.
async function worldDeath(chatId, chatKey, { id, name, how }) {
    try {
        if (await markDead(chatKey, { id, name, how, source: 'world', chatId })) {
            updateChatDoc(chatKey, (d) => { d.gm.world.log = [...d.gm.world.log, { day: d.canonical.day, text: `${name} died off scene - ${how}.`, schemeId: '', situationId: '', ties: [id], veiled: false }].slice(-120); });
            console.info(LOG_PREFIX, `${name} died off scene: ${how}`);
        }
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not record a death off scene', err);
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

// Changes to places: 'on' | 'ask' | 'off'; off-scene deaths: 'ask' |
// 'allow' | 'never' (§6).
export function setWorldPlaces(value) {
    getSettings().world.places = ['on', 'ask', 'off'].includes(value) ? value : 'on';
    saveSettings();
}

export function setWorldDeaths(value) {
    getSettings().world.deaths = ['ask', 'allow', 'never'].includes(value) ? value : 'ask';
    saveSettings();
}

// ---- phase 3: the user's controls for situations and changes

export function endSituationNow(chatKey, id) {
    let done = false;
    updateChatDoc(chatKey, (d) => { done = endSituation(d.gm.world, id, d.canonical.day); });
    return done;
}

// A change waiting for the user's say-so: yes carries it out (a death is
// marked, a place changed), no lets it go.
export async function answerChange(chatId, chatKey, id, yes) {
    let p = null;
    updateChatDoc(chatKey, (d) => {
        p = answerPending(d.gm.world, id, yes);
        if (p?.kind === 'place') d.gm.world.log = [...d.gm.world.log, { day: d.canonical.day, text: `${p.name}: ${p.text}`, schemeId: p.schemeId, situationId: '', ties: [], veiled: false }].slice(-120);
    });
    if (p?.kind === 'death') await worldDeath(chatId, chatKey, { id: p.targetId, name: p.name, how: p.text });
    return p;
}

// Takes a change back: kind 'place' | 'person' | 'stance' | 'condition'.
export function undoWorldChange(chatKey, kind, key) {
    let done = false;
    updateChatDoc(chatKey, (d) => { done = undoChange(d.gm.world, kind, key); });
    return done;
}

// "Make it part of the setting" for a changed place: its description
// takes the change in, and the overlay goes. Never in a canon-only setting
// or on an entry that takes no generated detail. -> a message.
export async function makePlaceCanon(chatId, chatKey, settingId, placeId) {
    try {
        if (!settingId || isCanonOnly(settingId) || !mayAddGeneratedDetail(settingId, placeId)) return { ok: false, message: 'This place keeps to its canon: the change stays in this chat only.' };
        const entry = await getEntry(chatId, settingId, placeId);
        if (!entry) return { ok: false, message: 'That place is not in the library any more.' };
        const before = entry.base?.description ?? entry.description ?? '';
        let made = null;
        updateChatDoc(chatKey, (d) => { made = canonizePlace(d.gm.world, placeId, before, { newId: newLocalId }); });
        if (!made) return { ok: false, message: 'Nothing to make part of the setting.' };
        await updateEntry(chatId, settingId, placeId, { description: made.description });
        return { ok: true, message: `${made.record.name || 'The place'} now says so in the setting.` };
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not make the change part of the setting', err);
        return { ok: false, message: 'Could not change the setting - see the console.' };
    }
}

// Undo of "make it part of the setting": the old description comes back,
// and the change is this chat's again.
export async function undoPlaceCanon(chatId, chatKey, settingId, recordId) {
    try {
        let r = null;
        updateChatDoc(chatKey, (d) => { r = uncanonize(d.gm.world, recordId, d.canonical.day); });
        if (!r) return { ok: false, message: 'Nothing to undo.' };
        await updateEntry(chatId, settingId, r.targetId, { description: r.before });
        return { ok: true, message: `${r.name || 'The place'} has its old description back.` };
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not undo the change to the setting', err);
        return { ok: false, message: 'Could not change the setting back - see the console.' };
    }
}
