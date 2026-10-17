// Generation for places: routes between the places inside a location (with
// travel times that fit their scale and the world's technology), and a
// place's climate and environment. The prompts and readers are pure (and
// tested); suggestRoutes() / suggestEnvironment() run them on the
// generation connection. Nothing is written here - the sheet shows what
// comes back for the user to keep or not.

import { describeTech } from '../library/world-options.js';
import { CLIMATES } from '../calendar/weather.js';
import { extractJson } from './prompt.js';

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

// -> { values: [{ from, to, travel, note }] (names as given), error }
export function readRoutes(text, placeNames, existing = []) {
    const data = extractJson(text);
    const list = Array.isArray(data?.routes) ? data.routes : (Array.isArray(data) ? data : null);
    if (!list) return { values: [], error: 'no routes list in the reply' };
    const byKey = new Map(placeNames.map((n) => [keyOf(n), n]));
    const seen = new Set(existing.map((r) => [keyOf(r.from), keyOf(r.to)].sort().join('|')));
    const out = [];
    for (const r of list) {
        const from = byKey.get(keyOf(r?.from));
        const to = byKey.get(keyOf(r?.to));
        const travel = clean(r?.travel);
        if (!from || !to || from === to || !travel) continue;
        const pair = [keyOf(from), keyOf(to)].sort().join('|');
        if (seen.has(pair)) continue;
        seen.add(pair);
        out.push({ from, to, travel: cut(travel, 60), note: cut(r?.note, 120) });
    }
    return out.length ? { values: out.slice(0, placeNames.length * 3), error: '' } : { values: [], error: 'no usable routes in the reply' };
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

export async function suggestRoutes({ parent, places, overview, existing }) {
    const [{ askReliably }, { useStateEngineJsonParser }, { getSettings }] = await Promise.all([import('./run.js'), import('./json.js'), import('../settings.js')]);
    await useStateEngineJsonParser();
    const prompt = buildRoutesPrompt({ parent, places, overview, existing });
    const result = await askReliably(prompt, (_p, text) => readRoutes(text, places.map((p) => p.name), existing), getSettings().generation.maxTokens);
    if (result.error) throw new Error(result.error);
    return result.values;
}

export async function suggestEnvironment({ place, inherited, overview, brief }) {
    const [{ askReliably }, { useStateEngineJsonParser }] = await Promise.all([import('./run.js'), import('./json.js')]);
    await useStateEngineJsonParser();
    const result = await askReliably(buildEnvironmentPrompt({ place, inherited, overview, brief }), (_p, text) => readEnvironment(text), 500);
    if (result.error) throw new Error(result.error);
    return result.values;
}
