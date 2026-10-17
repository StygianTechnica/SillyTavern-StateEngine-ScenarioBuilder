// Quests (spec 9.5) - the runner.
//
//   runQuestSync()   Archivist's compiled story threads -> quest objects
//                    (SB-430, SB-439b/c): a quest seed, goal, plan or hook not
//                    yet linked becomes a quest (a State Engine chat object),
//                    with its objectives from the plan's steps, the people and
//                    places involved linked, and the thread remembered; a
//                    thread already linked keeps its quest's objectives in
//                    step. Quests the story started itself (State Engine
//                    created them from sb__quests) are taken in too. Runs on
//                    its own after Archivist compiles (when automatic creation
//                    is on), and on demand ("Scan for quests").
//   questBoard()     every quest with its effective status, priority,
//                    progress and current objective (src/quests/model.js).
//   writeActiveQuests()  the active quests into sb__quests before a reply,
//                    so State Engine tracks their runtime status (SB-432).
//   setupQuestTracking()  adds "progress" and "current objective" runtime
//                    fields to the setting's quests - only when the user asks
//                    (SB-102).
//
// Nothing is written to Archivist (SB-005).

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { getEntryMeta } from '../store/setting-store.js';
import { newLocalId } from '../store/schema.js';
import { getObject, getObjectRuntimeFields, setObjectRuntimeFields } from '../api/objects.js';
import { getVariableValues, setVariableValue } from '../api/variables.js';
import { listEntries, createEntry, updateEntry, setEntryMeta, mayAddGeneratedDetail, readField, deleteEntry } from '../library/library.js';
import { PRESET_NAME } from '../preset/blueprint.js';
import { enqueueEnrichment } from '../generate/enrich.js';
import {
    isQuestThread, statusFromThread, typeFromThread, objectivesFromThread, mergeObjectives, effectiveStatus,
    questProgress, currentObjective, questPriority, sortQuests, normalizeQuestMeta,
} from './model.js';

export const QUESTS_EVENT = 'scenario_builder_quests';

function announce() {
    try {
        SillyTavern.getContext().eventSource.emit(QUESTS_EVENT);
    } catch {
        // No event bus.
    }
}

const lower = (s) => String(s ?? '').trim().toLowerCase();

// Archivist's compiled story threads for the open chat, or [].
async function archivistThreads() {
    try {
        const view = await window.StateEngineArchivist?.getCompiledMemory?.();
        return Array.isArray(view?.threads) ? view.threads : [];
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read Archivist\'s story threads', err);
        return [];
    }
}

export function hasArchivistThreads() {
    return typeof window.StateEngineArchivist?.getCompiledMemory === 'function';
}

export function questMeta(settingId, id) {
    return normalizeQuestMeta(getEntryMeta(settingId, id).quest);
}

export function setQuestMeta(settingId, id, patch) {
    setEntryMeta(settingId, id, { quest: { ...questMeta(settingId, id), ...patch } });
    announce();
}

let running = false;

