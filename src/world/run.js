// The world meanwhile - the runner (docs/DESIGN - THE WORLD MEANWHILE.md,
// phase 1). After each reply it looks for ripples in the chat's records
// (quests ended, deaths, secrets out, oaths broken, beliefs shaken) with
// no model call. When the planner's DAY pass plans a new in-game day, it
// adds the world's part to that pass (worldForDay) - the ripples, who
// would care, the schemes under way - and applies the answer. At the Quiet
// level that is the world's only cost. Before each reply the director gets
// the MEANWHILE lines (meanwhileFor). Never throws.

import { LOG_PREFIX } from '../constants.js';
import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { listEntries, allKnowledge, playerIdOf, getParents } from '../library/library.js';
import { listRelations, relationsFor } from '../library/relations-edit.js';
import { relationsOf } from '../library/relations.js';
import { libraryMemberships } from '../library/faction-sync.js';
import { pathOf } from '../library/hierarchy.js';
import { isPower } from '../library/powers.js';
import { questBoard } from '../quests/sync.js';
import { deadIds } from '../state/death.js';
import {
    limitsOf, worldOn, findRipples, addRipple, waitingRipples, stakeholders, openSchemes, applyWorld,
    meanwhileSection, markShown, settleSurfaced, dismissScheme, holdScheme, offscreenOf,
} from './model.js';
import { worldPart } from './prompts.js';

const worldSettings = () => getSettings().world ?? { level: 'off', surfacing: 'all' };

// Whether the world moves: the planner is on (it carries the world) and
// the level is not Off.
export const isWorldOn = () => getSettings().planner?.enabled === true && worldOn(worldSettings().level);

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

// The world's part of the DAY pass, for planner/run.js runDay: { part,
// apply(answer, aim) } - part goes to buildDayPrompt as `world`; apply
// takes the answer's world object in. null when the world is off or has
// nothing to move.
export async function worldForDay(chatId, chatKey, settingId, { aim = null, userName = '' } = {}) {
    try {
        if (!isWorldOn() || !settingId) return null;
        const { level, surfacing } = worldSettings();
        const limits = limitsOf(level);
        const doc = getChatDoc(chatKey);
        const world = doc.gm.world;
        const cast = await worldCast(chatId, settingId);
        const knowledge = await allKnowledge(settingId, cast.nameOf).catch(() => []);
        const ripples = waitingRipples(world);
        const schemes = openSchemes(world).filter((s) => !s.held);
        const schemers = [...new Set(schemes.flatMap((s) => s.who))];
        const playerId = playerIdOf(settingId, cast.characters);
        const found = stakeholders(ripples, {
            entries: cast.entries, tiesOf: cast.tiesOf, memberships: cast.memberships, knowledge,
            present: doc.canonical.castIds, playerId, skip: [...deadIds(doc)], schemers, limit: limits.stakeholders,
        }).map((s) => {
            const base = cast.byId.get(s.id)?.base ?? {};
            return { ...s, role: base.role ?? '', goals: base.goals ?? '', personality: base.personality ?? base.description ?? '' };
        });
        const part = worldPart({
            ripples, stakeholders: found, schemes, day: doc.canonical.day,
            daysPassed: world.lastDay === null ? 1 : doc.canonical.day - world.lastDay,
            limits, aim, surfacing, userName,
        });
        if (!part.text) return null;
        const places = await listEntries(chatId, settingId, 'location').catch(() => []);
        const placeOf = (name) => places.find((p) => namesOf(p).includes(lower(name)))?.id ?? '';
        const ids = [...new Set([...found.map((s) => s.id), ...schemers])];
        const apply = (answer) => {
            let counts = null;
            updateChatDoc(chatKey, (d) => {
                counts = applyWorld(d.gm.world, answer ?? { schemes: [] }, { day: d.canonical.day, resolve: cast.resolve, nameOf: cast.nameOf, placeOf, limits, aim: aim?.word ?? '', surfacing, ids, newId: newLocalId });
                // The day plan's off-screen lines are the world's moves today.
                if (d.gm.day) d.gm.day.offscreen = offscreenOf(d.gm.world, d.canonical.day);
            });
            return counts;
        };
        return { part, apply };
    } catch (err) {
        console.warn(LOG_PREFIX, 'no world for the day plan', err);
        return null;
    }
}

// The MEANWHILE section for the director ('' when off or nothing fits).
// opts: { aim: the tension aim word, quiet: the scene is tense or the
// user is lingering, userIndex: the player's message the reply answers }.
export function meanwhileFor(chatKey, settingId, { aim = '', quiet = false, userIndex = null } = {}) {
    try {
        if (!isWorldOn()) return '';
        const doc = getChatDoc(chatKey);
        const locationId = doc.canonical.locationId;
        const placeIds = locationId && settingId ? pathOf(getParents(settingId), locationId) : locationId ? [locationId] : [];
        const { text, ids } = meanwhileSection(doc.gm.world, { day: doc.canonical.day, userIndex, placeIds, present: doc.canonical.castIds, aim, quiet });
        if (ids.length) updateChatDoc(chatKey, (d) => markShown(d.gm.world, ids, userIndex));
        return text;
    } catch (err) {
        console.warn(LOG_PREFIX, 'no MEANWHILE for the director', err);
        return '';
    }
}

// The user's controls on the World view.
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

export function setWorldLevel(level) {
    getSettings().world.level = limitsOf(level) ? level : 'off';
    saveSettings();
}

export function setWorldSurfacing(value) {
    getSettings().world.surfacing = ['all', 'talk', 'log'].includes(value) ? value : 'all';
    saveSettings();
}
