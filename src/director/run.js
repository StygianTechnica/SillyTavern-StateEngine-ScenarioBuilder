// Runs the director (src/director/prompt.js) for the open chat: reads the
// recent chat and the scene dossier, asks the generation connection for a
// game master's briefing, adds the rooms, people and items the briefing
// says the scene needs to the library, and keeps the briefing in the chat
// document, where the guidance (src/guidance/sync.js) puts it first.
//
// Called before each reply (src/state/lifecycle.js, with a timeout: a late
// briefing is used next time, and the previous one stands meanwhile) and
// from the Preview's "Rethink" button. Never throws.

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { getObjectType, getBoundSettingId, createEntry, findSimilar, setParent, setEntryMeta, isCanonOnly, mayAddGeneratedDetail, getOverview } from '../library/library.js';
import { baselineFields } from '../library/fields.js';
import { describeMagic, describeTech } from '../library/world-options.js';
import { enqueueEnrichment } from '../generate/enrich.js';
import { callModelFirst } from '../generate/llm.js';
import { gatherInputs } from '../guidance/sync.js';
import { buildDirectorPrompt, parseDirectorNote } from './prompt.js';

export const DIRECTOR_EVENT = 'scenario_builder_director';

// The run in flight, by chat key + situation key: a second request for the
// same situation (a swipe, the Rethink button) waits on the same run.
const inFlight = new Map();
let status = { running: false, chatKey: null, error: '' };

export function getDirectorStatus() {
    return { ...status };
}

function announce() {
    try {
        SillyTavern.getContext().eventSource.emit(DIRECTOR_EVENT, getDirectorStatus());
    } catch {
        // No event bus.
    }
}

