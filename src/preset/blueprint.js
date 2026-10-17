// The "Scenario State" preset (spec 7.1): Scenario Builder's own State
// Engine variable preset, namespace sb. Pure data - restored and migrated
// from here by src/preset/scenario-preset.js (SB-206), never edited by the
// user in the manager.
//
// Three groups of variables, side by side (SB-201):
//
// OBSERVED - a trimmed subset of State Engine's Scene Context preset,
//   renamed sb__<name> and PROMPTED: what the roleplay model writes is read
//   back into them by State Engine's own per-message update, and Scenario
//   Builder validates it against the library (SB-202, 7.3). Kept from
//   Scene Context: scene_title, scene_summary, scene_location,
//   scene_characters, scene_weather, scene_temperature, scene_isindoor.
//   Dropped (OPEN-1, MVP choice): scene_currentdate and scene_currenttime
//   (decided), scene_deltatime, scene_id, scene_tags and the calculated
//   weather flags - nothing in the guidance reads them, and each prompted
//   variable costs prompt space.
//
// CANONICAL - what Scenario Builder holds as true; never prompted, written
//   only by Scenario Builder (SB-202), shown in the tracker next to the
//   observed values.
//
// OUTPUT - sb__guidance and sb__state_block (spec 8.1): never prompted,
//   not in the tracker; offered to Curator through capabilities.

import { WEATHER_VALUES, TEMPERATURES } from '../store/schema.js';

export const PRESET_NAME = 'Scenario State';

export const PRESET_DESCRIPTION = 'The scenario\'s world state: what the story says (checked against the setting library) and what is canonically true, plus the narrative guidance offered to Curator.';

// Raised whenever a definition below changes, so an existing install is
// brought up to date once (SB-206).
// 2: sb__quests (the active quests, so State Engine tracks their runtime).
// 3: self-contained, so Scene Context can be switched off: the clock
//    (sb__scene_deltatime observed; canonical datetime, date, clock, part of
//    day, season, sky, holiday), what is present in the scene (items,
//    creatures, quests, lore, events) and calculated weather/time flags.
// 4: the scene title is written when it is empty; sb__cast.
// 5: canon_datetime follows the chat's setting calendar ("@setting").
// 6: the guidance in six parts (guidance_setting ... guidance_direction).
// 7: sb__scene_creatures (the creatures the story has in the scene).
// 8: sb__canon_summary; scene summary and title instructions tightened.
export const PRESET_VERSION = 8;

const text = (label, description, extra = {}) => ({
    label, description, type: 'string', defaultValue: '', scope: 'chat', showInTracker: true,
    behaviors: { prompted: false, increment: false }, ...extra,
});
const prompted = (instructions) => ({ behaviors: { prompted: true, increment: false }, prompted: { instructions } });

export const OBSERVED_VARIABLES = Object.freeze([
    ['scene_title', text('Scene title', 'A short title for the current situation, as the story tells it.', prompted(
        'A short scene title of two to five words naming the current situation (like "Siege at the Wall"), from the recent messages and the current value. If the current value is empty, write one. Otherwise keep it unless the situation has clearly moved on.',
    ))],
    ['scene_summary', text('Scene summary', 'What is happening in the scene now, as the story tells it.', prompted(
        'One or two sentences on what is happening in the scene right now, from the last few messages only: who is doing what, and where. Write full sentences - never just a name or a word. Not the whole story.',
    ))],
    ['scene_location', {
        label: 'Location (story)', description: 'The place the story says the scene is in - a location object, checked against the canonical location.',
        type: 'object', objectType: 'location', defaultValue: '', scope: 'chat', showInTracker: true,
        ...prompted('The specific place the scene is in right now - the most specific named place (a room, building or street rather than the whole city).\nThe current value is where the scene is meant to be: keep it exactly unless the characters clearly moved or a different place is explicitly named.'),
    }],
    ['scene_characters', {
        label: 'Characters (story)', description: 'The characters the story says are present - checked against the canonical cast.',
        type: 'array', itemType: 'object', itemObjectType: 'character', unique: true, defaultValue: '[]', scope: 'chat', showInTracker: true,
        ...prompted('Who is present in the scene now. Keep characters who remain, add characters who arrive, remove characters who leave. Start from the current value - it is who is meant to be here.'),
    }],
    ['scene_creatures', {
        label: 'Creatures (story)', description: 'The creatures the story says are in the scene - checked against the canonical ones.',
        type: 'array', itemType: 'object', itemObjectType: 'creature', unique: true, defaultValue: '[]', scope: 'chat', showInTracker: true,
        ...prompted('The creatures in the scene now - monsters, beasts and animals that matter to it. A group counts as one entry, by what the story calls it ("the zombies", "a pack of wolves"). Start from the current value: keep those still here, add any that arrive, remove those that leave or are killed.'),
    }],
    ['scene_weather', {
        label: 'Weather (story)', description: 'The weather the story describes.',
        type: 'array', itemType: 'enum', itemEnumValues: [...WEATHER_VALUES], unique: true, defaultValue: '[]', scope: 'chat', showInTracker: true,
        ...prompted('Explicit weather cues in the last turn only (e.g. "drizzling", "clear sky", "wind picking up"), mapped to the allowed values. Do not infer weather from mood or metaphor. If the messages do not describe the weather, keep the current value.'),
    }],
    ['scene_temperature', {
        label: 'Temperature (story)', description: 'How warm or cold the story says it is.',
        type: 'enum', enumValues: [...TEMPERATURES], defaultValue: '', scope: 'chat', showInTracker: true,
        ...prompted('The temperature value closest to what the characters experience. Keep the current value unless the messages say otherwise.'),
    }],
    ['scene_deltatime', text('Time passed (story)', 'How much in-story time the last turn covered, as the story tells it - the clock catches up when it is more than was planned.', prompted(
        'How much in-story time passed across the whole Latest turn - every message in it, the user’s included. Count everything that takes time: talking (a few minutes), travel, waiting, work, sleep, and any skip the story makes (“hours later”, “the next day”). Answer a duration (“5 minutes”, “2 hours”, “3 days”) or, when the story moves on to a time of day, that time of day (“the next morning”, “that evening”, “tomorrow afternoon”, “until dawn”). Drop hedging words (“about half an hour” → “30 minutes”). Answer “” only if no time passed at all.',
    ))],
    ['scene_isindoor', {
        label: 'Indoors (story)', description: 'Whether the story puts the scene indoors.',
        type: 'boolean', defaultValue: '', scope: 'chat', showInTracker: true,
        ...prompted('Whether the scene is indoors, from explicit cues ("inside the tavern", "under the open sky"). If the recent messages give no cue, keep the current value.'),
    }],
]);

