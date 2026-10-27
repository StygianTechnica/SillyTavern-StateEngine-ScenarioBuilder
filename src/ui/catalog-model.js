// The catalog browser's logic as plain functions (unit-tested): filtering,
// sorting, an entry's status in the chat, and an entry's own story
// history.

import { isWithin } from '../library/hierarchy.js';

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

// filters: { search, tag, status ('' | 'scene' | 'play' | 'unused'),
//            within (a location id: the place itself or anywhere inside it) }
export function filterEntries(entries, filters = {}, { doc = null, parents = {} } = {}) {
    const q = String(filters.search ?? '').trim().toLowerCase();
    return entries.filter((e) => {
        if (q && !text(e).includes(q)) return false;
        if (filters.tag && !(e.meta?.tags ?? []).includes(filters.tag)) return false;
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

// sort: 'name' | 'recent' | 'status'. Pinned entries always come first.
export function sortEntries(entries, sort = 'name', doc = null) {
    const rank = { scene: 0, play: 1, unused: 2 };
    return [...entries].sort((a, b) => {
        const pin = (b.meta?.pinned === true) - (a.meta?.pinned === true);
        if (pin) return pin;
        if (sort === 'recent') return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')) || a.name.localeCompare(b.name);
        if (sort === 'status') return rank[chatStatusOf(a.id, doc)] - rank[chatStatusOf(b.id, doc)] || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
    });
}

// Every tag used by the entries, sorted.
export function tagsOf(entries) {
    return [...new Set(entries.flatMap((e) => e.meta?.tags ?? []))].sort((a, b) => a.localeCompare(b));
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
