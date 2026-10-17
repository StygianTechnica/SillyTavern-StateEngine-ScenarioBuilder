// Fills roles with the canonical state. Displays (Pretty Panels layouts)
// bind to roles - "scene.location", "scene.characters" - and each chat says
// which variable fulfils each one. When Scenario State is active in a chat,
// a role with a familiar name and no working assignment there is given the
// matching canonical variable, so a layout built on Scene Context shows
// Scenario Builder's state once Scene Context is switched off. An
// assignment that works is never touched.

import { LOG_PREFIX } from '../constants.js';
import { listRoles, assignRole } from '../api/roles.js';
import { qualifiedName } from '../api/variables.js';
import { ALL_VARIABLES } from './blueprint.js';

// Role names (the last part of the public name, or all of it without its
// "scene." prefix) -> our variable (local name). The first that fits the
// role's type wins.
const ROLE_NAMES = Object.freeze({
    location: ['canon_location'], place: ['canon_location'],
    characters: ['canon_characters'], cast: ['canon_characters'], present: ['canon_characters'], characters_present: ['canon_characters'], people: ['canon_characters'],
    weather: ['canon_weather'], temperature: ['canon_temperature'],
    indoors: ['is_indoors', 'canon_setting'], isindoor: ['is_indoors', 'canon_setting'], indoor: ['is_indoors', 'canon_setting'], setting: ['canon_setting'],
    datetime: ['canon_datetime'], date_time: ['canon_datetime'], currentdate: ['canon_datetime', 'canon_date'], currenttime: ['canon_datetime', 'canon_clock'],
    date: ['canon_datetime', 'canon_date'], time: ['canon_datetime', 'canon_time'], clock: ['canon_datetime', 'canon_clock'],
    daypart: ['canon_daypart'], time_of_day: ['canon_daypart'], part_of_day: ['canon_daypart'],
    season: ['canon_season'], sky: ['canon_sky'], holiday: ['canon_holiday'], events: ['canon_events'],
    title: ['canon_scene'], scene: ['canon_scene'], summary: ['scene_summary'],
    items: ['canon_items'], creatures: ['canon_creatures'], quests: ['canon_quests'], lore: ['canon_lore'],
    is_raining: ['is_raining'], raining: ['is_raining'], is_snowy: ['is_snowy'], snowing: ['is_snowy'], is_stormy: ['is_stormy'],
    is_foggy: ['is_foggy'], is_windy: ['is_windy'], is_hailing: ['is_hailing'], is_drizzle: ['is_drizzle'], is_dry: ['is_dry'],
    is_burning: ['is_burning'], is_night: ['is_night'], night: ['is_night'],
});

// State Engine's rule for which variable types fulfil which role types.
const ACCEPTS = { text: ['string', 'enum', 'calculated', 'object'], number: ['number', 'calculated'], boolean: ['boolean', 'calculated'], date: ['datetime'], image: ['image', 'imageList', 'imageMap'], list: ['array'], object: ['object'] };
export const fits = (roleType, variableType) => (roleType === 'any' ? !!variableType : (ACCEPTS[roleType] ?? []).includes(variableType));

const TYPES = new Map(ALL_VARIABLES.map(([name, def]) => [name, def.type]));

// Pure: the assignments to make. roles: listRoles entries.
// -> [{ roleId, variable (qualified) }]
export function roleFills(roles) {
    const out = [];
    for (const r of roles ?? []) {
        if (!r?.exists || r.valid) continue;
        const name = String(r.publicName ?? '');
        const keys = [name.replace(/^scene\./, '').replace(/\./g, '_'), name.split('.').at(-1)];
        const candidates = keys.map((k) => ROLE_NAMES[k]).find(Boolean) ?? [];
        const pick = candidates.find((v) => fits(r.type, TYPES.get(v)));
        if (pick) out.push({ roleId: r.id, variable: qualifiedName(pick) });
    }
    return out;
}

// Fills the open chat's empty or broken familiar roles. Never throws.
export async function fillRoles(chatId) {
    try {
        const fills = roleFills(await listRoles(chatId));
        for (const f of fills) await assignRole(chatId, f.roleId, f.variable);
        if (fills.length) console.info(LOG_PREFIX, `gave ${fills.length} role(s) the canonical state: ${fills.map((f) => f.roleId).join(', ')}`);
        return fills;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not fill roles with the canonical state', err);
        return [];
    }
}
