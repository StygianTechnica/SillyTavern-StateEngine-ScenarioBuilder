// Weather that follows the place and the season and runs on from day to day.
// Pure and deterministic: the same region, calendar day and hour always give
// the same weather, so it can be plotted ahead on the calendar and is the
// same every time it is asked for. The day is split into four watches; each
// watch's sky follows the one before (fronts last), drawn from what the
// climate makes likely in this season. Temperature is the climate's mean for
// the season, the swing between night and afternoon, and a slow day-to-day
// drift (warm spells, cold snaps).

import { seasonalWarmth } from './sky.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// [id, label, { mean °C, seasonal swing, daily swing, wet (0-1, chance of
// rain/snow in a watch), wetSeason (-1 winter-wet .. +1 summer-wet), storm,
// fog, wind, extra }]
export const CLIMATES = Object.freeze([
    ['temperate', 'Temperate', { mean: 11, season: 9, daily: 7, wet: 0.3, wetSeason: 0, storm: 0.15, fog: 0.08, wind: 0.2 }],
    ['oceanic', 'Oceanic / coastal', { mean: 11, season: 5, daily: 5, wet: 0.42, wetSeason: -0.3, storm: 0.15, fog: 0.15, wind: 0.35 }],
    ['continental', 'Continental (hot summers, hard winters)', { mean: 8, season: 16, daily: 10, wet: 0.25, wetSeason: 0.3, storm: 0.25, fog: 0.06, wind: 0.2 }],
    ['mediterranean', 'Mediterranean (dry summers)', { mean: 17, season: 7, daily: 9, wet: 0.2, wetSeason: -0.8, storm: 0.15, fog: 0.04, wind: 0.2 }],
    ['subarctic', 'Subarctic / taiga', { mean: -2, season: 17, daily: 8, wet: 0.28, wetSeason: 0.2, storm: 0.1, fog: 0.08, wind: 0.25 }],
    ['polar', 'Polar / tundra', { mean: -14, season: 13, daily: 5, wet: 0.2, wetSeason: 0, storm: 0.2, fog: 0.1, wind: 0.45 }],
    ['highland', 'Highland / alpine', { mean: 3, season: 9, daily: 11, wet: 0.35, wetSeason: 0.2, storm: 0.25, fog: 0.2, wind: 0.4 }],
    ['steppe', 'Steppe / semi-arid', { mean: 12, season: 13, daily: 14, wet: 0.12, wetSeason: 0.3, storm: 0.3, fog: 0.02, wind: 0.4, dry: true }],
    ['desert', 'Desert', { mean: 25, season: 9, daily: 18, wet: 0.03, wetSeason: 0, storm: 0.4, fog: 0, wind: 0.35, dry: true }],
    ['tropical', 'Tropical rainforest', { mean: 27, season: 1, daily: 7, wet: 0.5, wetSeason: 0, storm: 0.35, fog: 0.15, wind: 0.08, humid: true }],
    ['monsoon', 'Tropical monsoon', { mean: 27, season: 3, daily: 8, wet: 0.35, wetSeason: 0.95, storm: 0.4, fog: 0.08, wind: 0.2, humid: true }],
    ['swamp', 'Swamp / marsh', { mean: 18, season: 8, daily: 6, wet: 0.38, wetSeason: 0.2, storm: 0.2, fog: 0.35, wind: 0.08, humid: true }],
    ['volcanic', 'Volcanic', { mean: 30, season: 4, daily: 8, wet: 0.2, wetSeason: 0, storm: 0.3, fog: 0.05, wind: 0.2, haze: 0.5 }],
    ['underground', 'Underground / sheltered (no weather)', { constant: 12 }],
]);

const CLIMATE = Object.fromEntries(CLIMATES.map(([id, , c]) => [id, c]));

export function climateOf(id) {
    return CLIMATE[id] ?? null;
}

// ---- deterministic randomness

