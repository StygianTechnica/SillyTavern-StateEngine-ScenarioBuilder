// Follows the chat (spec section 10): validation after State Engine's
// extraction, the canonical state pushed into the scene variables and the
// guidance rebuilt before each generation, and reverts when a message is
// swiped, edited or deleted.
//
//   VARIABLES_CHANGED (debounced)  -> validate -> rebuild guidance  (SB-502)
//   GENERATION_STARTED             -> validate -> push canonical -> rebuild (SB-213, SB-306)
//   MESSAGE_SWIPED / EDITED / DELETED -> revert what that message caused (SB-224)
//   CHAT_CHANGED                   -> drop pending work, bind the setting, rebuild (SB-501)
//   (after validation and on a chat change, newly confirmed objects are
//   taken into the library and enriched - src/library/intake.js)
//
// Only the director waits on a model before a reply (bounded by its
// timeout, settings.director.timeout); everything else is local, so the
// rest of the generation hook costs milliseconds (SB-801).

import { LOG_PREFIX } from '../constants.js';
import { isActive } from '../settings.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { VARIABLES_CHANGED_EVENT } from '../api/variables.js';
import { getPresetStatus } from '../preset/scenario-preset.js';
import { ensureBoundSetting, getBoundSettingId } from '../library/library.js';
import { runIntake } from '../library/intake.js';
import { runQuestSync, writeActiveQuests } from '../quests/sync.js';
import { reconcileOpenChat, pushCanonicalToObserved, revertFromMessage } from '../validate/reconcile.js';
import { syncNow } from '../guidance/sync.js';
import { directBeforeReply } from '../director/run.js';

const VALIDATE_DEBOUNCE_MS = 1000;
let timer = null;

// Objects newly confirmed into the open chat's setting are taken in (and
// enriched) - src/library/intake.js. Never throws.
async function intakeOpenChat() {
    const ref = getCurrentChatRef();
    if (!ref || !isActive()) return;
    const settingId = await getBoundSettingId(ref.chatId);
    await runIntake(ref.chatId, chatKeyFor(ref), settingId);
    await runQuestSync(ref.chatId, chatKeyFor(ref), settingId);
    hookArchivist();
}

// When Archivist finishes a compile, its story threads may hold new quests.
let archivistHooked = false;
function hookArchivist() {
    const event = window.StateEngineArchivist?.COMPILED_CHANGED_EVENT;
    if (archivistHooked || !event) return;
    archivistHooked = true;
    SillyTavern.getContext().eventSource.on(event, () => void intakeOpenChat().then(() => syncNow()));
}

function scheduleValidation(chatId) {
    const ref = getCurrentChatRef();
    if (!ref || (chatId !== null && chatId !== undefined && chatId !== ref.chatId)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
        await reconcileOpenChat();
        await intakeOpenChat();
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
        await writeActiveQuests(ref.chatId, chatKeyFor(ref), await getBoundSettingId(ref.chatId));
        // The game master thinks before the reply (src/director/): the one
        // step here that waits on a model, bounded by its timeout.
        if (type !== 'impersonate') await directBeforeReply(ref.chatId, chatKeyFor(ref), type);
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
    await intakeOpenChat();
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
