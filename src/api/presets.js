// Thin wrappers around the State Engine Preset API, always as Scenario
// Builder. Creating and updating presets is limited to Scenario Builder's
// own namespace; activating/deactivating works on any namespace's preset
// (State Engine API Reference, "Preset API"). No additional logic belongs
// in this file.

import { getStateEngine } from './state-engine.js';
import { EXTENSION_ID, NAMESPACE } from '../constants.js';

// The preset's definition in our namespace, or null if it does not exist.
export async function findPreset(name) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.listPresets(EXTENSION_ID, instanceId, NAMESPACE).find((preset) => preset.name === name) ?? null;
}

// `def: { name, description?, triggers?, showInTracker? }`. Returns the
// created preset or null.
export async function createPreset(def) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.createPreset(EXTENSION_ID, instanceId, { ...def, namespace: NAMESPACE });
}

export async function updatePreset(name, patch) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.updatePreset(EXTENSION_ID, instanceId, NAMESPACE, name, patch);
}

// Binds a preset (ours by default, any namespace allowed) to a chat.
export async function activatePreset(chatId, name, namespace = NAMESPACE) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.activatePreset(EXTENSION_ID, instanceId, chatId, namespace, name);
}

export async function deactivatePreset(chatId, name, namespace = NAMESPACE) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.deactivatePreset(EXTENSION_ID, instanceId, chatId, namespace, name);
}

// Every preset in every namespace, each with `active` for `chatId`
// (Variable Value API listAllVariables) - how Scenario Builder sees
// whether its own preset and State Engine's Scene Context are bound to a
// chat.
export async function listAllPresets(chatId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.listAllVariables(EXTENSION_ID, instanceId, chatId) ?? [];
}
