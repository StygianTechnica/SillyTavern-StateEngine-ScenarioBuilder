// An entry's relationships, read from what the library already holds
// (spec 6.2): State Engine reference fields in both directions (a field
// holding another object's id IS a reference - ids are unique, prefixed
// strings, which is how State Engine itself treats them), related ids, and
// the location tree. Pure (SB-804). Relationship kinds the library doesn't
// store yet (allies, enemies, family) come from Archivist later - see
// docs/ROADMAP.md.

import { pathOf, childrenOf } from './hierarchy.js';

// Fields that are not references even when they hold an id-looking value.
const SKIP = new Set(['id', 'type', 'settingId', 'activeVariant', 'scope']);

function refsIn(record) {
    const out = [];
    for (const [key, value] of Object.entries(record ?? {})) {
        if (SKIP.has(key)) continue;
        const ids = Array.isArray(value) ? value.filter((v) => typeof v === 'string') : (typeof value === 'string' ? [value] : []);
        if (ids.length) out.push([key, ids]);
    }
    return out;
}

// entry: the object; entries: every library entry (any type); parents: the
// location parent map; labelOf(typeId, fieldName) -> display label.
// -> { parentPath: [id], children: [id],
//      outgoing: [{ field, label, ids }],  this entry's fields pointing at others
//      incoming: [{ id, field, label }] }  others' fields pointing at this entry
export function relationsOf(entry, entries, parents = {}, labelOf = (_t, f) => f) {
    const known = new Set(entries.map((e) => e.id));
    const record = entry.base ?? entry;
    const outgoing = [];
    for (const [field, ids] of refsIn(record)) {
        const hits = ids.filter((id) => id !== entry.id && known.has(id));
        if (hits.length) outgoing.push({ field, label: field === 'related_entity_ids' ? 'Related' : labelOf(entry.type, field), ids: hits });
    }
    const incoming = [];
    for (const other of entries) {
        if (other.id === entry.id) continue;
        for (const [field, ids] of refsIn(other.base ?? other)) {
            if (ids.includes(entry.id)) incoming.push({ id: other.id, field, label: field === 'related_entity_ids' ? 'Related' : labelOf(other.type, field) });
        }
    }
    const locationIds = entries.filter((e) => e.type === 'location').map((e) => e.id);
    return {
        parentPath: entry.type === 'location' ? pathOf(parents, entry.id).slice(0, -1) : [],
        children: entry.type === 'location' ? childrenOf(parents, locationIds, entry.id) : [],
        outgoing,
        incoming,
    };
}
