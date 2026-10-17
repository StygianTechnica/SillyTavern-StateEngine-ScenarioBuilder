// Keeps the Scenario State preset (src/preset/blueprint.js) in place and
// reports its status for a chat.
//
// - ensureScenarioPreset() creates the preset and any missing variable,
//   and updates existing variables once when PRESET_VERSION moves on
//   (SB-206) - otherwise leaving them alone.
// - Scenario Builder does NOT toggle the preset on its own (SB-200,
//   SB-203): State Engine owns activation. The drawer's shortcut
//   (SB-204) calls State Engine's activatePreset/deactivatePreset only when
//   the user clicks it.
// - Scene Context is looked at, never changed (SB-205).

import { LOG_PREFIX, NAMESPACE } from '../constants.js';
import { getSettings, saveSettings } from '../settings.js';
import { findPreset, createPreset, activatePreset, deactivatePreset, listAllPresets } from '../api/presets.js';
import { getVariable, createVariable, updateVariable } from '../api/variables.js';
import { PRESET_NAME, PRESET_DESCRIPTION, PRESET_VERSION, ALL_VARIABLES, SCENE_CONTEXT } from './blueprint.js';
import { fillRoles } from './role-fill.js';

export const PRESET_STATUS_EVENT = 'scenario_builder_preset_status';

// Creates/restores/migrates the preset. Throws if State Engine refuses.
export async function ensureScenarioPreset() {
    if (!await findPreset(PRESET_NAME)) {
        const created = await createPreset({ name: PRESET_NAME, description: PRESET_DESCRIPTION, triggers: ['ai'], showInTracker: true });
        if (!created) throw new Error(`could not create the ${PRESET_NAME} preset`);
    }
    const settings = getSettings();
    const migrate = settings.presetVersion !== PRESET_VERSION;
    for (const [name, def] of ALL_VARIABLES) {
        if (!await getVariable(PRESET_NAME, name)) {
            if (!await createVariable(PRESET_NAME, name, def)) throw new Error(`could not create the ${name} variable`);
        } else if (migrate && !await updateVariable(PRESET_NAME, name, def)) {
            throw new Error(`could not update the ${name} variable`);
        }
    }
    if (migrate) {
        settings.presetVersion = PRESET_VERSION;
        saveSettings();
    }
}

// { exists, active, sceneContextActive } for a chat. Never throws.
export async function getPresetStatus(chatId) {
    if (!chatId) return { exists: false, active: false, sceneContextActive: false };
    try {
        const presets = await listAllPresets(chatId);
        const ours = presets.find((p) => p.namespace === NAMESPACE && p.name === PRESET_NAME);
        const scene = presets.find((p) => p.namespace === SCENE_CONTEXT.namespace && p.name === SCENE_CONTEXT.name);
        return { exists: !!ours, active: ours?.active === true, sceneContextActive: scene?.active === true };
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read the preset status', err);
        return { exists: false, active: false, sceneContextActive: false };
    }
}

function announce(chatId) {
    try {
        SillyTavern.getContext().eventSource.emit(PRESET_STATUS_EVENT, chatId);
    } catch {
        // No event bus.
    }
}

// The drawer shortcut (SB-204): (de)activates the Scenario State preset for
// a chat through State Engine. Restores the preset first if it was deleted.
export async function setScenarioPresetActive(chatId, active) {
    if (active) {
        await ensureScenarioPreset();
        await activatePreset(chatId, PRESET_NAME);
        await fillRoles(chatId);
    } else {
        await deactivatePreset(chatId, PRESET_NAME);
    }
    announce(chatId);
    return getPresetStatus(chatId);
}
