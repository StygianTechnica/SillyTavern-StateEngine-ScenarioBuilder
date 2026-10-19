// The validation runner (spec 7.3): after State Engine has extracted the
// prompted sb__ values from a reply, compare them with canonical state
// (src/validate/drift.js), act on each difference by its policy, and keep
// the review queue, candidates, corrections and history in the chat
// document. Also: the user's answers from the review queue, candidate
// promotion/merge/rejection (SB-225), and reverting what a swiped, edited
// or deleted message caused (SB-224).
//
// State Engine has no "extraction finished" event; it announces every
// value write with VARIABLES_CHANGED_EVENT. Reconciliation therefore runs
// (debounced) on that event and only acts on observed values that CHANGED
// since the last run (drift.js detectDrift) - so it never races
// extraction into acting twice, and Scenario Builder's own writes settle
// at once (SB-502).

import { revertPatch } from '../state/revert.js';
import { LOG_PREFIX } from '../constants.js';
import { getSettings, isActive } from '../settings.js';
import { getCurrentChatRef, chatKeyFor, sourceMessageId, sourceIndex } from '../store/chat-ref.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId, DRIFT_LIMIT } from '../store/schema.js';
import { getVariableValues, setVariableValue, getRawValues } from '../api/variables.js';
import { getObject, confirmObject, resolveObject, updateObject } from '../api/objects.js';
import { placeNameFrom, samePlaceName } from '../director/prompt.js';
import { PRESET_NAME, OBSERVED_NAMES } from '../preset/blueprint.js';
import { withStateEngineCast, SE_CAST } from './drift.js';
import { getPresetStatus } from '../preset/scenario-preset.js';
import { getBoundSettingId, getParents, setParent, getLocationPathNames, deleteEntry, playerIdOf, listEntries } from '../library/library.js';
import { setCanonical } from '../state/canonical.js';
import { catchUpWithStory, holdStoryWeather, travelAlong, followStoryTimeOfDay, followStoryElapsed } from '../calendar/clock.js';
import { detectDrift, decide, DEFAULT_POLICIES, readObserved, applyAccepted, correctionText, describeItem, applyHolds, followPlayer, OBSERVED_FIELDS } from './drift.js';

export const DRIFT_CHANGED_EVENT = 'scenario_builder_drift_changed';

function announce(chatKey) {
    try {
        SillyTavern.getContext().eventSource.emit(DRIFT_CHANGED_EVENT, chatKey);
    } catch {
        // No event bus.
    }
}

// The newest AI reply's source id (SB-223), or ''.
function latestReplySource(chatId) {
    const chat = SillyTavern.getContext().chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i] && !chat[i].is_user && !chat[i].is_system) return sourceMessageId(chatId, i, chat[i]);
    }
    return '';
}

// The newest AI reply's text.
function latestReplyText() {
    const chat = SillyTavern.getContext().chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i] && !chat[i].is_user && !chat[i].is_system) return String(chat[i].mes ?? '');
    }
    return '';
}

// id -> { id, type, name, confirmed } for every id the comparison needs.
async function objectsFor(chatId, ids) {
    const map = new Map();
    for (const id of new Set(ids.filter(Boolean))) {
        const obj = await getObject(chatId, id);
        if (obj) map.set(id, { id: obj.id, type: obj.type, name: obj.name, confirmed: obj.confirmed !== false });
    }
    return map;
}

