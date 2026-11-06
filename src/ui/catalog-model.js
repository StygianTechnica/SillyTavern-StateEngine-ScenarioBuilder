// The catalog browser's logic as plain functions (unit-tested): filtering,
// sorting, an entry's status in the chat, and an entry's own story
// history.

import { isWithin, pathOf, childrenOf } from '../library/hierarchy.js';

// SB-124: 'scene' (in the current scene), 'play' (has been in play in this
// chat), or 'unused'.
export function chatStatusOf(entryId, doc) {
    if (doc?.canonical?.locationId === entryId || doc?.canonical?.castIds?.includes(entryId) || doc?.canonical?.creatureIds?.includes(entryId)) return 'scene';
    if (doc?.inPlay?.includes(entryId)) return 'play';
    return 'unused';
}

export const STATUS_LABELS = Object.freeze({ scene: 'In scene', play: 'In play', unused: 'Unused' });

const text = (e) => [e.name, ...(e.aliases ?? []), ...(e.meta?.tags ?? []), e.description ?? ''].join(' ').toLowerCase();

// Where an entry is: a location's own place, or another type's "location"
// reference field.
function placeOf(entry) {
    if (entry.type === 'location') return entry.id;
    const v = entry.base?.location ?? entry.location;
    return typeof v === 'string' ? v : '';
}

// ---- quick filters: what Scenario Builder already knows about an entry.
// ctx: { doc (the chat document), playerId }.
export const QUICK_FILTERS = Object.freeze([
    { id: 'active', label: 'Active', icon: 'fa-bolt', title: 'In the scene or in play in this chat' },
    { id: 'inactive', label: 'Inactive', icon: 'fa-moon', title: 'Not in play in this chat' },
    { id: 'player', label: 'Player', icon: 'fa-gamepad', title: 'The character you play' },
    { id: 'dead', label: 'Dead', icon: 'fa-skull', title: 'Died in this chat' },
    { id: 'power', label: 'Powers', icon: 'fa-sun', title: 'Gods, spirits and forces with no body' },
    { id: 'locked', label: 'Canon', icon: 'fa-lock', title: 'Canon-locked: never given generated detail' },
    { id: 'story', label: 'From the story', icon: 'fa-feather-pointed', title: 'Introduced by the story or the director' },
    { id: 'unreviewed', label: 'To review', icon: 'fa-wand-magic-sparkles', title: 'Not in the setting yet, still unnamed, or with fields written by generation' },
]);

export function quickMatch(id, entry, { doc = null, playerId = '' } = {}) {
    const m = entry.meta ?? {};
    switch (id) {
        case 'active': return chatStatusOf(entry.id, doc) !== 'unused';
        case 'inactive': return chatStatusOf(entry.id, doc) === 'unused';
        case 'player': return !!playerId && entry.id === playerId;
        case 'dead': return (doc?.dead ?? []).some((d) => d.id === entry.id);
        case 'power': return m.power?.on === true;
        case 'locked': return m.canonLocked === true;
        case 'story': return m.origin === 'story' || m.origin === 'director';
        case 'unreviewed': return entry.confirmed === false || m.provisional === true || (m.generated?.length ?? 0) > 0;
        default: return true;
    }
}

// ---- factions: which factions each entry belongs to - a faction's Members
// (people) and Related (places, anything), and the entry's own Factions /
// faction ties. entries: every entry. -> Map entryId -> [factionId]
const idList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).filter((x) => typeof x === 'string' && x);
export function factionsByEntry(entries) {
    const known = new Set(entries.filter((e) => e.type === 'faction').map((e) => e.id));
    const out = new Map();
    const add = (id, f) => {
        if (!known.has(f) || id === f) return;
        if (!out.has(id)) out.set(id, new Set());
        out.get(id).add(f);
    };
    for (const e of entries) {
        const base = e.base ?? e;
        if (e.type === 'faction') for (const m of [...idList(base.members), ...idList(base.related_entity_ids)]) add(m, e.id);
        for (const f of [...idList(base.factions), ...idList(base.faction_ties), ...idList(base.faction)]) add(e.id, f);
    }
    return new Map([...out].map(([k, v]) => [k, [...v]]));
}

