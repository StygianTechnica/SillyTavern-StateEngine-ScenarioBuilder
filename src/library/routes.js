// Routes between places (SB-111): which places connect, how long the
// journey takes ("2 hours", "half a day by cart"), and a note (the coast
// road, a hidden passage). Kept in the setting document; both ends see a
// route. When the scene moves along one, the clock skips ahead by its
// travel time (src/calendar/clock.js), and the guidance and the director
// mention the ways on from where the scene is.

import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { newLocalId } from '../store/schema.js';

// ---- pure

// The routes touching a place, seen from it: [{ route, otherId }].
export function routesFrom(placeId, routes) {
    return (routes ?? []).filter((r) => r.from === placeId || r.to === placeId).map((route) => ({ route, otherId: route.from === placeId ? route.to : route.from }));
}

// The route between two places, either way, or null.
export function routeBetween(a, b, routes) {
    return (routes ?? []).find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) ?? null;
}

// The route that covers a move from `fromId` to `toId`: a direct one, else
// one between places they are inside (leaving a tavern in one town for an
// inn in the next still takes the road between the towns). `pathOf` gives
// a place's chain of containing places, innermost first.
export function routeForMove(fromId, toId, routes, pathOf) {
    if (!fromId || !toId || fromId === toId) return null;
    const direct = routeBetween(fromId, toId, routes);
    if (direct) return direct;
    const up = (id) => [id, ...(pathOf(id) ?? []).filter((x) => x !== id)];
    const a = up(fromId);
    const b = up(toId);
    // Moving within one place (both inside the same town) takes no route.
    for (const x of a) for (const y of b) {
        if (x === y) return null;
        const r = routeBetween(x, y, routes);
        if (r) return r;
    }
    return null;
}

// The routes, leg by leg, from one place to another a few routes away -
// the fewest legs, and of those the first found. A journey to somewhere
// further on passes through the places between; it does not stop at each.
// -> [route] (empty when `fromId` is `toId`), or null when no chain of at
// most `maxLegs` routes joins them.
export function pathBetween(fromId, toId, routes, maxLegs = 4) {
    if (!fromId || !toId) return null;
    if (fromId === toId) return [];
    const seen = new Set([fromId]);
    let frontier = [{ id: fromId, legs: [] }];
    for (let depth = 0; depth < maxLegs && frontier.length; depth++) {
        const next = [];
        for (const { id, legs } of frontier) {
            for (const { route, otherId } of routesFrom(id, routes)) {
                if (seen.has(otherId)) continue;
                const path = [...legs, route];
                if (otherId === toId) return path;
                seen.add(otherId);
                next.push({ id: otherId, legs: path });
            }
        }
        frontier = next;
    }
    return null;
}

// The places two to `maxLegs` routes away from `fromId` (the ways on are one
// away), nearest first, each with the place it is reached through:
// [{ id, via: <id of the first place on the way> }].
export function placesFurtherOn(fromId, routes, maxLegs = 3) {
    if (!fromId) return [];
    const seen = new Set([fromId]);
    const out = [];
    let frontier = routesFrom(fromId, routes).map(({ otherId }) => ({ id: otherId, via: otherId }));
    for (const f of frontier) seen.add(f.id);
    for (let depth = 1; depth < maxLegs && frontier.length; depth++) {
        const next = [];
        for (const { id, via } of frontier) {
            for (const { otherId } of routesFrom(id, routes)) {
                if (seen.has(otherId)) continue;
                seen.add(otherId);
                next.push({ id: otherId, via });
            }
        }
        out.push(...next);
        frontier = next;
    }
    return out;
}