// The observed variable values matching canonical, for the fields given
// (all by default). Booleans with no canonical value are left alone.
// A value Scenario Builder has not set yet is left out, so a blank never
// overwrites what the story wrote (it would wipe the scene title every turn
// until one was set); the cast counts as set once there is a scene.
function restoreValues(canonical, fields = Object.keys(OBSERVED_FIELDS)) {
    const out = {};
    for (const field of fields) {
        switch (field) {
            case 'location': if (canonical.locationId) out.scene_location = canonical.locationId; break;
            case 'cast': if (canonical.castIds.length || canonical.locationId) out.scene_characters = [...canonical.castIds]; break;
            case 'weather': if (canonical.weather.length) out.scene_weather = [...canonical.weather]; break;
            case 'temperature': if (canonical.temperature) out.scene_temperature = canonical.temperature; break;
            case 'indoor': if (typeof canonical.indoor === 'boolean') out.scene_isindoor = canonical.indoor; break;
            case 'title': if (canonical.sceneTitle) out.scene_title = canonical.sceneTitle; break;
            case 'summary': if (canonical.sceneSummary) out.scene_summary = canonical.sceneSummary; break;
            case 'creatures': if (canonical.creatureIds.length || canonical.locationId) out.scene_creatures = [...canonical.creatureIds]; break;
            default: break;
        }
    }
    return out;
}

// Writes canonical values into the prompted variables so the next prompted
// update starts from the intended state (SB-213), skipping fields with a
// question or candidate still open (their observed value is kept for the
// review). Only values that differ are written. Never throws.
export async function pushCanonicalToObserved(chatId, chatKey, { fields = null } = {}) {
    try {
        const doc = getChatDoc(chatKey);
        const open = new Set([
            ...doc.drift.filter((d) => d.status === 'pending').map((d) => d.field),
            ...doc.candidates.map((c) => c.field),
        ]);
        const wanted = restoreValues(doc.canonical, (fields ?? Object.keys(OBSERVED_FIELDS)).filter((f) => !open.has(f)));
        const current = await getVariableValues(chatId, Object.keys(wanted));
        let wrote = false;
        for (const [name, value] of Object.entries(wanted)) {
            if (JSON.stringify(current[name] ?? null) === JSON.stringify(value)) continue;
            await setVariableValue(chatId, PRESET_NAME, name, value);
            wrote = true;
        }
        if (wrote) {
            const raw = await getVariableValues(chatId, OBSERVED_NAMES);
            updateChatDoc(chatKey, (d) => { d.lastObserved = readObserved(raw); });
        }
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not write the canonical state into the scene variables', err);
    }
}

// Display helpers for correction lines and queue text.
async function namers(chatId, settingId, objects) {
    const names = new Map([...objects.values()].map((o) => [o.id, o.name]));
    // '' for an object that can't be found: correction lines leave it out
    // and the queue text says so in words - never an id.
    const nameOf = (id) => names.get(id) ?? '';
    const paths = new Map();
    for (const o of objects.values()) {
        if (o.type === 'location') paths.set(o.id, (await getLocationPathNames(chatId, settingId, o.id)).join(' > ') || o.name);
    }
    return { nameOf, placeOf: (id) => paths.get(id) || nameOf(id) };
}

let running = false;
let again = false;

// One validation pass over the open chat. Never throws.
export async function reconcileOpenChat() {
    if (running) {
        again = true;
        return;
    }
    running = true;
    try {
        do {
            again = false;
            await reconcileOnce();
        } while (again);
    } catch (err) {
        console.warn(LOG_PREFIX, 'validation failed', err);
    } finally {
        running = false;
    }
}

// State Engine's own scene tracker (se__scene_characters), or null.
async function stateEngineCast(chatId) {
    try {
        const value = (await getRawValues(chatId, [SE_CAST]))?.[SE_CAST];
        return Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x) : null;
    } catch {
        return null;
    }
}