// ---- any field: its value as text, references named.
export function fieldText(entry, name, nameOf = (id) => id) {
    const base = entry.base ?? entry;
    const v = base[name] ?? entry[name];
    const one = (x) => {
        if (x === null || x === undefined || x === '') return '';
        if (typeof x === 'boolean') return x ? 'yes' : 'no';
        if (typeof x === 'object') return String(x.name ?? x.text ?? '');
        const s = String(x);
        return nameOf(s) || s;
    };
    return (Array.isArray(v) ? v.map(one) : [one(v)]).filter(Boolean).join(', ');
}

// ---- tags
const TAG_MAX = 40;
export function cleanTag(raw) {
    return String(raw ?? '').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX);
}
// Adds tags (one, or a comma-separated few), a tag already there (any case)
// not twice; the setting's own spelling of a known tag wins.
export function addTags(tags, raw, known = []) {
    const out = [...(tags ?? [])];
    for (const part of String(raw ?? '').split(',')) {
        const t = cleanTag(part);
        if (!t || out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
        out.push(known.find((k) => k.toLowerCase() === t.toLowerCase()) ?? t);
    }
    return out;
}
export const removeTag = (tags, tag) => (tags ?? []).filter((t) => t !== tag);
// A tag's colour: the same hue wherever it is shown.
export function tagHue(tag) {
    let n = 0;
    for (const c of String(tag).toLowerCase()) n = (n * 31 + c.charCodeAt(0)) % 3600;
    return Math.round(n / 10) % 360;
}

// ---- the chapter's filter (kept per viewer, per type, in the settings)
export const EMPTY_FILTER = Object.freeze({ tags: [], tagMode: 'all', quick: [], faction: '', field: '', fieldValue: '' });
export const TAG_MODES = Object.freeze([['all', 'all of'], ['any', 'any of'], ['none', 'none of']]);
export function normalizeFilter(f) {
    const x = f && typeof f === 'object' ? f : {};
    const strs = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s) : []);
    return {
        tags: strs(x.tags),
        tagMode: ['all', 'any', 'none'].includes(x.tagMode) ? x.tagMode : 'all',
        quick: strs(x.quick).filter((q) => QUICK_FILTERS.some((d) => d.id === q)),
        faction: typeof x.faction === 'string' ? x.faction : '',
        field: typeof x.field === 'string' ? x.field : '',
        fieldValue: typeof x.fieldValue === 'string' ? x.fieldValue : '',
    };
}
export const isFiltering = (f) => !!(f.tags.length || f.quick.length || f.faction || f.field);

// Filters saved under a name, per setting: [{ name, type, filter, sort }].
// The same name for the same type is replaced.
export function saveFilter(list, { name, type, filter, sort }) {
    const n = String(name ?? '').trim();
    if (!n) return list ?? [];
    const rest = (list ?? []).filter((s) => !(s.type === type && s.name.toLowerCase() === n.toLowerCase()));
    return [...rest, { name: n, type, filter: normalizeFilter(filter), sort: sort || 'name' }].sort((a, b) => a.name.localeCompare(b.name));
}

