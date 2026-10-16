// Scenario Builder's notification on State Engine's shared notification
// surface: "N new entries in the setting to look at" (and any open
// questions), with a button that opens the workspace's Review tab. One
// notification, replaced as the count changes and cleared when Review is
// empty. Confirming new objects stays State Engine's own review - this only
// covers what Scenario Builder did with them afterwards.

import { LOG_PREFIX } from '../constants.js';
import { getCurrentChatKey } from '../store/chat-ref.js';
import { getChatDoc, SCENARIO_CHANGED_EVENT } from '../store/chat-store.js';
import { DRIFT_CHANGED_EVENT } from '../validate/reconcile.js';
import { registerNotificationCallback, notify, clearNotification } from '../api/notifications.js';
import { openWorkspace } from './workspace.js';
import { noticeText } from './status-model.js';

const NOTICE_ID = 'review';
const CALLBACK_ID = 'openReview';
let lastMessage = null;

async function update() {
    try {
        const key = getCurrentChatKey();
        const text = key ? noticeText(getChatDoc(key)) : '';
        if (text === lastMessage) return;
        lastMessage = text;
        if (text) await notify({ id: NOTICE_ID, message: text, severity: 'info', callbackId: CALLBACK_ID });
        else await clearNotification(NOTICE_ID);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not update the review notification', err);
    }
}

export async function startReviewNotice() {
    await registerNotificationCallback(CALLBACK_ID, () => openWorkspace({ tab: 'review' }));
    const { eventSource, eventTypes } = SillyTavern.getContext();
    let timer = null;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => void update(), 800); };
    for (const event of [SCENARIO_CHANGED_EVENT, DRIFT_CHANGED_EVENT, eventTypes.CHAT_CHANGED]) eventSource.on(event, later);
    later();
}