async function reconcileOnce() {
    const ref = getCurrentChatRef();
    if (!ref || !isActive()) return;
    const { chatId } = ref;
    const chatKey = chatKeyFor(ref);
    if (!(await getPresetStatus(chatId)).active) return;

    const settings = getSettings();
    const settingId = await getBoundSettingId(chatId);
    const raw = await getVariableValues(chatId, OBSERVED_NAMES);
    const doc = getChatDoc(chatKey);
    // The player character never leaves the scene: the scene goes with them.
    const playerId = settingId ? playerIdOf(settingId, await listEntries(chatId, settingId, 'character')) : '';
    const observed = followPlayer(withStateEngineCast(readObserved(raw), await stateEngineCast(chatId)), doc.canonical, playerId);
    const replySource = latestReplySource(chatId);
    const newReply = !!replySource && replySource !== doc.lastReply;

    const objects = await objectsFor(chatId, [observed.location, ...observed.cast, doc.canonical.locationId, ...doc.canonical.castIds]);
    const items = applyHolds(detectDrift({
        canonical: doc.canonical,
        observed,
        lastObserved: doc.lastObserved,
        objects,
        parents: settingId ? getParents(settingId) : {},
        policies: settings.policies,
        rejected: doc.rejected,
    }), doc.held.filter((h) => h.until > doc.turn));

    if (!items.length && !newReply && JSON.stringify(doc.lastObserved) === JSON.stringify(observed)) return;

    // A new place read as a whole sentence ("Remus is in the infirmary now,
    // resting from his injuries") is renamed to the place itself before it
    // is offered, so a merge does not make the sentence an alias either.
    let places = null;
    for (const item of items) {
        const obj = item.action === 'candidate' && item.field === 'location' ? objects.get(item.observed) : null;
        if (!obj?.name) continue;
        const short = placeNameFrom(obj.name, [SillyTavern.getContext().name1].filter(Boolean)) || obj.name;
        try {
            if (short !== obj.name && await updateObject(chatId, obj.id ?? item.observed, { name: short })) obj.name = short;
            // A name the library already has for a place ("the wall" when
            // the walls are known) is that place, not a new one: the story's
            // changing words for one place no longer pile up as candidates.
            places ??= settingId ? await listEntries(chatId, settingId, 'location') : [];
            const known = places.find((p) => p.id !== item.observed && samePlaceName(short, p));
            if (known && await resolveObject(chatId, item.observed, known.id)) {
                objects.set(known.id, known);
                item.observed = known.id;
                item.classification = 'library_match';
                item.reason = `"${short}" is ${known.name}`;
                item.action = decide('library_match', settings.policies?.location ?? DEFAULT_POLICIES.location);
                if (item.observed === doc.canonical.locationId) item.action = 'skip';
            }
        } catch (err) {
            console.warn(LOG_PREFIX, `could not tidy the new place "${obj.name}"`, err);
        }
    }
    const { nameOf, placeOf } = await namers(chatId, settingId, objects);
    let canonical = doc.canonical;
    const accepted = [];
    const acceptedFields = new Set();
    const restore = new Set();
    const corrections = [];
    const driftLog = [];
    const candidates = [];

    for (const item of items) {
        const record = {
            id: newLocalId('d'),
            at: new Date().toISOString(),
            ...item,
            text: describeItem(item, nameOf),
            source: replySource,
            status: 'resolved',
            resolution: '',
        };
        switch (item.action) {
            case 'accept':
                canonical = applyAccepted(canonical, item);
                accepted.push(record.text);
                acceptedFields.add(item.field);
                record.resolution = 'accepted';
                break;
            case 'adjust': {
                restore.add(item.field);
                const line = correctionText(item, { nameOf, placeOf });
                if (line) corrections.push({ id: newLocalId('c'), text: line, turnsLeft: settings.correctionTurns, source: replySource });
                record.resolution = 'adjusted';
                break;
            }
            case 'ask':
                record.status = 'pending';
                break;
            case 'candidate': {
                const objectId = item.field === 'cast' ? item.objectId : item.observed;
                const obj = objects.get(objectId);
                candidates.push({ id: newLocalId('k'), objectId, type: obj?.type ?? '', name: obj?.name ?? objectId, field: item.field, source: replySource, at: record.at });
                record.status = 'candidate';
                break;
            }
            default:
                break;
        }
        driftLog.push(record);
    }

    const mutate = (d) => {
        if (newReply) {
            d.corrections = d.corrections.map((c) => ({ ...c, turnsLeft: (c.turnsLeft ?? 1) - 1 })).filter((c) => c.turnsLeft > 0);
            d.turn += 1;
            d.lastReply = replySource;
            d.held = d.held.filter((h) => h.until > d.turn);
        }
        d.corrections = [...d.corrections, ...corrections];
        const known = new Set(d.candidates.map((c) => c.objectId));
        d.candidates = [...d.candidates, ...candidates.filter((c) => !known.has(c.objectId))];
        const pending = d.drift.filter((x) => x.status === 'pending' || x.status === 'candidate');
        const resolved = d.drift.filter((x) => x.status !== 'pending' && x.status !== 'candidate');
        d.drift = [...pending, ...resolved.slice(-DRIFT_LIMIT), ...driftLog];
        d.lastObserved = observed;
    };

    const patch = {};
    for (const key of ['locationId', 'castIds', 'creatureIds', 'weather', 'temperature', 'indoor', 'sceneTitle', 'sceneSummary']) {
        if (JSON.stringify(canonical[key]) !== JSON.stringify(doc.canonical[key])) patch[key] = canonical[key];
    }
    // One save: the canonical change (if any) plus the queue/log updates,
    // which setCanonical applies even when no canonical value changed.
    setCanonical(chatKey, patch, { source: 'validation', note: accepted.join('; '), sourceMessage: replySource, chatId, alsoMutate: mutate });
    if (settings.time.enabled && settingId) {
        // The story's weather holds a while before the simulation resumes;
        // a time skip the story made is caught up with (sb__scene_deltatime).
        if (acceptedFields.has('weather') || acceptedFields.has('temperature')) await holdStoryWeather(chatKey, settingId, canonical.weather, canonical.temperature);
        // A move along a route takes its travel time.
        if (acceptedFields.has('location') && canonical.locationId !== doc.canonical.locationId) await travelAlong(chatId, chatKey, settingId, doc.canonical.locationId, canonical.locationId, replySource);
        const replyFrom = doc.clock.planned?.from ?? doc.canonical.time;
        if (newReply) await catchUpWithStory(chatId, chatKey, settingId, raw.scene_deltatime, replySource);
        // The day turning in the reply's own words ("the sun began to set"),
        // and time it says has passed ("gone for hours").
        if (newReply) {
            const text = latestReplyText();
            await followStoryTimeOfDay(chatId, chatKey, settingId, text, replySource);
            await followStoryElapsed(chatId, chatKey, settingId, text, replyFrom, replySource);
            updateChatDoc(chatKey, (d) => { d.clock.readTo = { source: replySource, length: text.length }; });
        }
    }
    if (restore.size) await pushCanonicalToObserved(chatId, chatKey, { fields: [...restore] });
    if (items.length) announce(chatKey);
}

