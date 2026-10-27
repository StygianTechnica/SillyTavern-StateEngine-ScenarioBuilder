// Keeps characters' runtime "factions" in step with the library and the
// story. A character has two faction fields (State Engine's defaults since
// 2026-10-17; the user asked for them, so they are not an SB-102 addition):
//   factions       settable - Scenario Builder writes it;
//   faction_ties   prompted: the factions the story shows the character
//                  tied to (the detection). State Engine adds a newly shown
//                  tie to factions itself.
// A setting made before then (factions prompted, no faction_ties) is set up
// the same way automatically, the first time it is synced - FACTION
// TRACKING is on by default, with nothing to switch on.
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

// Sets faction tracking up for a setting (factions settable, faction_ties
// added): done automatically for a setting from before it was the default.
// -> true when done.
export async function setupFactionTracking(settingId) {
    const defs = trackingDefs(await getObjectFields(settingId, 'character'));
    if (!defs) return false;
    return !!(await setObjectFields(settingId, 'character', defs));
}

// Relationship kinds, written from a character to a faction, that make the
// character one of its people.
export const MEMBER_KINDS = Object.freeze(new Set(['member of', 'leads', 'serves', 'works for']));

// Words that set someone against a faction, or put them outside it.
const OUTSIDE = /\b(rival|enem|oppos|hunt|against|hate|fears?\b|feared|fled|flee|escap|left\b|leaving|former|ex(?:-|\b)|once\b|betray|desert|exile|spy|spies|infiltrat|owes?\b|owing|target|war\b|wars\b)/i;
const LEAD = /\b(boss|leader|head|chief|captain|commander|founder|master|mistress|ruler|king|queen|don|kingpin|matriarch|patriarch|ceo|president|runs|leads|heads|commands|rules|founded)\b/i;
const MEMBER = /\b(members?|belongs?|part|works?|working|serves?|serving|agents?|operatives?|soldiers?|enforcers?|recruits?|lieutenants?|thugs?|guards?|knights?|initiates?|acolytes?|loyal|sworn|joined|joins)\b/i;

// Pure: the kind a relationship a model wrote to a faction stands for, when
// it makes the character one of its people ("boss of" -> leads, "enforcer
// for" -> member of); null when it does not.
export function memberKindOf(kind) {
    const k = String(kind ?? '').toLowerCase().trim();
    if (MEMBER_KINDS.has(k)) return k;
    if (!k || OUTSIDE.test(k)) return null;
    if (LEAD.test(k) || /\blead/.test(k)) return 'leads';
    if (/\bserv/.test(k)) return 'serves';
    if (/\bwork(s|ing)? for\b|\bemploy/.test(k)) return 'works for';
    if (MEMBER.test(k)) return 'member of';
    return null;
}

// Pure: the factions a new character's idea makes them one of - "the boss
// of the Iron Hand", "an Iron Hand enforcer", "who works for the Guild" -
// and not those it only mentions ("owes the Iron Hand", "a rival of...").
// -> [{ id, name, kind: 'leads' | 'member of' }]
export function briefMemberships(brief, factions) {
    const text = String(brief ?? '');
    const out = [];
    for (const f of factions ?? []) {
        const record = f.base ?? f;
        // Each mention in order; the first that says where they stand decides.
        const mentions = [];
        for (const n of [f.name, ...(record.aliases ?? f.aliases ?? [])]) {
            const name = String(n ?? '').trim();
            if (name.length < 3) continue;
            const re = new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'giu');
            for (const m of text.matchAll(re)) mentions.push({ start: m.index + m[1].length, name });
        }
        for (const { start, name } of mentions.sort((a, b) => a.start - b.start)) {
            const stand = mentionStand(text, start, name);
            if (stand === 'outside') break;
            if (stand) {
                out.push({ id: f.id, name: f.name, kind: stand });
                break;
            }
        }
    }
    return out;
}

// Where one mention of a faction puts someone: 'leads', 'member of',
// 'outside' (set against it or gone from it), or null (only mentioned).
function mentionStand(text, start, name) {
    // Its clause: from the last break before the name to the next after it.
    const before = text.slice(0, start).split(/[.;:!?\n,]|\b(?:and|but|while|who|whom|though|yet|whose)\b/i).pop().split(/\s+/).filter(Boolean).slice(-5).join(' ');
    const after = text.slice(start + name.length).split(/[.;:!?\n,]|\b(?:and|but|while|who|whom|though|yet)\b/i)[0];
    // The words right after it: "Iron Hand enforcer", "the Dogs' new lieutenant".
    const next = /^\s*(?:['’]s?\s+)?((?:[\p{L}-]+\s*){0,2})/u.exec(after)?.[1] ?? '';
    if (OUTSIDE.test(before) || OUTSIDE.test(next)) return 'outside';
    if (LEAD.test(before) || LEAD.test(next)) return 'leads';
    // "in the Iron Hand" is in it; "heard of the Iron Hand" is not.
    if (MEMBER.test(before) || MEMBER.test(next) || /\b(in|inside|within|among|under)\s+(the\s+)?$/i.test(`${before} `)) return 'member of';
    return null;
}

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
        // An older setting gets the two fields first (State Engine refuses
        // writes to a prompted factions field).
        if (!await hasFactionTracking(settingId) && !await setupFactionTracking(settingId)) {
            console.warn(LOG_PREFIX, 'could not set the setting\'s character fields up for faction tracking');
            return 0;
        }
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
            let stored = true;
            if (JSON.stringify([...next].sort()) !== JSON.stringify([...current].sort())) {
                stored = stateEngine.setObjectRuntimeValue(EXTENSION_ID, instanceId, chatId, id, FACTIONS_FIELD, next) !== null;
                if (stored) changed += 1;
            }
            // Remembered only once it is really there: a refused write
            // writes nothing.
            if (!stored) continue;
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
