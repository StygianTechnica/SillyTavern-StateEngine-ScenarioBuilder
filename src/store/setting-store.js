// The setting-level library document (src/store/schema.js), one per State
// Engine setting, kept in Scenario Builder's own extension settings keyed by
// setting id (spec SB-601, OPEN-6: State Engine's setting record has no
// room for extension data today). updateSettingDoc() is the ONLY way it is
// written (spec SB-014).

import { getSettings, saveSettings } from '../settings.js';
import { normalizeSettingDoc, normalizeEntryMeta } from './schema.js';

export const LIBRARY_CHANGED_EVENT = 'scenario_builder_library_changed';

function emit(settingId) {
    try {
        SillyTavern.getContext().eventSource.emit(LIBRARY_CHANGED_EVENT, settingId);
    } catch {
        // No event bus (tests) - nothing listens then.
    }
}

// A copy of the setting's document (an empty one when it has none yet).
export function getSettingDoc(settingId) {
    return structuredClone(normalizeSettingDoc(getSettings().library[settingId]));
}

// One entry's metadata (defaults when it has none).
export function getEntryMeta(settingId, objectId) {
    return normalizeEntryMeta(getSettings().library[settingId]?.entries?.[objectId]);
}

// Runs `mutate(doc)` on the setting's document, normalizes and saves it.
// Returns the saved copy.
export function updateSettingDoc(settingId, mutate) {
    if (!settingId) throw new Error('no setting');
    const settings = getSettings();
    const doc = normalizeSettingDoc(settings.library[settingId]);
    mutate(doc);
    settings.library[settingId] = normalizeSettingDoc(doc);
    saveSettings();
    emit(settingId);
    return structuredClone(settings.library[settingId]);
}

// Forgets a setting's document (the setting itself was deleted).
export function deleteSettingDoc(settingId) {
    const settings = getSettings();
    if (!settings.library[settingId]) return false;
    delete settings.library[settingId];
    saveSettings();
    emit(settingId);
    return true;
}

// Drops documents of settings State Engine no longer has (spec SB-601:
// cleaned up when the setting is deleted). `existingIds` from listSettings.
export function pruneSettingDocs(existingIds) {
    const settings = getSettings();
    const keep = new Set(existingIds);
    let removed = 0;
    for (const id of Object.keys(settings.library)) {
        if (!keep.has(id)) {
            delete settings.library[id];
            removed++;
        }
    }
    if (removed) saveSettings();
    return removed;
}