// One pass. `scan`: the user asked (creates quests even when automatic
// creation is off, and includes finished threads not yet turned into quests
// so the history is complete). -> { created, linked, updated, taken } or null.
export async function runQuestSync(chatId, chatKey, settingId, { scan = false } = {}) {
    if (running || !chatId || !settingId) return null;
    running = true;
    const out = { created: 0, linked: 0, updated: 0, taken: 0 };
    try {
        const settings = getSettings();
        const create = scan || settings.quests.autoCreate === true;
        const threads = (await archivistThreads()).filter(isQuestThread);
        let quests = await listEntries(chatId, settingId, 'quest');
        const doc = getChatDoc(chatKey);
        const links = { ...doc.questLinks };
        const adopted = [];
        // Removed quests stay removed: their threads are dismissed, and a
        // quest whose name was rejected is never made or taken in again.
        const dismissed = new Set(doc.questsDismissed);
        const rejectedName = (name) => doc.rejected.some((r) => r.type === 'quest' && lower(r.name) === lower(name));

        for (const thread of threads) {
            if (dismissed.has(thread.id)) continue;
            let qid = links[thread.id];
            if (qid && !quests.some((q) => q.id === qid)) {
                // The quest made from this thread was deleted: the thread is
                // dismissed rather than made into a quest again.
                dismissed.add(thread.id);
                delete links[thread.id];
                continue;
            }
            if (!qid && thread.entity?.type === 'quest' && quests.some((q) => q.id === thread.entity.id)) qid = thread.entity.id;
            if (!qid) qid = quests.find((q) => [q.name, ...(q.aliases ?? [])].some((n) => lower(n) === lower(thread.title)))?.id ?? null;

            if (qid) {
                const meta = questMeta(settingId, qid);
                const objectives = mergeObjectives(meta.objectives, objectivesFromThread(thread));
                const changed = JSON.stringify(objectives) !== JSON.stringify(meta.objectives) || meta.threadId !== thread.id;
                if (changed) {
                    setEntryMeta(settingId, qid, { quest: { ...meta, threadId: thread.id, type: meta.type || typeFromThread(thread), objectives } });
                    await mirrorObjectives(chatId, settingId, qid, objectives);
                    out.updated += 1;
                }
                if (links[thread.id] !== qid) { links[thread.id] = qid; out.linked += 1; }
                continue;
            }
            if (!create || rejectedName(thread.title)) continue;
            const finished = thread.status === 'resolved' || thread.status === 'abandoned';
            if (finished && !scan) continue;

            const objectives = objectivesFromThread(thread);
            const involved = (thread.involved ?? []).map((e) => e?.id).filter(Boolean);
            const created = await createEntry(chatId, settingId, 'quest', {
                name: thread.title || 'Untitled quest',
                description: thread.text || '',
                objectives: objectives.map((o) => o.text),
                related_entity_ids: involved,
                startValues: { status: statusFromThread(thread.status) === 'Abandoned' ? 'Failed' : statusFromThread(thread.status) },
            }, {
                origin: 'story',
                quest: { type: typeFromThread(thread), priority: 'medium', status: statusFromThread(thread.status) === 'Abandoned' ? 'Abandoned' : '', objectives, completion: '', abandon: '', threadId: thread.id },
            });
            if (!created) continue;
            links[thread.id] = created.id;
            quests = [...quests, created];
            out.created += 1;
            adopted.push({ id: newLocalId('a'), objectId: created.id, type: 'quest', name: created.name, at: new Date().toISOString(), placedUnder: '', enrich: 'off', error: '' });
        }

        // Quests the story started itself (State Engine created them from
        // sb__quests): taken in once. The first pass only records what exists.
        const seen = doc.questsSeen;
        const fresh = seen ? quests.filter((q) => !seen.includes(q.id) && !Object.values(links).includes(q.id) && !getEntryMeta(settingId, q.id).origin) : [];
        // A quest the story starts again under a rejected name is removed.
        for (const q of fresh.filter((x) => rejectedName(x.name))) {
            await deleteEntry(chatId, settingId, q.id);
            quests = quests.filter((x) => x.id !== q.id);
        }
        for (const q of fresh.filter((x) => !rejectedName(x.name))) {
            setEntryMeta(settingId, q.id, { origin: 'story' });
            adopted.push({ id: newLocalId('a'), objectId: q.id, type: 'quest', name: q.name, at: new Date().toISOString(), placedUnder: '', enrich: 'off', error: '' });
            out.taken += 1;
        }

        updateChatDoc(chatKey, (d) => {
            d.questLinks = links;
            d.questsDismissed = [...dismissed];
            d.questsSeen = quests.map((q) => q.id);
            const known = new Set(d.adopted.map((a) => a.objectId));
            d.adopted = [...d.adopted, ...adopted.filter((a) => !known.has(a.objectId))];
        });

        // New quests get fleshed out like any new entry (SB-431, SB-133b).
        if (settings.generation.autoEnrich) {
            for (const a of adopted) {
                if (!mayAddGeneratedDetail(settingId, a.objectId)) continue;
                updateChatDoc(chatKey, (d) => { const item = d.adopted.find((x) => x.id === a.id); if (item) item.enrich = 'queued'; });
                enqueueEnrichment({ settingId, chatId, chatKey, objectId: a.objectId, name: a.name, adoptedId: a.id });
            }
        }
        if (out.created || out.linked || out.updated || out.taken) announce();
        return out;
    } catch (err) {
        console.warn(LOG_PREFIX, 'quest sync failed', err);
        return null;
    } finally {
        running = false;
    }
}

