// A change to the canonical scene made by the user - from the sheet, or
// from a button on another extension's panel (src/public-api.js). The
// story variables and the guidance follow at once; a move or a change of
// who is here holds over the story's reading for a few replies, and the
// game master's briefing is written again for the new scene.

import { getChatDoc } from '../store/chat-store.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { setCanonical } from './canonical.js';
import { pushCanonicalToObserved, holdUserScene } from '../validate/reconcile.js';
import { syncNow } from '../guidance/sync.js';
import { getSettings } from '../settings.js';
import { runDirector } from '../director/run.js';

export async function changeScene(chatId, chatKey, patch, note) {
    const before = structuredClone(getChatDoc(chatKey).canonical);
    setCanonical(chatKey, patch, { source: 'user', note, chatId });
    const after = getChatDoc(chatKey).canonical;
    const sceneChanged = before.locationId !== after.locationId || JSON.stringify(before.castIds) !== JSON.stringify(after.castIds) || JSON.stringify(before.creatureIds) !== JSON.stringify(after.creatureIds);
    if (sceneChanged) await holdUserScene(chatId, chatKey, before);
    await pushCanonicalToObserved(chatId, chatKey);
    await syncNow();
    if (sceneChanged && getSettings().director.enabled) {
        void runDirector(chatId, chatKey, { type: 'continue', force: true }).then(() => syncNow());
    }
}

// Someone (or a kind of creature) leaves the open chat's scene, as a
// LEAVES from the game master would take them out. -> { ok, message }
export async function leaveScene(objectId, name = '') {
    const ref = getCurrentChatRef();
    if (!ref || !objectId) return { ok: false, message: 'No chat is open.' };
    const chatKey = chatKeyFor(ref);
    const { castIds, creatureIds } = getChatDoc(chatKey).canonical;
    const who = name || 'They';
    if (castIds.includes(objectId)) {
        await changeScene(ref.chatId, chatKey, { castIds: castIds.filter((id) => id !== objectId) }, `${who} left the scene`);
        return { ok: true, message: `${who} left the scene.` };
    }
    if (creatureIds.includes(objectId)) {
        await changeScene(ref.chatId, chatKey, { creatureIds: creatureIds.filter((id) => id !== objectId) }, `${who} left the scene`);
        return { ok: true, message: `${who} left the scene.` };
    }
    return { ok: false, message: `${who} ${name ? 'is' : 'are'} not in the scene.` };
}