// The way on the player's message sets out along, when the game master
// left no MOVE line: the message names a place one route away ("mounted up
// for the next leg of their journey... The blackened bridge") and tells of
// leaving for it. Never a trip only planned or talked of ("we'll ride for
// the bridge tomorrow", or in speech). `ways`: [{ id, names }] of the
// places the routes from here lead to.
// -> { id, name, together } (together: the party goes as one) or null.
const SETTING_OUT = /\b(?:set(?:s|ting)? out|set off|mount(?:s|ed|ing)? up|rode|ride(?:s)? (?:out|off|on)|head(?:s|ed|ing)? (?:out|off|for|to|toward|towards)|(?:made|make|makes|making) (?:their|our|his|her|my|the) way|journey(?:s|ed)?|travel(?:s|led|ed|ling|ing)?|depart(?:s|ed|ing)?|(?:left|leave|leaves|leaving) for|on the road|hit the road|march(?:es|ed|ing)? (?:out|off|on|for|to)|next leg|continu(?:e|es|ed|ing) (?:on|onward|onwards|to|toward|towards|for)|(?:press|push)(?:es|ed|ing)? on|(?:go|goes|went) (?:on )?(?:to|toward|towards|for)|rode (?:on|out|off)|(?:carried|carry|carries) on)\b/i;
const NOT_YET = /\b(?:will|would|shall|should|tomorrow|tonight|later|soon|plan(?:s|ned)?|going to|could|might|if)\b|'ll\b/i;
const TOGETHER = /\b(?:they|we|the group|the party|everyone|together|all of (?:us|them)|companions)\b/i;
export function headingAlong(text, ways) {
    const plain = String(text ?? '').replace(/"[^"]*"|“[^”]*”/g, ' ').replace(/’/g, "'");
    const sentences = plain.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*/g) ?? [];
    const going = sentences.filter((s) => SETTING_OUT.test(s) && !NOT_YET.test(s));
    if (!going.length) return null;
    const bare = (n) => String(n ?? '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9'À-ɏ]+/g, ' ').trim();
    const lower = ` ${bare(plain)} `;
    let best = null;
    for (const w of ways ?? []) {
        for (const n of w.names ?? []) {
            const name = bare(n);
            if (name.length >= 4 && lower.includes(` ${name} `) && (!best || name.length > best.len)) best = { id: w.id, name: String(n), len: name.length };
        }
    }
    // Spoken of only where the plan is told ("we'll reach the bridge by
    // nightfall") is not setting out.
    if (!best || sentences.filter((s) => ` ${bare(s)} `.includes(` ${bare(best.name)} `)).every((s) => NOT_YET.test(s))) return null;
    return { id: best.id, name: best.name, together: going.some((s) => TOGETHER.test(s)) };
}

// ---- stored

export function listRoutes(settingId) {
    return getSettingDoc(settingId).routes ?? [];
}

// route: { from, to, travel, note, guessed? }. One route per pair: a new one replaces it.
export function addRoute(settingId, route) {
    const stored = { id: newLocalId('rt'), from: route.from, to: route.to, travel: String(route.travel ?? '').trim(), note: String(route.note ?? '').trim(), ...(route.guessed ? { guessed: true } : {}) };
    if (!stored.from || !stored.to || stored.from === stored.to) return null;
    updateSettingDoc(settingId, (d) => {
        d.routes = [...(d.routes ?? []).filter((r) => !((r.from === stored.from && r.to === stored.to) || (r.from === stored.to && r.to === stored.from))), stored];
    });
    return stored;
}

export function updateRoute(settingId, id, patch) {
    updateSettingDoc(settingId, (d) => { d.routes = (d.routes ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)); });
}

export function removeRoute(settingId, id) {
    updateSettingDoc(settingId, (d) => { d.routes = (d.routes ?? []).filter((r) => r.id !== id); });
}

// ---- guessed routes
//
// When the scene moves between two places no route connects, the journey
// is GUESSED rather than skipped: a route is added between the two places
// that sit side by side under their nearest shared place (an inn in one
// town to a tavern in the next: the towns), with a travel time from the
// places' scale and the world's technology. It is marked guessed, shown so
// on the sheet, and the user edits it when it is wrong - no need to work
// routes out before playing.

