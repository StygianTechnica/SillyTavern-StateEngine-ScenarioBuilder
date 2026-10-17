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
//         quest: { type, priority, status (user override), objectives: [{ text, status }],
//                  completion, abandon, threadId }   quests only (src/quests/model.js)
//         excluded,                 never selected for guidance (SB-401)
//         environment: { climate, lighting, rules }   inherited down the tree (SB-142)
//     } },
//     groups: [{ id, name, entryIds: [] }],
//     imports: [{ id, at, books, created: [{ id, type, name }],
//                 filled: [{ id, name, before: { field: value }, parentBefore }] }]
//                                   the last lorebook imports, for undoing one whole
//     relations: [{ id, from, to, kind, note, mutual }]
//                                   relationships the user authored (allies, rivals,
//                                   family...) - where no State Engine field holds them
//                                   (SB-110, SB-112); they take precedence over the
//                                   story's (Archivist's) for the same pair
//     tracked: [objectId],          objects Scenario Builder has taken in (src/library/intake.js)
//     trackedReady,                 false until the first intake pass has seeded `tracked`
//     graph: { positions: { [objectId]: { x, y } },     where the user dragged nodes in the graph view
//              map: { [locationId]: { x, y } } } }     where places sit on the location map (src/ui/map.js)
//
// CHAT DOCUMENT - per-chat state (spec SB-603), keyed by chat key.
//   { schemaVersion, settingId,
//     canonical: { locationId, castIds, weather, temperature, indoor,
//                  dayPart, day, sceneTitle, scenePremise },
//     inPlay: [objectId],                   library entries used in this chat (SB-124)
//     questLinks: { [archivistThreadId]: questId }   quests made from or linked to Archivist threads
//     questsSeen: [questId] | null          quests already taken in (null until the first pass)
//     narrative: { [objectId]: { text, updatedAt, previous } }
//                                           the "current description": what the story
//                                           has made of an object in this chat (a burnt
//                                           forest), used instead of its base description
//     director: { note, key, at, created: [{ id, kind, name }], error }
//     clock: { planned: { from, to, text } | null, override: { until, weather, temperature } | null }
//                                           the game master's latest briefing (src/director/)
//     lastObserved: { [field]: value },     what State Engine extracted last time
//     lastReply: source message id of the newest AI reply reconciled
//     drift: [driftItem],                   see src/validate/drift.js
//     adopted: [{ id, objectId, type, name, at, placedUnder, enrich }],
//                                           objects confirmed into the setting while this chat
//                                           was open, taken in by intake.js; enrich: 'queued' |
//                                           'running' | 'done' | 'failed' | 'off' | 'held'.
//                                           Listed in Review until the user has looked
//     candidates: [{ id, objectId, type, name, field, source, at }],
//     rejected: [{ type, name, threadId? }], suppressed names (SB-225); threadId: the
//                                           Archivist thread a rejected quest came from
//     factionsWritten: { [characterId]: [factionId] }   memberships Scenario Builder wrote
//                                           into characters' runtime factions (src/library/faction-sync.js)
//     held: [{ field, op?, objectId?, value?, until }]   scene changes the user made by
//                                           hand, kept over the story's reading until turn `until`
//     questsDismissed: [threadId]           Archivist threads whose quest was removed:
//                                           no quest is made from them again
//     loreLinks: { [archivistWorldId]: loreId }   lore made from or linked to Archivist's world lore
//     loreDismissed: [archivistWorldId]     Archivist lore whose entry was removed
//     corrections: [{ id, text, turnsLeft, source }],
//     history: [historyEntry],              every automated or manual change (SB-226)
//     turn }                                AI replies reconciled so far

import { emptyMagic, emptyTech, normalizeMagic, normalizeTech } from '../library/world-options.js';
import { emptyQuestMeta, normalizeQuestMeta } from '../quests/model.js';

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

const OVERVIEW_TEXT_KEYS = Object.freeze(['premise', 'worldType', 'tone', 'themes', 'era', 'rules', 'gmStyle']);

export function emptyOverview() {
    return { premise: '', worldType: '', tone: '', themes: '', era: '', rules: '', gmStyle: '', magic: emptyMagic(), tech: emptyTech() };
}

export function emptyRealm() {
    return { worldType: '', magic: '', tech: '', notes: '' };
}

export function normalizeRealm(r) {
    const x = isObject(r) ? r : {};
    return { worldType: str(x.worldType), magic: str(x.magic), tech: str(x.tech), notes: str(x.notes) };
}

