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
export const PRESET_VERSION = 2;

const text = (label, description, extra = {}) => ({
    label, description, type: 'string', defaultValue: '', scope: 'chat', showInTracker: true,
    behaviors: { prompted: false, increment: false }, ...extra,
});
const prompted = (instructions) => ({ behaviors: { prompted: true, increment: false }, prompted: { instructions } });

export const OBSERVED_VARIABLES = Object.freeze([
    ['scene_title', text('Scene title', 'A short title for the current situation, as the story tells it.', prompted(
        'A short scene title summarizing the current situation, from the recent messages and the current value. Keep the current value unless the situation has clearly moved on.',
    ))],
    ['scene_summary', text('Scene summary', 'What is happening in the scene now, as the story tells it.', prompted(
        'Summarize the current scene from the last few messages only - the situation and environment now, not the whole story.',
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
]);

export const OUTPUT_VARIABLES = Object.freeze([
    ['guidance', text('Narrative guidance', 'Guidance for the next reply: where and when the scene is, who is here and what they want, and corrections to keep the story consistent with its world. Not asked of the model.', { showInTracker: false })],
    ['state_block', text('Canonical scene state', 'The current scene\'s canonical state - location, time, weather and who is present - one line each. Not asked of the model.', { showInTracker: false })],
]);

export const ALL_VARIABLES = Object.freeze([...OBSERVED_VARIABLES, ...QUEST_VARIABLES, ...CANONICAL_VARIABLES, ...OUTPUT_VARIABLES]);

export const OBSERVED_NAMES = Object.freeze(OBSERVED_VARIABLES.map(([name]) => name));
export const CANONICAL_NAMES = Object.freeze(CANONICAL_VARIABLES.map(([name]) => name));

// State Engine's own Scene Context preset (namespace se) - never touched,
// only looked at for the "not needed" hint (SB-205).
export const SCENE_CONTEXT = Object.freeze({ namespace: 'se', name: 'Scene Context' });
