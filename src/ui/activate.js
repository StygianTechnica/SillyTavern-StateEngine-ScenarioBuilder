// Activates the Scenario State preset for the open chat - always the user's
// click (a notification, the Preview banner, the drawer); Scenario Builder
// never activates it on its own (SB-203).

import { LOG_PREFIX } from '../constants.js';
import { getCurrentChatRef } from '../store/chat-ref.js';
import { setScenarioPresetActive } from '../preset/scenario-preset.js';
import { toast } from './dom.js';

export async function activateForOpenChat() {
    const ref = getCurrentChatRef();
    if (!ref) return false;
    try {
        const status = await setScenarioPresetActive(ref.chatId, true);
        if (status.active) toast('success', 'Scenario State is active in this chat - the narrative guidance will be written from now on.');
        return status.active;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not activate the preset', err);
        toast('error', `Could not activate Scenario State: ${err?.message ?? err}`);
        return false;
    }
}