export function emptyEntryMeta() {
    return { parentId: null, gmNotes: '', tags: [], pinned: false, excluded: false, origin: '', canonLocked: false, provisional: false, generated: [], source: '', quest: emptyQuestMeta(), archivist: { syncedText: '' }, environment: { climate: '', lighting: '', rules: '' }, climate: '', sky: '', realm: emptyRealm() };
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
        origin: ['user', 'story', 'import', 'director'].includes(m.origin) ? m.origin : '',
        canonLocked: m.canonLocked === true,
        // Known only by a description ("The Eyepatched Man") until the
        // story names them (src/director/: RENAME).
        provisional: m.provisional === true,
        generated: strList(m.generated),
        source: str(m.source),
        quest: normalizeQuestMeta(m.quest),
        // Lore made from or linked to Archivist (src/library/lore-sync.js):
        // the text last synced, so a user's edit is never overwritten.
        archivist: { syncedText: str(m.archivist?.syncedText) },
        environment: { climate: str(env.climate), lighting: str(env.lighting), rules: str(env.rules) },
        // Locations: the climate zone the weather follows (src/calendar/
        // weather.js CLIMATES; '' = inherit from the place it is in) and
        // whether the sky can be seen ('' inherit, 'open', 'none').
        climate: str(m.climate),
        sky: ['open', 'none'].includes(m.sky) ? m.sky : '',
        // Locations: how the world differs here - its kind, magic and
        // technology - for the places inside too (a planet, a realm, a
        // dead-magic zone; '' = inherit). See world-options.js placeOverview.
        realm: normalizeRealm(m.realm),
    };
}

export const IMPORTS_KEPT = 10;

function normalizeRelations(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(isObject)
        .filter((r) => typeof r.from === 'string' && r.from && typeof r.to === 'string' && r.to && r.from !== r.to)
        .map((r) => ({ id: str(r.id) || newLocalId('r'), from: r.from, to: r.to, kind: str(r.kind) || 'knows', note: str(r.note), mutual: r.mutual === true }));
}

// The setting's calendar and sky (src/calendar/): which State Engine
// calendar its dates are on ('' = the built-in gregorian), where a new
// chat's clock starts (scalar seconds, null = the calendar's first morning),
// how the day length swings (sky.js LATITUDES), the suns and moons (either
// list may be empty), the holidays, and the climate where no place says.
export function emptyCalendar() {
    return {
        calendarId: '', start: null, latitude: 'temperate', climate: 'temperate',
        suns: [{ name: 'the sun', offset: 0 }],
        moons: [{ name: 'the moon', cycle: 29.5, offset: 0 }],
        holidays: [],
    };
}

const num = (value, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);

export function normalizeCalendar(value) {
    const c = isObject(value) ? value : {};
    const base = emptyCalendar();
    return {
        calendarId: str(c.calendarId),
        start: Number.isFinite(c.start) ? c.start : null,
        latitude: ['equatorial', 'temperate', 'polar'].includes(c.latitude) ? c.latitude : base.latitude,
        climate: str(c.climate) || base.climate,
        suns: Array.isArray(c.suns) ? c.suns.filter(isObject).slice(0, 4).map((x) => ({ name: str(x.name) || 'the sun', offset: num(x.offset, 0) })) : base.suns,
        moons: Array.isArray(c.moons) ? c.moons.filter(isObject).slice(0, 6).map((x) => ({ name: str(x.name) || 'the moon', cycle: Math.max(1, num(x.cycle, 29.5)), offset: num(x.offset, 0) })) : base.moons,
        holidays: Array.isArray(c.holidays) ? c.holidays.filter((h) => isObject(h) && str(h.name) && Number.isInteger(h.month) && Number.isInteger(h.day)).map((h) => ({
            id: str(h.id) || `h_${str(h.name).toLowerCase().replace(/\W+/g, '_')}`,
            name: str(h.name), month: h.month, day: h.day,
            days: Math.max(1, Math.round(num(h.days, 1))), prepDays: Math.max(0, Math.round(num(h.prepDays, 2))),
            description: str(h.description),
        })) : [],
    };
}

export function emptySettingDoc() {
    // playerId: the character the user plays ('' = the one named like the
    // SillyTavern persona, if any) - the guidance never writes for them.
    return { schemaVersion: SETTING_SCHEMA_VERSION, overview: emptyOverview(), canonOnly: false, entries: {}, groups: [], tracked: [], trackedReady: false, imports: [], relations: [], graph: { positions: {}, map: {} }, calendar: emptyCalendar(), playerId: '', routes: [] };
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
    return { schemaVersion: SETTING_SCHEMA_VERSION, overview, canonOnly: d.canonOnly === true, entries, groups, tracked: strList(d.tracked), trackedReady: d.trackedReady === true,
        imports: Array.isArray(d.imports) ? d.imports.filter(isObject).slice(-IMPORTS_KEPT) : [],
        relations: normalizeRelations(d.relations), graph: { positions: normalizePositions(d.graph?.positions), map: normalizePositions(d.graph?.map) }, calendar: normalizeCalendar(d.calendar), playerId: str(d.playerId),
        // Routes between places: { id, from, to, travel, note, guessed? } (src/library/routes.js).
        routes: Array.isArray(d.routes) ? d.routes.filter((r) => isObject(r) && str(r.id) && str(r.from) && str(r.to) && r.from !== r.to).map((r) => ({ id: r.id, from: r.from, to: r.to, travel: str(r.travel), note: str(r.note), ...(r.guessed === true ? { guessed: true } : {}) })) : [] };
}

