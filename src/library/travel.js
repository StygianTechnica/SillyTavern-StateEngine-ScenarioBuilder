// Ways of travelling a route (docs/ROADMAP.md, Routes): a route keeps ONE
// walking time - it stands for the distance - and the time by cart, horse,
// car, transit or air is worked out from it here. A route can override a
// way that breaks the pattern (the maglev beats a taxi; the island is ferry
// only; a portal is a minute whatever the distance). Pure.
//
// route = { travel,             the walking time ("2 hours", "3 days")
//           basis,              'walk' - travel is the walking time;
//                               '' - an older route whose time may be the
//                               usual way, not walking (see readBasis)
//           times: { mode: text },  overrides - this way takes this long;
//                               'none' - this way does not go here
//           ... }

import { travelMinutes, formatMinutes } from '../ui/map-model.js';

// fixed:  minutes before moving at all (hail a cab, wait for the train,
//         get to the airport)
// short / long: how many times faster than walking, on a trip of up to an
//         hour's walk / of a day's walk or more (a taxi crawls in town and
//         flies on the open road)
// day:    minutes of it in a travel day - walkers and riders stop for the
//         night; null: it goes on through
// from:   the tech level it needs (TL5 rail, TL6 cars and aircraft)
// until:  the last tech level where it is a usual way (riding)
// minWalk: walking minutes below which it is not offered (no flights
//         across town)
// auto:   offered from the walking time; false: only where a route says
//         (a boat needs water, a portal a portal)
export const MODES = Object.freeze([
    { id: 'walk', label: 'on foot', short: 1, long: 1, fixed: 0, day: 480, from: 0, auto: true },
    { id: 'ride', label: 'riding', short: 1.7, long: 2, fixed: 0, day: 480, from: 1, until: 5, auto: true, minWalk: 30 },
    { id: 'cart', label: 'by cart', short: 1.2, long: 1.2, fixed: 0, day: 480, from: 1, until: 5, auto: true, minWalk: 60 },
    { id: 'transit', label: 'by transit', short: 4, long: 8, fixed: 10, day: 900, from: 5, auto: true, minWalk: 20 },
    { id: 'car', label: 'by car', short: 5, long: 12, fixed: 5, day: 600, from: 6, auto: true, minWalk: 15 },
    { id: 'flight', label: 'by air', short: 100, long: 100, fixed: 120, day: null, from: 6, auto: true, minWalk: 3 * 480 },
    { id: 'boat', label: 'by boat', short: 3, long: 3, fixed: 0, day: null, from: 0, auto: false },
    { id: 'portal', label: 'by portal', short: 1, long: 1, fixed: 1, day: null, from: 0, auto: false },
]);
const BY_ID = new Map(MODES.map((m) => [m.id, m]));
export const modeOf = (id) => BY_ID.get(id) ?? null;
export const modeLabel = (id) => BY_ID.get(id)?.label ?? String(id ?? '');

// ---- walking time <-> effort
//
// A long walk is told in travel days: "2 days" on foot is two days of eight
// hours on the road, not 48 hours of walking. EFFORT is minutes actually
// moving; it is what a faster way divides.

const DAY = 1440;

// Walking text -> minutes on the move, or null.
export function walkEffort(text) {
    const minutes = travelMinutes(text);
    if (!minutes) return null;
    if (minutes < 600) return minutes;
    return Math.max(360, (minutes / DAY) * 480);
}

// Minutes on the move by a way -> the time it takes, nights included.
function elapsed(effort, mode) {
    if (!mode.day || effort <= mode.day) return effort;
    const days = Math.round((effort / mode.day) * 2) / 2;
    return Math.max(1, days) * DAY;
}

// How much faster than walking `mode` is, on a trip of `effort` walking
// minutes: short trips at `short`, a day's walk or more at `long`, between
// them on a log scale.
function speedFor(mode, effort) {
    if (effort <= 60) return mode.short;
    if (effort >= 480) return mode.long;
    const t = Math.log(effort / 60) / Math.log(8);
    return mode.short + (mode.long - mode.short) * t;
}