// filters: { search, tag, status ('' | 'scene' | 'play' | 'unused'),
//            within (a location id: the place itself or anywhere inside it),
//            tags + tagMode ('all' | 'any' | 'none'), quick: [QUICK_FILTERS id],
//            faction (a faction id, or NO_FACTION), field + fieldValue (has
//            any value when empty; otherwise the field's text contains it) }
// ctx: { doc, parents, playerId, factions (factionsByEntry), nameOf }
export const NO_FACTION = '__none';
export function filterEntries(entries, filters = {}, { doc = null, parents = {}, playerId = '', factions = null, nameOf = (id) => id } = {}) {
    const q = String(filters.search ?? '').trim().toLowerCase();
    const want = (filters.tags ?? []).map((t) => t.toLowerCase());
    const mode = filters.tagMode ?? 'all';
    const fv = String(filters.fieldValue ?? '').trim().toLowerCase();
    return entries.filter((e) => {
        if (q && !text(e).includes(q)) return false;
        const tags = (e.meta?.tags ?? []).map((t) => t.toLowerCase());
        if (filters.tag && !tags.includes(filters.tag.toLowerCase())) return false;
        if (want.length) {
            const hit = want.filter((t) => tags.includes(t)).length;
            if (mode === 'all' && hit < want.length) return false;
            if (mode === 'any' && !hit) return false;
            if (mode === 'none' && hit) return false;
        }
        for (const id of filters.quick ?? []) if (!quickMatch(id, e, { doc, playerId })) return false;
        if (filters.faction) {
            const of = factions?.get(e.id) ?? [];
            if (filters.faction === NO_FACTION ? of.length : !of.includes(filters.faction)) return false;
        }
        if (filters.field) {
            const t = fieldText(e, filters.field, nameOf).toLowerCase();
            if (fv ? !t.includes(fv) : !t) return false;
        }
        // Lore: bloodlines only, or none of them (src/library/bloodlines.js).
        if (filters.bloodline === 'only' && e.meta?.bloodline?.on !== true) return false;
        if (filters.bloodline === 'none' && e.meta?.bloodline?.on === true) return false;
        if (filters.status && chatStatusOf(e.id, doc) !== filters.status) return false;
        if (filters.within) {
            const place = placeOf(e);
            if (!place || !isWithin(parents, place, filters.within)) return false;
        }
        return true;
    });
}

