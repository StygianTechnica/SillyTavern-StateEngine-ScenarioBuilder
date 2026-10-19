// The GM planner - scheduling and the background passes
// (docs/DESIGN - GM PLANNER.md). After each reply (src/state/lifecycle.js)
// it keeps the pace count and runs whichever pass is due (src/planner/
// model.js duePasses): DAY when an in-game day begins (or the day's plan
// has run long), CHECK every few replies to keep the plan in step with the
// story, OUTLINE every so often (and after Archivist compiles) to keep the
// long-term outline on its story shape, INSPIRE for a new inspiration
// text. Every call goes through generate/llm.js callModel: queued one at a
// time and held while a reply is being written, so the planner never makes
// a reply wait.
//
// Tension comes from Archivist's compiled readings when it has any, else
// from the CHECK pass's own reading (src/planner/shapes.js turns it into
// the aim: build, hold or ease).
//
// Before each reply the director asks directorPlan() for the private GM
// PLAN section (the story's beat, the tension aim, the pace aim, the next
// moments, agendas, requests, motifs) and hands the BEAT lines it writes
// back to takeBeats(). Never throws.

import { LOG_PREFIX } from '../constants.js';
import { getSettings, isActive } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { getBoundSettingId } from '../library/library.js';
import { callModel } from '../generate/llm.js';
import { readModelJson } from '../generate/prompt.js';
import { gatherInputs } from '../guidance/sync.js';
import { dossierText } from '../director/prompt.js';
import {
    duePasses, setDayPlan, applyCheck, applyBeats, trackPace, paceAim, planSection, motifsOf, addLog,
    addRequest, setRequestStatus, waitingRequests,
    setOutline, positionOf, currentAct, activeBeat, beatsOf, finishBeat, editBeat, lockBeat, removeBeat, addBeat,
    mergeArchivistTension, addOwnReading, tensionNow, startAt, replaceBeat,
    volumeComplete, closeVolume, startVolume, editVolume, previousVolumesText,
} from './model.js';
import { shapeOf, tensionAim } from './shapes.js';
import { questBoard } from '../quests/sync.js';
import {
    buildDayPrompt, readDayPlan, buildCheckPrompt, readCheck, buildInspirePrompt, readInspiration, buildOutlinePrompt, readOutline,
    buildBeatPrompt, readBeat, buildRecapPrompt, readRecap,
} from './prompts.js';

export const PLANNER_EVENT = 'scenario_builder_planner';

let status = { running: '', chatKey: null, error: '' };

export function getPlannerStatus() {
    return { ...status };
}

function announce() {
    try {
        SillyTavern.getContext().eventSource.emit(PLANNER_EVENT, getPlannerStatus());
    } catch {
        // No event bus.
    }
}

function plannerSettings() {
    return getSettings().planner;
}

const isOn = () => plannerSettings().enabled === true && isActive();

// The open chat's messages, oldest first: [{ name, text, isUser }].
function chatMessages(max = 8) {
    const chat = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system && typeof m.mes === 'string');
    return chat.slice(-max).map((m) => ({ name: m.name, text: m.mes, isUser: !!m.is_user }));
}

const userName = () => SillyTavern.getContext().name1 ?? '';

// One pass at a time per chat; a pass of the same kind already queued is
// not queued again.
const queued = new Set();

async function runPass(kind, chatKey, fn) {
    const id = `${chatKey}|${kind}`;
    if (queued.has(id)) return null;
    queued.add(id);
    const started = Date.now();
    status = { running: kind, chatKey, error: '' };
    announce();
    try {
        const outcome = await fn();
        updateChatDoc(chatKey, (d) => addLog(d.gm, { pass: kind, ms: Date.now() - started, outcome: outcome ?? 'done' }));
        return outcome;
    } catch (err) {
        console.warn(LOG_PREFIX, `the planner's ${kind} pass failed`, err);
        const error = String(err?.message ?? err);
        updateChatDoc(chatKey, (d) => addLog(d.gm, { pass: kind, ms: Date.now() - started, outcome: 'failed', error }));
        status = { ...status, error };
        return null;
    } finally {
        queued.delete(id);
        status = { ...status, running: '' };
        announce();
    }
}

