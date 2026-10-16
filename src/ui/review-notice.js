// Scenario Builder's notifications on State Engine's shared notification
// surface (a button in the chat UI and a panel):
//
//   review    "N new entries in the setting to look at" (and any open
//             questions) - its button opens the workspace's Review tab.
//             Confirming new objects stays State Engine's own review; this
//             only covers what Scenario Builder did with them afterwards.
//   inactive  "The narrative guidance is empty: Scenario State is not active
//             in this chat" - shown when the chat's setting has a library
//             (so the user is using Scenario Builder here) but the preset is
//             off; its button activates the preset. Scenario Builder never
//             activates it on its own (SB-203) - the click is the user's.
//
// Each is one notification, replaced as it changes and cleared when it no
// longer applies.

import { LOG_PREFIX } from '../constants.js';
import { isActive } from '../settings.js';
import { getCurrentChatKey, getCurrentChatRef } from '../store/chat-ref.js';
import { getChatDoc, SCENARIO_CHANGED_EVENT } from '../store/chat-store.js';
import { getSettingDoc } from '../store/setting-store.js';
import { DRIFT_CHANGED_EVENT } from '../validate/reconcile.js';
import { getPresetStatus, PRESET_STATUS_EVENT } from '../preset/scenario-preset.js';
import { activateForOpenChat } from './activate.js';
import { getBoundSettingId } from '../library/library.js';
import { registerNotificationCallback, notify, clearNotification } from '../api/notifications.js';
import { openWorkspace } from './workspace.js';
import { noticeText } from './status-model.js';

const REVIEW_ID = 'review';
const INACTIVE_ID = 'inactive';
const shown = { [REVIEW_ID]: null, [INACTIVE_ID]: null };

async function show(id, text, callbackId) {
    if (text === shown[id]) return;
    shown[id] = text;
    if (text) await notify({ id, message: text, severity: id === INACTIVE_ID ? 'warning' : 'info', callbackId });
    else await clearNotification(id);
}

// Whether the user is using Scenario Builder with this chat's setting.
function settingInUse(settingId) {
    if (!settingId) return false;
    const doc = getSettingDoc(settingId);
    return !!doc.overview.premise?.trim() || Object.keys(doc.entries).length > 0 || doc.tracked.length > 0;
}

async function update() {
    try {
        const key = getCurrentChatKey();
        await show(REVIEW_ID, key ? noticeText(getChatDoc(key)) : '', 'openReview');

        const ref = getCurrentChatRef();
        let inactive = '';
        if (ref && isActive()) {
            const status = await getPresetStatus(ref.chatId);
            if (!status.active && settingInUse(await getBoundSettingId(ref.chatId))) {
                inactive = 'Scenario Builder: the narrative guidance is empty because the Scenario State preset is not active in this chat. Click to activate it.';
            }
        }
        await show(INACTIVE_ID, inactive, 'activatePreset');
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not update the notifications', err);
    }
}

export async function startReviewNotice() {
    await registerNotificationCallback('openReview', () => openWorkspace({ tab: 'review' }));
    await registerNotificationCallback('activatePreset', () => activateForOpenChat());
    const { eventSource, eventTypes } = SillyTavern.getContext();
    let timer = null;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => void update(), 800); };
    for (const event of [SCENARIO_CHANGED_EVENT, DRIFT_CHANGED_EVENT, PRESET_STATUS_EVENT, eventTypes.CHAT_CHANGED]) eventSource.on(event, later);
    // Activation can also happen in State Engine's own manager.
    eventSource.on('state_engine_variables_changed', later);
    later();
}