// The quests being pursued now. Scenario Builder writes the active ones
// before each reply; holding them makes State Engine prompt their runtime
// fields (status, and progress if tracking is on), and the story can add a
// quest it starts (SB-432, SB-439a B).
export const QUEST_VARIABLES = Object.freeze([
    ['quests', {
        label: 'Quests (story)', description: 'The quests the characters are pursuing now.',
        type: 'array', itemType: 'object', itemObjectType: 'quest', unique: true, defaultValue: '[]', scope: 'chat', showInTracker: true,
        ...prompted('The quests the characters are actively pursuing now. Keep every quest in the current value that is still being pursued. Add a quest only when the story clearly starts a new one. Remove a quest only when it is finished, failed or given up.'),
    }],
]);

const objects = (label, description, objectType) => ({
    label, description, type: 'array', itemType: 'object', itemObjectType: objectType, unique: true, defaultValue: '[]', scope: 'chat', showInTracker: true,
    behaviors: { prompted: false, increment: false },
});

export const CANONICAL_VARIABLES = Object.freeze([
    ['canon_location', {
        label: 'Location', description: 'Where the scene canonically is - a location from the setting library.',
        type: 'object', objectType: 'location', defaultValue: '', scope: 'chat', showInTracker: true,
        behaviors: { prompted: false, increment: false },
    }],
    ['canon_characters', {
        label: 'Characters present', description: 'Who is canonically present.',
        type: 'array', itemType: 'object', itemObjectType: 'character', unique: true, defaultValue: '[]', scope: 'chat', showInTracker: true,
        behaviors: { prompted: false, increment: false },
    }],
    ['canon_weather', {
        label: 'Weather', description: 'The canonical weather.',
        type: 'array', itemType: 'enum', itemEnumValues: [...WEATHER_VALUES], unique: true, defaultValue: '[]', scope: 'chat', showInTracker: true,
        behaviors: { prompted: false, increment: false },
    }],
    ['canon_temperature', text('Temperature', 'The canonical temperature.')],
    ['canon_setting', text('Indoors / outdoors', 'Whether the scene is canonically indoors or outdoors.')],
    ['canon_time', text('Time', 'The canonical day and time of day.')],
    ['canon_scene', text('Scene', 'The canonical scene title.')],
    ['canon_summary', text('Scene summary', 'What is going on in the scene now, in a sentence.')],
    // The clock (src/calendar/clock.js). canon_datetime follows the chat's
    // setting calendar: State Engine reads it through the calendar the
    // setting names, so each setting's chats show their own dates.
    ['canon_datetime', {
        label: 'Date and time', description: 'The canonical moment, on the setting\'s calendar.',
        type: 'datetime', calendar: '@setting', unit: 'seconds', datetimeMode: 'full', timeSemanticMode: 'none', deltaSource: '',
        defaultValue: 0, scope: 'chat', showInTracker: true, behaviors: { prompted: false, increment: false },
    }],
    ['canon_date', text('Date', 'The canonical date, written out.')],
    ['canon_clock', text('Clock', 'The canonical time of day on the clock.')],
    ['canon_daypart', text('Part of day', 'dawn, morning, midday, afternoon, evening, night or late night.')],
    ['canon_season', text('Season', 'The season.')],
    ['canon_sky', text('Sky', 'Where the sun(s) and moon(s) are, as seen from the scene.')],
    ['canon_holiday', text('Holiday', 'A holiday that is on today or coming soon.')],
    // What is in the scene, beyond the location and cast.
    ['canon_items', objects('Items present', 'Items here or carried by someone present.', 'item')],
    ['canon_creatures', objects('Creatures present', 'Creatures here.', 'creature')],
    ['canon_quests', objects('Active quests', 'The quests being pursued, most important first.', 'quest')],
    ['canon_lore', objects('Relevant lore', 'Lore tied to this place or these people, or just mentioned.', 'lore')],
    ['canon_events', {
        label: 'Events', description: 'Holidays and happenings on today or coming soon.',
        type: 'array', itemType: 'string', unique: true, defaultValue: '[]', scope: 'chat', showInTracker: true,
        behaviors: { prompted: false, increment: false },
    }],
]);