async function ask({ system, prompt }, maxTokens = 0) {
    const raw = await callModel([{ role: 'system', content: system }, { role: 'user', content: prompt }], Math.max(plannerSettings().maxTokens || 1200, maxTokens));
    const json = readModelJson(raw);
    if (!json) throw new Error('The model\'s answer was not JSON.');
    return json;
}

// ---------------------------------------------------------------- the story (§5)

// Where the story stands on its shape: { shape, position, act, beat, next,
// aim } (aim null without a reading; everything empty without a shape).
export function storyState(gm) {
    const shape = shapeOf(gm.shape);
    if (!shape) return { shape: null, position: 0, act: null, beat: null, next: null, aim: null };
    const position = positionOf(gm.outline);
    const { now, recent } = tensionNow(gm);
    const beat = activeBeat(gm.outline);
    const beats = beatsOf(gm.outline);
    const next = beat ? beats.slice(beats.indexOf(beat) + 1).find((b) => b.status === 'pending') ?? null : null;
    return { shape, position, act: currentAct(gm.outline)?.act ?? null, beat, next, aim: tensionAim(shape, position, now, recent) };
}

// For the passes' prompts: { shape, act, beat, next, aim } as words.
function storyWords(gm) {
    const s = storyState(gm);
    if (!s.shape) return null;
    return { shape: s.shape.label, act: s.act?.title ?? '', beat: s.beat?.text ?? '', next: s.next?.text ?? '', aim: s.aim };
}

// Archivist's tension readings, taken into the chat's own copy; a new
// compile asks for an OUTLINE review. Never throws.
async function refreshTension(chatKey) {
    try {
        const archivist = window.StateEngineArchivist;
        if (typeof archivist?.getCompiledMemory !== 'function') return;
        const compiled = await archivist.getCompiledMemory();
        if (!compiled) return;
        const gm = getChatDoc(chatKey).gm;
        const compiledAt = String(compiled.compiledAt ?? '');
        const fresh = compiledAt && compiledAt !== gm.counters.lastCompiled;
        if (!fresh && !(compiled.tension ?? []).length) return;
        updateChatDoc(chatKey, (d) => {
            mergeArchivistTension(d.gm, compiled.tension ?? []);
            if (fresh) {
                // The first compile seen is only remembered.
                if (d.gm.counters.lastCompiled) d.gm.outlineWanted = true;
                d.gm.counters.lastCompiled = compiledAt;
            }
        });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read Archivist\'s tension', err);
    }
}

const hasArchivistTension = (gm) => gm.tension.some((r) => r.source === 'archivist');

// A chat this long is well past its beginning: the outline takes the story
// over where it is.
const UNDER_WAY_AFTER = 12;

// What has happened so far, for an outline written onto a story already
// under way: the user's own note, Archivist's story summary, its major
// events and open threads, and the quests. '' when there is nothing.
async function storySoFar(gm, guidance) {
    const lines = [];
    // The finished volumes come first: the story's own record of itself.
    const earlier = previousVolumesText(gm);
    if (earlier) lines.push('Earlier volumes:', earlier);
    if (gm.join.note) lines.push(`From the user: ${gm.join.note}`);
    try {
        const compiled = typeof window.StateEngineArchivist?.getCompiledMemory === 'function' ? await window.StateEngineArchivist.getCompiledMemory() : null;
        if (compiled?.story_summary) lines.push(`Summary: ${compiled.story_summary}`);
        const major = (compiled?.timeline ?? []).filter((e) => e?.major && e.text).slice(-15);
        if (major.length) lines.push('Major events, in order:', ...major.map((e) => `- ${e.text}`));
        const open = (compiled?.threads ?? []).filter((t) => t?.title && (t.status === 'open' || t.status === 'active')).slice(0, 10);
        if (open.length) lines.push('Open threads:', ...open.map((t) => `- ${t.title}${t.progress ? `: ${t.progress}` : ''}`));
        if (compiled?.scene_summary) lines.push(`Where things stand: ${compiled.scene_summary}`);
    } catch (err) {
        console.warn(LOG_PREFIX, 'no story summary from Archivist', err);
    }
    const quests = (guidance.quests ?? []).filter((q) => q?.name).slice(0, 8);
    if (quests.length) lines.push('Quests in play:', ...quests.map((q) => `- ${q.name}${q.current ? `: now - ${q.current}` : ''}`));
    return lines.join('\n');
}