function hashOf(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

// A number in [0, 1) for a seed and a key, always the same.
function rand(seed, key) {
    let t = (hashOf(`${seed}|${key}`) + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- sky conditions, watch by watch

const SKIES = ['clear', 'cloudy', 'overcast', 'wet', 'storm', 'fog'];

function chances(c, warmth) {
    const wet = clamp(c.wet * (1 + c.wetSeason * warmth), 0, 0.9);
    const storm = wet * c.storm;
    const fog = c.fog * (warmth < 0 ? 1.4 : 0.7);
    const rest = Math.max(0, 1 - wet - fog);
    return { clear: rest * 0.45, cloudy: rest * 0.33, overcast: rest * 0.22, wet: wet - storm, storm, fog };
}

function draw(table, r) {
    let acc = 0;
    for (const s of SKIES) {
        acc += table[s];
        if (r < acc) return s;
    }
    return 'clear';
}

const NEXT_TO = { clear: ['cloudy'], cloudy: ['clear', 'overcast'], overcast: ['cloudy', 'wet'], wet: ['overcast', 'storm'], storm: ['wet'], fog: ['clear', 'cloudy'] };

// The sky in a watch (4 per day), run on from 24 watches earlier so fronts
// carry over from day to day.
function skyOfWatch(seed, c, watch, warmthOf) {
    let sky = draw(chances(c, warmthOf(watch - 24)), rand(seed, `s${watch - 24}`));
    for (let w = watch - 23; w <= watch; w++) {
        const r = rand(seed, `w${w}`);
        if (r < 0.55) continue; // fronts last
        if (r < 0.75) {
            const near = NEXT_TO[sky];
            sky = near[Math.floor(rand(seed, `n${w}`) * near.length)];
        } else {
            sky = draw(chances(c, warmthOf(w)), rand(seed, `d${w}`));
        }
    }
    return sky;
}

// A slow drift in temperature, -1..1, smoothed over a few days.
function drift(seed, day) {
    let sum = 0;
    let weight = 0;
    for (let k = 0; k < 5; k++) {
        const w = 5 - k;
        sum += (rand(seed, `t${day - k}`) * 2 - 1) * w;
        weight += w;
    }
    return sum / weight;
}

export const TEMPERATURE_BANDS = Object.freeze([[-5, 'Freezing'], [5, 'Cold'], [12, 'Cool'], [20, 'Mild'], [27, 'Warm'], [35, 'Hot'], [Infinity, 'Scorching']]);
export const bandOf = (celsius) => TEMPERATURE_BANDS.find(([max]) => celsius < max)[1];

// The weather at a moment.
// seed: the region (setting + place); climateId; dayIndex: whole days since
// the epoch; fraction: of the day; dayOfYear, yearLength (for the season).
// -> { sky, weather: [WEATHER_VALUES], celsius, temperature, windy }
export function weatherAt({ seed, climateId, dayIndex, fraction, dayOfYear, yearLength }) {
    const c = climateOf(climateId) ?? climateOf('temperate');
    if (c.constant !== undefined) return { sky: 'none', weather: [], celsius: c.constant, temperature: bandOf(c.constant), windy: false };
    const watch = dayIndex * 4 + Math.min(3, Math.floor(fraction * 4));
    const doyAt = (w) => {
        const d = Math.floor(w / 4) - dayIndex;
        return ((dayOfYear - 1 + d) % yearLength + yearLength) % yearLength + 1;
    };
    const warmthOf = (w) => seasonalWarmth(doyAt(w), yearLength);
    const warmth = warmthOf(watch);
    let sky = skyOfWatch(seed, c, watch, warmthOf);
    if (c.dry && sky === 'fog') sky = 'clear';

    // Coldest just before dawn, warmest mid-afternoon.
    const daily = Math.cos(2 * Math.PI * (fraction - 0.62));
    const cloudDamp = sky === 'clear' ? 1 : sky === 'cloudy' ? 0.75 : 0.45;
    const celsius = Math.round(c.mean + c.season * warmth + (c.daily / 2) * daily * cloudDamp + 5 * drift(seed, dayIndex) - (sky === 'wet' || sky === 'storm' ? 2 : 0));
    const windy = sky === 'storm' || rand(seed, `wind${watch}`) < c.wind;
    const daytime = fraction > 0.27 && fraction < 0.77;
    const freezing = celsius <= 0;

    const weather = [];
    switch (sky) {
        case 'clear': weather.push(daytime ? 'Sunny' : 'Clear'); break;
        case 'cloudy': weather.push('Partly Cloudy'); break;
        case 'overcast': weather.push('Overcast'); break;
        case 'wet': weather.push(freezing ? 'Snowy' : rand(seed, `drz${watch}`) < 0.35 ? 'Drizzle' : 'Rainy'); break;
        case 'storm':
            if (freezing) weather.push('Snowy', 'Stormy');
            else if (rand(seed, `hail${watch}`) < 0.06) weather.push('Hailing', 'Stormy');
            else weather.push(celsius > 12 ? 'Thunderstorm' : 'Stormy');
            break;
        case 'fog': weather.push('Foggy'); break;
        default: break;
    }
    if (windy && !weather.includes('Stormy')) weather.push('Windy');
    if (c.humid && celsius > 22) weather.push('Humid');
    if (c.dry && (sky === 'clear' || sky === 'cloudy')) weather.push('Dry');
    if (c.haze && rand(seed, `haze${dayIndex}`) < c.haze && !weather.includes('Foggy')) weather.push('Hazy');
    return { sky, weather, celsius, temperature: bandOf(celsius), windy };
}

// A run of days for the calendar: per day the main sky in the day watches
// and the low/high temperature bands.
export function forecast({ seed, climateId, fromDay, days, dayOfYear, yearLength }) {
    const out = [];
    for (let i = 0; i < days; i++) {
        const at = (fraction) => weatherAt({ seed, climateId, dayIndex: fromDay + i, fraction, dayOfYear: ((dayOfYear - 1 + i) % yearLength) + 1, yearLength });
        const night = at(0.15);
        const morning = at(0.4);
        const afternoon = at(0.65);
        out.push({ dayIndex: fromDay + i, weather: afternoon.weather.length ? afternoon.weather : morning.weather, morning: morning.weather, low: night.temperature, high: afternoon.temperature, lowC: night.celsius, highC: afternoon.celsius });
    }
    return out;
}

// A sentence for the narrator.
// Each weather value as a phrase that reads in a sentence.
const WEATHER_PHRASES = {
    Clear: 'the sky is clear', Sunny: 'the sun is out', 'Partly Cloudy': 'clouds drift across the sky', Overcast: 'the sky is overcast',
    Rainy: 'it is raining', Drizzle: 'a light drizzle is falling', Stormy: 'a storm is blowing', Thunderstorm: 'a thunderstorm is raging',
    Snowy: 'it is snowing', Hailing: 'hail is falling', Windy: 'the wind is up', Foggy: 'fog hangs in the air',
    Hazy: 'the air is hazy', Humid: 'the air is humid', Dry: 'the air is dry',
};

export function weatherText({ weather, temperature }, { indoor = false, open = true } = {}) {
    const phrases = (weather ?? []).map((x) => WEATHER_PHRASES[x] ?? `it is ${String(x).toLowerCase()}`);
    if (!open && !phrases.length) return temperature ? `The air here is ${temperature.toLowerCase()}.` : '';
    if (temperature) phrases.push(`it is ${temperature.toLowerCase()}`);
    if (!phrases.length) return '';
    const joined = phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}` : phrases[0];
    const text = `${indoor ? 'Outside, ' : ''}${joined}.`;
    return text.charAt(0).toUpperCase() + text.slice(1);
}