// Flags worked out by State Engine from the canonical values, for displays
// and conditions (Pretty Panels atmosphere, conditional world info) - the
// same kind Scene Context offers, so Scene Context can be switched off.
const flag = (label, expression, dependencies) => ({
    label, description: '', type: 'calculated', expression, dependencies, defaultValue: 0,
    scope: 'chat', showInTracker: false, behaviors: { prompted: false, increment: false },
});
const W = 'sb__canon_weather';
const has = (value) => `${W}.contains("${value}")`;
export const CALCULATED_VARIABLES = Object.freeze([
    ['is_raining', flag('Is raining', has('Rainy'), [W])],
    ['is_drizzle', flag('Is drizzling', has('Drizzle'), [W])],
    ['is_snowy', flag('Is snowing', has('Snowy'), [W])],
    ['is_stormy', flag('Is stormy', `${has('Stormy')} || ${has('Thunderstorm')}`, [W])],
    ['is_hailing', flag('Is hailing', has('Hailing'), [W])],
    ['is_foggy', flag('Is foggy', has('Foggy'), [W])],
    ['is_windy', flag('Is windy', has('Windy'), [W])],
    ['is_dry', flag('Is dry', has('Dry'), [W])],
    ['is_hazy', flag('Is hazy', has('Hazy'), [W])],
    ['is_burning', flag('Is scorching', 'sb__canon_temperature == "Scorching"', ['sb__canon_temperature'])],
    ['is_freezing', flag('Is freezing', 'sb__canon_temperature == "Freezing"', ['sb__canon_temperature'])],
    ['is_night', flag('Is night', 'sb__canon_daypart == "night" || sb__canon_daypart == "late night"', ['sb__canon_daypart'])],
    ['is_dawn', flag('Is dawn', 'sb__canon_daypart == "dawn"', ['sb__canon_daypart'])],
    ['is_evening', flag('Is evening', 'sb__canon_daypart == "evening"', ['sb__canon_daypart'])],
    ['is_indoors', flag('Is indoors', 'sb__canon_setting == "indoors"', ['sb__canon_setting'])],
    ['has_holiday', flag('Holiday today', 'sb__canon_holiday != ""', ['sb__canon_holiday'])],
]);

export const OUTPUT_VARIABLES = Object.freeze([
    ['guidance', text('Narrative guidance', 'Guidance for the next reply: where and when the scene is, who is here and what they want, and corrections to keep the story consistent with its world. Not asked of the model.', { showInTracker: false })],
    // The same guidance in six parts (src/guidance/build.js GUIDANCE_PARTS).
    ['guidance_setting', text('Guidance: setting', 'The story\'s setting - premise, tone, how magic and technology work. Not asked of the model.', { showInTracker: false })],
    ['guidance_rules', text('Guidance: world rules', 'What the world does not have - never broken. Not asked of the model.', { showInTracker: false })],
    ['guidance_threads', text('Guidance: threads', 'The quests and threads being followed. Not asked of the model.', { showInTracker: false })],
    ['guidance_scene', text('Guidance: scene', 'The scene now - where and when, what is here, lore and corrections. Not asked of the model.', { showInTracker: false })],
    ['guidance_summary', text('Guidance: summary', 'The game master\'s summary of where things stand. Not asked of the model.', { showInTracker: false })],
    ['guidance_direction', text('Guidance: direction', 'The game master\'s direction for this reply. Not asked of the model.', { showInTracker: false })],
    ['cast', text('Characters present', 'Who is in the scene, one line each, the player character marked - its own block so it can be placed above the guidance. Not asked of the model.', { showInTracker: false })],
    ['state_block', text('Canonical scene state', 'The current scene\'s canonical state - location, time, weather and who is present - one line each. Not asked of the model.', { showInTracker: false })],
]);

// Calculated variables last: their dependencies must exist first.
export const ALL_VARIABLES = Object.freeze([...OBSERVED_VARIABLES, ...QUEST_VARIABLES, ...CANONICAL_VARIABLES, ...OUTPUT_VARIABLES, ...CALCULATED_VARIABLES]);

export const OBSERVED_NAMES = Object.freeze(OBSERVED_VARIABLES.map(([name]) => name));
export const CANONICAL_NAMES = Object.freeze(CANONICAL_VARIABLES.map(([name]) => name));

// State Engine's own Scene Context preset (namespace se) - never touched,
// only looked at for the "not needed" hint (SB-205).
export const SCENE_CONTEXT = Object.freeze({ namespace: 'se', name: 'Scene Context' });