// Writes the outline, or reviews it against the story (`rewrite`: starts
// it over, keeping what is done and - unless keepLocked is false - what
// the user locked).
export async function runOutline(chatId, chatKey, { rewrite = false, keepLocked = true, wish = '' } = {}) {
    return runPass('outline', chatKey, async () => {
        await refreshTension(chatKey);
        const doc = getChatDoc(chatKey);
        const shape = shapeOf(doc.gm.shape);
        if (!shape) return 'no story shape chosen';
        const settingId = await getBoundSettingId(chatId);
        const inputs = await gatherInputs(chatId, chatKey);
        const guidance = inputs.guidance;
        const { sceneContext } = await import('../director/run.js');
        const ctx = await sceneContext(chatId, chatKey, settingId, guidance);
        const writing = !doc.gm.outline || rewrite;
        const chatLength = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system).length;
        const startIndex = writing && doc.gm.join.act >= 0 && doc.gm.join.act < shape.acts.length ? doc.gm.join.act : -1;
        // A new volume's first outline (nothing played out in it yet)
        // starts at its first chapter, steered by what the user asked for.
        const volume = doc.gm.volume;
        const newVolume = writing && volume.number > 1 && !beatsOf(doc.gm.outline).some((b) => b.status === 'done') ? { number: volume.number } : null;
        if (newVolume && !wish) wish = volume.direction;
        const parsed = readOutline(await ask(buildOutlinePrompt({
            dossier: dossierText({ ...guidance, ...ctx }),
            userName: userName(),
            messages: chatMessages(writing ? 12 : 8),
            shape,
            outline: doc.gm.outline,
            tension: tensionNow(doc.gm),
            motifs: motifsOf(doc.gm),
            gmStyle: guidance.overview?.gmStyle ?? '',
            rewrite,
            keepLocked,
            wish,
            storySoFar: await storySoFar(doc.gm, guidance),
            underWay: chatLength > UNDER_WAY_AFTER,
            startAct: startIndex >= 0 ? { index: startIndex, title: shape.acts[startIndex].title } : null,
            newVolume,
        })));
        if (!parsed) throw new Error('The outline had no beats in it.');
        updateChatDoc(chatKey, (d) => {
            setOutline(d.gm, parsed, { turn: d.gm.counters.turn, keepLocked: !rewrite || keepLocked });
            // The user said where the story is: the outline starts there,
            // whatever the model made of it.
            if (startIndex >= 0) startAt(d.gm, startIndex);
            d.gm.counters.sinceOutline = 0;
            d.gm.outlineWanted = false;
        });
        const beats = beatsOf(getChatDoc(chatKey).gm.outline).length;
        return `${parsed.acts.length} act${parsed.acts.length === 1 ? '' : 's'}, ${beats} beats`;
    });
}

