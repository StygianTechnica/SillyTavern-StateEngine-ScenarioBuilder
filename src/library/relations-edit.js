// Editing relationships (spec 6.2):
//   - LINKS in the setting are State Engine reference fields (a faction's
//     members, an item's owner, related ids) - added and removed through
//     the Object API on the object that holds the field (SB-110).
//   - AUTHORED relationships (ally, rival, family, mentor...) are Scenario
//     Builder metadata in the setting document, where State Engine has no
//     field for them (SB-110, SB-112). For a pair of entries they take
//     precedence over what the story (Archivist) says - that is how a wrong
//     story relationship is corrected without writing to Archivist (SB-005).

import { getObject } from '../api/objects.js';
import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { newLocalId } from '../store/schema.js';
import { updateEntry } from './library.js';

// Relationship kinds offered (any text is allowed). Mutual kinds read the
// same from both sides.
export const RELATION_KINDS = Object.freeze([
    'ally', 'friend', 'rival', 'enemy', 'family', 'sibling', 'spouse / partner', 'lover',
    'parent of', 'child of', 'mentor of', 'student of', 'employer of', 'works for', 'serves', 'leads',
    'member of', 'owes', 'protects', 'fears', 'distrusts', 'admires', 'hates', 'loves', 'knows',
]);
export const MUTUAL_KINDS = Object.freeze(new Set(['ally', 'friend', 'rival', 'enemy', 'family', 'sibling', 'spouse / partner', 'lover', 'knows']));
const INVERSE = Object.freeze({ 'parent of': 'child of', 'child of': 'parent of', 'mentor of': 'student of', 'student of': 'mentor of', 'employer of': 'works for', 'works for': 'employer of', leads: 'led by', serves: 'served by', 'member of': 'has member' });

// ---- links (reference fields)

const valueOf = (obj, field) => (obj?.base ?? obj ?? {})[field];

// Removes `targetId` from `field` of the object `ownerId`.
export async function removeLink(chatId, settingId, ownerId, field, targetId) {
    const owner = await getObject(chatId, ownerId);
    if (!owner) return false;
    const current = valueOf(owner, field);
    const next = Array.isArray(current) ? current.filter((id) => id !== targetId) : (current === targetId ? '' : current);
    if (JSON.stringify(next) === JSON.stringify(current)) return true;
    return !!await updateEntry(chatId, settingId, ownerId, { [field]: next });
}

// Puts `targetId` into `field` of `ownerId` (a list gains it; a single
// reference is replaced).
export async function addLink(chatId, settingId, ownerId, field, targetId, { multiple = true } = {}) {
    const owner = await getObject(chatId, ownerId);
    if (!owner) return false;
    const current = valueOf(owner, field);
    const next = multiple ? [...new Set([...(Array.isArray(current) ? current : []), targetId])] : targetId;
    return !!await updateEntry(chatId, settingId, ownerId, { [field]: next });
}

// ---- authored relationships

export function listRelations(settingId) {
    return getSettingDoc(settingId).relations;
}

// rel: { from, to, kind, note, mutual }. -> the stored relationship
export function addRelation(settingId, rel) {
    const stored = { id: newLocalId('r'), from: rel.from, to: rel.to, kind: String(rel.kind || 'knows').trim(), note: String(rel.note ?? '').trim(), mutual: rel.mutual ?? MUTUAL_KINDS.has(rel.kind) };
    if (!stored.from || !stored.to || stored.from === stored.to) return null;
    updateSettingDoc(settingId, (d) => {
        // One authored relationship per ordered pair: a new one replaces it.
        d.relations = [...d.relations.filter((r) => !(r.from === stored.from && r.to === stored.to)), stored];
    });
    return stored;
}

export function updateRelation(settingId, id, patch) {
    updateSettingDoc(settingId, (d) => {
        d.relations = d.relations.map((r) => (r.id === id ? { ...r, ...patch } : r));
    });
}

export function removeRelation(settingId, id) {
    updateSettingDoc(settingId, (d) => { d.relations = d.relations.filter((r) => r.id !== id); });
}

// An entry's authored relationships, seen from it (pure):
// -> [{ rel, otherId, kind (as it reads from this entry), direction }]
export function relationsFor(entryId, relations) {
    const out = [];
    for (const r of relations ?? []) {
        if (r.from === entryId) out.push({ rel: r, otherId: r.to, kind: r.kind, direction: 'out' });
        else if (r.to === entryId) out.push({ rel: r, otherId: r.from, kind: r.mutual ? r.kind : (INVERSE[r.kind] ?? `${r.kind} (them)`), direction: 'in' });
    }
    return out;
}

// Whether an authored relationship covers the pair (either way), so the
// story's one for that pair is superseded.
export function pairCovered(aId, bId, relations) {
    return (relations ?? []).some((r) => (r.from === aId && r.to === bId) || (r.from === bId && r.to === aId));
}

// A line of prompt text for an authored relationship, from `name`'s side.
export function authoredLine(name, otherName, item) {
    return `${name} → ${otherName}: ${item.kind}${item.rel.note ? ` - ${item.rel.note}` : ''}`;
}