// ---- the review queue (SB-221 "ambiguous"/"ask", SB-225 candidates)

function findDrift(chatKey, driftId) {
    return getChatDoc(chatKey).drift.find((d) => d.id === driftId) ?? null;
}

// The user's answer to a pending item: 'accept' (the story wins: canonical
// takes the observed value) or 'keep' (canonical wins: the observed value
// is written back and the guidance carries a correction).
export async function resolveDrift(chatId, chatKey, driftId, answer) {
    const item = findDrift(chatKey, driftId);
    if (!item || item.status !== 'pending') return false;
    const markResolved = (resolution, extra = []) => (d) => {
        const x = d.drift.find((y) => y.id === driftId);
        if (x) { x.status = 'resolved'; x.resolution = resolution; }
        d.corrections = [...d.corrections, ...extra];
    };
    if (answer === 'accept') {
        const doc = getChatDoc(chatKey);
        const next = applyAccepted(doc.canonical, item);
        const patch = {};
        for (const key of Object.keys(next)) if (JSON.stringify(next[key]) !== JSON.stringify(doc.canonical[key])) patch[key] = next[key];
        setCanonical(chatKey, patch, { source: 'review', note: `Accepted: ${item.text}`, sourceMessage: item.source, chatId, alsoMutate: markResolved('accepted') });
    } else {
        const settingId = await getBoundSettingId(chatId);
        const objects = await objectsFor(chatId, [item.canonical, item.observed, item.objectId].flat().filter((v) => typeof v === 'string'));
        const { nameOf, placeOf } = await namers(chatId, settingId, objects);
        const line = correctionText(item, { nameOf, placeOf });
        const correction = line ? [{ id: newLocalId('c'), text: line, turnsLeft: getSettings().correctionTurns, source: item.source }] : [];
        updateChatDoc(chatKey, markResolved('kept canonical', correction));
        await pushCanonicalToObserved(chatId, chatKey, { fields: [item.field] });
    }
    announce(chatKey);
    return true;
}