// Writes one beat of the outline again (the user did not like it). wish:
// the user's steer, or ''.
export async function runBeat(chatId, chatKey, beatId, wish = '') {
    return runPass('beat', chatKey, async () => {
        const doc = getChatDoc(chatKey);
        const shape = shapeOf(doc.gm.shape);
        if (!shape || !beatsOf(doc.gm.outline).some((b) => b.id === beatId)) return 'that beat is gone';
        const settingId = await getBoundSettingId(chatId);
        const inputs = await gatherInputs(chatId, chatKey);
        const guidance = inputs.guidance;
        const { sceneContext } = await import('../director/run.js');
        const ctx = await sceneContext(chatId, chatKey, settingId, guidance);
        const beat = readBeat(await ask(buildBeatPrompt({
            dossier: dossierText({ ...guidance, ...ctx }),
            userName: userName(),
            messages: chatMessages(6),
            shape,
            outline: doc.gm.outline,
            beatId,
            wish,
            storySoFar: await storySoFar(doc.gm, guidance),
        })));
        if (!beat) throw new Error('No beat came back.');
        let changed = false;
        updateChatDoc(chatKey, (d) => { changed = replaceBeat(d.gm, beatId, beat); });
        return changed ? 'beat rewritten' : 'that beat has already played out';
    });
}

// ---------------------------------------------------------------- passes

// Plans the day (or, `rest`, the rest of a day already under way).
export async function runDay(chatId, chatKey, { rest = false } = {}) {
    return runPass('day', chatKey, async () => {
        const settingId = await getBoundSettingId(chatId);
        const inputs = await gatherInputs(chatId, chatKey);
        const guidance = inputs.guidance;
        const { sceneContext } = await import('../director/run.js');
        const ctx = await sceneContext(chatId, chatKey, settingId, guidance);
        const doc = getChatDoc(chatKey);
        const sameDay = doc.gm.day?.day === doc.canonical.day;
        const { system, prompt } = buildDayPrompt({
            dossier: dossierText({ ...guidance, ...ctx }),
            dateText: guidance.clock?.words ?? '',
            dayPart: guidance.clock?.dayPart ?? doc.canonical.dayPart,
            userName: userName(),
            messages: chatMessages(),
            requests: waitingRequests(doc.gm).concat(doc.gm.queue.filter((r) => r.status === 'planned')),
            motifs: motifsOf(doc.gm),
            gmStyle: guidance.overview?.gmStyle ?? '',
            previous: sameDay ? doc.gm.day : null,
            rest: rest || sameDay,
            story: storyWords(doc.gm),
        });
        const plan = readDayPlan(await ask({ system, prompt }));
        if (!plan) throw new Error('The plan had no moments in it.');
        updateChatDoc(chatKey, (d) => {
            setDayPlan(d.gm, plan, { day: d.canonical.day, turn: d.gm.counters.turn });
            d.gm.counters.sinceCheck = 0;
            d.gm.counters.lastCheck = new Date().toISOString();
            d.gm.checkWanted = false;
        });
        return `${plan.moments.length} moment${plan.moments.length === 1 ? '' : 's'} planned`;
    });
}

// Keeps the day's plan in step with the story.
export async function runCheck(chatId, chatKey) {
    return runPass('check', chatKey, async () => {
        await refreshTension(chatKey);
        const doc = getChatDoc(chatKey);
        if (!doc.gm.day) return 'no plan to check';
        const inputs = await gatherInputs(chatId, chatKey);
        const beat = activeBeat(doc.gm.outline);
        const askTension = !!doc.gm.shape && !hasArchivistTension(doc.gm);
        const { system, prompt } = buildCheckPrompt({
            userName: userName(),
            messages: chatMessages(6),
            moments: doc.gm.day.moments,
            requests: waitingRequests(doc.gm),
            dayPart: inputs.guidance.clock?.dayPart ?? doc.canonical.dayPart,
            beat: beat?.text ?? '',
            askTension,
        });
        const check = readCheck(await ask({ system, prompt }));
        updateChatDoc(chatKey, (d) => {
            applyCheck(d.gm, check);
            d.gm.counters.sinceCheck = 0;
            d.gm.counters.lastCheck = new Date().toISOString();
            d.gm.checkWanted = false;
            // The story's beat played out: the outline moves on.
            if (check.beatDone && beat) finishBeat(d.gm, beat.id);
            if (askTension && check.tension) addOwnReading(d.gm, check.tension, { index: d.gm.counters.turn });
        });
        return [check.done.length && `${check.done.length} done`, check.skipped.length && `${check.skipped.length} dropped`, check.add.length && `${check.add.length} added`, check.beatDone && beat && 'beat done'].filter(Boolean).join(', ') || 'plan still holds';
    });
}

