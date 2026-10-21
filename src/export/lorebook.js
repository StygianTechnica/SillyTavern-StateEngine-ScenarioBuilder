// A standard World Info book from a world (spec SB-160) - the pure half.
// It works in plain SillyTavern, with no Scenario Builder or State Engine:
// one entry per object, written as readable text from its fields, keyed by
// its name and aliases; the setting's overview as one constant entry. It is
// output, made again whenever asked (SB-164) - never a second source of
// truth. GM notes stay out unless asked for; an entry the user excluded
// from the guidance stays out too.
//
// Input is a world file's two halves (src/worlds/model.js): State Engine's
// export of the setting and Scenario Builder's library document - so a
// lorebook can be made from the world as it is, or from any starting point.

import { describeMagic, describeTech } from '../library/world-options.js';

export const LOREBOOK_TYPES = Object.freeze(['character', 'location', 'faction', 'item', 'creature', 'lore']);
export const DEFAULT_LOREBOOK_OPTIONS = Object.freeze({ types: LOREBOOK_TYPES, gmNotes: false, maxChars: 2000 });

const TYPE_NOUNS = Object.freeze({ character: 'character', location: 'place', faction: 'faction', item: 'item', creature: 'creature', lore: 'lore' });
const OVERVIEW_LABELS = Object.freeze([
    ['premise', 'Premise'], ['worldType', 'World'], ['era', 'Era'], ['tone', 'Tone'], ['themes', 'Themes'], ['rules', 'Rules of the world'],
]);
// Fields that are Scenario Builder's or State Engine's bookkeeping, not the world's.
const SKIP_FIELDS = new Set(['faction_ties']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const paragraphs = (s) => String(s ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).join('\n\n');

function cut(text, max) {
    if (text.length <= max) return text;
    const at = text.lastIndexOf(' ', max - 1);
    return `${text.slice(0, at > max * 0.6 ? at : max - 1).trim()}…`;
}

// A field's value as text: names for references, lists joined.
function valueText(value, def, nameOf) {
    const isRef = def?.type === 'object' || (def?.type === 'array' && def.itemType === 'object');
    const list = Array.isArray(value) ? value : [value];
    const parts = list.map((v) => {
        if (v === null || v === undefined || v === '') return '';
        if (isRef) return nameOf(v) ?? '';
        if (isObject(v)) return Object.values(v).map(clean).filter(Boolean).join(' - ');
        return clean(v);
    }).filter(Boolean);
    return parts.join(', ');
}

function overviewEntry(overview) {
    const o = isObject(overview) ? overview : {};
    const lines = OVERVIEW_LABELS.filter(([key]) => clean(o[key])).map(([key, label]) => `${label}: ${paragraphs(o[key])}`);
    const magic = describeMagic(o.magic);
    const tech = describeTech(o.tech);
    lines.push(...magic.lines, ...tech.lines, ...magic.limits, ...tech.limits);
    return lines.join('\n');
}

// -> { entries: [{ key, comment, content, constant, order, objectId }], counts: { [type]: n } }
export function buildLorebook({ setting, library }, options = {}) {
    const opts = { ...DEFAULT_LOREBOOK_OPTIONS, ...options };
    const types = new Set(opts.types ?? LOREBOOK_TYPES);
    const objects = isObject(setting?.objects) ? setting.objects : {};
    const doc = isObject(library) ? library : {};
    const metaOf = (id) => (isObject(doc.entries?.[id]) ? doc.entries[id] : {});
    const byId = new Map();
    for (const records of Object.values(objects)) for (const r of Object.values(records ?? {})) if (isObject(r)) byId.set(r.id, r);
    const nameOf = (id) => byId.get(id)?.name ?? null;
    const pathOf = (id) => {
        const names = [];
        const seen = new Set();
        for (let p = metaOf(id).parentId; p && !seen.has(p); p = metaOf(p).parentId) {
            seen.add(p);
            if (nameOf(p)) names.push(nameOf(p));
        }
        return names;
    };

    const entries = [];
    const counts = {};
    const overview = overviewEntry(doc.overview);
    if (overview) entries.push({ key: [], comment: 'The world', content: overview, constant: true, order: 200, objectId: '' });

    for (const type of LOREBOOK_TYPES) {
        if (!types.has(type)) continue;
        const defs = (Array.isArray(setting?.fields?.[type]) ? setting.fields[type] : []).filter((d) => d.scope === 'global' && !SKIP_FIELDS.has(d.name));
        const records = Object.values(objects[type] ?? {}).filter(isObject).sort((a, b) => a.name.localeCompare(b.name));
        for (const r of records) {
            const meta = metaOf(r.id);
            if (meta.excluded === true) continue;
            const aliases = (Array.isArray(r.aliases) ? r.aliases : []).map(clean).filter(Boolean);
            const lines = [`${r.name} (${TYPE_NOUNS[type] ?? type})${aliases.length ? `, also called ${aliases.join(', ')}` : ''}.`];
            if (clean(r.description)) lines.push(paragraphs(r.description));
            const within = type === 'location' ? pathOf(r.id) : [];
            if (within.length) lines.push(`Within: ${within.join(' > ')}`);
            for (const def of defs) {
                const text = valueText(r[def.name], def, nameOf);
                if (text) lines.push(`${def.label || def.name}: ${text}`);
            }
            const ties = (Array.isArray(doc.relations) ? doc.relations : []).filter((rel) => rel.from === r.id || (rel.mutual && rel.to === r.id));
            const tieText = ties.map((rel) => {
                const other = nameOf(rel.from === r.id ? rel.to : rel.from);
                return other ? `${rel.kind || 'knows'} ${other}${clean(rel.note) ? ` (${clean(rel.note)})` : ''}` : '';
            }).filter(Boolean);
            if (tieText.length) lines.push(`Ties: ${tieText.join('; ')}`);
            if (opts.gmNotes && clean(meta.gmNotes)) lines.push(`GM notes: ${paragraphs(meta.gmNotes)}`);
            entries.push({
                key: [...new Set([r.name, ...aliases].map(clean).filter(Boolean))],
                comment: `${r.name} (${TYPE_NOUNS[type] ?? type})`,
                content: cut(lines.join('\n'), Math.max(200, Number(opts.maxChars) || DEFAULT_LOREBOOK_OPTIONS.maxChars)),
                constant: false,
                order: 100,
                objectId: r.id,
            });
            counts[type] = (counts[type] ?? 0) + 1;
        }
    }
    return { entries, counts };
}

// The book's data for SillyTavern: { entries: { [uid]: entry } }, each
// entry the World Info template (`template`, from world-info.js) filled in.
// `sbObjectId` marks what Scenario Builder made (SB-162).
export function toWorldInfo(built, template = {}) {
    const entries = {};
    built.entries.forEach((e, uid) => {
        entries[uid] = {
            ...structuredClone(template), uid,
            key: e.key, keysecondary: [], comment: e.comment, content: e.content,
            constant: e.constant, selective: true, order: e.order, position: 0, disable: false,
            sbObjectId: e.objectId,
        };
    });
    return { entries };
}

// A book name not taken yet: "<name>", then "<name> (2)"...
export function freeBookName(name, taken) {
    const have = new Set((taken ?? []).map((n) => String(n).toLowerCase()));
    if (!have.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) if (!have.has(`${name} (${n})`.toLowerCase())) return `${name} (${n})`;
}