// The time a way takes, worked out from walking minutes on the move ->
// minutes, or null.
export function computedMinutes(walkMinutes, modeId) {
    const mode = BY_ID.get(modeId);
    if (!mode || !Number.isFinite(walkMinutes) || walkMinutes <= 0) return null;
    if (modeId === 'walk') return elapsed(walkMinutes, mode);
    return elapsed(mode.fixed + walkMinutes / speedFor(mode, walkMinutes), mode);
}

// A way's time back to walking effort (an override names only "half a day
// by cart": the walk is worked back from it). -> minutes, or null.
export function walkFromMode(text, modeId) {
    const mode = BY_ID.get(modeId);
    const minutes = travelMinutes(text);
    if (!mode || !minutes) return null;
    // Undo the travel days, then the speed (taken at the long end for a
    // long trip, the short end for a short one).
    const moving = mode.day && minutes >= 600 ? Math.max(360, (minutes / DAY) * mode.day) : minutes;
    const base = Math.max(1, moving - mode.fixed);
    const guess = base * mode.short;
    return Math.round(base * speedFor(mode, guess));
}

// ---- which ways a world has

const techNumber = (level) => Number(/^tl(\d+)$/.exec(String(level ?? ''))?.[1] ?? NaN);

// The tech level as a number for a place: its level, else 6 for a later-age
// world that sets none, else 3.
export function techOf({ techLevel = '', laterAge = false } = {}) {
    const n = techNumber(techLevel);
    return Number.isFinite(n) ? n : laterAge ? 7 : 3;
}

// The ways this world offers by itself on a trip of `walkMinutes`: [id].
export function autoModes(walkMinutes, tech) {
    return MODES.filter((m) => m.auto && tech >= m.from && (m.until == null || tech <= m.until) && (!m.minWalk || walkMinutes >= m.minWalk)).map((m) => m.id);
}

// ---- a route's times

// What an older route's time means. A route made before ways of travel
// (no basis) whose time names a way ("half a day by cart") is that way's;
// one with a bare time is walking in a world without engines, and in one
// with them is the usual way, unknown until the user says.
// -> { walk: minutes | null, override: { mode, text } | null, unsure }
export function readBasis(route, tech) {
    const text = String(route?.travel ?? '');
    if (route?.basis === 'walk') return { walk: walkEffort(text), walkText: text, override: null, unsure: false };
    const mode = modeInText(text);
    // "half a day by cart" is the cart's "half a day".
    const bare = text.replace(/\s*\b(?:by|on|via|in|aboard)\s+(?:an?\s+|the\s+)?[\p{L}\s-]+$/iu, '').trim();
    const own = travelMinutes(bare) ? bare : text;
    // A sea, air or portal crossing says nothing about walking there.
    if (mode && mode !== 'walk') return { walk: ['boat', 'flight', 'portal'].includes(mode) ? null : walkFromMode(text, mode), override: { mode, text: own }, unsure: false };
    if (mode === 'walk' || tech < 6) return { walk: walkEffort(text), walkText: own, override: null, unsure: false };
    return { walk: null, override: null, unsure: Boolean(travelMinutes(text)) };
}

// Every way a route can be travelled, and how long each takes:
// [{ mode, label, text, minutes, own }] (own: set on the route, not worked
// out), fastest last. tech: the tech level at the route.
export function routeTimes(route, tech) {
    const basis = readBasis(route, tech);
    const overrides = { ...(basis.override ? { [basis.override.mode]: basis.override.text } : {}), ...(route?.times ?? {}) };
    const walk = basis.walk;
    // The route's own text is the walking time (not an older route's "half
    // a day by cart", which is the cart's).
    const walkText = walk && !basis.override ? basis.walkText ?? String(route.travel) : '';
    const out = [];
    if (basis.unsure) {
        // The old route's time, for any way, until the user says what it is.
        out.push({ mode: '', label: '', text: String(route.travel), minutes: travelMinutes(route.travel), own: true });
        return out;
    }
    // Only a walking time offers the other ways: with none, the route goes
    // only the ways it names (the island is ferry only).
    const ids = new Set([...(walk ? ['walk', ...autoModes(walk, tech)] : []), ...Object.keys(overrides)]);
    for (const id of MODES.map((m) => m.id)) {
        if (!ids.has(id) || overrides[id] === 'none') continue;
        if (overrides[id]) { out.push({ mode: id, label: modeLabel(id), text: overrides[id], minutes: travelMinutes(overrides[id]), own: true }); continue; }
        if (id === 'walk' && walkText) { out.push({ mode: 'walk', label: modeLabel('walk'), text: walkText, minutes: travelMinutes(walkText), own: true }); continue; }
        const minutes = computedMinutes(walk, id);
        if (minutes) out.push({ mode: id, label: modeLabel(id), text: formatMinutes(minutes), minutes, own: false });
    }
    return out;
}

