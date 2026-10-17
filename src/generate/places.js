// Generation for places: routes between the places inside a location (with
// travel times that fit their scale and the world's technology), and a
// place's climate and environment. The prompts and readers are pure (and
// tested); suggestRoutes() / suggestEnvironment() run them on the
// generation connection. Nothing is written here - the sheet shows what
// comes back for the user to keep or not.

import { describeTech } from '../library/world-options.js';
import { CLIMATES } from '../calendar/weather.js';
import { extractJson } from './prompt.js';
import { scaleOf, guessTravel, SCALE_ORDER } from '../library/routes.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};
const keyOf = (name) => clean(name).toLowerCase().replace(/^(the|a|an)\s+/, '');

function worldLine(overview) {
    const o = overview ?? {};
    const tech = describeTech(o.tech).lines.join(' ');
    return [clean(o.premise) && `Setting: ${cut(o.premise, 300)}`, clean(o.era) && `Era: ${clean(o.era)}`, tech].filter(Boolean).join('\n');
}

// ---- routes

// parent: { name, description }; places: [{ name, description }] inside it.
export function buildRoutesPrompt({ parent, places, overview, existing = [] }) {
    const system = 'You are a worldbuilding assistant. You connect places with believable routes and travel times. Reply with JSON only.';
    const user = [
        worldLine(overview),
        '',
        `These places are all inside ${clean(parent.name)}${clean(parent.description) ? ` (${cut(parent.description, 300)})` : ''}:`,
        ...places.map((p) => `- ${clean(p.name)}${clean(p.description) ? `: ${cut(p.description, 160)}` : ''}`),
        existing.length ? `\nRoutes that already exist (do not repeat them): ${existing.map((r) => `${r.from} - ${r.to}`).join('; ')}` : '',
        '',
        'Connect them the way someone would actually get from one to another: a door or stair between rooms, a street between buildings, a road or a sea passage between towns. Not every pair needs a route - only the ones that are directly connected. Give each a travel time that fits the scale and how people travel in this world ("a few steps", "5 minutes", "half a day by cart", "3 days by ship"), and a short note on the way itself when it helps (a narrow stair, the coast road).',
        '',
        'Reply with ONLY this JSON, using the place names exactly as written above:',
        '{"routes": [{"from": "place name", "to": "place name", "travel": "5 minutes", "note": "a narrow stair"}]}',
    ].filter((l) => l !== '').join('\n');
    return { system, user };
}

