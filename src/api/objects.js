// Thin wrappers around the State Engine Object API (State Engine API
// Reference, "Object API"). Every library entry IS a State Engine object
// (spec SB-011): create, edit and delete go through here, never through a
// store of Scenario Builder's own. No additional logic belongs in this
// file.

import { getStateEngine } from './state-engine.js';
import { EXTENSION_ID } from '../constants.js';

// The type registry: [{ id, label, plural, noun, scope, idPrefix, color,
// icon, hasPresence, fields, runtime, fieldRoles }]. No identity needed.
export async function listObjectTypes() {
    const { stateEngine } = await getStateEngine();
    return stateEngine.listObjectTypes();
}

// ---- settings (worlds)

export async function listSettings() {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.listSettings(EXTENSION_ID, instanceId) ?? [];
}

// patch: { name?, autoConfirm?, calendarId? } -> the setting summary, or null.
export async function updateSetting(settingId, patch) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.updateSetting(EXTENSION_ID, instanceId, settingId, patch) ?? null;
}

export async function getSetting(settingId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.getSetting(EXTENSION_ID, instanceId, settingId) ?? null;
}

export async function getChatSetting(chatId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.getChatSetting(EXTENSION_ID, instanceId, chatId) ?? null;
}

// Asks the user (State Engine's own question) when the chat has none.
export async function ensureChatSetting(chatId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return await stateEngine.ensureChatSetting(EXTENSION_ID, instanceId, chatId) ?? null;
}

export async function setChatSetting(chatId, settingId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.setChatSetting(EXTENSION_ID, instanceId, chatId, settingId) ?? null;
}

// ---- objects

// A chat's objects of `type` (its own, then its setting's), or [].
export async function listObjects(chatId, type, options = {}) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.listObjects(EXTENSION_ID, instanceId, chatId, type, options) ?? [];
}

export async function getObject(chatId, id, settingId = null) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.getObject(EXTENSION_ID, instanceId, chatId, id, settingId) ?? null;
}

// A canonical, confirmed world object in a setting.
export async function createObject(settingId, type, data) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.createObject(EXTENSION_ID, instanceId, settingId, type, data) ?? null;
}

// A chat object - how story types (quest, scene, event) are created.
export async function createChatObject(chatId, type, name, data = {}) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.createChatObject(EXTENSION_ID, instanceId, chatId, type, name, null, data) ?? null;
}

export async function updateObject(chatId, id, patch, options = {}) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.updateObject(EXTENSION_ID, instanceId, chatId, id, patch, options) ?? null;
}

export async function deleteObject(chatId, id, options = {}) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.deleteObject(EXTENSION_ID, instanceId, chatId, id, options) === true;
}

export async function confirmObject(chatId, id) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.confirmObject(EXTENSION_ID, instanceId, chatId, id) ?? null;
}

// A detection that is really `targetId`: merged into it, then confirmed.
export async function resolveObject(chatId, sourceId, targetId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.resolveObject(EXTENSION_ID, instanceId, chatId, sourceId, targetId) ?? null;
}

export async function markObjectPresent(chatId, id) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.markObjectPresent(EXTENSION_ID, instanceId, chatId, id) ?? null;
}

export async function markObjectAbsent(chatId, id) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.markObjectAbsent(EXTENSION_ID, instanceId, chatId, id) ?? null;
}

// ---- fields

// The setting's object preset for a type: variable definitions, baseline
// (scope 'global') first, then runtime (scope 'chat').
export async function getObjectFields(settingId, type) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.getObjectFields(EXTENSION_ID, instanceId, settingId, type) ?? [];
}

// A setting's runtime (per-chat) fields for a type, as State Engine's
// runtime-field view: [{ name, type, prompted, description, values?, builtIn }].
export async function getObjectRuntimeFields(settingId, type) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.getObjectRuntimeFields(EXTENSION_ID, instanceId, settingId, type) ?? [];
}

// Replaces them (built-ins are kept by State Engine). Only on the user's
// request (SB-102: Scenario Builder never adds fields on its own).
export async function setObjectRuntimeFields(settingId, type, fields) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.setObjectRuntimeFields(EXTENSION_ID, instanceId, settingId, type, fields) ?? null;
}

// A field's value by field name or role id ("se__character.mood"), so user
// renames do not break reading (spec SB-441). undefined when unknown.
export async function getObjectField(chatId, id, fieldOrRole) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.getObjectField(EXTENSION_ID, instanceId, chatId, id, fieldOrRole);
}
