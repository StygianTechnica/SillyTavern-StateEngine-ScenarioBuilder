// Where a new place goes when the user leaves "Inside" to it: the place it
// is part of. Pure.
//
//   1. a place the idea (or, after writing, its description) names: "a bar
//      on the Neon Mile" goes in the Neon Mile - the most specific one;
//   2. else the nearest place around the story that is bigger than it: a
//      room in the house the scene is in, a gallery in the museum, a shop in
//      the town, a town in the province, a planet in the star system;
//   3. inside that, a place between the two sizes whose purpose fits it (a
//      jazz club in the nightlife district, a container yard in the docks),
//      when there is exactly one such - never for a room in a house, where
//      there is nothing between.
//
// Sizes are relative, never "a district": what sits between a shop and its
// city is a district on one map, a ward or a market ring on another, and on
// a map of worlds the step below the system is a planet. Saint Aora's
// Museum: the director's "West Wing Gallery" went in the Nexus Galleries
// (a district for art) across the city, not in the museum the scene was in.
//
// A place said to be elsewhere ("a vault beneath the ruined temple to the
// northeast") is not inside the building the scene is in. With no scene,
// the one top-level place. None when there is nothing to go by.

import { purposesOfKind, parentFrame } from './fit-place.js';
import { purposeOf, nameKindFor, mainClause } from '../naming/classify.js';
import { pathOf } from '../library/hierarchy.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whether `text` names `name` as a whole (case aside, "the" aside). A name
// of one word ("The Club") only as a name - capitalized: "a jazz club" is
// not The Club.
function names(text, name) {
    const n = clean(name).replace(/[‘’]/g, "'").replace(/^the\s+/i, '');
    text = String(text ?? '').replace(/[‘’]/g, "'");
    if (n.length < 4) return false;
    const oneWord = !/\s/.test(n);
    const word = oneWord ? `${n[0].toUpperCase()}${escape(n.slice(1))}` : escape(n);
    return new RegExp(`(^|[^\\p{L}\\p{N}])${word}($|[^\\p{L}\\p{N}])`, oneWord ? 'u' : 'iu').test(text);
}

// How big a place is, smallest first. Only the order matters: a place goes
// in the nearest bigger one, whatever the map calls its levels.
const SIZES = [
    [0, 'room|rooms|chamber|chambers|alcove|gallery|galleries|wing|wings|hallway|hallways|corridor|corridors|passage|passages|passageway|passageways|vaults|cellars|cell|vault|office|deck|cellar|basement|attic|loft|kitchen|bedroom|bedchamber|study|parlou?r|foyer|lobby|atrium|stairwell|staircase|balcony|closet|pantry|storeroom|crypt|nave|sanctum|armou?ry|quarters|suite|annex|landing|courtyard|cockpit|hangar|airlock|bay|bunk|vestibule|antechamber|undercroft|dungeon|garret'],
    [1, 'house|home|cottage|hut|cabin|manor|mansion|villa|estate|museum|temple|church|chapel|cathedral|shrine|monastery|abbey|castle|fortress|fort|keep|citadel|palace|tower|inn|tavern|bar|club|pub|nightclub|hotel|motel|shop|store|boutique|warehouse|factory|mill|forge|smithy|ship|vessel|starship|shuttle|hospital|clinic|school|academy|university|library|prison|jail|arena|stadium|theat(?:er|re)|bank|apartment|apartments|tenement|mall|compound|bunker|outpost|mine|cave|cavern|ruin|ruins|tomb|mausoleum|lighthouse|farm|farmhouse|barn|lodge|embassy|headquarters|hq|precinct|station|restaurant|caf[eé]|diner|brothel|casino|laboratory|lab|garage|workshop|camp|den|hideout|safehouse|office block|skyscraper|arcology|spire'],
    [2, 'district|quarter|ward|neighbou?rhood|borough|street|avenue|road|lane|alley|alleyway|boulevard|square|plaza|block|market|marketplace|bazaar|docks|dockside|harbou?r|wharf|park|slums|heights|row|strip|mile|precincts|suburb|outskirts|downtown|uptown|ring|zone'],
    [3, 'city|town|village|hamlet|metropolis|megacity|megalopolis|colony|settlement|capital|port city|township|starbase|space station|orbital station|habitat'],
    [4, 'province|county|shire|state|duchy|march|barony|territory|region|prefecture|canton|oblast'],
    [5, 'country|nation|kingdom|empire|realm|republic|dominion|federation|principality|commonwealth|union'],
    [6, 'continent|subcontinent'],
    [7, 'planet|world|moon|homeworld|planetoid|asteroid'],
    [8, 'system|star system|solar system'],
    [9, 'galaxy|nebula|cluster|quadrant|expanse|universe|cosmos'],
];
// Whole words only, never half of one: "a world-famous museum" is a museum.
const SIZE_RE = SIZES.map(([size, words]) => [size, new RegExp(`(?<![\\p{L}-])(?:${words})(?![\\p{L}-])`, 'giu')]);

// The size a piece of text gives: in a name, the word that ends it ("Museum
// storage room" is a room); in a description, the first ("A bar in the Neon
// Mile" is a bar). -> a size, or null.
function sizeIn(text, last) {
    let best = null;
    for (const [size, re] of SIZE_RE) {
        re.lastIndex = 0;
        for (const m of text.matchAll(re)) {
            // "space station" and "port city" are one word: the longer match.
            const end = m.index + m[0].length;
            if (!best || (last ? end > best.end || (end === best.end && m[0].length > best.len) : m.index < best.at || (m.index === best.at && m[0].length > best.len))) best = { size, at: m.index, end, len: m[0].length };
        }
    }
    return best ? best.size : null;
}