// The way people usually go, when nothing says: on foot without engines or
// for a short walk; by air for a long trip that has it; else by car.
export function usualMode(times, tech) {
    const has = (id) => times.some((t) => t.mode === id);
    const walk = times.find((t) => t.mode === 'walk');
    if (tech < 6 || !times.some((t) => ['car', 'transit', 'flight'].includes(t.mode))) return has('walk') ? 'walk' : times[0]?.mode ?? '';
    if (walk && walk.minutes != null && walk.minutes <= 20) return 'walk';
    if (has('flight')) return 'flight';
    return has('car') ? 'car' : has('transit') ? 'transit' : times[0]?.mode ?? '';
}

// The time for a journey along a route: the way asked for when the route
// has it, else the usual way. -> { mode, text, minutes, fellBack } or null.
// fellBack: the way asked for does not go here.
export function timeFor(route, tech, wanted = '') {
    const times = routeTimes(route, tech);
    if (!times.length) return null;
    const hit = wanted ? times.find((t) => t.mode === wanted) : null;
    const pick = hit ?? times.find((t) => t.mode === usualMode(times, tech)) ?? times[0];
    return { mode: pick.mode, text: pick.text, minutes: pick.minutes, fellBack: Boolean(wanted && !hit && times[0].mode !== '') };
}

// A route's ways in a line for a prompt: "1 hour on foot, 15 minutes by
// car, 25 minutes by transit" - the party's way first, at most `max`.
export function timesLine(route, tech, { first = '', max = 3 } = {}) {
    const times = routeTimes(route, tech);
    const lead = first || usualMode(times, tech);
    const ordered = [...times.filter((t) => t.mode === lead), ...times.filter((t) => t.mode !== lead)];
    return ordered.slice(0, max).map((t) => (t.mode ? `${t.text} ${t.label}` : t.text)).join(', ');
}

// ---- the way a message travels

// Words for each way, and whether going that way means the party now has
// it (they bought horses; they have a car) - a taxi or a train is just this
// trip.
const MODE_WORDS = [
    ['portal', false, /\b(?:portal|teleport(?:s|ed|ing)?|blink(?:ed)? (?:to|across)|stepped through the gate)\b/],
    ['flight', false, /\b(?:flew|fly|flies|flying|flight|plane|airliner|jet|airship|shuttle|dropship|aircar|hovercraft)\b/],
    ['boat', false, /\b(?:sail(?:s|ed|ing)?|ship|boat|ferry|barge|rowed|row(?:s|ing)? (?:across|over|to)|canoe|gondola)\b/],
    ['transit', false, /\b(?:bus|buses|tram|metro|subway|underground|tube|train|maglev|monorail|rail|streetcar|light rail)\b/],
    ['car', false, /\b(?:taxi|taxis|cab|cabs|uber|rideshare|ride share|limo|limousine)\b/],
    ['car', true, /\b(?:drove|drive|drives|driving|car|truck|van|jeep|motorbike|motorcycle|hovercar)\b/],
    ['cart', true, /\b(?:cart|wagon|carriage|stagecoach|coach|buggy)\b/],
    ['ride', true, /\b(?:rode|ride|rides|riding|horseback|on horses|mounted|mount(?:s|ed)? up|gallop(?:s|ed|ing)?|saddled)\b/],
    ['walk', false, /\b(?:walk(?:s|ed|ing)?|on foot|hike(?:s|d)?|hiking|trek(?:s|ked|king)?|march(?:es|ed|ing)?|stroll(?:s|ed|ing)?|trudg(?:e|es|ed|ing))\b/],
];
const TRAVEL_SENTENCE = /\b(?:to|toward|towards|for|across|into|back|over|took|take|takes|taking|catch|caught|hail(?:s|ed)?|board(?:s|ed)?|hop(?:s|ped)? (?:on|in)|got (?:on|in|into)|get (?:on|in|into)|by|via|set (?:out|off)|head(?:s|ed|ing)?|leave|left|depart(?:s|ed)?|went|go|goes|going|travel(?:s|led|ed|ling)?|journey(?:s|ed)?|arriv(?:e|es|ed))\b/;

