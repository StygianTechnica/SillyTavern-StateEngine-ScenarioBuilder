// Automatic enrichment (spec SB-133b): objects newly confirmed into the
// setting (src/library/intake.js) get their EMPTY fields written in the
// background, from the setting's context, so they are fleshed out without
// the user asking. Rules:
//   - empty fields only, re-checked just before writing - never a field the
//     user (or an import) has filled (SB-128);
//   - never for a canon-only setting or a canon-locked entry
//     (library.mayAddGeneratedDetail);
//   - held while the user has that entry open for editing;
//   - one at a time, with a pause between, cancellable; a failure changes
//     nothing and is reported on the Review list;
//   - written fields are marked as generated (SB-136) and can be edited or
//     cleared at once.

import { LOG_PREFIX } from '../constants.js';
import { getObject } from '../api/objects.js';
import { updateChatDoc } from '../store/chat-store.js';
import { getEntryMeta } from '../store/setting-store.js';
import { getObjectType, getObjectTypes, listEntries, updateEntry, setEntryMeta, mayAddGeneratedDetail } from '../library/library.js';
import { baselineFields } from '../library/fields.js';
import { generateEntry } from './run.js';

export const ENRICH_EVENT = 'scenario_builder_enrichment';
const PAUSE_MS = 1500;

const queue = [];
let current = null;
let running = false;
let isBeingEdited = () => false;

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

function announce() {
    try {
        SillyTavern.getContext().eventSource.emit(ENRICH_EVENT, getEnrichmentStatus());
    } catch {
        // No event bus.
    }
}

// The UI tells the queue which entry is open for editing.
export function setEditingCheck(fn) {
    isBeingEdited = typeof fn === 'function' ? fn : () => false;
}

// -> { current: { objectId, name } | null, queued: n }
export function getEnrichmentStatus() {
    return { current: current ? { objectId: current.objectId, name: current.name } : null, queued: queue.length };
}

function setItem(job, enrich, error = '') {
    if (!job.chatKey || !job.adoptedId) return;
    updateChatDoc(job.chatKey, (d) => {
        const item = d.adopted.find((a) => a.id === job.adoptedId);
        if (item) { item.enrich = enrich; item.error = error; }
    });
}

// job: { settingId, chatId, chatKey, objectId, name, adoptedId? }
export function enqueueEnrichment(job) {
    if (queue.some((j) => j.objectId === job.objectId) || current?.objectId === job.objectId) return;
    queue.push(job);
    setItem(job, 'queued');
    announce();
    void drain();
}

export function cancelEnrichment() {
    for (const job of queue.splice(0)) setItem(job, 'off');
    announce();
}

async function drain() {
    if (running) return;
    running = true;
    try {
        while (queue.length) {
            const job = queue.shift();
            current = job;
            announce();
            await enrichOne(job);
            current = null;
            announce();
            if (queue.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
        }
    } finally {
        running = false;
        current = null;
    }
}

async function enrichOne(job) {
    const { settingId, chatId } = job;
    if (!mayAddGeneratedDetail(settingId, job.objectId)) return setItem(job, 'off', 'canon - no generated detail');
    if (isBeingEdited(job.objectId)) return setItem(job, 'held', 'open for editing - enrich it from the sheet');
    setItem(job, 'running');
    try {
        const obj = await getObject(chatId, job.objectId);
        if (!obj) return setItem(job, 'failed', 'it no longer exists');
        const type = await getObjectType(obj.type);
        // A quest's objectives are the story's, Archivist's plan or the user's:
        // never invented in the background (Enrich all on its sheet still can).
        const fields = (await baselineFields(settingId, type)).filter((f) => !(type.id === 'quest' && f.name === 'objectives'));
        const all = {};
        for (const t of await getObjectTypes()) all[t.id] = await listEntries(chatId, settingId, t.id);
        const base = obj.base ?? obj;
        const draft = { name: obj.name, aliases: base.aliases ?? [], description: base.description ?? '', fields: Object.fromEntries(fields.map((f) => [f.name, base[f.name] ?? null])) };
        const { values } = await generateEntry({ task: 'fill', type, ctx: { chatId, chatKey: job.chatKey, settingId }, fields, entry: obj, draft, all });

        // Re-read: only what is STILL empty is written.
        const fresh = await getObject(chatId, job.objectId);
        if (!fresh || isBeingEdited(job.objectId)) return setItem(job, 'held', 'open for editing - enrich it from the sheet');
        const now = fresh.base ?? fresh;
        const patch = {};
        for (const [key, value] of Object.entries(values)) {
            if (key === 'name') continue;
            if (isEmpty(now[key])) patch[key] = value;
        }
        if (Object.keys(patch).length) {
            if (!await updateEntry(chatId, settingId, job.objectId, patch)) throw new Error('State Engine refused the change');
            const generated = getEntryMeta(settingId, job.objectId).generated;
            setEntryMeta(settingId, job.objectId, { generated: [...new Set([...generated, ...Object.keys(patch)])] });
        }
        setItem(job, 'done');
    } catch (err) {
        console.warn(LOG_PREFIX, `could not enrich ${job.name}`, err);
        setItem(job, 'failed', err?.message ?? String(err));
    }
}