// A short stable hash of the situation, so the same chat state (a swipe of
// the same reply) reuses the briefing instead of asking again.
function hashOf(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

// The recent messages the next reply answers. `type` is SillyTavern's
// generation type: a swipe or regenerate replaces the last AI reply, so it
// is left out; a normal send's text is still in the input box when the
// generation starts, so it is read from there.
export function recentMessages(type) {
    const context = SillyTavern.getContext();
    const chat = (context.chat ?? []).filter((m) => m && !m.is_system && typeof m.mes === 'string');
    const list = chat.slice(-12).map((m) => ({ name: m.name, text: m.mes, isUser: !!m.is_user }));
    if (type === 'swipe' || type === 'regenerate') {
        while (list.length && !list[list.length - 1].isUser) list.pop();
    }
    if (!type || type === 'normal') {
        const pending = String(document.getElementById('send_textarea')?.value ?? '').trim();
        if (pending && !pending.startsWith('/')) list.push({ name: context.name1, text: pending, isUser: true });
    }
    return list.slice(-8);
}

function memoriesFor(ids) {
    const archivist = window.StateEngineArchivist;
    if (typeof archivist?.getMemoriesForEntity !== 'function') return [];
    const rank = { high: 0, medium: 1, low: 2 };
    const out = [];
    for (const id of ids) {
        try {
            const list = (archivist.getMemoriesForEntity(id) ?? []).slice().sort((a, b) => (rank[a.importance] ?? 3) - (rank[b.importance] ?? 3));
            for (const m of list.slice(0, 4)) if (m?.text && !out.includes(m.text)) out.push(m.text);
        } catch {
            // Archivist not ready for this one.
        }
    }
    return out.slice(0, 12);
}

// The ref field on `typeId` that points at a location ('location' first).
async function locationFieldOf(settingId, typeId) {
    const type = await getObjectType(typeId);
    if (!type) return null;
    const fields = await baselineFields(settingId, type);
    const refs = fields.filter((f) => f.kind === 'ref' && f.refType === 'location');
    return (refs.find((f) => f.name === 'location') ?? refs[0])?.name ?? null;
}

// Adds what the briefing says the scene needs. Places go under the current
// location; items and people who are here are placed in it. Never adds a
// duplicate of something the library already has.
async function createNeeded(chatId, chatKey, settingId, created, locationId) {
    const made = [];
    for (const item of created) {
        try {
            if ((await findSimilar(chatId, settingId, item.kind, item.name)).length) continue;
            const data = { name: item.name, description: item.description };
            if (locationId && item.kind !== 'location' && item.here) {
                const field = await locationFieldOf(settingId, item.kind);
                if (field) data[field] = locationId;
            }
            const obj = await createEntry(chatId, settingId, item.kind, data, { origin: 'director' });
            if (!obj) continue;
            if (item.kind === 'location' && locationId) setParent(settingId, obj.id, locationId);
            made.push({ id: obj.id, kind: item.kind, name: obj.name });
        } catch (err) {
            console.warn(LOG_PREFIX, `the director could not add ${item.name}`, err);
        }
    }
    if (!made.length) return made;
    const at = new Date().toISOString();
    const adopted = made.map((m) => ({ id: newLocalId('a'), objectId: m.id, type: m.kind, name: m.name, at, placedUnder: m.kind === 'location' ? locationId ?? '' : '', enrich: 'off', error: '' }));
    updateChatDoc(chatKey, (d) => {
        const known = new Set(d.adopted.map((a) => a.objectId));
        d.adopted = [...d.adopted, ...adopted.filter((a) => !known.has(a.objectId))];
    });
    if (getSettings().generation.autoEnrich) {
        for (const a of adopted) enqueueEnrichment({ settingId, chatId, chatKey, objectId: a.objectId, name: a.name, adoptedId: a.id });
    }
    return made;
}

// The current location and the people present get fleshed out when they
// are thin, so the next briefing has more to work with.
function enrichThin(chatId, chatKey, settingId, guidance) {
    if (!getSettings().generation.autoEnrich) return;
    const thin = (text) => String(text ?? '').trim().length < 80;
    const targets = [];
    if (guidance.location?.id && thin(guidance.location.description)) targets.push({ id: guidance.location.id, name: guidance.location.path?.at(-1) ?? '' });
    for (const c of guidance.cast ?? []) if (c.id && (thin(c.description) || (!c.personality && !c.goals))) targets.push({ id: c.id, name: c.name });
    for (const t of targets) {
        if (mayAddGeneratedDetail(settingId, t.id)) enqueueEnrichment({ settingId, chatId, chatKey, objectId: t.id, name: t.name });
    }
}

async function run(chatId, chatKey, type, force) {
    const settings = getSettings();
    const settingId = await getBoundSettingId(chatId);
    const inputs = await gatherInputs(chatId, chatKey);
    const guidance = inputs.guidance;
    const messages = recentMessages(type);
    const key = hashOf(JSON.stringify(messages.map((m) => [m.name, m.text])));
    const doc = getChatDoc(chatKey);
    if (!force && doc.director.key === key && doc.director.note) return doc.director;

    const overview = settingId ? getOverview(settingId) : {};
    const limits = [...describeMagic(overview.magic).limits, ...describeTech(overview.tech).limits];
    const canonOnly = settingId ? isCanonOnly(settingId) : true;
    const { system, prompt } = buildDirectorPrompt({
        ...guidance,
        messages,
        userName: SillyTavern.getContext().name1,
        previousNote: doc.director.note,
        memories: memoriesFor([guidance.location?.id, ...(guidance.cast ?? []).map((c) => c.id)].filter(Boolean)),
        limits,
        allowCreate: settings.director.allowCreate && !!settingId,
        canonOnly,
    });
    const raw = await callModelFirst([{ role: 'system', content: system }, { role: 'user', content: prompt }], settings.director.maxTokens);
    const { note, created } = parseDirectorNote(raw);
    if (!note) throw new Error('The model wrote no briefing.');

    const made = settingId && settings.director.allowCreate && !canonOnly
        ? await createNeeded(chatId, chatKey, settingId, created, guidance.location?.id ?? null)
        : [];
    if (settingId) enrichThin(chatId, chatKey, settingId, guidance);

    const result = { note, key, at: new Date().toISOString(), created: [...doc.director.created, ...made].slice(-20), error: '' };
    updateChatDoc(chatKey, (d) => { d.director = result; });
    return result;
}

// Writes a fresh briefing for the open chat (unless the situation has not
// changed since the last one, or `force`). Resolves to the chat's director
// record; on failure the previous briefing stays and `error` says why.
export async function runDirector(chatId, chatKey, { type = 'normal', force = false } = {}) {
    if (!getSettings().director.enabled) return null;
    const id = `${chatKey}|${type}|${force}`;
    if (inFlight.has(id)) return inFlight.get(id);
    status = { running: true, chatKey, error: '' };
    announce();
    const job = run(chatId, chatKey, type, force)
        .catch((err) => {
            console.warn(LOG_PREFIX, 'the director could not write a briefing', err);
            const error = String(err?.message ?? err);
            updateChatDoc(chatKey, (d) => { d.director = { ...d.director, error }; });
            status = { ...status, error };
            return getChatDoc(chatKey).director;
        })
        .finally(() => {
            inFlight.delete(id);
            status = { ...status, running: inFlight.size > 0 };
            announce();
        });
    inFlight.set(id, job);
    return job;
}

// runDirector, but gives up waiting after the configured timeout (the run
// carries on and its briefing is kept for later). Resolves to true when a
// briefing for this reply is ready.
export async function directBeforeReply(chatId, chatKey, type) {
    const { enabled, timeout } = getSettings().director;
    if (!enabled) return false;
    const ms = Math.max(5, Number(timeout) || 45) * 1000;
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve('late'), ms); });
    const outcome = await Promise.race([runDirector(chatId, chatKey, { type }), late]);
    clearTimeout(timer);
    if (outcome === 'late') console.info(LOG_PREFIX, `the director took longer than ${ms / 1000}s; the previous briefing is used for this reply`);
    return outcome !== 'late' && !!outcome?.note;
}
