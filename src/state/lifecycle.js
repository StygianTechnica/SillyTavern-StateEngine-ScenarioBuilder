// Follows the chat (spec section 10): validation after State Engine's
// extraction, the canonical state pushed into the scene variables and the
// guidance rebuilt before each generation, and reverts when a message is
// swiped, edited or deleted.
//
//   VARIABLES_CHANGED (debounced)  -> validate -> rebuild guidance  (SB-502)
//   GENERATION_STARTED             -> validate -> push canonical -> director -> rebuild (SB-213, SB-306);
//                                     for a send, all of it waits for USER_MESSAGE_RENDERED so the
//                                     message is taken first
//   MESSAGE_SWIPED / EDITED / DELETED -> revert what that message caused (SB-224)
//   CHAT_CHANGED                   -> drop pending work, bind the setting, rebuild (SB-501)
//   GENERATION_ENDED               -> the GM planner keeps pace and runs due passes (src/planner/)
//   (after validation and on a chat change, newly confirmed objects are
//   taken into the library and enriched - src/library/intake.js)
//
// Only the director waits on a model before a reply (bounded by its
// timeout, settings.director.timeout); everything else is local, so the
// rest of the generation hook costs milliseconds (SB-801).

import { LOG_PREFIX } from '../constants.js';
import { isActive, getSettings } from '../settings.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { VARIABLES_CHANGED_EVENT } from '../api/variables.js';
import { getPresetStatus } from '../preset/scenario-preset.js';
import { ensureBoundSetting, getBoundSettingId } from '../library/library.js';
import { runIntake } from '../library/intake.js';
import { runLoreSync } from '../library/lore-sync.js';
import { runQuestSync, writeActiveQuests } from '../quests/sync.js';
import { checkQuestEnds, fillMissingEnds } from '../quests/ends.js';
import { reconcileOpenChat, pushCanonicalToObserved, revertFromMessage } from '../validate/reconcile.js';
import { syncNow } from '../guidance/sync.js';
import { directBeforeReply, addNamedPeople } from '../director/run.js';
import { ensureClock, advanceBy, setTime, perTurnDefault, followStoryTimeOfDay } from '../calendar/clock.js';
import { getChatDoc } from '../store/chat-store.js';
import { healMissing } from './canonical.js';
import { fillRoles } from '../preset/role-fill.js';
import { setReplying } from '../generate/llm.js';
import { syncFactions } from '../library/faction-sync.js';
import { LIBRARY_CHANGED_EVENT } from '../store/setting-store.js';
import { afterReply } from '../planner/run.js';

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
    await runLoreSync(ref.chatId, chatKeyFor(ref), settingId);
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
        // The scene never points at something deleted meanwhile.
        await healMissing(ref.chatId, chatKeyFor(ref));
        await intakeOpenChat();
        await syncNow();
    }, VALIDATE_DEBOUNCE_MS);
}

// A send with text in the input box: the work waits until SillyTavern has
// posted the message (USER_MESSAGE_RENDERED, which it also waits on before
// building the prompt), so the input is taken at once and the wait comes
// after it. { chatId, type } or null.
let awaitingMessage = null;

function pendingInput() {
    const text = String(document.getElementById('send_textarea')?.value ?? '').trim();
    return text && !text.startsWith('/') ? text : '';
}

async function beforeGeneration(type, _options, dryRun) {
    awaitingMessage = null;
    if (dryRun || type === 'quiet') return;
    // Background generation waits until this reply is written.
    setReplying(true);
    if (!isActive()) return;
    const ref = getCurrentChatRef();
    if (!ref) return;
    clearTimeout(timer);
    if ((!type || type === 'normal') && pendingInput() && SillyTavern.getContext().eventTypes.USER_MESSAGE_RENDERED) {
        awaitingMessage = { chatId: ref.chatId, type: type || 'normal' };
        return;
    }
    await prepareReply(ref, type);
}

async function onUserMessageRendered() {
    const waiting = awaitingMessage;
    awaitingMessage = null;
    const ref = getCurrentChatRef();
    if (!waiting || !ref || ref.chatId !== waiting.chatId) return;
    await prepareReply(ref, waiting.type);
}

