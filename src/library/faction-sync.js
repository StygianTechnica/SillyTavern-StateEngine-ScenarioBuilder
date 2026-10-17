// Keeps characters' runtime "factions" in step with the library and the
// story. State Engine makes "factions" a PROMPTED field, which no other
// extension may write; FACTION TRACKING (set up on the user's request,
// SB-102) changes the setting's character fields:
//   factions       no longer prompted - Scenario Builder writes it;
//   faction_ties   a new prompted field: the factions the story shows the
//                  character tied to (the detection).
// Then each character's factions are the library's memberships - a
// faction's Members field, and the relationships the user wrote from a
// character to a faction ("member of", "leads", "serves", "works for") -
// plus the story's faction_ties. A faction set by hand stays; one Scenario
// Builder wrote that neither the library nor the story holds any more is
// taken out - it remembers what it wrote, per chat (chat document
// `factionsWritten`). Without tracking set up nothing is written.

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { getSettingDoc } from '../store/setting-store.js';
import { getStateEngine } from '../api/state-engine.js';
import { EXTENSION_ID } from '../constants.js';
import { listEntries } from './library.js';
import { getObjectFields, setObjectFields } from '../api/objects.js';

export const FACTIONS_FIELD = 'factions';
export const TIES_FIELD = 'faction_ties';

const TIES_DEF = Object.freeze({
    name: TIES_FIELD,
    label: 'Faction ties (story)',
    description: 'The factions the story shows this character tied to - Scenario Builder reads it to keep Factions complete.',
    scope: 'chat',
    type: 'array',
    itemType: 'object',
    itemObjectType: 'faction',
    behaviors: { prompted: true, increment: false },
    prompted: {
        instructions: 'The factions, groups or organizations the story shows this character belonging to, serving, leading or openly tied to. Start from the current value: keep the ones still true, add any the story shows, remove only those the story ends. [] if none is shown.',
        mode: 'update',
    },
});

// Pure: whether a setting's character fields (`defs`) are set up for
// faction tracking.
export function isFactionTracking(defs) {
    const factions = (defs ?? []).find((d) => d.name === FACTIONS_FIELD);
    return !!factions && factions.behaviors?.prompted !== true && (defs ?? []).some((d) => d.name === TIES_FIELD);
}

// Pure: the character fields with tracking set up - factions no longer
// prompted, faction_ties added after it. null when there is no factions
// field to take over.
export function trackingDefs(defs) {
    const list = (defs ?? []).map((d) => ({ ...d }));
    const at = list.findIndex((d) => d.name === FACTIONS_FIELD);
    if (at < 0) return null;
    list[at] = { ...list[at], behaviors: { ...(list[at].behaviors ?? {}), prompted: false } };
    if (!list.some((d) => d.name === TIES_FIELD)) list.splice(at + 1, 0, structuredClone(TIES_DEF));
    return list;
}

// Whether the setting tracks factions. Never throws.
export async function hasFactionTracking(settingId) {
    try {
        return isFactionTracking(await getObjectFields(settingId, 'character'));
    } catch {
        return false;
    }
}

// Sets faction tracking up for a setting (the user's request). -> true when done.
export async function setupFactionTracking(settingId) {
    const defs = trackingDefs(await getObjectFields(settingId, 'character'));
    if (!defs) return false;
    return !!(await setObjectFields(settingId, 'character', defs));
}

// Relationship kinds, written from a character to a faction, that make the
// character one of its people.
export const MEMBER_KINDS = Object.freeze(new Set(['member of', 'leads', 'serves', 'works for']));

const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

// Pure: the library's factions for each character.
// factions: [{ id, members? / base.members? }]; relations: [{ from, to, kind }]
// -> Map characterId -> [factionId]
export function libraryMemberships(factions, relations) {
    const factionIds = new Set((factions ?? []).map((f) => f.id));
    const out = new Map();
    const add = (charId, factionId) => {
        if (!out.has(charId)) out.set(charId, new Set());
        out.get(charId).add(factionId);
    };
    for (const f of factions ?? []) for (const m of ids(f.base?.members ?? f.members)) add(m, f.id);
    for (const r of relations ?? []) {
        if (factionIds.has(r.to) && MEMBER_KINDS.has(String(r.kind).toLowerCase())) add(r.from, r.to);
    }
    return new Map([...out].map(([k, v]) => [k, [...v]]));
}

// Pure: the runtime list after bringing in the library's memberships.
// runtime: what the character holds now; library: what the library says;
// written: what Scenario Builder wrote last time.
export function mergeFactions(runtime, library, written) {
    const lib = new Set(ids(library));
    const dropped = new Set(ids(written).filter((id) => !lib.has(id)));
    return [...new Set([...ids(runtime).filter((id) => !dropped.has(id)), ...lib])];
}

// Pure: what Scenario Builder holds a character's factions to be - the
// library's memberships, then the story's ties (real factions only).
export function wantedFactions(library, ties, factionIds) {
    const known = factionIds ? new Set(factionIds) : null;
    return [...new Set([...ids(library), ...ids(ties).filter((id) => !known || known.has(id))])];
}

// Brings the open chat's characters' runtime factions in line with the
// library and the story. Never throws. -> how many characters changed.
export async function syncFactions(chatId, chatKey, settingId) {
    if (!chatId || !chatKey || !settingId) return 0;
    try {
        const { stateEngine, instanceId } = await getStateEngine();
        if (typeof stateEngine.setObjectRuntimeValue !== 'function') return 0;
        // State Engine refuses writes to a prompted factions field.
        if (!await hasFactionTracking(settingId)) return 0;
        const factions = await listEntries(chatId, settingId, 'faction');
        const factionIds = factions.map((f) => f.id);
        const memberships = libraryMemberships(factions, getSettingDoc(settingId).relations);
        const characters = await listEntries(chatId, settingId, 'character');
        const written = getChatDoc(chatKey).factionsWritten;
        const chars = new Set([...memberships.keys(), ...characters.map((c) => c.id), ...Object.keys(written)]);
        const record = { ...written };
        let changed = 0;
        for (const id of chars) {
            const ties = ids(stateEngine.getObjectField(EXTENSION_ID, instanceId, chatId, id, TIES_FIELD));
            const library = wantedFactions(memberships.get(id), ties, factionIds);
            const current = ids(stateEngine.getObjectField(EXTENSION_ID, instanceId, chatId, id, FACTIONS_FIELD));
            const next = mergeFactions(current, library, written[id]);
            if (JSON.stringify([...next].sort()) !== JSON.stringify([...current].sort())) {
                if (stateEngine.setObjectRuntimeValue(EXTENSION_ID, instanceId, chatId, id, FACTIONS_FIELD, next) !== null) changed += 1;
            }
            if (library.length) record[id] = library;
            else delete record[id];
        }
        if (JSON.stringify(record) !== JSON.stringify(written)) updateChatDoc(chatKey, (d) => { d.factionsWritten = record; });
        return changed;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not bring characters\' factions in line with the library', err);
        return 0;
    }
}
