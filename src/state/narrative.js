// The "current description" of an object in one chat: what the story has
// made of it (a forest after the fire, a character after the scar). It
// stands in for the object's base description - in the sheet and in the
// guidance - for this chat only; the base description in the setting is
// never changed (values belong to the chat, structure to the setting:
// SB-013). setNarrative() is its one entry point (SB-014); the previous
// text is kept so a change can be taken back.

import { getChatDoc, updateChatDoc } from '../store/chat-store.js';

// The object's current description in this chat, or ''.
export function getNarrative(chatKey, objectId) {
    return getChatDoc(chatKey).narrative[objectId]?.text ?? '';
}

// Sets (or, with '', clears) the current description.
export function setNarrative(chatKey, objectId, text) {
    const clean = String(text ?? '').trim();
    updateChatDoc(chatKey, (doc) => {
        const before = doc.narrative[objectId]?.text ?? '';
        if (before === clean) return;
        if (!clean) {
            delete doc.narrative[objectId];
            return;
        }
        doc.narrative[objectId] = { text: clean, updatedAt: new Date().toISOString(), previous: before };
    });
}

// Puts back the text before the last change ('' clears it).
export function revertNarrative(chatKey, objectId) {
    const previous = getChatDoc(chatKey).narrative[objectId]?.previous ?? '';
    updateChatDoc(chatKey, (doc) => {
        if (!doc.narrative[objectId]) return;
        if (previous) doc.narrative[objectId] = { text: previous, updatedAt: new Date().toISOString(), previous: '' };
        else delete doc.narrative[objectId];
    });
}