// The place a name in the reply means: the same name, else the one whose
// name holds it or that it holds ("Market" for "Liston Market"), else the
// one with every distinctive word of it. null when none, or more than one, fits.
export function matchPlaceName(name, placeNames) {
    const k = keyOf(name);
    if (!k) return null;
    const exact = placeNames.find((n) => keyOf(n) === k);
    if (exact) return exact;
    const one = (list) => (list.length === 1 ? list[0] : null);
    const holds = one(placeNames.filter((n) => keyOf(n).includes(k) || k.includes(keyOf(n))));
    if (holds) return holds;
    const words = k.split(/[^a-z0-9']+/).filter((w) => w.length >= 3 && !['the', 'and', 'of'].includes(w));
    return words.length ? one(placeNames.filter((n) => words.every((w) => keyOf(n).includes(w)))) : null;
}

const pairKey = (a, b) => [keyOf(a), keyOf(b)].sort().join('|');

// -> { values: [{ from, to, travel, note }] (names as given), error }
export function readRoutes(text, placeNames, existing = []) {
    const data = extractJson(text);
    const list = Array.isArray(data?.routes) ? data.routes : (Array.isArray(data) ? data : null);
    if (!list) return { values: [], error: 'no routes list in the reply' };
    const seen = new Set(existing.map((r) => pairKey(r.from, r.to)));
    const out = [];
    for (const r of list) {
        // Models name the ends in different ways.
        const ends = Array.isArray(r?.between) ? r.between : [r?.from ?? r?.a ?? r?.start ?? r?.place1, r?.to ?? r?.b ?? r?.end ?? r?.place2];
        const from = matchPlaceName(ends[0], placeNames);
        const to = matchPlaceName(ends[1], placeNames);
        const travel = clean(r?.travel ?? r?.time ?? r?.duration ?? r?.travel_time);
        if (!from || !to || from === to || !travel) continue;
        const pair = pairKey(from, to);
        if (seen.has(pair)) continue;
        seen.add(pair);
        out.push({ from, to, travel: cut(travel, 60), note: cut(r?.note, 120) });
    }
    return out.length ? { values: out.slice(0, placeNames.length * 3), error: '' } : { values: [], error: 'no usable routes in the reply' };
}

// The pairs of places no route joins yet: [[a, b]] (names).
export function unconnectedPairs(placeNames, existing = []) {
    const seen = new Set(existing.map((r) => pairKey(r.from, r.to)));
    const out = [];
    for (let i = 0; i < placeNames.length; i++) for (let j = i + 1; j < placeNames.length; j++) if (!seen.has(pairKey(placeNames[i], placeNames[j]))) out.push([placeNames[i], placeNames[j]]);
    return out;
}

// Routes guessed without the model, when it gives none to use: every
// unconnected pair of a few places (up to 4 - more would be a web of
// guesses), each with a time from the larger place's size and the world's
// technology. places: [{ name, description }].
export function guessedRoutes(places, existing = [], techLevel = '') {
    if (places.length > 4) return [];
    const byName = new Map(places.map((p) => [p.name, p]));
    return unconnectedPairs(places.map((p) => p.name), existing).map(([from, to]) => {
        const scales = [from, to].map((n) => scaleOf(byName.get(n))).filter(Boolean);
        const scale = scales.length ? scales.reduce((x, y) => (SCALE_ORDER.indexOf(y) > SCALE_ORDER.indexOf(x) ? y : x)) : 'building';
        return { from, to, travel: guessTravel(scale, techLevel), note: 'guessed - edit if wrong', guessed: true };
    });
}

// ---- climate and environment

const ZONES = CLIMATES.map(([id]) => id);

export function buildEnvironmentPrompt({ place, inherited = {}, overview, brief = '' }) {
    const system = 'You are a worldbuilding assistant. You describe the climate and surroundings of a place so they fit it and the world. Reply with JSON only.';
    const user = [
        worldLine(overview),
        '',
        `The place: ${clean(place.name)}${clean(place.description) ? ` - ${cut(place.description, 500)}` : ''}`,
        place.path?.length ? `It lies in: ${place.path.join(' > ')}` : '',
        inherited.climate ? `The region around it: climate ${clean(inherited.climate)}${inherited.lighting ? `; light ${clean(inherited.lighting)}` : ''}.` : '',
        clean(brief) ? `Make it this: ${clean(brief)}` : 'Make it distinctive - it may differ from the region around it when the place calls for it (a volcano is hot, a crypt is cold and still).',
        '',
        `Pick the climate zone its weather follows from: ${CLIMATES.map(([id, label]) => `${id} (${label})`).join(', ')}.`,
        'Reply with ONLY this JSON:',
        '{"climate_zone": "temperate", "climate": "a short phrase - humid, salt wind", "lighting": "a short phrase - lantern-lit, smoky", "rules": "a local custom or condition worth knowing, or empty"}',
    ].filter((l) => l !== '').join('\n');
    return { system, user };
}

// -> { values: { climateZone, climate, lighting, rules }, error }
export function readEnvironment(text) {
    const data = extractJson(text);
    if (!data || typeof data !== 'object') return { values: null, error: 'no JSON object in the reply' };
    const zone = String(data.climate_zone ?? data.climateZone ?? '').toLowerCase().trim();
    const values = {
        climateZone: ZONES.includes(zone) ? zone : '',
        climate: cut(data.climate, 120),
        lighting: cut(data.lighting, 120),
        rules: cut(data.rules, 200),
    };
    return values.climateZone || values.climate || values.lighting ? { values, error: '' } : { values: null, error: 'the reply named no climate' };
}

// A random climate zone other than `current` (never 'underground' - that
// is a choice, not weather). `random` is injectable for tests.
export function randomClimate(current = '', random = Math.random) {
    const pool = ZONES.filter((z) => z !== current && z !== 'underground');
    return pool[Math.floor(random() * pool.length)];
}

// ---- runners (the generation connection)

// -> { items: [{ from, to, travel, note, guessed? }], message }: what the
// model suggests; when it gives nothing to use, guesses (marked so) - or,
// when every place is already connected, nothing and a message saying so.
export async function suggestRoutes({ parent, places, overview, existing }) {
    const names = places.map((p) => p.name);
    if (!unconnectedPairs(names, existing).length) return { items: [], message: `The places inside ${clean(parent.name)} are already connected - every pair has a route. Edit those on each place's sheet.` };
    const [{ askReliably }, { useStateEngineJsonParser }, { getSettings }] = await Promise.all([import('./run.js'), import('./json.js'), import('../settings.js')]);
    await useStateEngineJsonParser();
    const prompt = buildRoutesPrompt({ parent, places, overview, existing });
    let result = null;
    try {
        result = await askReliably(prompt, (_p, text) => readRoutes(text, names, existing), getSettings().generation.maxTokens);
    } catch (err) {
        result = { values: [], error: String(err?.message ?? err) };
    }
    if (!result.error && result.values.length) return { items: result.values, message: '' };
    const guesses = guessedRoutes(places, existing, overview?.tech?.level ?? '');
    return guesses.length
        ? { items: guesses, message: 'The model suggested no routes that could be used, so these are guesses from the places\' size. Keep the ones you want and change their times on the sheet.' }
        : { items: [], message: 'The model suggested no routes that could be used. Add them by hand below, or try again.' };
}

export async function suggestEnvironment({ place, inherited, overview, brief }) {
    const [{ askReliably }, { useStateEngineJsonParser }] = await Promise.all([import('./run.js'), import('./json.js')]);
    await useStateEngineJsonParser();
    const result = await askReliably(buildEnvironmentPrompt({ place, inherited, overview, brief }), (_p, text) => readEnvironment(text), 500);
    if (result.error) throw new Error(result.error);
    return result.values;
}
