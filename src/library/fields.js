// An object type's editable baseline fields, as one simple shape shared by
// the sheet editor and generation: { name, label, kind, values, refType },
// kind one of text | longtext | list | number | boolean | enum | ref | refs.
// Read from the setting's object preset (SB-100: never a parallel field
// system), falling back to the type registry's defaults.

import { getObjectFields } from '../api/objects.js';

export function editorKind(def) {
    if (def.kind) {
        const map = { text: 'text', longtext: 'longtext', list: 'list', enum: 'enum', ref: 'ref', refs: 'refs', timestamp: 'text' };
        return { name: def.name, label: def.label || def.name, kind: map[def.kind] ?? 'text', values: def.values ?? [], refType: def.refType };
    }
    const base = { name: def.name, label: def.label || def.name, values: def.enumValues ?? [] };
    if (def.type === 'object') return { ...base, kind: 'ref', refType: def.objectType };
    if (def.type === 'array' && def.itemType === 'object') return { ...base, kind: 'refs', refType: def.itemObjectType };
    if (def.type === 'array') return { ...base, kind: 'list' };
    if (def.type === 'enum') return { ...base, kind: 'enum' };
    if (def.type === 'number') return { ...base, kind: 'number' };
    if (def.type === 'boolean') return { ...base, kind: 'boolean' };
    if (def.type === 'string') return { ...base, kind: 'longtext' };
    return { ...base, kind: 'text' };
}

// `type`: a registry entry from getObjectTypes().
export async function baselineFields(settingId, type) {
    const defs = (await getObjectFields(settingId, type.id)).filter((d) => d.scope === 'global');
    return (defs.length ? defs : type.fields).map(editorKind);
}