// The quest object's own objectives field mirrors the texts.
async function mirrorObjectives(chatId, settingId, id, objectives) {
    try {
        const obj = await getObject(chatId, id);
        const texts = objectives.map((o) => o.text);
        const current = obj?.base?.objectives ?? obj?.objectives;
        if (JSON.stringify(current ?? []) !== JSON.stringify(texts)) await updateEntry(chatId, settingId, id, { objectives: texts });
    } catch (err) {
        console.debug(LOG_PREFIX, 'could not mirror objectives', err);
    }
}

// Every quest of the chat, ready for the board and the guidance.
// -> [{ id, name, description, type, status, from, conflict, override,
//       priority: { score, level, reasons }, basePriority, progress,
//       current, objectives, thread, runtime: { progress, current } }]
export async function questBoard(chatId, chatKey, settingId) {
    const quests = await listEntries(chatId, settingId, 'quest');
    const threads = hasArchivistThreads() ? await archivistThreads() : [];
    const byThread = new Map(threads.map((t) => [t.id, t]));
    const doc = getChatDoc(chatKey);
    const present = doc.canonical.castIds;
    const out = [];
    for (const q of quests) {
        const meta = questMeta(settingId, q.id);
        const thread = meta.threadId ? byThread.get(meta.threadId) ?? null : null;
        const runtime = (await readField(chatId, q.id, 'se__quest.status', 'status')) || q.runtime?.values?.status || '';
        const state = effectiveStatus({ override: meta.status, runtime, thread });
        const objectives = meta.objectives.length ? meta.objectives : (q.base?.objectives ?? q.objectives ?? []).map((t) => ({ text: String(t), status: 'pending' }));
        const involved = [...new Set([...(q.related_entity_ids ?? []), ...(thread?.involved ?? []).map((e) => e?.id).filter(Boolean)])];
        out.push({
            id: q.id,
            name: q.name,
            description: q.description ?? '',
            type: meta.type || 'side',
            status: state.status,
            from: state.from,
            conflict: state.conflict,
            override: meta.status,
            basePriority: meta.priority,
            priority: questPriority({ base: meta.priority, type: meta.type || 'side', status: state.status, involved, present, locationId: doc.canonical.locationId }),
            progress: questProgress(objectives),
            current: currentObjective(objectives),
            objectives,
            thread,
            involved,
            completion: meta.completion,
            abandon: meta.abandon,
            runtime: {
                progress: await readField(chatId, q.id, null, 'progress'),
                current: await readField(chatId, q.id, null, 'current_objective'),
            },
        });
    }
    return sortQuests(out);
}

// The active quests, most important first, at most `tracked`.
export async function activeQuests(chatId, chatKey, settingId) {
    const limit = getSettings().quests.tracked ?? 5;
    return (await questBoard(chatId, chatKey, settingId)).filter((q) => q.status === 'Active').slice(0, limit);
}

// Holds the active quests in sb__quests before a reply (SB-213, SB-432).
// Never throws.
export async function writeActiveQuests(chatId, chatKey, settingId) {
    try {
        const ids = (await activeQuests(chatId, chatKey, settingId)).map((q) => q.id);
        const current = (await getVariableValues(chatId, ['quests'])).quests ?? [];
        if (JSON.stringify([...current].sort()) !== JSON.stringify([...ids].sort())) await setVariableValue(chatId, PRESET_NAME, 'quests', ids);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not write the active quests', err);
    }
}

const TRACKING_FIELDS = Object.freeze([
    { name: 'progress', type: 'string', prompted: true, description: 'How far the quest has come in the story so far - what has been achieved and what is still left (short).' },
    { name: 'current_objective', type: 'string', prompted: true, description: 'What the characters are working on for this quest right now (short).' },
]);

// Whether the setting's quests have the tracking fields.
export async function hasQuestTracking(settingId) {
    const fields = await getObjectRuntimeFields(settingId, 'quest');
    return TRACKING_FIELDS.every((t) => fields.some((f) => f.name === t.name));
}

// Adds the tracking fields to the setting's quests (the user's request).
export async function setupQuestTracking(settingId) {
    const fields = await getObjectRuntimeFields(settingId, 'quest');
    const missing = TRACKING_FIELDS.filter((t) => !fields.some((f) => f.name === t.name));
    if (!missing.length) return true;
    const result = await setObjectRuntimeFields(settingId, 'quest', [...fields, ...missing]);
    announce();
    return !!result;
}
