// Thin wrappers around the State Engine Notification API: one shared
// surface for actionable messages (a button in the chat UI and a panel).
// No additional logic belongs in this file.

import { getStateEngine } from './state-engine.js';
import { EXTENSION_ID } from '../constants.js';

// Functions are not persisted - register again on every load.
export async function registerNotificationCallback(callbackId, fn) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.registerNotificationCallback(EXTENSION_ID, instanceId, callbackId, fn);
}

// notification: { message, severity?, callbackId?, id? } - the same id
// replaces instead of stacking.
export async function notify(notification) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.notify(EXTENSION_ID, instanceId, notification);
}

export async function clearNotification(id) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.clearNotification(EXTENSION_ID, instanceId, id);
}
