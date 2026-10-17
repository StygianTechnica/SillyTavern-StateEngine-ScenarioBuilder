// Keeps characters' runtime "factions" (a State Engine runtime field, read
// from the story) in step with the memberships set in the library: a
// faction's Members field, and the relationships the user wrote from a
// character to a faction ("member of", "leads", "serves", "works for").
// What the story added on its own stays; a membership Scenario Builder
// wrote and the user later removed is taken out again - it remembers what
// it wrote, per chat (chat document `factionsWritten`).

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { getSettingDoc } from '../store/setting-store.js';
import { getStateEngine } from '../api/state-engine.js';
import { EXTENSION_ID } from '../constants.js';
import { listEntries } from './library.js';

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

// Brings the open chat's characters' runtime factions in line with the
// library. Never throws. -> how many characters changed.
export async function syncFactions(chatId, chatKey, settingId) {
    if (!chatId || !chatKey || !settingId) return 0;
    try {
        const { stateEngine, instanceId } = await getStateEngine();
        if (typeof stateEngine.setObjectRuntimeValue !== 'function') return 0;
        const memberships = libraryMemberships(await listEntries(chatId, settingId, 'faction'), getSettingDoc(settingId).relations);
        const written = getChatDoc(chatKey).factionsWritten;
        const chars = new Set([...memberships.keys(), ...Object.keys(written)]);
        const record = { ...written };
        let changed = 0;
        for (const id of chars) {
            const library = memberships.get(id) ?? [];
            const current = ids(stateEngine.getObjectField(EXTENSION_ID, instanceId, chatId, id, 'factions'));
            const next = mergeFactions(current, library, written[id]);
            if (JSON.stringify([...next].sort()) !== JSON.stringify([...current].sort())) {
                if (stateEngine.setObjectRuntimeValue(EXTENSION_ID, instanceId, chatId, id, 'factions', next) !== null) changed += 1;
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
