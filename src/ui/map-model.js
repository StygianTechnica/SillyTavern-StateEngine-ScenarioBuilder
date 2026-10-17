// The location map's model (SB-141 "a map-like outline"), as pure
// functions (unit-tested; no DOM). The view is src/ui/map.js.
//
// The map shows ONE LEVEL of the location tree at a time - the top-level
// places, or the places inside one - as tiles the user drags into place,
// with the routes between them. The routes whose travel time the user set
// give the map a SCALE (minutes per unit of distance); from it, every
// guessed route gets an estimate from how far apart its ends sit on the
// map, which the user can apply - placing places roughly is how distances
// get guessed.

// ---- travel times

const UNIT_MINUTES = {
    minute: 1, min: 1, mins: 1, minutes: 1, m: 1,
    hour: 60, hours: 60, hr: 60, hrs: 60, h: 60,
    day: 60 * 24, days: 60 * 24, d: 60 * 24,
    week: 60 * 24 * 7, weeks: 60 * 24 * 7,
    month: 60 * 24 * 30, months: 60 * 24 * 30,
    year: 60 * 24 * 365, years: 60 * 24 * 365,
};
const WORD_NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, few: 3, several: 4, couple: 2, half: 0.5 };

// A travel time ("2 hours", "half a day by cart", "3 days by ship", "a few
// steps") in minutes, or null when it says no length of time.
export function travelMinutes(text) {
    const t = String(text ?? '').toLowerCase().replace(/-/g, ' ');
    if (!t.trim()) return null;
    if (/\b(a few |some )?(steps|moments|seconds?)\b/.test(t) && !/\b(minute|hour|day|week|month|year)/.test(t)) return 1;
    // "half a day", "half an hour"
    const half = /\bhalf (?:an? )?(minute|hour|day|week|month|year)\b/.exec(t);
    if (half) return UNIT_MINUTES[half[1]] / 2;
    const m = /\b(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|few|several|couple)\s*(?:of\s+)?(?:an?\s+)?(minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|[mhd])\b/.exec(t);
    if (!m) return null;
    const n = Number.isFinite(Number(m[1])) ? Number(m[1]) : WORD_NUMBERS[m[1]];
    const unit = UNIT_MINUTES[m[2]] ?? UNIT_MINUTES[m[2].replace(/s$/, '')];
    return n && unit ? n * unit : null;
}

// Minutes as a travel time, rounded the way people say it.
export function formatMinutes(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return '';
    const say = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
    if (minutes < 1.5) return '1 minute';
    if (minutes < 55) return say(Math.max(1, Math.round(minutes / 5) * 5 || Math.round(minutes)), 'minute');
    if (minutes < 60 * 10) return minutes < 80 ? '1 hour' : say(Math.round(minutes / 60), 'hour');
    if (minutes < 60 * 18) return 'half a day';
    if (minutes < 60 * 24 * 10) return say(Math.max(1, Math.round(minutes / (60 * 24))), 'day');
    if (minutes < 60 * 24 * 60) return say(Math.round(minutes / (60 * 24 * 7)), 'week');
    return say(Math.round(minutes / (60 * 24 * 30)), 'month');
}

// ---- levels

// The places on one level of the map: those inside `parentId` (null: the
// top-level places). -> [location]
export function levelPlaces(locations, parents, parentId = null) {
    const ids = new Set((locations ?? []).map((l) => l.id));
    return (locations ?? []).filter((l) => (parentId ? parents[l.id] === parentId : !parents[l.id] || !ids.has(parents[l.id])));
}

// The routes drawn on a level: those joining two of its places.
export function levelRoutes(routes, placeIds) {
    const on = new Set(placeIds);
    return (routes ?? []).filter((r) => on.has(r.from) && on.has(r.to));
}

// How many places each place holds, all the way down: { [id]: count }.
export function insideCounts(locations, parents) {
    const out = {};
    for (const l of locations ?? []) {
        const seen = new Set();
        let at = parents[l.id];
        while (at && !seen.has(at)) { seen.add(at); out[at] = (out[at] ?? 0) + 1; at = parents[at]; }
    }
    return out;
}

// ---- scale and estimates

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The map's scale on a level: the middle value of minutes per unit of
// distance over the routes the user set (not guessed) whose ends are both
// placed. null with none to go by.
export function mapScale(routes, positions) {
    const ratios = (routes ?? [])
        .filter((r) => !r.guessed && positions[r.from] && positions[r.to])
        .map((r) => ({ minutes: travelMinutes(r.travel), d: distance(positions[r.from], positions[r.to]) }))
        .filter((x) => x.minutes && x.d > 1)
        .map((x) => x.minutes / x.d)
        .sort((a, b) => a - b);
    if (!ratios.length) return null;
    const mid = Math.floor(ratios.length / 2);
    return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
}

// What the map says each guessed route takes, at `scale`:
// [{ route, minutes, travel }] - only where the estimate differs from it.
export function estimates(routes, positions, scale) {
    if (!scale) return [];
    const out = [];
    for (const r of routes ?? []) {
        if (!r.guessed || !positions[r.from] || !positions[r.to]) continue;
        const minutes = distance(positions[r.from], positions[r.to]) * scale;
        const travel = formatMinutes(minutes);
        if (travel && travel !== r.travel) out.push({ route: r, minutes, travel });
    }
    return out;
}

// Starting positions for a level's places that have none yet: on a ring,
// in name order, so a new map is tidy and nothing overlaps.
export function seedPositions(places, saved = {}, radius = 220) {
    const out = {};
    const missing = [...places].filter((p) => !saved[p.id]).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const n = Math.max(1, missing.length);
    missing.forEach((p, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = n === 1 ? 0 : radius;
        out[p.id] = { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) };
    });
    for (const p of places) if (saved[p.id]) out[p.id] = { ...saved[p.id] };
    return out;
}