function dropCandidate(d, candidateId, status) {
    const candidate = d.candidates.find((c) => c.id === candidateId);
    d.candidates = d.candidates.filter((c) => c.id !== candidateId);
    if (candidate) {
        for (const x of d.drift) {
            if (x.status === 'candidate' && (x.observed === candidate.objectId || x.objectId === candidate.objectId)) { x.status = 'resolved'; x.resolution = status; }
        }
    }
}

// Puts a promoted/merged object into the canonical scene where the story
// put it.
function canonicalPatchFor(doc, candidate, objectId) {
    if (candidate.field === 'location') return { locationId: objectId };
    if (candidate.field === 'cast') return { castIds: [...new Set([...doc.canonical.castIds, objectId])] };
    return {};
}

// Promotes a candidate into the library: State Engine confirms the object
// (moving it into the setting); a location may get a parent. The canonical
// scene then takes it where the story put it.
export async function promoteCandidate(chatId, chatKey, candidateId, { parentId = null } = {}) {
    const doc = getChatDoc(chatKey);
    const candidate = doc.candidates.find((c) => c.id === candidateId);
    if (!candidate) return false;
    const confirmed = await confirmObject(chatId, candidate.objectId);
    if (!confirmed) return false;
    if (parentId && candidate.type === 'location') {
        const settingId = await getBoundSettingId(chatId);
        if (settingId) setParent(settingId, candidate.objectId, parentId);
    }
    setCanonical(chatKey, canonicalPatchFor(doc, candidate, candidate.objectId), {
        source: 'review', note: `Added to the library: ${candidate.name}`, sourceMessage: candidate.source, chatId,
        alsoMutate: (d) => dropCandidate(d, candidateId, 'promoted'),
    });
    announce(chatKey);
    return true;
}

// Merges a candidate into an existing library object (State Engine
// resolveObject: the detected name becomes the target's alias and every
// variable holding the candidate holds the target).
export async function mergeCandidate(chatId, chatKey, candidateId, targetId) {
    const doc = getChatDoc(chatKey);
    const candidate = doc.candidates.find((c) => c.id === candidateId);
    if (!candidate || !targetId) return false;
    const resolved = await resolveObject(chatId, candidate.objectId, targetId);
    if (!resolved) return false;
    setCanonical(chatKey, canonicalPatchFor(doc, candidate, targetId), {
        source: 'review', note: `${candidate.name} is ${resolved.name}`, sourceMessage: candidate.source, chatId,
        alsoMutate: (d) => dropCandidate(d, candidateId, `merged into ${resolved.name}`),
    });
    announce(chatKey);
    return true;
}

// Rejects a candidate: its name is suppressed from now on (later mentions
// are contradictions, adjusted), and the observed value goes back to
// canonical.
export async function rejectCandidate(chatId, chatKey, candidateId) {
    const doc = getChatDoc(chatKey);
    const candidate = doc.candidates.find((c) => c.id === candidateId);
    if (!candidate) return false;
    updateChatDoc(chatKey, (d) => {
        dropCandidate(d, candidateId, 'rejected');
        d.rejected = [...d.rejected, { type: candidate.type, name: candidate.name }];
    });
    await pushCanonicalToObserved(chatId, chatKey, { fields: [candidate.field] });
    announce(chatKey);
    return true;
}