// sort: 'name' | 'recent' | 'status' | 'faction' | 'field:<name>'. Pinned
// entries always come first; one without a faction / a value goes last.
// ctx: { factions, nameOf } for the faction and field sorts.
const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const keyedSort = (s) => s === 'faction' || s.startsWith('field:');
function sortKey(e, sort, { factions = null, nameOf = (id) => id } = {}) {
    if (sort === 'faction') return (factions?.get(e.id) ?? []).map((f) => nameOf(f) || f).sort(cmp)[0] ?? '';
    if (sort.startsWith('field:')) return fieldText(e, sort.slice(6), nameOf);
    return '';
}
export function sortEntries(entries, sort = 'name', doc = null, ctx = {}) {
    const rank = { scene: 0, play: 1, unused: 2 };
    const s = String(sort || 'name');
    const keys = keyedSort(s) ? new Map(entries.map((e) => [e.id, sortKey(e, s, ctx)])) : null;
    return [...entries].sort((a, b) => {
        const pin = (b.meta?.pinned === true) - (a.meta?.pinned === true);
        if (pin) return pin;
        if (s === 'recent') return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')) || a.name.localeCompare(b.name);
        if (s === 'status') return rank[chatStatusOf(a.id, doc)] - rank[chatStatusOf(b.id, doc)] || a.name.localeCompare(b.name);
        if (keys) {
            const ka = keys.get(a.id), kb = keys.get(b.id);
            return (!ka) - (!kb) || cmp(ka, kb) || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
    });
}

// Sorted entries in groups under a heading, for a faction or field sort
// (pinned entries first, in a group of their own); other sorts: one group
// with no heading. -> [{ label, entries }]
export function groupEntries(sorted, sort = 'name', ctx = {}) {
    const s = String(sort || 'name');
    if (!keyedSort(s)) return [{ label: '', entries: sorted }];
    const empty = s === 'faction' ? 'No faction' : 'Not set';
    const groups = [];
    for (const e of sorted) {
        const label = e.meta?.pinned === true ? 'Pinned' : (sortKey(e, s, ctx) || empty);
        const last = groups[groups.length - 1];
        if (last?.label === label) last.entries.push(e);
        else groups.push({ label, entries: [e] });
    }
    return groups;
}

// Every tag used by the entries, sorted.
export function tagsOf(entries) {
    return [...new Set(entries.flatMap((e) => e.meta?.tags ?? []))].sort((a, b) => a.localeCompare(b));
}

// ---- drag and drop: a place dropped onto another place (or onto "no
// parent", targetId null) in the card and list views. placeIds: the
// locations (anything else is not a place to drop or be dropped).
// -> 'ok' | 'same' (onto itself) | 'unchanged' (already there) | 'cycle'
//    (inside one of its own parts) | 'invalid'
export function reparentCheck(parents, id, targetId, placeIds = null) {
    if (!id) return 'invalid';
    if (placeIds && (!placeIds.has(id) || (targetId && !placeIds.has(targetId)))) return 'invalid';
    if (targetId === id) return 'same';
    if ((parents?.[id] || null) === (targetId || null)) return 'unchanged';
    if (targetId && isWithin(parents ?? {}, targetId, id)) return 'cycle';
    return 'ok';
}

const mentions = (value, id) => value === id || (Array.isArray(value) && value.includes(id));

// What happened to an entry in this chat, newest first: canonical changes
// that moved it in or out of the scene, validation findings about it, and
// changes to its current description.
// -> [{ at, kind: 'change' | 'drift' | 'narrative', text, source }]
export function entityHistory(doc, id) {
    const out = [];
    for (const h of doc?.history ?? []) {
        const keys = Object.keys(h.after ?? {}).filter((k) => mentions(h.before?.[k], id) || mentions(h.after?.[k], id));
        if (!keys.length) continue;
        let what = h.note || 'Scene changed';
        if (keys.includes('locationId')) what = h.after.locationId === id ? 'The scene moved here' : 'The scene left here';
        else if (keys.includes('castIds')) what = (h.after.castIds ?? []).includes(id) ? 'Joined the scene' : 'Left the scene';
        else if (keys.includes('creatureIds')) what = (h.after.creatureIds ?? []).includes(id) ? 'Appeared in the scene' : 'Left the scene';
        out.push({ at: h.at, kind: 'change', text: `${what}${h.undone ? ' (undone)' : ''}`, source: h.source });
    }
    for (const d of doc?.drift ?? []) {
        if (d.objectId === id || d.observed === id || d.canonical === id) out.push({ at: d.at, kind: 'drift', text: d.text, source: d.resolution || d.status });
    }
    const n = doc?.narrative?.[id];
    if (n?.updatedAt) out.push({ at: n.updatedAt, kind: 'narrative', text: 'Current description changed', source: 'user' });
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// A place's spot on the map, for moving about it from its sheet: the
// places above it (top first), the places inside it (each with how many
// are inside that), the places beside it, and the other entries that are
// here (a character, an item or a creature whose location is this place).
// entries: every entry, [{ id, type, name, location?, base? }].
export function placeMap(id, { parents = {}, entries = [] } = {}) {
    const places = entries.filter((e) => e.type === 'location');
    const ids = places.map((e) => e.id);
    const known = new Set(ids);
    const byName = (a, b) => String(places.find((e) => e.id === a)?.name ?? '').localeCompare(String(places.find((e) => e.id === b)?.name ?? ''));
    const above = pathOf(parents, id).slice(0, -1).filter((x) => known.has(x));
    const inside = childrenOf(parents, ids, id).sort(byName).map((child) => ({ id: child, count: childrenOf(parents, ids, child).length }));
    const parent = above[above.length - 1] ?? null;
    const beside = (parent ? childrenOf(parents, ids, parent) : ids.filter((x) => !parents[x] || !known.has(parents[x]))).filter((x) => x !== id).sort(byName);
    const here = entries.filter((e) => e.type !== 'location' && (e.base?.location ?? e.location) === id).sort((a, b) => String(a.name).localeCompare(String(b.name))).map((e) => e.id);
    return { above, inside, beside, here };
}