// What level of the map a place is: 'region', 'settlement', 'district',
// 'place', or '' - the older reading, kept for what words alone miss.
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
const LEVEL_SIZE = { place: 1, district: 2, settlement: 3, region: 4 };

// How big a place is: its name, unless the name is only "The <word>" (The
// City is a financial district); else what its description first says it
// is; else the older reading. -> a size, or null.
export function placeSize({ name = '', description = '' } = {}) {
    const n = clean(name);
    const first = mainClause(clean(description).split(/(?<=[.!?])\s/)[0] ?? '');
    const generic = /^(?:the\s+)?\p{L}+$/iu.test(n) && /^the\s/i.test(n);
    const fromName = generic ? null : sizeIn(n, true);
    return fromName ?? sizeIn(first, false) ?? (generic ? sizeIn(n, true) : null) ?? LEVEL_SIZE[placeLevel({ name, description })] ?? null;
}

// Said to be close by: next door, across the street.
const NEARBY = /\b(?:nearby|close by|next door|adjacent|around the corner|across the (?:street|road|square|plaza|way|alley|hall|corridor)|down the (?:street|road|block|alley|hall|corridor)|just outside|neighbou?ring|beside it|next to it)\b/i;
// Said to be somewhere else than where the scene is.
const ELSEWHERE =/\b(?:to the (?:north|south|east|west)|(?:north|south|east|west)(?:east|west)?\s+of\b|far (?:to|from|away)|miles|leagues|kilometers|kilometres|across the|beyond the|on the other side|outside (?:the )?(?:city|town|walls))/i;

// locations: [{ id, name, aliases?, description? }]; parents: { id: parentId };
// sceneId: where the story is now (or null); where: 'inside' | 'nearby' |
// 'elsewhere' | '' - what the director said of it (NEW location lines).
// -> { id, why } or null - why: 'named' | 'fits' | 'top' (the place around
// the story).
//
// Inside or nearby: in the nearest place around the scene bigger than it -
// a room in the house, a shop across the square. Elsewhere: out on the wider
// map, never the scene's own surroundings - the Medina Syndicate's hideout
// is not across the plaza from the museum. With nothing said, the words
// decide ("next door", "to the north"); else a room or other part is where
// the scene is, and a building or site is elsewhere.
export function chooseParent({ brief = '', description = '', locations = [], parents = {}, sceneId = null, where = '' } = {}) {
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
    // 2. The nearest place around the story bigger than it. A place of no
    // telling size is taken for a building.
    const sizes = new Map();
    const sizeOf = (id) => {
        if (!sizes.has(id)) sizes.set(id, placeSize(byId.get(id) ?? {}));
        return sizes.get(id);
    };
    const own = placeSize({ name: brief, description }) ?? 1;
    const said = /^(?:inside|in|here|within|part)/i.test(where) ? 'inside'
        : /^(?:near|beside|next|close|adjacent)/i.test(where) ? 'nearby'
            : /^(?:elsewhere|away|far|distant|other)/i.test(where) ? 'elsewhere'
                // "Across the square" is near; "across the sea" is not.
                : NEARBY.test(text) ? 'nearby'
                    : ELSEWHERE.test(text) ? 'elsewhere'
                        : own >= 1 ? 'elsewhere' : 'inside';
    // Elsewhere skips the scene's own surroundings - the building it is in
    // and the area around that. A town or a world elsewhere is already out
    // on the wider map one step up.
    const away = said === 'elsewhere';
    // Inside trusts the director over a size guessed from words: a
    // "workshop" inside the museum is in the museum - but a room is never
    // in another room.
    const floor = away && own <= 1 ? 2 : said === 'inside' && own > 0 ? own - 1 : own;
    const tops = locations.filter((l) => !parents[l.id] || !byId.has(parents[l.id]));
    const scenePath = sceneId && byId.has(sceneId) ? pathOf(parents, sceneId).filter((x) => byId.has(x)) : [];
    let scope = [...scenePath].reverse().find((id) => sizeOf(id) !== null && sizeOf(id) > floor) ?? null;
    scope ??= scenePath[0] ?? (tops.length === 1 ? tops[0].id : null);
    if (!scope) return null;
    // 3. A place between the two sizes that is for this kind of place.
    const top = sizeOf(scope);
    const between = (id) => {
        const s = sizeOf(id);
        return s === null || (s > own && (top === null || s < top));
    };
    if (top === null || top - own >= 2) {
        // Elsewhere is never back in the scene's own surroundings.
        const under = locations.filter((l) => l.id !== scope && pathOf(parents, l.id).includes(scope) && between(l.id) && !(away && scenePath.includes(l.id)));
        const purposeAt = (l) => parentFrame({ name: l.name, description: l.description ?? '' }).purpose || purposeOf(`${l.name} ${l.description ?? ''}`);
        for (const purpose of purposesOfKind(brief)) {
            const fits = under.filter((l) => purposeAt(l) === purpose).sort((a, b) => depth(a.id) - depth(b.id));
            if (!fits.length) continue;
            // The broadest such place; two apart (a ward in each of two
            // towns) is not guessed between.
            const broadest = fits[0];
            if (fits.some((l) => l.id !== broadest.id && !pathOf(parents, l.id).includes(broadest.id))) continue;
            return { id: broadest.id, why: 'fits' };
        }
    }
    return { id: scope, why: 'top' };
}
