// Follows the chat (spec section 10): validation after State Engine's
// extraction, the canonical state pushed into the scene variables and the
// guidance rebuilt before each generation, and reverts when a message is
// swiped, edited or deleted.
//
//   VARIABLES_CHANGED (debounced)  -> validate -> rebuild guidance  (SB-502)
//   GENERATION_STARTED             -> validate -> push canonical -> rebuild (SB-213, SB-306)
//   MESSAGE_SWIPED / EDITED / DELETED -> revert what that message caused (SB-224)
//   CHAT_CHANGED                   -> drop pending work, bind the setting, rebuild (SB-501)
//
// Nothing here waits on an LLM: State Engine's data is local, so the
// generation hook only costs milliseconds (SB-801).

import { LOG_PREFIX } from '../constants.js';
import { isActive } from '../settings.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { VARIABLES_CHANGED_EVENT } from '../api/variables.js';
import { getPresetStatus } from '../preset/scenario-preset.js';
import { ensureBoundSetting } from '../library/library.js';
import { reconcileOpenChat, pushCanonicalToObserved, revertFromMessage } from '../validate/reconcile.js';
import { syncNow } from '../guidance/sync.js';

const VALIDATE_DEBOUNCE_MS = 1000;
let timer = null;

function scheduleValidation(chatId) {
    const ref = getCurrentChatRef();
    if (!ref || (chatId !== null && chatId !== undefined && chatId !== ref.chatId)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
        await reconcileOpenChat();
        await syncNow();
    }, VALIDATE_DEBOUNCE_MS);
}

async function beforeGeneration(type, _options, dryRun) {
    if (dryRun || type === 'quiet' || !isActive()) return;
    const ref = getCurrentChatRef();
    if (!ref) return;
    try {
        clearTimeout(timer);
        if (!(await getPresetStatus(ref.chatId)).active) return;
        await reconcileOpenChat();
        await pushCanonicalToObserved(ref.chatId, chatKeyFor(ref));
        await syncNow();
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not prepare the guidance before generation', err);
    }
}

async function onChatChanged() {
    clearTimeout(timer);
    const ref = getCurrentChatRef();
    if (!ref) return;
    // The setting is State Engine's to choose (SB-600): only when the
    // scenario is in use here does State Engine ask, once.
    try {
        if ((await getPresetStatus(ref.chatId)).active) await ensureBoundSetting(ref.chatId);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not bind the chat\'s setting', err);
    }
    await syncNow();
}

const safely = (fn) => (...args) => void Promise.resolve(fn(...args)).catch((err) => console.warn(LOG_PREFIX, err));

export function startLifecycle() {
    const { eventSource, eventTypes } = SillyTavern.getContext();
    eventSource.on(VARIABLES_CHANGED_EVENT, (chatId) => { if (isActive()) scheduleValidation(chatId); });
    if (eventTypes.GENERATION_STARTED) eventSource.on(eventTypes.GENERATION_STARTED, beforeGeneration);
    if (eventTypes.MESSAGE_SWIPED) eventSource.on(eventTypes.MESSAGE_SWIPED, safely((index) => revertFromMessage(Number(index))));
    if (eventTypes.MESSAGE_EDITED) eventSource.on(eventTypes.MESSAGE_EDITED, safely((index) => revertFromMessage(Number(index))));
    // The payload is the chat's length after the deletion.
    if (eventTypes.MESSAGE_DELETED) eventSource.on(eventTypes.MESSAGE_DELETED, safely((length) => revertFromMessage(Number(length))));
    eventSource.on(eventTypes.CHAT_CHANGED, safely(onChatChanged));
}