// Scales, smallest first: [scale, words that say a place is of it].
const SCALES = [
    ['room', ['room', 'chamber', 'quarters', 'hall', 'kitchen', 'cellar', 'attic', 'study', 'library', 'office', 'cell', 'vault', 'stair', 'stairs', 'corridor', 'gallery', 'chapel', 'bedroom', 'bar', 'loft', 'wall', 'gate', 'gatehouse', 'courtyard', 'yard', 'garden', 'roof', 'battlements', 'tower']],
    ['building', ['tavern', 'inn', 'house', 'home', 'shop', 'store', 'smithy', 'forge', 'temple', 'shrine', 'church', 'cathedral', 'manor', 'mansion', 'estate', 'keep', 'castle', 'fortress', 'fort', 'palace', 'barracks', 'warehouse', 'mill', 'farm', 'market', 'square', 'plaza', 'street', 'alley', 'docks', 'dock', 'harbor', 'harbour', 'pier', 'district', 'quarter', 'ward', 'slums', 'park', 'arena', 'station', 'base', 'ship', 'camp']],
    ['settlement', ['town', 'city', 'village', 'hamlet', 'enclave', 'outpost', 'settlement', 'port', 'haven', 'colony', 'citadel', 'stronghold', 'capital', 'metropolis', 'ruins']],
    ['region', ['forest', 'woods', 'wood', 'mountain', 'mountains', 'hills', 'valley', 'plains', 'desert', 'swamp', 'marsh', 'region', 'province', 'county', 'wilds', 'wilderness', 'wastes', 'wasteland', 'coast', 'river', 'lake', 'island', 'isles', 'highlands', 'lowlands', 'frontier', 'border', 'march', 'interstate', 'highway', 'road']],
    ['country', ['kingdom', 'empire', 'realm', 'nation', 'country', 'dominion', 'republic', 'continent', 'sea', 'ocean', 'lands']],
    ['world', ['world', 'planet', 'moon', 'system', 'star', 'galaxy', 'plane', 'dimension']],
];
export const SCALE_ORDER = Object.freeze(SCALES.map(([s]) => s));

// A place's scale ('room' ... 'world') from its name and description, or
// '' when nothing says.
export function scaleOf(place) {
    const words = (text) => String(text ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const name = words(place?.name);
    // The name's last word says most ("Redhaven Great Hall"), then any
    // word of it, then the description's opening.
    for (const pool of [name.slice(-1), name, words(place?.description).slice(0, 40)]) {
        for (const [scale, keys] of SCALES) if (pool.some((w) => keys.includes(w))) return scale;
    }
    return '';
}

// Travel times by scale: before engines, and with them (TL6 and up: cars,
// trains, aircraft).
const TRAVEL = {
    room: ['1 minute', '1 minute'],
    building: ['10 minutes', '10 minutes'],
    settlement: ['half a day', '1 hour'],
    region: ['2 days', '4 hours'],
    country: ['2 weeks', '1 day'],
    world: ['3 months', '3 days'],
};

const techNumber = (level) => Number(/^tl(\d+)$/.exec(String(level ?? ''))?.[1] ?? NaN);

// A guessed travel time between places of `scale`, for a world at tech
// level `techLevel` ('tl3'...).
export function guessTravel(scale, techLevel = '') {
    const row = TRAVEL[scale] ?? TRAVEL.building;
    return techNumber(techLevel) >= 6 ? row[1] : row[0];
}

// The pair a guessed route joins for a move: the two places side by side
// under the nearest place both are in (or the ends themselves). null when
// one is inside the other - moving within a place takes no route.
// `up(id)`: the chain of places from id outwards, id first.
export function routePairFor(fromId, toId, up) {
    if (!fromId || !toId || fromId === toId) return null;
    const a = up(fromId);
    const b = up(toId);
    if (a.includes(toId) || b.includes(fromId)) return null;
    const shared = a.find((x) => b.includes(x));
    const childOf = (chain) => (shared ? chain[chain.indexOf(shared) - 1] : chain[chain.length - 1]);
    const pair = [childOf(a), childOf(b)];
    return pair[0] && pair[1] && pair[0] !== pair[1] ? pair : null;
}

// The guessed route for a move, or null. places: Map id -> { name,
// description }; the larger of the two places' scales sets the time.
export function guessRoute(fromId, toId, { up, places, techLevel = '' }) {
    const pair = routePairFor(fromId, toId, up);
    if (!pair) return null;
    const scales = pair.map((id) => scaleOf(places.get(id))).filter(Boolean);
    // With nothing to go on, the depth says: the deeper, the closer.
    const fallback = ['country', 'region', 'settlement', 'building', 'room'][Math.min(4, up(pair[0]).length - 1)];
    const scale = scales.length ? scales.reduce((x, y) => (SCALE_ORDER.indexOf(y) > SCALE_ORDER.indexOf(x) ? y : x)) : fallback;
    return { from: pair[0], to: pair[1], travel: guessTravel(scale, techLevel), note: 'guessed - edit if wrong', guessed: true };
}