export function emptyCanonical() {
    // time: the canonical moment, scalar seconds on the setting's calendar
    // (src/calendar/clock.js); null until the clock starts. dayPart and day
    // follow it whenever it is set.
    return { locationId: '', castIds: [], creatureIds: [], weather: [], temperature: '', indoor: null, dayPart: '', day: 1, time: null, sceneTitle: '', sceneSummary: '', scenePremise: '' };
}

export function normalizeCanonical(value) {
    const c = isObject(value) ? value : {};
    return {
        locationId: str(c.locationId),
        castIds: strList(c.castIds),
        // Creatures the story (or the director) has in the scene, beyond
        // those the library places here.
        creatureIds: strList(c.creatureIds),
        weather: strList(c.weather).filter((w) => WEATHER_VALUES.includes(w)),
        temperature: TEMPERATURES.includes(c.temperature) ? c.temperature : '',
        indoor: typeof c.indoor === 'boolean' ? c.indoor : null,
        dayPart: DAY_PARTS.includes(c.dayPart) ? c.dayPart : '',
        day: Number.isInteger(c.day) && c.day > 0 ? c.day : 1,
        time: Number.isFinite(c.time) ? c.time : null,
        sceneTitle: str(c.sceneTitle),
        // What is going on in the scene now, in a sentence (the director's
        // SITUATION line, or the story's reading when it is a sentence).
        sceneSummary: str(c.sceneSummary),
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

// The clock's bookkeeping (src/calendar/clock.js): the advance made before
// the reply being written (to compare with how much time the story says
// passed), and a weather the story set, kept until a later watch.
// needsNow: the clock started without knowing the story's time of day -
// the director is asked for it (a NOW line) on its next briefing.
export function emptyClock() {
    return { planned: null, override: null, needsNow: false };
}

function normalizeClock(value) {
    const c = isObject(value) ? value : {};
    const planned = isObject(c.planned) && Number.isFinite(c.planned.from) && Number.isFinite(c.planned.to) ? { from: c.planned.from, to: c.planned.to, text: str(c.planned.text) } : null;
    const o = c.override;
    const override = isObject(o) && Number.isFinite(o.until) ? { until: o.until, weather: strList(o.weather).filter((w) => WEATHER_VALUES.includes(w)), temperature: TEMPERATURES.includes(o.temperature) ? o.temperature : '' } : null;
    return { planned, override, needsNow: c.needsNow === true };
}

export function emptyDirector() {
    return { note: '', summary: '', direction: '', key: '', at: '', created: [], error: '', time: '', moves: { in: [], out: [] } };
}

function normalizeDirector(value) {
    if (!isObject(value)) return emptyDirector();
    return {
        note: str(value.note),
        summary: str(value.summary),
        direction: str(value.direction),
        key: str(value.key),
        at: str(value.at),
        created: Array.isArray(value.created) ? value.created.filter((c) => isObject(c) && str(c.id)).slice(-20) : [],
        error: str(value.error),
        time: str(value.time),
        moves: isObject(value.moves) ? { in: strList(value.moves.in), out: strList(value.moves.out) } : { in: [], out: [] },
    };
}

export function emptyChatDoc() {
    return {
        schemaVersion: CHAT_SCHEMA_VERSION,
        settingId: null,
        canonical: emptyCanonical(),
        inPlay: [],
        narrative: {},
        director: emptyDirector(),
        clock: emptyClock(),
        questLinks: {},
        questsSeen: null,
        lastObserved: {},
        lastReply: '',
        drift: [],
        adopted: [],
        candidates: [],
        rejected: [],
        questsDismissed: [],
        loreLinks: {},
        loreDismissed: [],
        factionsWritten: {},
        held: [],
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
        director: normalizeDirector(d.director),
        clock: normalizeClock(d.clock),
        questLinks: isObject(d.questLinks) ? d.questLinks : {},
        questsSeen: Array.isArray(d.questsSeen) ? strList(d.questsSeen) : null,
        lastObserved: isObject(d.lastObserved) ? d.lastObserved : {},
        lastReply: str(d.lastReply),
        drift: Array.isArray(d.drift) ? d.drift.filter(isObject) : [],
        adopted: Array.isArray(d.adopted) ? d.adopted.filter(isObject) : [],
        candidates: Array.isArray(d.candidates) ? d.candidates.filter(isObject) : [],
        // One entry per type and name (older chats could hold repeats).
        rejected: Array.isArray(d.rejected)
            ? d.rejected.filter(isObject).filter((r, i, all) => all.findIndex((x) => x.type === r.type && str(x.name).toLowerCase() === str(r.name).toLowerCase()) === i)
            : [],
        questsDismissed: strList(d.questsDismissed),
        loreLinks: isObject(d.loreLinks) ? d.loreLinks : {},
        loreDismissed: strList(d.loreDismissed),
        held: Array.isArray(d.held) ? d.held.filter((h) => isObject(h) && str(h.field) && Number.isInteger(h.until)) : [],
        factionsWritten: isObject(d.factionsWritten) ? Object.fromEntries(Object.entries(d.factionsWritten).map(([k, v]) => [k, strList(v)]).filter(([, v]) => v.length)) : {},
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
