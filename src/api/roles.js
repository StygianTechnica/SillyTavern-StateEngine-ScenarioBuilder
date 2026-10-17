// Thin wrappers around State Engine's Role API. No additional logic belongs
// in this file - see the State Engine API Reference, "Role API".

import { getStateEngine } from './state-engine.js';
import { EXTENSION_ID } from '../constants.js';

// Every role as seen from a chat: [{ id, publicName, type, exists, variable, valid, problem, ... }].
export async function listRoles(chatId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.listRoles?.(EXTENSION_ID, instanceId, chatId) ?? [];
}

// Assigns a fully-qualified variable to a role in a chat (null clears it).
export async function assignRole(chatId, roleId, variableName) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.assignRole(EXTENSION_ID, instanceId, chatId, roleId, variableName);
}
