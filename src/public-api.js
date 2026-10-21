// Scenario Builder's public API for other extensions (spec 11.5) - read-
// only, except for the ACTIONS: things the user can do from another
// extension's panel (Pretty Panels' Action Buttons), each the same as doing
// it in Scenario Builder. Reach it either way:
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
//   getRelationships(id)    -> Promise<[{ otherId, otherName, kind, note, direction }]>
//                              the relationships the user wrote for an entry (both ways)
//   getActions()            -> [{ id, label, icon, scope, description }] what a
//                              button can do: scope 'object' acts on one object
//                              (a card's), 'panel' needs none
//   runAction(id, objectId?) -> Promise<{ ok, message }>
//   openEntry(id)           -> Promise<boolean> the entry's page in Scenario Builder
//   SCENARIO_CHANGED_EVENT  SillyTavern event, payload chatKey
//   DRIFT_CHANGED_EVENT     SillyTavern event, payload chatKey
//
// Every returned object is a copy. See docs/api.md.

import { LOG_PREFIX } from './constants.js';
import { getCurrentChatRef, chatKeyFor } from './store/chat-ref.js';
import { getChatDoc, SCENARIO_CHANGED_EVENT } from './store/chat-store.js';
import { getObjectTypes, getBoundSettingId, listEntries, getEntry as libraryEntry, getLocationPathNames } from './library/library.js';
import { DRIFT_CHANGED_EVENT } from './validate/reconcile.js';
import { getLastBuild } from './guidance/sync.js';
import { listRelations, relationsFor } from './library/relations-edit.js';

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

// The relationships the user wrote in the library for entry `id`, seen from
// it (an "in" one reads as the other side would: "child of" for "parent
// of"). They take precedence over the story's (Archivist's) for the pair.
export async function getRelationships(id) {
    const chat = open();
    if (!chat || !id) return [];
    const settingId = await getBoundSettingId(chat.chatId);
    if (!settingId) return [];
    const items = relationsFor(id, listRelations(settingId));
    const out = [];
    for (const item of items) {
        const other = await libraryEntry(chat.chatId, settingId, item.otherId);
        out.push({ otherId: item.otherId, otherName: other?.name ?? '', kind: item.kind, note: item.rel.note ?? '', direction: item.direction });
    }
    return out;
}

// ---- actions

const ACTIONS = Object.freeze([
    { id: 'open', label: 'Open in Scenario Builder', icon: 'book-atlas', scope: 'object', description: 'Opens its page in Scenario Builder' },
    { id: 'leave', label: 'Leave the scene', icon: 'person-walking-arrow-right', scope: 'object', description: 'Takes them out of the scene, as if they walked off' },
    { id: 'map', label: 'Open the map', icon: 'map', scope: 'panel', description: 'Opens the map of the world\'s places' },
    { id: 'workspace', label: 'Open Scenario Builder', icon: 'book-atlas', scope: 'panel', description: 'Opens Scenario Builder where it was left' },
]);

export function getActions() {
    return structuredClone(ACTIONS);
}

// The UI loads on demand: the read-only calls never pull it in.
const ui = () => Promise.all([import('./ui/workspace.js'), import('./ui/ws.js'), import('./ui/catalog.js')]);

export async function openEntry(id) {
    const chat = open();
    if (!chat || !id) return false;
    const entry = await getEntry(id);
    if (!entry) return false;
    const [{ openWorkspace }, { openSheet }] = await ui();
    await openWorkspace({ tab: 'catalog' });
    openSheet(id, entry.type);
    return true;
}

export async function runAction(id, objectId = null) {
    try {
        if (id === 'open') return (await openEntry(objectId)) ? { ok: true, message: '' } : { ok: false, message: 'That is not in this chat\'s world.' };
        if (id === 'leave') {
            const { leaveScene } = await import('./state/scene-actions.js');
            return leaveScene(objectId, (await getEntry(objectId))?.name ?? '');
        }
        if (id === 'map' || id === 'workspace') {
            if (!open()) return { ok: false, message: 'Open a chat first.' };
            const [{ openWorkspace }, , { openLocationMap }] = await ui();
            await openWorkspace();
            if (id === 'map') openLocationMap();
            return { ok: true, message: '' };
        }
        return { ok: false, message: `Scenario Builder has no action "${id}".` };
    } catch (err) {
        console.warn(LOG_PREFIX, 'action failed', id, err);
        return { ok: false, message: err?.message ?? String(err) };
    }
}

export { SCENARIO_CHANGED_EVENT, DRIFT_CHANGED_EVENT };

export const scenarioBuilderApi = Object.freeze({
    getLibrary, getEntry, getCurrentScene, getLocationPath, getPerspective, getDrift, getGuidance, getRelationships,
    getActions, runAction, openEntry,
    SCENARIO_CHANGED_EVENT, DRIFT_CHANGED_EVENT,
});

export function exposeScenarioBuilderApi() {
    window.StateEngineScenarioBuilder = scenarioBuilderApi;
}