// Takes an adopted entry off the "New from the story" list.
export function dismissAdopted(chatKey, adoptedId) {
    updateChatDoc(chatKey, (d) => { d.adopted = d.adopted.filter((a) => a.id !== adoptedId); });
}

// "Reject": deletes an adopted entry from the library,
// puts the scene back to where it was before the story brought it in, and
// suppresses the name from now on (later mentions are corrected).
export async function removeAdopted(chatId, chatKey, adoptedId) {
    const doc = getChatDoc(chatKey);
    const a = doc.adopted.find((x) => x.id === adoptedId);
    if (!a) return false;
    const patch = {};
    if (doc.canonical.locationId === a.objectId) {
        const brought = [...doc.history].reverse().find((h) => h.after?.locationId === a.objectId);
        patch.locationId = brought?.before?.locationId ?? '';
    }
    if (doc.canonical.castIds.includes(a.objectId)) patch.castIds = doc.canonical.castIds.filter((id) => id !== a.objectId);
    setCanonical(chatKey, patch, {
        source: 'review', note: `${a.name} rejected`, chatId,
        alsoMutate: (d) => {
            d.adopted = d.adopted.filter((x) => x.id !== adoptedId);
            // A quest made from an Archivist thread (or lore from its world
            // lore): the source is dismissed, or the next sync would make it
            // again.
            const [linkKey, dismissKey] = a.type === 'quest' ? ['questLinks', 'questsDismissed'] : a.type === 'lore' ? ['loreLinks', 'loreDismissed'] : [];
            const threadId = linkKey ? Object.entries(d[linkKey]).find(([, q]) => q === a.objectId)?.[0] ?? '' : '';
            if (threadId) {
                d[dismissKey] = [...new Set([...d[dismissKey], threadId])];
                const links = { ...d[linkKey] };
                delete links[threadId];
                d[linkKey] = links;
            }
            const known = d.rejected.some((r) => r.type === a.type && String(r.name).toLowerCase() === String(a.name).toLowerCase());
            if (!known) d.rejected = [...d.rejected, { type: a.type, name: a.name, ...(threadId ? { threadId } : {}) }];
        },
    });
    const settingId = await getBoundSettingId(chatId);
    if (settingId) await deleteEntry(chatId, settingId, a.objectId);
    await pushCanonicalToObserved(chatId, chatKey);
    announce(chatKey);
    return true;
}

// Un-rejects a name.
// Un-rejects a name - and lets a quest be made from its thread again.
export function forgetRejection(chatKey, index) {
    updateChatDoc(chatKey, (d) => {
        const gone = d.rejected[index];
        d.rejected = d.rejected.filter((_, i) => i !== index);
        if (gone?.threadId) {
            d.questsDismissed = d.questsDismissed.filter((t) => t !== gone.threadId);
            d.loreDismissed = d.loreDismissed.filter((t) => t !== gone.threadId);
        }
    });
}

// A continue adds to the reply already read: only the new part is read
// for time - the day turning, time passing. Run after each generation (a
// continue is no new reply, so reconcile's own reading skips it).
export async function followContinuedReply() {
    try {
        const ref = getCurrentChatRef();
        if (!ref || !isActive()) return;
        const chatKey = chatKeyFor(ref);
        const settingId = await getBoundSettingId(ref.chatId);
        if (!settingId) return;
        const source = latestReplySource(ref.chatId);
        const text = latestReplyText();
        const read = getChatDoc(chatKey).clock.readTo;
        if (!source || !read || read.source !== source || text.length <= read.length) return;
        const added = text.slice(read.length);
        updateChatDoc(chatKey, (d) => { d.clock.readTo = { source, length: text.length }; });
        await followStoryTimeOfDay(ref.chatId, chatKey, settingId, added, source);
        await followStoryElapsed(ref.chatId, chatKey, settingId, added, getChatDoc(chatKey).canonical.time, source);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read the continued reply for time', err);
    }
}

// ---- following messages (SB-224)

