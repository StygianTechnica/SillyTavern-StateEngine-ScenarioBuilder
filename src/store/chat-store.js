// The per-chat document (src/store/schema.js), keyed by chat key
// (src/store/chat-ref.js) in Scenario Builder's own extension settings
// (spec SB-012, SB-603). updateChatDoc() is the ONLY way it is written
// (spec SB-014); a copy is always handed out, so nothing outside can
// change stored state by accident.

import { getSettings, saveSettings } from '../settings.js';
import { normalizeChatDoc } from './schema.js';
import { isStaleTab } from '../ui/tab-guard.js';

export const SCENARIO_CHANGED_EVENT = 'scenario_builder_scenario_changed';

function emit(chatKey) {
    try {
        SillyTavern.getContext().eventSource.emit(SCENARIO_CHANGED_EVENT, chatKey);
    } catch {
        // No event bus (tests).
    }
}

export function getChatDoc(chatKey) {
    return structuredClone(normalizeChatDoc(getSettings().chats[chatKey]));
}

// The chat keys of every stored chat document.
export function listChatKeys() {
    return Object.keys(getSettings().chats ?? {});
}

export function hasChatDoc(chatKey) {
    return !!getSettings().chats[chatKey];
}

// Runs `mutate(doc)` on the chat's document, normalizes and saves it.
// Returns the saved copy.
export function updateChatDoc(chatKey, mutate) {
    if (!chatKey) throw new Error('no chat');
    const settings = getSettings();
    // A newer tab has taken over: this one's copy is out of date, and a save
    // here would set the newer tab's work back.
    if (isStaleTab()) return structuredClone(normalizeChatDoc(settings.chats[chatKey]));
    const doc = normalizeChatDoc(settings.chats[chatKey]);
    mutate(doc);
    settings.chats[chatKey] = normalizeChatDoc(doc);
    saveSettings();
    emit(chatKey);
    return structuredClone(settings.chats[chatKey]);
}