// Distils one inspiration text into motifs.
export async function runInspire(chatKey, id) {
    return runPass('inspire', chatKey, async () => {
        const item = getChatDoc(chatKey).gm.inspirations.find((x) => x.id === id);
        if (!item) return 'gone';
        let motifs = [];
        let error = '';
        try {
            motifs = readInspiration(await ask(buildInspirePrompt(item)), item.text);
            if (!motifs.length) error = 'No motifs came out of it - try again.';
        } catch (err) {
            error = String(err?.message ?? err);
        }
        updateChatDoc(chatKey, (d) => {
            const x = d.gm.inspirations.find((y) => y.id === id);
            if (x) { x.motifs = motifs; x.error = error; }
        });
        if (error) throw new Error(error);
        return `${motifs.length} motifs`;
    });
}

// ---------------------------------------------------------------- after a reply

// Remembered between replies (not stored): the last AI message seen per
// chat, so a background call's own generation events never count as a
// reply; and whether the director saw something change this turn.
const lastSeen = new Map();
const activeHint = new Map();

// The director marks a turn in which something changed (someone came or
// went, a beat was done, the scene moved).
export function markActive(chatKey) {
    activeHint.set(chatKey, true);
}

// Called when a reply has been written. Keeps the pace count and runs the
// passes that are due, in the background.
export async function afterReply(chatId, chatKey) {
    try {
        if (!isOn() || !chatId || !chatKey) return;
        const chat = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system);
        const last = chat[chat.length - 1];
        if (!last || last.is_user || typeof last.mes !== 'string') return;
        const stamp = `${chat.length}|${last.mes.length}|${last.mes.slice(0, 40)}`;
        if (lastSeen.get(chatKey) === stamp) return;
        lastSeen.set(chatKey, stamp);
        const settingId = await getBoundSettingId(chatId);
        if (!settingId) return;

        const lastUser = [...chat].reverse().find((m) => m.is_user)?.mes ?? '';
        const active = activeHint.get(chatKey) === true;
        activeHint.delete(chatKey);
        updateChatDoc(chatKey, (d) => {
            trackPace(d.gm, { sceneKey: `${d.canonical.locationId}|${d.canonical.sceneTitle}`, active, userText: lastUser });
            d.gm.counters.turn += 1;
            d.gm.counters.sinceCheck += 1;
            d.gm.counters.sinceOutline += 1;
        });
        await refreshTension(chatKey);
        const doc = getChatDoc(chatKey);
        const p = plannerSettings();
        const due = duePasses(doc.gm, { day: doc.canonical.day, turn: doc.gm.counters.turn, level: p.level, checkEvery: p.checkEvery, dayExpire: p.dayExpire, outlineEvery: p.outlineEvery });
        for (const x of doc.gm.inspirations.filter((i) => !i.motifs.length && !i.error)) void runInspire(chatKey, x.id);
        // The outline first: the day plan follows the story's direction.
        void (async () => {
            if (due.includes('outline')) await runOutline(chatId, chatKey);
            if (due.includes('day')) await runDay(chatId, chatKey);
            else if (due.includes('check')) await runCheck(chatId, chatKey);
        })();
    } catch (err) {
        console.warn(LOG_PREFIX, 'the planner could not follow the reply', err);
    }
}

// ---------------------------------------------------------------- the director's side

// A reading this high is a fight or a confrontation: the pace never moves
// the story on from it.
const TENSE = 4;

