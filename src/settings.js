// Scenario Builder's persisted settings, kept in SillyTavern's own
// extension_settings under the "scenarioBuilder" key so they are saved
// with the rest of the user's settings.
//
// Two kinds of document also live here, each with its own single write
// entry point (spec SB-014) - never written from anywhere else:
//   settings.library[settingId]  library organisation per State Engine
//                                setting (src/store/setting-store.js)
//   settings.chats[chatKey]      per-chat state: canonical values, drift,
//                                candidates, history (src/store/chat-store.js)
// The objects themselves live in State Engine (spec SB-010/011); nothing
// here duplicates their data. No chat metadata is used (spec SB-012).

import { DEFAULT_POLICIES } from './validate/drift.js';
import { DEFAULT_SECTIONS } from './guidance/build.js';
import { DEFAULT_IMAGE_OPTIONS } from './images/prompt.js';

const SETTINGS_KEY = 'scenarioBuilder';

const DEFAULTS = {
    // The drawer's "Enable Scenario Builder" switch. Off: outputs are empty,
    // listeners idle, stored data stays (spec SB-503).
    enabled: true,
    // "Pause": the same as off for the outputs, without leaving the
    // validation queue (a quick toggle while the user steers by hand).
    paused: false,
    // Token budget for sb__guidance (spec SB-305), estimated as chars/4.
    // Generous: the guidance is meant to replace world-info entries.
    tokenBudget: 2000,
    // Which guidance sections are built (spec 9.2), { [key]: boolean }.
    sections: { ...DEFAULT_SECTIONS },
    // Whether sb__state_block is written (spec SB-301).
    stateBlockEnabled: true,
    // Resolution policy per validated field: 'canonical' | 'observed' |
    // 'ask' (spec SB-222; defaults are OPEN-2 and documented in
    // src/validate/drift.js).
    policies: { ...DEFAULT_POLICIES },
    // How many AI replies a correction line stays in the guidance.
    correctionTurns: 2,
    // SillyTavern Connection Profile for content generation (src/generate/;
    // '' = the active connection).
    connectionProfileId: '',
    // Generation: detail level ('brief' | 'standard' | 'rich', SB-133b) and
    // answer size.
    // autoEnrich: objects newly confirmed into the setting get their empty
    // fields written in the background (SB-133b; canon switches permitting).
    generation: { detail: 'standard', maxTokens: 1200, autoEnrich: true },
    // Which version of the Scenario State preset blueprint is installed
    // (src/preset/blueprint.js, PRESET_VERSION). null = none yet.
    presetVersion: null,
    // Image prompt options (src/images/prompt.js): provider, style,
    // Midjourney parameters. The user's last choices.
    imagePrompts: structuredClone(DEFAULT_IMAGE_OPTIONS),
    // Catalog browser preferences: view per chapter ('grid' | 'list' |
    // 'tree'), sort order.
    catalog: { views: {}, sort: 'name' },
    // Quests (src/quests/): make quest objects from Archivist's quest seeds,
    // goals and plans automatically; how many active quests are tracked.
    quests: { autoCreate: true, tracked: 5 },
    // The director (src/director/): a game master's briefing written before
    // each reply. timeout: seconds the reply waits for it (the last note is
    // used when it is late); allowCreate: it may add the rooms, people and
    // items the scene needs to the library (never in a canon-only setting).
    director: { enabled: true, timeout: 45, allowCreate: true, maxTokens: 700 },
    // The clock (src/calendar/clock.js): on = Scenario Builder keeps the
    // time and weather; perTurn = how much time a reply covers when the
    // director does not say.
    time: { enabled: true, perTurn: '5 minutes' },
    // Settings migrations already applied.
    migrated: [],
    // { [settingId]: library document } - src/store/setting-store.js.
    library: {},
    // { [chatKey]: chat document } - src/store/chat-store.js.
    chats: {},
};

// Returns the live settings object, creating it (and filling in any
// missing defaults) on first use.
export function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[SETTINGS_KEY] || typeof extensionSettings[SETTINGS_KEY] !== 'object') {
        extensionSettings[SETTINGS_KEY] = {};
    }
    const settings = extensionSettings[SETTINGS_KEY];
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (settings[key] === undefined) settings[key] = structuredClone(value);
    }
    // New sections/policies added by an update get their defaults.
    for (const [key, value] of Object.entries(DEFAULT_SECTIONS)) settings.sections[key] ??= value;
    for (const [key, value] of Object.entries(DEFAULTS.director)) settings.director[key] ??= value;
    for (const [key, value] of Object.entries(DEFAULTS.time)) settings.time[key] ??= value;
    // The old 600-token default was far too small for a narrative briefing.
    if (!settings.migrated.includes('budget-2000')) {
        if (settings.tokenBudget === 600) settings.tokenBudget = DEFAULTS.tokenBudget;
        settings.migrated.push('budget-2000');
    }
    for (const [key, value] of Object.entries(DEFAULT_POLICIES)) settings.policies[key] ??= value;
    for (const [key, value] of Object.entries(DEFAULT_IMAGE_OPTIONS)) settings.imagePrompts[key] ??= structuredClone(value);
    for (const [key, value] of Object.entries(DEFAULT_IMAGE_OPTIONS.midjourney)) settings.imagePrompts.midjourney[key] ??= value;
    settings.catalog.views ??= {};
    settings.generation.detail ??= 'standard';
    settings.generation.maxTokens ??= 1200;
    settings.generation.autoEnrich ??= true;
    settings.quests ??= { autoCreate: true, tracked: 5 };
    settings.quests.autoCreate ??= true;
    settings.quests.tracked ??= 5;
    return settings;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

// Whether the outputs should be written at all right now.
export function isActive() {
    const settings = getSettings();
    return settings.enabled === true && settings.paused !== true;
}
