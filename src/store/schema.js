// The shapes of Scenario Builder's two stored documents, and their
// forward-only migrations (spec SB-014). Pure: no SillyTavern imports, so
// it can be unit-tested (spec SB-804).
//
// SETTING DOCUMENT - library organisation for one State Engine setting
// (spec SB-601). Object data is NOT here (SB-011): only ids plus
// Scenario Builder's own metadata.
//   { schemaVersion,
//     overview: { premise, worldType, tone, themes, era, rules,
//                 magic: { presence, power, kinds, absent, restrictions, notes },
//                 tech: { level, levelFromEra, flavors, spread, absent, notes } },
//                 (src/library/world-options.js; the old single magicLevel migrates)
//     canonOnly,                    the setting is fixed canon (e.g. from a published
//                                   lorebook): nothing generated is added to its
//                                   entries, and story inventions wait for review
//     entries: { [objectId]: {
//         parentId,                 location hierarchy (SB-145: kept here until
//                                   State Engine has a location.parent field)
//         gmNotes,                  GM-only text, never in guidance (SB-123)
//         tags: [], pinned,
//         origin,                   '' | 'user' | 'story' | 'import' - where it came from
//         canonLocked,              never add generated detail to this entry
//         generated: [field],       fields last filled by generation (SB-136)
//         source,                   where an imported entry came from: "lorebook:<book>#<uid>" (SB-155)
//         excluded,                 never selected for guidance (SB-401)
//         environment: { climate, lighting, rules }   inherited down the tree (SB-142)
//     } },
//     groups: [{ id, name, entryIds: [] }],
//     tracked: [objectId],          objects Scenario Builder has taken in (src/library/intake.js)
//     trackedReady,                 false until the first intake pass has seeded `tracked`
//     graph: { positions: { [objectId]: { x, y } } } }   where the user dragged nodes in the graph view
//
// CHAT DOCUMENT - per-chat state (spec SB-603), keyed by chat key.
//   { schemaVersion, settingId,
//     canonical: { locationId, castIds, weather, temperature, indoor,
//                  dayPart, day, sceneTitle, scenePremise },
//     inPlay: [objectId],                   library entries used in this chat (SB-124)
//     narrative: { [objectId]: { text, updatedAt, previous } }
//                                           the "current description": what the story
//                                           has made of an object in this chat (a burnt
//                                           forest), used instead of its base description
//     lastObserved: { [field]: value },     what State Engine extracted last time
//     lastReply: source message id of the newest AI reply reconciled
//     drift: [driftItem],                   see src/validate/drift.js
//     adopted: [{ id, objectId, type, name, at, placedUnder, enrich }],
//                                           objects confirmed into the setting while this chat
//                                           was open, taken in by intake.js; enrich: 'queued' |
//                                           'running' | 'done' | 'failed' | 'off' | 'held'.
//                                           Listed in Review until the user has looked
//     candidates: [{ id, objectId, type, name, field, source, at }],
//     rejected: [{ type, name }],           suppressed candidate names (SB-225)
//     corrections: [{ id, text, turnsLeft, source }],
//     history: [historyEntry],              every automated or manual change (SB-226)
//     turn }                                AI replies reconciled so far

import { emptyMagic, emptyTech, normalizeMagic, normalizeTech } from '../library/world-options.js';

export const SETTING_SCHEMA_VERSION = 1;
export const CHAT_SCHEMA_VERSION = 1;

// How many history entries a chat keeps (oldest dropped first).
export const HISTORY_LIMIT = 200;
// How many resolved drift items a chat keeps.
export const DRIFT_LIMIT = 100;

export const DAY_PARTS = Object.freeze(['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night', 'late night']);
export const TEMPERATURES = Object.freeze(['Freezing', 'Cold', 'Cool', 'Mild', 'Warm', 'Hot', 'Scorching']);
export const WEATHER_VALUES = Object.freeze([
    'Clear', 'Sunny', 'Partly Cloudy', 'Overcast', 'Rainy', 'Stormy', 'Thunderstorm', 'Snowy',
    'Windy', 'Foggy', 'Hazy', 'Humid', 'Dry', 'Drizzle', 'Hailing',
]);

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const str = (value) => (typeof value === 'string' ? value : '');
const strList = (value) => (Array.isArray(value) ? [...new Set(value.filter((v) => typeof v === 'string' && v))] : []);

const OVERVIEW_TEXT_KEYS = Object.freeze(['premise', 'worldType', 'tone', 'themes', 'era', 'rules']);

export function emptyOverview() {
    return { premise: '', worldType: '', tone: '', themes: '', era: '', rules: '', magic: emptyMagic(), tech: emptyTech() };
}

export function emptyEntryMeta() {
    return { parentId: null, gmNotes: '', tags: [], pinned: false, excluded: false, origin: '', canonLocked: false, generated: [], source: '', environment: { climate: '', lighting: '', rules: '' } };
}