// The GM PLAN section for the director's prompt ('' when off or empty).
// messages: the director's recent messages.
export function directorPlan(chatKey, messages) {
    try {
        const p = plannerSettings();
        if (p.enabled !== true) return '';
        const gm = getChatDoc(chatKey).gm;
        const recentUser = (messages ?? []).filter((m) => m.isUser).slice(-3).map((m) => m.text);
        const pending = (gm.day?.moments ?? []).filter((m) => m.status === 'pending');
        // The plan pulls when its next moment is set for later or elsewhere.
        const pull = pending.length > 0 && pending.some((m) => m.trigger || (m.when && m.when !== 'any time'));
        const story = storyState(gm);
        const tense = (tensionNow(gm).now?.overall ?? 0) >= TENSE;
        const pace = paceAim(gm, { level: p.pacing, recentUser, tense, pull });
        return planSection(gm, { pace, aim: story.aim, story: { shape: story.shape?.label ?? '', act: story.act?.title ?? '' }, motifs: motifsOf(gm, 3) });
    } catch (err) {
        console.warn(LOG_PREFIX, 'no GM plan for the director', err);
        return '';
    }
}

// The director's BEAT lines: moments done or skipped. A skipped one asks
// for a CHECK on the next pass.
export function takeBeats(chatKey, beats) {
    if (!beats?.length) return;
    try {
        let done = false;
        updateChatDoc(chatKey, (d) => {
            applyBeats(d.gm, beats);
            done = beats.some((b) => b.status === 'done');
        });
        if (done) markActive(chatKey);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not record the director\'s beats', err);
    }
}

// ---------------------------------------------------------------- the user's side (GM Plan tab)

export function queueRequest(chatKey, text, urgency) {
    let made = null;
    updateChatDoc(chatKey, (d) => { made = addRequest(d.gm, { id: newLocalId('req'), text, urgency, at: new Date().toISOString() }); });
    return made;
}

export function withdrawRequest(chatKey, id) {
    updateChatDoc(chatKey, (d) => setRequestStatus(d.gm, id, 'withdrawn'));
}

export function addInspiration(chatKey, title, text) {
    const id = newLocalId('insp');
    updateChatDoc(chatKey, (d) => {
        d.gm.inspirations = [...d.gm.inspirations, { id, title: String(title ?? '').trim(), text: String(text ?? ''), motifs: [], at: new Date().toISOString(), error: '' }];
    });
    if (isOn()) void runInspire(chatKey, id);
    return id;
}

export function removeInspiration(chatKey, id) {
    updateChatDoc(chatKey, (d) => { d.gm.inspirations = d.gm.inspirations.filter((x) => x.id !== id); });
}

export function setMotifs(chatKey, id, motifs) {
    updateChatDoc(chatKey, (d) => {
        const x = d.gm.inspirations.find((y) => y.id === id);
        if (x) { x.motifs = motifs; x.error = ''; }
    });
}

export function peek(chatKey, id) {
    updateChatDoc(chatKey, (d) => { d.gm.peeked = [...d.gm.peeked, id]; });
}

export function setHold(chatKey, hold) {
    updateChatDoc(chatKey, (d) => { d.gm.pace.hold = hold === true; });
}

// The story's shape. A new shape on an existing outline asks for a review
// on the next pass (the user can also rewrite it at once).
export function setShape(chatKey, shapeId) {
    updateChatDoc(chatKey, (d) => {
        if (d.gm.shape === shapeId) return;
        d.gm.shape = shapeOf(shapeId) ? shapeId : '';
        if (d.gm.outline) d.gm.outlineWanted = true;
    });
}

export function editOutlineBeat(chatKey, id, text) {
    updateChatDoc(chatKey, (d) => editBeat(d.gm, id, text));
}

export function lockOutlineBeat(chatKey, id, locked) {
    updateChatDoc(chatKey, (d) => lockBeat(d.gm, id, locked));
}

export function removeOutlineBeat(chatKey, id) {
    updateChatDoc(chatKey, (d) => removeBeat(d.gm, id));
}

