// Where a new place goes when the user leaves "Inside" to it: the place it
// is part of. Pure.
//
//   1. a place the idea (or, after writing, its description) names: "a bar
//      on the Neon Mile" goes in the Neon Mile - the most specific one;
//   2. else a district of the map whose purpose fits what it is: a jazz
//      club in the nightlife district, a container yard in the harbour;
//   3. else the top of the map - the one top-level place (a whole city,
//      "Arcadia City"), or the top the story is in now.
// None when the library has no place to put it in.

import { parentFrame, purposesOfKind } from './fit-place.js';
import { purposeOf } from '../naming/classify.js';
import { pathOf } from '../library/hierarchy.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whether `text` names `name` as a whole (case aside, "the" aside).
function names(text, name) {
    const n = clean(name).replace(/^the\s+/i, '');
    if (n.length < 4) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

// locations: [{ id, name, aliases?, description? }]; parents: { id: parentId };
// sceneId: where the story is now (or null). -> { id, why } or null -
// why: 'named' | 'fits' | 'top'.
export function chooseParent({ brief = '', description = '', locations = [], parents = {}, sceneId = null } = {}) {
    if (!locations.length) return null;
    const byId = new Map(locations.map((l) => [l.id, l]));
    const depth = (id) => pathOf(parents, id).length;
    // 1. Named.
    const text = clean(`${brief} ${description}`);
    const named = locations.filter((l) => [l.name, ...(l.aliases ?? [])].some((n) => names(text, n)));
    if (named.length) {
        const deepest = named.sort((a, b) => depth(b.id) - depth(a.id))[0];
        return { id: deepest.id, why: 'named' };
    }
    // The top of the map: the only top-level place, else the one the story is in.
    const topOf = (id) => pathOf(parents, id).find((x) => byId.has(x)) ?? id;
    const tops = locations.filter((l) => !parents[l.id] || !byId.has(parents[l.id]));
    const top = tops.length === 1 ? tops[0].id : (sceneId && byId.has(sceneId) ? topOf(sceneId) : null);
    if (!top) return null;
    // 2. A district under it that is for this kind of place.
    for (const purpose of purposesOfKind(brief)) {
        const under = locations.filter((l) => l.id !== top && pathOf(parents, l.id).includes(top) && depth(l.id) - depth(top) <= 2);
        // A district's purpose, or a place's own (a temple quarter, a market
        // ring - read as one building, but a shrine still goes in it).
        const purposeAt = (l) => parentFrame({ name: l.name, description: l.description ?? '' }).purpose || purposeOf(`${l.name} ${l.description ?? ''}`);
        const fits = under.filter((l) => purposeAt(l) === purpose);
        if (fits.length) {
            // The broadest such district (a district before a street in it).
            const broadest = fits.sort((a, b) => depth(a.id) - depth(b.id))[0];
            return { id: broadest.id, why: 'fits' };
        }
    }
    // 3. The top.
    return { id: top, why: 'top' };
}
