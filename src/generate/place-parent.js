// Where a new place goes when the user leaves "Inside" to it: the place it
// is part of. Pure.
//
//   1. a place the idea (or, after writing, its description) names: "a bar
//      on the Neon Mile" goes in the Neon Mile - the most specific one;
//   2. else a district whose purpose fits what it is (a jazz club in the
//      nightlife district, a container yard in the harbour), inside the
//      place around the story;
//   3. else the place around the story itself.
//
// "The place around the story" follows how the map is laid out, read from
// where the scene is: a building or a district goes in the city or town the
// scene is in - not the nation or province above it - and a town goes in
// the country or province the scene is in. A map whose places say no such
// thing (a station, a planet) uses the top of the scene's map; with no
// scene, the one top-level place. None when there is nothing to go by.

import { parentFrame, purposesOfKind } from './fit-place.js';
import { purposeOf, nameKindFor, mainClause } from '../naming/classify.js';
import { pathOf } from '../library/hierarchy.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whether `text` names `name` as a whole (case aside, "the" aside). A name
// of one word ("The Club") only as a name - capitalized: "a jazz club" is
// not The Club.
function names(text, name) {
    const n = clean(name).replace(/^the\s+/i, '');
    if (n.length < 4) return false;
    const oneWord = !/\s/.test(n);
    const word = oneWord ? `${n[0].toUpperCase()}${escape(n.slice(1))}` : escape(n);
    return new RegExp(`(^|[^\\p{L}\\p{N}])${word}($|[^\\p{L}\\p{N}])`, oneWord ? 'u' : 'iu').test(text);
}

// What level of the map a place is: 'region' (a nation, a kingdom, a
// province), 'settlement' (a city, a town), 'district', 'place' (a
// building, a site), or '' when its name and first words do not say.
function levelOfKind(kind) {
    if (!kind) return '';
    if (kind.kind === 'region') return 'region';
    if (kind.kind === 'settlement') return kind.subtype ? 'place' : 'settlement';
    if (kind.kind === 'district' || kind.kind === 'street') return 'district';
    if (kind.kind === 'feature') return '';
    return 'place';
}
export function placeLevel({ name = '', description = '' } = {}) {
    const first = clean(description).split(/(?<=[.!?])\s/)[0] ?? '';
    return levelOfKind(nameKindFor('location', clean(name), { hasParent: true }))
        || levelOfKind(nameKindFor('location', mainClause(first.toLowerCase()), { hasParent: true }));
}

// locations: [{ id, name, aliases?, description? }]; parents: { id: parentId };
// sceneId: where the story is now (or null). -> { id, why } or null -
// why: 'named' | 'fits' | 'top' (the place around the story).
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
    // What the new place is: a town goes in a country, anything smaller in
    // a town.
    const level = placeLevel({ name: brief, description });
    const wants = level === 'region' ? ['region'] : level === 'settlement' ? ['region'] : ['settlement'];
    const levels = new Map();
    const levelOf = (id) => {
        if (!levels.has(id)) levels.set(id, placeLevel(byId.get(id) ?? {}));
        return levels.get(id);
    };
    const tops = locations.filter((l) => !parents[l.id] || !byId.has(parents[l.id]));
    const scenePath = sceneId && byId.has(sceneId) ? pathOf(parents, sceneId).filter((x) => byId.has(x)) : [];
    // The place around the story: the nearest of the wanted level up from
    // the scene (a region for a region, too: the one it sits beside is in
    // the one above it); else the top of the scene's map; else the only top.
    let scope = null;
    for (const id of [...scenePath].reverse()) {
        if (wants.includes(levelOf(id)) && !(level === 'region' && id === sceneId)) { scope = id; break; }
    }
    if (level === 'region' && scope) scope = parents[scope] && byId.has(parents[scope]) ? parents[scope] : scope;
    scope ??= scenePath[0] ?? (tops.length === 1 ? tops[0].id : null);
    if (!scope) return null;
    // 2. A district inside it that is for this kind of place - never for a
    // town or a country, which are not kinds of district.
    if (level !== 'settlement' && level !== 'region') {
        const under = locations.filter((l) => l.id !== scope && pathOf(parents, l.id).includes(scope));
        const purposeAt = (l) => parentFrame({ name: l.name, description: l.description ?? '' }).purpose || purposeOf(`${l.name} ${l.description ?? ''}`);
        // The town a district is in, so that a fit is not picked at random
        // among the towns of a country.
        const townOf = (id) => [...pathOf(parents, id)].reverse().find((x) => x !== id && levelOf(x) === 'settlement') ?? '';
        const sceneTown = scenePath.slice().reverse().find((x) => levelOf(x) === 'settlement') ?? '';
        for (const purpose of purposesOfKind(brief)) {
            let fits = under.filter((l) => purposeAt(l) === purpose);
            if (!fits.length) continue;
            const towns = new Set(fits.map((l) => townOf(l.id)));
            if (towns.size > 1) {
                if (!sceneTown || !towns.has(sceneTown)) continue;
                fits = fits.filter((l) => townOf(l.id) === sceneTown);
            }
            // The broadest such district (a district before a street in it).
            const broadest = fits.sort((a, b) => depth(a.id) - depth(b.id))[0];
            return { id: broadest.id, why: 'fits' };
        }
    }
    // 3. The place around the story.
    return { id: scope, why: 'top' };
}