export function addOutlineBeat(chatKey, actId, text) {
    let beat = null;
    updateChatDoc(chatKey, (d) => { beat = addBeat(d.gm, actId, text); });
    return beat;
}

export function finishOutlineBeat(chatKey, id) {
    updateChatDoc(chatKey, (d) => finishBeat(d.gm, id));
}

export function setOutlineText(chatKey, patch) {
    updateChatDoc(chatKey, (d) => {
        if (!d.gm.outline) return;
        if (typeof patch.premise === 'string') d.gm.outline.premise = patch.premise.trim();
    });
}

// Where a story already under way stands, for the next outline written:
// act (index into the shape's acts; -1 = let the planner judge) and the
// user's note on the story so far.
export function setJoin(chatKey, patch) {
    updateChatDoc(chatKey, (d) => {
        if (Number.isInteger(patch.act)) d.gm.join.act = patch.act;
        if (typeof patch.note === 'string') d.gm.join.note = patch.note.trim();
    });
}

// ---------------------------------------------------------------- volumes (§5.1)

// A recap's length: longer for a longer volume, within reason.
const recapWords = (replies) => Math.max(400, Math.min(1000, 300 + replies * 6));
// Room for the longest recap and its JSON.
const RECAP_TOKENS = 2000;

// Writes the recap of the volume under way, files it away and begins the
// next volume on `shape` with the user's steer. Nothing changes if the
// recap fails. -> an outcome line, or null on failure.
export async function finishVolume(chatId, chatKey, { shape = '', direction = '' } = {}) {
    return runPass('recap', chatKey, async () => {
        const doc = getChatDoc(chatKey);
        const gm = doc.gm;
        const settingId = await getBoundSettingId(chatId);
        let summary = '';
        let events = [];
        try {
            const compiled = typeof window.StateEngineArchivist?.getCompiledMemory === 'function' ? await window.StateEngineArchivist.getCompiledMemory() : null;
            summary = compiled?.story_summary ?? '';
            events = (compiled?.timeline ?? []).filter((e) => e?.major && e.text && (!Number.isInteger(e.message_index) || e.message_index >= gm.volume.startedIndex)).map((e) => e.text).slice(-20);
        } catch (err) {
            console.warn(LOG_PREFIX, 'no Archivist summary for the recap', err);
        }
        let quests = [];
        try {
            quests = settingId ? (await questBoard(chatId, chatKey, settingId)).map((q) => ({ name: q.name, status: q.status })) : [];
        } catch (err) {
            console.warn(LOG_PREFIX, 'no quests for the recap', err);
        }
        const complete = volumeComplete(gm.outline);
        const recap = readRecap(await ask(buildRecapPrompt({
            userName: userName(),
            number: gm.volume.number,
            shape: shapeOf(gm.shape)?.label ?? '',
            outline: gm.outline,
            chronicle: gm.volume.chronicle,
            summary,
            events,
            quests,
            previous: previousVolumesText(gm, { full: false }),
            closedEarly: !complete,
            words: recapWords(gm.counters.turn - gm.volume.startedTurn),
        }), RECAP_TOKENS));
        if (!recap) throw new Error('The recap came back empty.');
        const index = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system).length;
        let record = null;
        updateChatDoc(chatKey, (d) => {
            record = closeVolume(d.gm, recap, { shape: shapeOf(d.gm.shape)?.label ?? '', turn: d.gm.counters.turn, day: d.canonical.day, index, closedEarly: !complete });
            startVolume(d.gm, { shape: shapeOf(shape) ? shape : d.gm.shape, direction, turn: d.gm.counters.turn, day: d.canonical.day, index });
        });
        return `"${record.title}" filed; volume ${record.number + 1} begins`;
    });
}

export function editFinishedVolume(chatKey, number, patch) {
    updateChatDoc(chatKey, (d) => editVolume(d.gm, number, patch));
}
