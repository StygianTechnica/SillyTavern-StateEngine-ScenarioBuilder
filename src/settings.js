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
    tokenBudget: 600,
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
    for (const [key, value] of Object.entries(DEFAULT_POLICIES)) settings.policies[key] ??= value;
    for (const [key, value] of Object.entries(DEFAULT_IMAGE_OPTIONS)) settings.imagePrompts[key] ??= structuredClone(value);
    for (const [key, value] of Object.entries(DEFAULT_IMAGE_OPTIONS.midjourney)) settings.imagePrompts.midjourney[key] ??= value;
    settings.catalog.views ??= {};
    settings.generation.detail ??= 'standard';
    settings.generation.maxTokens ??= 1200;
    settings.generation.autoEnrich ??= true;
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
