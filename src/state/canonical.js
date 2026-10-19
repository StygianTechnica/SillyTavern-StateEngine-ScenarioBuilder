// Canonical state (spec 7.2): what Scenario Builder holds as true for a
// chat - location, cast, weather, temperature, indoors, time, scene.
// setCanonical() is the ONE entry point for changing it (SB-014): every
// change, by the user or by validation, goes through here and is recorded
// in the chat's history with what it was before, so it can be undone
// (SB-226, SB-703).
//
// Writing the canonical values into State Engine variables (and the
// guidance) is src/guidance/sync.js's job; it follows the chat document's
// change event.

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { normalizeCanonical, newLocalId, HISTORY_LIMIT } from '../store/schema.js';
import { markObjectPresent, markObjectAbsent, getObject } from '../api/objects.js';
import { missingPatch, idsToCheck } from './missing.js';

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Characters' presence is State Engine's per-chat fact; it follows the
// canonical cast. Never throws.
async function followPresence(chatId, beforeIds, afterIds) {
    if (!chatId) return;
    const before = new Set(beforeIds ?? []);
    const after = new Set(afterIds ?? []);
    try {
        for (const id of after) if (!before.has(id)) await markObjectPresent(chatId, id);
        for (const id of before) if (!after.has(id)) await markObjectAbsent(chatId, id);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not update who is present', err);
    }
}

// Applies `patch` (canonical keys) to a chat's canonical state. `info`:
// { source: 'user' | 'validation' | 'review' | 'revert', note, sourceMessage,
//   chatId }. Mutating more of the chat document in the same save is
// possible with `info.alsoMutate(doc)`. Returns the history entry, or null
// when nothing changed.
export function setCanonical(chatKey, patch, info = {}) {
    let entry = null;
    let castChange = null;
    updateChatDoc(chatKey, (doc) => {
        const next = normalizeCanonical({ ...doc.canonical, ...patch });
        const before = {};
        const after = {};
        for (const key of Object.keys(patch)) {
            if (!(key in next) || sameValue(doc.canonical[key], next[key])) continue;
            before[key] = doc.canonical[key];
            after[key] = next[key];
        }
        info.alsoMutate?.(doc);
        if (!Object.keys(after).length) return;
        if ('castIds' in after) castChange = [before.castIds, after.castIds];
        doc.canonical = next;
        // In play (SB-124): every location and character that has been part
        // of the canonical scene in this chat (and every creature).
        const inPlay = new Set(doc.inPlay);
        if (next.locationId) inPlay.add(next.locationId);
        for (const id of [...next.castIds, ...next.creatureIds]) inPlay.add(id);
        doc.inPlay = [...inPlay];
        entry = {
            id: newLocalId('h'),
            at: new Date().toISOString(),
            source: info.source ?? 'user',
            note: info.note ?? '',
            sourceMessage: info.sourceMessage ?? '',
            before,
            after,
            undone: false,
        };
        doc.history = [...doc.history, entry].slice(-HISTORY_LIMIT);
    });
    if (castChange) void followPresence(info.chatId, castChange[0], castChange[1]);
    return entry;
}

// Undoes one history entry: the keys it changed go back to their `before`
// values (recorded as a new 'revert' entry). Returns that entry or null.
export function undoHistoryEntry(chatKey, entryId, chatId = null) {
    const doc = getChatDoc(chatKey);
    const entry = doc.history.find((h) => h.id === entryId);
    if (!entry || entry.undone) return null;
    return setCanonical(chatKey, entry.before, {
        source: 'revert',
        note: `Undo: ${entry.note || 'change'}`,
        chatId,
        alsoMutate: (d) => {
            const h = d.history.find((x) => x.id === entryId);
            if (h) h.undone = true;
        },
    });
}

export function getCanonical(chatKey) {
    return getChatDoc(chatKey).canonical;
}

// The scene pointing at objects that no longer exist (deleted outside
// Scenario Builder - State Engine's review rejects a detected place by
// deleting it): the location falls back to the last place in the history
// that still exists (else none), and people and creatures who are gone are
// taken out. Never throws.
export async function healMissing(chatId, chatKey) {
    try {
        if (!chatId || !chatKey) return null;
        const doc = getChatDoc(chatKey);
        const found = new Map();
        for (const id of idsToCheck(doc.canonical, doc.history)) {
            try {
                found.set(id, await getObject(chatId, id));
            } catch {
                // Unknown: treated as still there - never drop on a failed read.
                found.set(id, { id });
            }
        }
        const { patch, gone } = missingPatch(doc.canonical, doc.history, (id) => !!found.get(id));
        if (!Object.keys(patch).length) return null;
        const back = patch.locationId ? found.get(patch.locationId)?.name : '';
        const notes = [
            gone.locationId ? `The place the scene was at no longer exists${back ? `; back at ${back}` : ''}` : '',
            gone.castIds.length + gone.creatureIds.length === 1 ? 'Someone who no longer exists left the scene' : '',
            gone.castIds.length + gone.creatureIds.length > 1 ? `${gone.castIds.length + gone.creatureIds.length} who no longer exist left the scene` : '',
        ].filter(Boolean);
        return setCanonical(chatKey, patch, { source: 'review', chatId, note: notes.join('; ') });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not check the scene for missing objects', err);
        return null;
    }
}