export function normalizeEntryMeta(meta) {
    const m = isObject(meta) ? meta : {};
    const env = isObject(m.environment) ? m.environment : {};
    return {
        parentId: typeof m.parentId === 'string' && m.parentId ? m.parentId : null,
        gmNotes: str(m.gmNotes),
        tags: strList(m.tags),
        pinned: m.pinned === true,
        excluded: m.excluded === true,
        origin: ['user', 'story', 'import'].includes(m.origin) ? m.origin : '',
        canonLocked: m.canonLocked === true,
        generated: strList(m.generated),
        source: str(m.source),
        environment: { climate: str(env.climate), lighting: str(env.lighting), rules: str(env.rules) },
    };
}

export function emptySettingDoc() {
    return { schemaVersion: SETTING_SCHEMA_VERSION, overview: emptyOverview(), canonOnly: false, entries: {}, groups: [], tracked: [], trackedReady: false, graph: { positions: {} } };
}

// Brings any stored setting document (or nothing) to the current shape.
function normalizePositions(value) {
    const out = {};
    if (!isObject(value)) return out;
    for (const [id, p] of Object.entries(value)) {
        if (isObject(p) && Number.isFinite(p.x) && Number.isFinite(p.y)) out[id] = { x: p.x, y: p.y };
    }
    return out;
}

export function normalizeSettingDoc(doc) {
    const d = isObject(doc) ? doc : {};
    const o = isObject(d.overview) ? d.overview : {};
    const overview = emptyOverview();
    for (const key of OVERVIEW_TEXT_KEYS) overview[key] = str(o[key]);
    overview.magic = normalizeMagic(o.magic, str(o.magicLevel));
    overview.tech = normalizeTech(o.tech);
    const entries = {};
    if (isObject(d.entries)) for (const [id, meta] of Object.entries(d.entries)) entries[id] = normalizeEntryMeta(meta);
    const groups = Array.isArray(d.groups)
        ? d.groups.filter(isObject).filter((g) => typeof g.id === 'string' && g.id).map((g) => ({ id: g.id, name: str(g.name) || 'Group', entryIds: strList(g.entryIds) }))
        : [];
    return { schemaVersion: SETTING_SCHEMA_VERSION, overview, canonOnly: d.canonOnly === true, entries, groups, tracked: strList(d.tracked), trackedReady: d.trackedReady === true, graph: { positions: normalizePositions(d.graph?.positions) } };
}

export function emptyCanonical() {
    return { locationId: '', castIds: [], weather: [], temperature: '', indoor: null, dayPart: '', day: 1, sceneTitle: '', scenePremise: '' };
}

export function normalizeCanonical(value) {
    const c = isObject(value) ? value : {};
    return {
        locationId: str(c.locationId),
        castIds: strList(c.castIds),
        weather: strList(c.weather).filter((w) => WEATHER_VALUES.includes(w)),
        temperature: TEMPERATURES.includes(c.temperature) ? c.temperature : '',
        indoor: typeof c.indoor === 'boolean' ? c.indoor : null,
        dayPart: DAY_PARTS.includes(c.dayPart) ? c.dayPart : '',
        day: Number.isInteger(c.day) && c.day > 0 ? c.day : 1,
        sceneTitle: str(c.sceneTitle),
        scenePremise: str(c.scenePremise),
    };
}

function normalizeNarrative(value) {
    const out = {};
    if (!isObject(value)) return out;
    for (const [id, n] of Object.entries(value)) {
        if (!isObject(n) || !str(n.text).trim()) continue;
        out[id] = { text: str(n.text), updatedAt: str(n.updatedAt), previous: str(n.previous) };
    }
    return out;
}

export function emptyChatDoc() {
    return {
        schemaVersion: CHAT_SCHEMA_VERSION,
        settingId: null,
        canonical: emptyCanonical(),
        inPlay: [],
        narrative: {},
        lastObserved: {},
        lastReply: '',
        drift: [],
        adopted: [],
        candidates: [],
        rejected: [],
        corrections: [],
        history: [],
        turn: 0,
    };
}

export function normalizeChatDoc(doc) {
    const d = isObject(doc) ? doc : {};
    return {
        schemaVersion: CHAT_SCHEMA_VERSION,
        settingId: typeof d.settingId === 'string' && d.settingId ? d.settingId : null,
        canonical: normalizeCanonical(d.canonical),
        inPlay: strList(d.inPlay),
        narrative: normalizeNarrative(d.narrative),
        lastObserved: isObject(d.lastObserved) ? d.lastObserved : {},
        lastReply: str(d.lastReply),
        drift: Array.isArray(d.drift) ? d.drift.filter(isObject) : [],
        adopted: Array.isArray(d.adopted) ? d.adopted.filter(isObject) : [],
        candidates: Array.isArray(d.candidates) ? d.candidates.filter(isObject) : [],
        rejected: Array.isArray(d.rejected) ? d.rejected.filter(isObject) : [],
        corrections: Array.isArray(d.corrections) ? d.corrections.filter(isObject) : [],
        history: Array.isArray(d.history) ? d.history.filter(isObject).slice(-HISTORY_LIMIT) : [],
        turn: Number.isInteger(d.turn) && d.turn >= 0 ? d.turn : 0,
    };
}

// Short, unique-enough ids for drift items, history entries, groups.
let counter = 0;
export function newLocalId(prefix) {
    counter = (counter + 1) % 1e6;
    return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}
