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
import { getSettings } from '../settings.js';
import { getObject } from '../api/objects.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { crewJobOf, isJobNote } from '../ops/model.js';
import { getEntryMeta, getSettingDoc } from '../store/setting-store.js';
import { addRelation, relationsFor } from '../library/relations-edit.js';
import { getObjectType, getObjectTypes, listEntries, updateEntry, setEntryMeta, mayAddGeneratedDetail, getParents, setParent } from '../library/library.js';
import { baselineFields, foldRegion } from '../library/fields.js';
import { chooseParent } from './place-parent.js';
import { pathOf } from '../library/hierarchy.js';
import { generateEntry } from './run.js';
import { recordEnrichment, enrichmentRecord } from './revert.js';
import { newLocalId } from '../store/schema.js';

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

// job: { settingId, chatId, chatKey, objectId, name, adoptedId?, story? }
// story: the chat an event or scene came from - it is written from that.
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

// Those made for a job and still described only by the job's line: written
// up properly, once, when their chat is opened. Never throws.
export async function enrichJobNotes(chatId, chatKey, settingId) {
    try {
        if (!settingId || getSettings().generation?.autoEnrich !== true) return;
        for (const c of await listEntries(chatId, settingId, 'character')) {
            if (isJobNote(c.description ?? c.base?.description) && mayAddGeneratedDetail(settingId, c.id)) enqueueEnrichment({ settingId, chatId, chatKey, objectId: c.id, name: c.name });
        }
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not look for people described only by their job', err);
    }
}

// A description that is only a line: one sentence, short.
export function thinDescription(text) {
    const t = String(text ?? '').trim();
    return !!t && t.length < 160 && (t.match(/[.!?…](?:\s|$)/g) ?? []).length <= 1;
}

function placeAgain(job, written, locations) {
    const { settingId } = job;
    const parents = getParents(settingId);
    const was = parents[job.objectId] ?? '';
    const chosen = chooseParent({
        brief: written.name ?? job.name, description: written.description ?? '',
        locations: locations.filter((l) => l.id !== job.objectId && !pathOf(parents, l.id).includes(job.objectId)).map((l) => ({ id: l.id, name: l.name, aliases: l.aliases ?? l.base?.aliases ?? [], description: l.description ?? l.base?.description ?? '' })),
        parents, sceneId: was || null,
    });
    if (!chosen || chosen.why === 'top' || chosen.id === was) return;
    // Only further in: a district of where it was put, never somewhere else.
    if (was && !pathOf(parents, chosen.id).includes(was)) return;
    setParent(settingId, job.objectId, chosen.id);
    if (job.chatKey && job.adoptedId) updateChatDoc(job.chatKey, (d) => { const item = d.adopted.find((a) => a.id === job.adoptedId); if (item) item.placedUnder = chosen.id; });
    console.info(LOG_PREFIX, `${job.name} placed inside ${locations.find((l) => l.id === chosen.id)?.name ?? chosen.id} - ${chosen.why === 'named' ? 'its description names it' : 'it fits there'}`);
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
        // A one-line description the story's own addition came with (the
        // director's "A heavily guarded storage facility for their illegal
        // operations") is a seed, not a description: written out from it,
        // with what an old Region field says (src/library/fields.js).
        const seed = (job.adoptedId && thinDescription(base.description)) || (type.id === 'character' && isJobNote(base.description)) ? String(base.description).trim() : '';
        const oldRegion = type.id === 'location' ? String(base.region ?? '').trim() : '';
        // For a person the description is looks only: what the line says of
        // them is their role, background and ties.
        const what = seed ? foldRegion(seed, oldRegion) : '';
        const seedBrief = !seed ? ''
            : type.id === 'character' ? `What the story says of them: ${what} - their role, background, ties and goals keep to that.`
                : `It is: ${what} - keep that, and write the description out from it.`;
        // On a rival crew's job: that is who they are, whatever the scene around them.
        const crewJob = type.id === 'character' && job.chatKey ? crewJobOf([...(getChatDoc(job.chatKey).opsDone ?? []), getChatDoc(job.chatKey).op, ...(getChatDoc(job.chatKey).opsAlso ?? [])], obj.name) : null;
        const brief = [seedBrief, crewJob?.brief].filter(Boolean).join(' ');
        const draft = { name: obj.name, aliases: base.aliases ?? [], description: seed ? '' : base.description ?? '', fields: Object.fromEntries(fields.map((f) => [f.name, base[f.name] ?? null])) };
        const { values } = await generateEntry({ task: 'fill', type, ctx: { chatId, chatKey: job.chatKey, settingId }, fields, entry: obj, draft, all, brief, story: job.story ?? '', fromStory: !!job.adoptedId });

        // Re-read: only what is STILL empty is written - or the seed, while
        // it is still the same line.
        const fresh = await getObject(chatId, job.objectId);
        if (!fresh || isBeingEdited(job.objectId)) return setItem(job, 'held', 'open for editing - enrich it from the sheet');
        const now = fresh.base ?? fresh;
        const patch = {};
        for (const [key, value] of Object.entries(values)) {
            if (key === 'name') continue;
            if (isEmpty(now[key]) || (key === 'description' && seed && String(now.description ?? '').trim() === seed && !isEmpty(value))) patch[key] = value;
        }
        // The old Region text, once in the description, is not kept twice.
        if (seed && oldRegion && patch.description && String(now.region ?? '').trim() === oldRegion && getEntryMeta(settingId, job.objectId).generated.includes('region')) patch.region = '';
        if (Object.keys(patch).length) {
            if (!await updateEntry(chatId, settingId, job.objectId, patch)) throw new Error('State Engine refused the change');
            const generated = getEntryMeta(settingId, job.objectId).generated;
            setEntryMeta(settingId, job.objectId, { generated: [...new Set([...generated, ...Object.keys(patch)])] });
            // Kept so it can be put back (src/generate/revert.js).
            await recordEnrichment(settingId, job.objectId, enrichmentRecord({ id: newLocalId('e'), at: new Date().toISOString(), source: 'auto', before: Object.fromEntries(Object.keys(patch).map((k) => [k, now[k] ?? null])), after: patch }));
        }
        // Of the crew's side, as its job says - before the fill's own guesses.
        if (crewJob?.sideId && !relationsFor(job.objectId, getSettingDoc(settingId).relations ?? []).length) addRelation(settingId, { from: job.objectId, to: crewJob.sideId, kind: 'member of', note: 'on their job' });
        // A person with no ties yet: the side and the people the fill tied
        // them to (Lena came out of the director with none - no faction, no
        // one she knew).
        if (type.id === 'character' && Array.isArray(values.relations) && values.relations.length && !relationsFor(job.objectId, getSettingDoc(settingId).relations ?? []).length) {
            for (const r of values.relations) if (r?.otherId) addRelation(settingId, { from: job.objectId, to: r.otherId, kind: r.kind, note: 'from the fill', role: typeof (patch.role ?? now.role) === 'string' ? (patch.role ?? now.role) : '' });
        }
        // A place left at the top of the map: its written description may
        // name or fit a district now (src/generate/place-parent.js).
        if (job.placeAfter && type.id === 'location') placeAgain(job, { ...now, ...patch }, all.location ?? []);
        setItem(job, 'done');
    } catch (err) {
        console.warn(LOG_PREFIX, `could not enrich ${job.name}`, err);
        setItem(job, 'failed', err?.message ?? String(err));
    }
}