// A message at `fromIndex` or later was swiped, edited, regenerated or
// deleted: every automated canonical change it caused is reverted, its
// open questions, candidates and corrections dropped, and the scene
// variables reset to canonical so the next extraction starts clean.
export async function revertFromMessage(fromIndex) {
    const ref = getCurrentChatRef();
    if (!ref) return;
    const chatKey = chatKeyFor(ref);
    const doc = getChatDoc(chatKey);
    const affected = (source) => sourceIndex(source) >= fromIndex;
    const toUndo = doc.history.filter((h) => !h.undone && (h.source === 'validation' || h.source === 'story') && affected(h.sourceMessage)).reverse();
    const touched = toUndo.length || doc.drift.some((d) => affected(d.source)) || doc.corrections.some((c) => affected(c.source)) || doc.candidates.some((c) => affected(c.source)) || affected(doc.lastReply);
    if (!touched) return;

    // A later change by the user (the date set by hand) is not taken back.
    const patch = revertPatch(doc.history, toUndo.map((h) => h.id), doc.canonical);
    setCanonical(chatKey, patch, {
        source: 'revert',
        note: 'A message changed or was removed - its changes were reverted',
        chatId: ref.chatId,
        alsoMutate: (d) => {
            const undo = new Set(toUndo.map((h) => h.id));
            for (const h of d.history) if (undo.has(h.id)) h.undone = true;
            d.drift = d.drift.filter((x) => !affected(x.source));
            d.candidates = d.candidates.filter((c) => !affected(c.source));
            d.corrections = d.corrections.filter((c) => !affected(c.source));
            if (affected(d.lastReply)) d.lastReply = '';
        },
    });
    await pushCanonicalToObserved(ref.chatId, chatKey);
    announce(chatKey);
}

// The user changed the scene by hand (the Scene tab, "Set the scene here",
// "Bring into / Remove from scene"): the change holds over the story's
// reading for HOLD_TURNS replies, the model is told (corrections), and the
// game master's briefing - written for the scene as it was - is dropped
// and written again. `before`: the canonical state before the change.
const HOLD_TURNS = 3;
export async function holdUserScene(chatId, chatKey, before) {
    const doc = getChatDoc(chatKey);
    const after = doc.canonical;
    const until = doc.turn + HOLD_TURNS;
    const holds = [];
    const lines = [];
    const settingId = await getBoundSettingId(chatId);
    const nameOf = async (id) => (await getObject(chatId, id))?.name ?? '';
    if (after.locationId && after.locationId !== before.locationId) {
        holds.push({ field: 'location', value: after.locationId, until });
        const path = settingId ? (await getLocationPathNames(chatId, settingId, after.locationId)).join(' > ') : await nameOf(after.locationId);
        lines.push(`The scene is now at ${path || await nameOf(after.locationId)}.`);
    }
    for (const id of before.castIds.filter((x) => !after.castIds.includes(x))) {
        holds.push({ field: 'cast', op: 'remove', objectId: id, until });
        const name = await nameOf(id);
        if (name) lines.push(`${name} is not in this scene any more.`);
    }
    for (const id of after.castIds.filter((x) => !before.castIds.includes(x))) {
        holds.push({ field: 'cast', op: 'add', objectId: id, until });
        const name = await nameOf(id);
        if (name) lines.push(`${name} is in this scene.`);
    }
    for (const id of (before.creatureIds ?? []).filter((x) => !(after.creatureIds ?? []).includes(x))) holds.push({ field: 'creatures', op: 'remove', objectId: id, until });
    if (!holds.length) return;
    const settings = getSettings();
    const fields = new Set(holds.map((h) => h.field));
    updateChatDoc(chatKey, (d) => {
        d.held = [...d.held.filter((h) => !fields.has(h.field) || h.until <= d.turn), ...holds];
        d.corrections = [...d.corrections, ...lines.map((text) => ({ id: newLocalId('c'), text, turnsLeft: settings.correctionTurns + 1, source: 'user' }))];
        // The briefing described the old scene.
        d.director = { ...d.director, note: '', summary: '', direction: '', key: '' };
    });
    announce(chatKey);
}
