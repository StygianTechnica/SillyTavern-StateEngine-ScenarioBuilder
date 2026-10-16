// Scenario Builder's public, read-only API for other extensions (spec
// 11.5). Reach it either way:
//   - window.StateEngineScenarioBuilder, set once Scenario Builder has
//     initialized (also the signal that it is installed and ready);
//   - an ES module import of this file.
//
//   getLibrary(type?)       -> Promise<entry[]>  the open chat's setting library
//   getEntry(id)            -> Promise<entry | null>
//   getCurrentScene()       -> canonical state of the open chat | null
//   getLocationPath(id)     -> Promise<string[]> names, root first
//   getPerspective(id)      -> null (knowledge boundaries: a later phase)
//   getDrift()              -> { pending, candidates, recent } | null
//   getGuidance()           -> { text, tokens, stateBlock, inert, reason }
//   SCENARIO_CHANGED_EVENT  SillyTavern event, payload chatKey
//   DRIFT_CHANGED_EVENT     SillyTavern event, payload chatKey
//
// Every returned object is a copy. See docs/api.md.

import { getCurrentChatRef, chatKeyFor } from './store/chat-ref.js';
import { getChatDoc, SCENARIO_CHANGED_EVENT } from './store/chat-store.js';
import { getObjectTypes, getBoundSettingId, listEntries, getEntry as libraryEntry, getLocationPathNames } from './library/library.js';
import { DRIFT_CHANGED_EVENT } from './validate/reconcile.js';
import { getLastBuild } from './guidance/sync.js';

const open = () => {
    const ref = getCurrentChatRef();
    return ref ? { chatId: ref.chatId, chatKey: chatKeyFor(ref) } : null;
};

export async function getLibrary(type = null) {
    const chat = open();
    if (!chat) return [];
    const settingId = await getBoundSettingId(chat.chatId);
    const types = type ? [type] : (await getObjectTypes()).map((t) => t.id);
    const out = [];
    for (const t of types) out.push(...await listEntries(chat.chatId, settingId, t));
    return structuredClone(out);
}

export async function getEntry(id) {
    const chat = open();
    if (!chat) return null;
    return structuredClone(await libraryEntry(chat.chatId, await getBoundSettingId(chat.chatId), id));
}

export function getCurrentScene() {
    const chat = open();
    return chat ? getChatDoc(chat.chatKey).canonical : null;
}

export async function getLocationPath(id) {
    const chat = open();
    if (!chat) return [];
    return getLocationPathNames(chat.chatId, await getBoundSettingId(chat.chatId), id);
}

// Knowledge boundaries are phase 0.5 (spec 9.4).
export function getPerspective() {
    return null;
}

export function getDrift() {
    const chat = open();
    if (!chat) return null;
    const doc = getChatDoc(chat.chatKey);
    return {
        pending: doc.drift.filter((d) => d.status === 'pending'),
        candidates: doc.candidates,
        recent: doc.drift.filter((d) => d.status === 'resolved').slice(-20),
    };
}

export function getGuidance() {
    const build = getLastBuild();
    return { text: build.guidance.text, tokens: build.guidance.tokens, stateBlock: build.stateBlock, inert: build.inert, reason: build.reason };
}

export { SCENARIO_CHANGED_EVENT, DRIFT_CHANGED_EVENT };

export const scenarioBuilderApi = Object.freeze({
    getLibrary, getEntry, getCurrentScene, getLocationPath, getPerspective, getDrift, getGuidance,
    SCENARIO_CHANGED_EVENT, DRIFT_CHANGED_EVENT,
});

export function exposeScenarioBuilderApi() {
    window.StateEngineScenarioBuilder = scenarioBuilderApi;
}