// The way of travel named in text: { mode, keeps } or null. In a sentence
// about going somewhere; the first way named wins.
export function readTravelMode(text) {
    const sentences = String(text ?? '').replace(/’/g, "'").replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*/g) ?? [];
    for (const s of sentences) {
        const low = s.toLowerCase();
        if (!TRAVEL_SENTENCE.test(low) && !/\b(?:drove|rode|flew|sailed|walked|teleported)\b/.test(low)) continue;
        let best = null;
        for (const [mode, keeps, re] of MODE_WORDS) {
            const m = re.exec(low);
            if (m && (!best || m.index < best.at)) best = { mode, keeps, at: m.index };
        }
        if (best) return { mode: best.mode, keeps: best.keeps };
    }
    return null;
}

// The way named in a route's own time text ("half a day by cart"), or ''.
export function modeInText(text) {
    const low = String(text ?? '').toLowerCase();
    for (const [mode, , re] of MODE_WORDS) if (re.test(low)) return mode;
    return '';
}

// ---- stored routes

// A route's stored ways: basis 'walk' or '' (an older route), and times
// kept to known ways with a time or 'none'.
export function normalizeRouteTimes(r) {
    const times = {};
    const raw = r && typeof r.times === 'object' && !Array.isArray(r.times) ? r.times : {};
    for (const [id, t] of Object.entries(raw)) {
        const text = String(t ?? '').trim();
        if (BY_ID.has(id) && text && (text === 'none' || travelMinutes(text))) times[id] = text.slice(0, 60);
    }
    return { basis: r?.basis === 'walk' ? 'walk' : '', times };
}

// A new route as stored: its time is the walking time. A time that names
// another way ("half a day by cart", "3 days by ship") is that way's, and
// the walk is worked out from a land way; a crossing by sea, air or portal
// has no walk at all.
export function asWalkRoute(route) {
    const { times } = normalizeRouteTimes(route);
    if (route?.basis === 'walk') return { ...route, basis: 'walk', times };
    const b = readBasis({ travel: route?.travel }, 3);
    if (!b.override) return { ...route, travel: b.walkText ?? String(route?.travel ?? ''), basis: 'walk', times };
    return { ...route, travel: formatWalk(b.walk), basis: 'walk', times: { [b.override.mode]: b.override.text, ...times } };
}

// Whether a route goes at all (a walking time, or a way of its own).
export const routeHasTime = (r) => Boolean(String(r?.travel ?? '').trim() || Object.values(r?.times ?? {}).some((t) => t && t !== 'none'));

// Walking effort (minutes on the move) as a walking time: "16 hours" on
// the move is "2 days" on foot.
export const formatWalk = (effort) => (Number.isFinite(effort) && effort > 0 ? formatMinutes(computedMinutes(effort, 'walk')) : '');

// A route's time in a few words for a label: its walking time, else its
// first way of its own ("2 hours by boat").
export function routeShort(route) {
    if (String(route?.travel ?? '').trim()) return String(route.travel);
    const own = Object.entries(route?.times ?? {}).find(([, t]) => t && t !== 'none');
    return own ? `${own[1]} ${modeLabel(own[0])}` : '';
}