// Everything before a reply: validation, the canonical state pushed into the
// scene variables, the active quests, the clock, the director's briefing and
// the guidance rebuilt. Never throws.
async function prepareReply(ref, type) {
    try {
        if (!(await getPresetStatus(ref.chatId)).active) return;
        await reconcileOpenChat();
        await healMissing(ref.chatId, chatKeyFor(ref));
        await pushCanonicalToObserved(ref.chatId, chatKeyFor(ref));
        const chatKey = chatKeyFor(ref);
        const settingId = await getBoundSettingId(ref.chatId);
        await writeActiveQuests(ref.chatId, chatKey, settingId);
        // Memberships set in the library show in the characters' runtime factions.
        await syncFactions(ref.chatId, chatKey, settingId);
        const settings = getSettings();
        const newTurn = !type || type === 'normal';
        if (settings.time.enabled && settingId) await ensureClock(ref.chatId, chatKey, settingId);
        // A time skip the player narrates ("It was morning at last", "he was
        // unconscious until well after daybreak") moves the clock before the
        // reply, so the game master and the narrator start from it.
        if (settings.time.enabled && settingId && newTurn) {
            const chat = SillyTavern.getContext().chat ?? [];
            const userText = [...chat].reverse().find((m) => m?.is_user && typeof m.mes === 'string')?.mes ?? '';
            if (userText) await followStoryTimeOfDay(ref.chatId, chatKey, settingId, userText);
        }
        // The game master thinks before the reply (src/director/): the one
        // step here that waits on a model, bounded by its timeout. It also
        // moves the clock on by what the reply will cover.
        if (type !== 'impersonate') await directBeforeReply(ref.chatId, chatKey, type);
        if (settings.time.enabled && settingId) {
            // Without the director, each new reply covers the per-turn default.
            if (newTurn && !settings.director.enabled) await advanceBy(ref.chatId, chatKey, settingId, perTurnDefault(), { planned: true, note: 'A reply\'s worth of time' });
            // The weather and sky for where the scene is now.
            const now = getChatDoc(chatKey).canonical.time;
            if (Number.isFinite(now)) await setTime(ref.chatId, chatKey, settingId, now, { note: 'The scene moved' });
        }
        // What the director and the clock just set (scene title, cast,
        // weather) is what the story's next reading starts from.
        await pushCanonicalToObserved(ref.chatId, chatKey);
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
    let active = false;
    try {
        active = (await getPresetStatus(ref.chatId)).active;
        if (active) await ensureBoundSetting(ref.chatId);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not bind the chat\'s setting', err);
    }
    await intakeOpenChat();
    if (active) await healMissing(ref.chatId, chatKeyFor(ref));
    await syncNow();
    // Displays bound to familiar roles show the canonical state here.
    if (active) await fillRoles(ref.chatId);
    if (active) await syncFactions(ref.chatId, chatKeyFor(ref), await getBoundSettingId(ref.chatId));
}

// Quests after a reply: one the reply ended (its own end condition met) is
// marked so, and one made without a way to end gets one - in the
// background, through the generation queue (src/quests/ends.js).
let lastQuestCheck = '';
async function followQuestEnds(chatId, chatKey) {
    try {
        const chat = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system);
        const last = chat[chat.length - 1];
        if (!last || last.is_user || typeof last.mes !== 'string') return;
        const stamp = `${chatKey}|${chat.length}|${last.mes.length}`;
        if (stamp === lastQuestCheck) return;
        lastQuestCheck = stamp;
        const settingId = await getBoundSettingId(chatId);
        if (!settingId) return;
        const userText = [...chat].reverse().find((m) => m.is_user)?.mes ?? '';
        if ((await checkQuestEnds(chatId, chatKey, settingId, { reply: last.mes, userText })).length) {
            await writeActiveQuests(chatId, chatKey, settingId);
            await syncNow();
        }
        await fillMissingEnds(chatId, chatKey, settingId);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not follow the quest endings', err);
    }
}

const safely = (fn) => (...args) => void Promise.resolve(fn(...args)).catch((err) => console.warn(LOG_PREFIX, err));

export function startLifecycle() {
    const { eventSource, eventTypes } = SillyTavern.getContext();
    eventSource.on(VARIABLES_CHANGED_EVENT, (chatId) => { if (isActive()) scheduleValidation(chatId); });
    if (eventTypes.GENERATION_STARTED) eventSource.on(eventTypes.GENERATION_STARTED, beforeGeneration);
    if (eventTypes.USER_MESSAGE_RENDERED) eventSource.on(eventTypes.USER_MESSAGE_RENDERED, onUserMessageRendered);
    // A membership edited in the library reaches the open chat's characters.
    let factionTimer = null;
    eventSource.on(LIBRARY_CHANGED_EVENT, () => {
        clearTimeout(factionTimer);
        factionTimer = setTimeout(() => {
            const ref = getCurrentChatRef();
            if (!ref || !isActive()) return;
            void getBoundSettingId(ref.chatId).then((settingId) => syncFactions(ref.chatId, chatKeyFor(ref), settingId));
        }, 1500);
    });
    for (const key of ['GENERATION_ENDED', 'GENERATION_STOPPED']) {
        if (eventTypes[key]) eventSource.on(eventTypes[key], () => setReplying(false));
    }
    // The GM planner follows each finished reply in the background (src/planner/).
    if (eventTypes.GENERATION_ENDED) {
        eventSource.on(eventTypes.GENERATION_ENDED, () => {
            const ref = getCurrentChatRef();
            if (ref && isActive()) void afterReply(ref.chatId, chatKeyFor(ref));
            if (ref && isActive()) void followQuestEnds(ref.chatId, chatKeyFor(ref));
            // People the story just named become characters (src/director/people.js).
            if (ref && isActive()) void addNamedPeople(ref.chatId, chatKeyFor(ref));
        });
    }
    if (eventTypes.MESSAGE_SWIPED) eventSource.on(eventTypes.MESSAGE_SWIPED, safely((index) => revertFromMessage(Number(index))));
    if (eventTypes.MESSAGE_EDITED) eventSource.on(eventTypes.MESSAGE_EDITED, safely((index) => revertFromMessage(Number(index))));
    // The payload is the chat's length after the deletion.
    if (eventTypes.MESSAGE_DELETED) eventSource.on(eventTypes.MESSAGE_DELETED, safely((length) => revertFromMessage(Number(length))));
    eventSource.on(eventTypes.CHAT_CHANGED, safely(onChatChanged));
}
