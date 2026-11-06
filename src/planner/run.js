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
import { opposedJobs, jobsLine, planTexts } from './aims.js';
import { timedHappenings, notYet } from './timed.js';
import { closesOut, nextThingLine } from '../guidance/wrapped.js';
import { presenceFrom, takingPart, absentSince, isKnownPerson } from './presence.js';
import { getSettings, isActive } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { getBoundSettingId, listEntries, getObjectTypes, createEntry, updateEntry, isCanonOnly, mayAddGeneratedDetail, allKnowledge, playerIdOf, setParent } from '../library/library.js';
import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { setQuestMeta, questMeta } from '../quests/sync.js';
import { callModel, plannerConnection } from '../generate/llm.js';
import { fitOutlinePrompt, promptBudget } from './fit.js';
import { readModelJson } from '../generate/prompt.js';
import { plannerTriggers, retirePlannerTriggers, latestUserIndex } from '../triggers/run.js';
import { gatherInputs } from '../guidance/sync.js';
import { dossierText, knownAs, relevance } from '../director/prompt.js';
import { triggerSection,
    duePasses, setDayPlan, applyCheck, applyBeats, trackPace, paceAim, planSection, motifsOf, addLog,
    addRequest, setRequestStatus, waitingRequests,
    setOutline, positionOf, currentAct, activeBeat, beatsOf, finishBeat, restoreBeat, editBeat, lockBeat, removeBeat, addBeat, moveBeat, stepBeat,
    mergeArchivistTension, addOwnReading, tensionNow, startAt, replaceBeat, unseenTies, undoUnseenBeats, newcomerWait, FIRM_AFTER,
    stampBeats, beatFrom, dueSection, dueToday, setByStory, readWhen,
    volumeComplete, closeVolume, startVolume, editVolume, previousVolumesText, removeChronicle,
    addIdeas, resolveIdea, editIdea, addHappening, removeHappening, dueHappenings, settleAgenda, addSeed, frictionLines, factionsOutOfPlay,
    removeFromDay, planBehindBeat, addSettled, removeSettled, settledSection, keptSettled, arrivalReasons,
} from './model.js';
import { shapeOf, tensionAim } from './shapes.js';
import { companyLines } from '../director/company.js';
import { questBoard } from '../quests/sync.js';
import { stillWaiting } from '../director/suspended.js';
import {
    buildDayPrompt, readDayPlan, buildCheckPrompt, readCheck, buildInspirePrompt, readInspiration, buildOutlinePrompt, readOutline, wholeOutline, outlineToCome,
    buildBeatPrompt, readBeat, buildRecapPrompt, readRecap, readRecapText, closeCutJson, buildIdeasPrompt, readIdeas,
    buildSteerObjectsPrompt, readSteerObjects, buildStarterPrompt, readStarter, writesForPlayer, withoutPlayerBeats, playerLed,
} from './prompts.js';
import { storyLogicLines, buildOutlineCheckPrompt, readOutlineCheck, applyOutlineCheck, newBeatsToCome } from './logic.js';
import { povRule } from '../director/perspective.js';
import { livePoolFor, byType } from '../naming/run.js';
import { poolLine } from '../naming/live.js';
import { worldForDay, worldMoves, worldDueNow, noteRipples, meanwhileFor } from '../world/run.js';
import { buildWorldPrompt, readWorld } from '../world/prompts.js';

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

// What a pass judges done by: the chat a CHECK reads, and a little more.
const SEEN_MESSAGES = 12;
const seenTexts = (max = SEEN_MESSAGES) => chatMessages(max).map((m) => m.text);

// The chat from index `from` on (SillyTavern's own indexes), its messages'
// texts; the index of the latest message.
function textsFrom(from = 0) {
    const chat = SillyTavern.getContext().chat ?? [];
    return chat.slice(Math.max(0, from)).filter((m) => m && !m.is_system && typeof m.mes === 'string').map((m) => m.mes);
}
const latestIndex = () => (SillyTavern.getContext().chat ?? []).length - 1;
// Where a beat seen under way now began: the latest exchange counts for it.
const stampIndex = () => Math.max(0, latestIndex() - 1);
// A beat's people seen since it was under way (src/planner/model.js beatFrom).
const beatTexts = (gm) => (beat) => textsFrom(beatFrom(gm, beat));

// The beat's people the story has not shown since the beat began: the
// beat has to bring them to the player, or it never plays out. Someone
// named long before (Inji, a hundred messages back) still has to come for
// this beat.
// Named is not there: someone the beat has taking part who has not been in
// the scene since it began (Zane, only talked of in Adam's plan) is still to
// come too. doc: the chat document (its presence record).
function beatNewcomers(gm, doc = null) {
    const beat = activeBeat(gm.outline);
    if (!beat?.ties?.length) return [];
    const unnamed = unseenTies(beat.ties, beatTexts(gm)(beat), userName());
    if (!doc) return unnamed;
    const away = absentSince(takingPart(beat.text, beat.ties, { isPerson: isKnownPerson, player: userName() }), presentNow(doc), beatFrom(gm, beat));
    return [...new Set([...unnamed, ...away])];
}

// Who has been in the scene, and when: the record, and the company samples
// from before it was kept.
const presentNow = (doc) => presenceFrom(doc?.company?.samples, doc?.present);

// A day moment's people not in the scene since the plan was made.
const absentFor = (doc) => (m) => {
    const since = Number.isInteger(doc?.gm?.day?.madeIndex) && doc.gm.day.madeIndex >= 0 ? doc.gm.day.madeIndex : 0;
    return absentSince(takingPart(m.text, m.ties, { isPerson: isKnownPerson, player: userName() }), presentNow(doc), since);
};

// Of those, the ones the story has shown before: they come back - they are
// no strangers to anyone they have met.
function beatReturning(gm, newcomers = beatNewcomers(gm)) {
    if (!newcomers.length) return [];
    const never = new Set(unseenTies(newcomers, textsFrom(0), userName()));
    return newcomers.filter((n) => !never.has(n));
}

// The newcomers the beat has waited on past the firm line (FIRM_AFTER
// replies): the director brings them into the scene itself - told to,
// the game master only ever wrote Adam's arrival as what comes "Next". []
// with the planner off.
export function overdueNewcomers(chatKey) {
    try {
        if (plannerSettings().enabled !== true) return [];
        const doc = getChatDoc(chatKey);
        const beat = activeBeat(doc.gm.outline);
        if (!beat || doc.gm.newcomer?.beatId !== beat.id || doc.turn - doc.gm.newcomer.since < FIRM_AFTER) return [];
        return beatNewcomers(doc.gm, doc);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read the beat\'s newcomers', err);
        return [];
    }
}

// Those the beat now is waiting on, the firm line passed or not: the game
// master may bring them to the player though they have been away a while.
// [] with the planner off.
export function beatWaitingOn(chatKey) {
    try {
        if (plannerSettings().enabled !== true) return [];
        const doc = getChatDoc(chatKey);
        return beatNewcomers(doc.gm, doc);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read who the beat waits on', err);
        return [];
    }
}

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
        updateChatDoc(chatKey, (d) => addLog(d.gm, { pass: kind, ms: Date.now() - started, outcome: 'failed', error, answer: err?.answer ?? '' }));
        status = { ...status, error };
        return null;
    } finally {
        queued.delete(id);
        status = { ...status, running: '' };
        announce();
    }
}

// One planner question. An answer that is not JSON is asked for once more;
// `salvage(raw)` (when given) then reads what it can of a second bad answer.
async function ask({ system, prompt }, maxTokens = 0, { salvage = null } = {}) {
    const tokens = Math.max(plannerSettings().maxTokens || 1200, maxTokens);
    const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    // The planner's own connection, when one is chosen.
    const use = plannerConnection();
    const raw = await callModel(messages, tokens, use);
    const json = readModelJson(raw);
    if (json) return json;
    console.info(LOG_PREFIX, 'the planner\'s answer was not JSON - asking again');
    const again = await callModel([...messages, { role: 'assistant', content: String(raw ?? '').slice(0, 4000) }, { role: 'user', content: 'That answer could not be read. Reply again with ONLY the JSON object asked for - start with { and end with }, with every quote inside a text escaped as \\" and paragraphs as \\n.' }], tokens, use);
    const second = readModelJson(again);
    if (second) return second;
    const saved = salvage?.(again) ?? salvage?.(raw);
    if (saved) return saved;
    throw Object.assign(new Error('The model\'s answer was not JSON.'), { answer: String(again || raw || '') });
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
    // What the story settled outweighs any summary that says otherwise.
    if (keptSettled(gm.settled).length) lines.push('Settled in the story (true, whatever the summary below says):', ...keptSettled(gm.settled).map((x) => `- ${x.text}`));
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

// The story's logic for an outline pass (src/planner/logic.js). Never throws.
async function logicFor(chatId, settingId, gm, wish = '') {
    try {
        const known = await knownEntries(chatId, settingId).catch(() => []);
        const nameOf = (id) => known.find((e) => e.id === id)?.name ?? '';
        return storyLogicLines({
            knowledge: settingId ? await allKnowledge(settingId, nameOf).catch(() => []) : [],
            settled: keptSettled(gm.settled).map((x) => x.text),
            jobs: jobsLine(opposedJobs(planTexts(gm), { player: [userName()] }), userName()),
            wish: [...new Set([wish, gm.volume?.outlineWish, gm.volume?.direction].map((w) => String(w ?? '').trim()).filter(Boolean))].join(' '),
        });
    } catch (err) {
        console.warn(LOG_PREFIX, 'no story logic for the outline', err);
        return [];
    }
}

// Writes the outline, or reviews it against the story (`rewrite`: starts
// it over, keeping what is done and - unless keepLocked is false - what
// the user locked).
export async function runOutline(chatId, chatKey, { rewrite = false, keepLocked = true, wish = '' } = {}) {
    return runPass('outline', chatKey, async () => {
        await refreshTension(chatKey);
        // What the user asked of a regenerate is kept on the volume and
        // asked of every pass after it: sent once, the next reviews (every
        // few replies, without it) planned it away (Assassins Inc).
        if (rewrite) updateChatDoc(chatKey, (d) => { d.gm.volume.outlineWish = String(wish ?? '').trim(); });
        const doc = getChatDoc(chatKey);
        if (!String(wish ?? '').trim()) wish = doc.gm.volume.outlineWish;
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
        // The story's logic (src/planner/logic.js): who believes what is not
        // so, what is settled, whose job is whose, the user's turns - kept
        // whole when the prompt is trimmed, and what the check holds to.
        const logic = await logicFor(chatId, settingId, doc.gm, wish);
        const sofar = await storySoFar(doc.gm, guidance);
        // Fitted to the model's context, with room for the answer (fit.js).
        const fitted = fitOutlinePrompt({
            dossier: await dossierWithNames(chatId, settingId, guidance, ctx),
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
            // The volume's steer, on every pass - not only its first outline.
            steer: doc.gm.volume.direction,
            storySoFar: sofar,
            logic,
            underWay: chatLength > UNDER_WAY_AFTER,
            startAct: startIndex >= 0 ? { index: startIndex, title: shape.acts[startIndex].title } : null,
            newVolume,
            pacing: plannerSettings().pacing,
            untouched: await factionsToBringIn(chatId, settingId),
        }, promptBudget(plannerConnection().contextTokens, OUTLINE_TOKENS));
        if (fitted.trimmed.length) console.info(LOG_PREFIX, `the outline prompt was trimmed to fit the model's context (${fitted.tokens} of ${fitted.budget} tokens): ${fitted.trimmed.join(', ')}`);
        if (!fitted.fits) console.warn(LOG_PREFIX, `the outline prompt is still over the model's context after trimming (${fitted.tokens} of ${fitted.budget} tokens)`);
        const outlinePrompt = { system: fitted.system, prompt: fitted.prompt };
        const salvage = { salvage: (raw) => readModelJson(closeCutJson(raw)) };
        // A written outline (a first one, or a rewrite) needs beats still to
        // come. Assassins Inc's rewrite came back with only the beats the
        // story had done - taken in, the volume read as complete. Such an
        // answer is asked for once more, then turned away; the outline
        // before it stays.
        // Every chapter of the shape, too: a rewrite with fewer chapters
        // deleted the rest (chapters 2-4 of Assassins Inc's volume 3).
        const toCome = outlineToCome;
        const whole = (p) => wholeOutline(p, shape);
        let answer = await ask(outlinePrompt, OUTLINE_TOKENS, salvage);
        let parsed = readOutline(answer);
        if (writing && !whole(parsed)) {
            console.info(LOG_PREFIX, 'the outline came back without every chapter, or with nothing still to come - asking again');
            answer = await ask({
                system: outlinePrompt.system,
                prompt: `${outlinePrompt.prompt}\n\nIMPORTANT: the last answer was not a whole outline - it had fewer than ${shape.acts.length} acts, or only what the story has already done. Answer with all ${shape.acts.length} acts of the shape, in its order (${shape.acts.map((a) => a.title).join(', ')}). Keep the beats the story has done as they are, then write the beats still to come - status "pending" - from where the story is now.`,
            }, OUTLINE_TOKENS, salvage);
            parsed = readOutline(answer);
            if (parsed && !whole(parsed)) {
                throw Object.assign(new Error(`The outline came back with ${toCome(parsed) ? `${parsed.acts.length} of ${shape.acts.length} chapters` : 'no beats still to come'} - the outline before it is kept (the answer is in the planner log).`), { answer: JSON.stringify(answer) });
            }
        }
        if (!parsed) {
            // What came back, so a new shape can be read next time.
            console.warn(LOG_PREFIX, 'the outline answer had no beats Scenario Builder could read:', JSON.stringify(answer).slice(0, 2000));
            throw Object.assign(new Error('The outline had no beats in it (the answer is kept in the planner log).'), { answer: JSON.stringify(answer) });
        }
        // Beats to come that the player character leads never happen: the
        // planner does not play them (the user's locked beats stay).
        const lockedIds = beatsOf(getChatDoc(chatKey).gm.outline).filter((b) => b.locked).map((b) => b.id);
        const pruned = withoutPlayerBeats(parsed, [userName()], lockedIds);
        if (pruned.dropped.length) console.info(LOG_PREFIX, `the outline's beats for ${userName()} to play were left out:`, pruned.dropped);
        parsed = pruned.outline;
        // Checked before it is kept (settings.planner.checkOutline): one more
        // call, only when it is newly written or its beats to come changed.
        let checked = '';
        if (plannerSettings().checkOutline !== false && (writing || newBeatsToCome(parsed, beatsOf(doc.gm.outline)))) {
            try {
                const check = readOutlineCheck(await ask(buildOutlineCheckPrompt({ userName: userName(), logic, outline: parsed, lockedIds, writing, storySoFar: sofar }), CHECK_TOKENS));
                const applied = applyOutlineCheck(parsed, check, { lockedIds, writing, playerLed: (t) => playerLed(t, [userName()]) });
                if (applied.changed.length) {
                    console.info(LOG_PREFIX, 'the outline check fixed:', applied.changed);
                    parsed = applied.outline;
                }
                checked = applied.changed.length ? `; checked - ${applied.changed.length} fixed: ${applied.changed.join(' | ')}` : '; checked - nothing to fix';
            } catch (err) {
                console.warn(LOG_PREFIX, 'the outline check failed - the outline is kept as written', err);
                checked = '; not checked (the check failed)';
            }
        }
        // The conditions the outline wants watched: story triggers.
        await plannerTriggers(chatId, chatKey, parsed.triggers ?? []);
        updateChatDoc(chatKey, (d) => {
            // A beat's people count only from when it was under way.
            const since = beatTexts(d.gm);
            setOutline(d.gm, parsed, { turn: d.gm.counters.turn, keepLocked: !rewrite || keepLocked, review: !writing, unseen: (b) => unseenTies(b.ties, since(b), userName()), index: latestIndex() });
            // The user said where the story is: the outline starts there,
            // whatever the model made of it.
            if (startIndex >= 0) startAt(d.gm, startIndex);
            stampBeats(d.gm, stampIndex());
            d.gm.counters.sinceOutline = 0;
            d.gm.outlineWanted = false;
        });
        const beats = beatsOf(getChatDoc(chatKey).gm.outline).length;
        return `${parsed.acts.length} act${parsed.acts.length === 1 ? '' : 's'}, ${beats} beats${checked}`;
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
            dossier: await dossierWithNames(chatId, settingId, guidance, ctx),
            userName: userName(),
            messages: chatMessages(6),
            shape,
            outline: doc.gm.outline,
            beatId,
            wish,
            // The volume's steer, on every pass - not only its first outline.
            steer: doc.gm.volume.direction,
            storySoFar: await storySoFar(doc.gm, guidance),
            logic: await logicFor(chatId, settingId, doc.gm, wish),
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
        // The world meanwhile moves with the new day (src/world/run.js).
        const world = sameDay ? null : await worldForDay(chatId, chatKey, settingId, { aim: storyState(doc.gm).aim, userName: userName() });
        const { system, prompt } = buildDayPrompt({
            dossier: await dossierWithNames(chatId, settingId, guidance, ctx),
            dateText: guidance.clock?.words ?? '',
            dayPart: guidance.clock?.dayPart ?? doc.canonical.dayPart,
            userName: userName(),
            messages: chatMessages(),
            requests: waitingRequests(doc.gm).concat(doc.gm.queue.filter((r) => r.status === 'planned')),
            motifs: motifsOf(doc.gm),
            gmStyle: guidance.overview?.gmStyle ?? '',
            // A plan for an earlier beat: only what played out of it, so its
            // leftovers do not come back.
            previous: sameDay ? (planBehindBeat(doc.gm) ? { ...doc.gm.day, moments: doc.gm.day.moments.filter((m) => m.status !== 'pending') } : doc.gm.day) : null,
            rest: rest || sameDay,
            story: storyWords(doc.gm),
            newcomers: beatNewcomers(doc.gm, doc),
            returning: beatReturning(doc.gm, beatNewcomers(doc.gm, doc)),
            company: companyLines(doc.company, { turn: doc.turn, player: userName() }),
            untouched: await factionsToBringIn(chatId, settingId),
            place: (guidance.location?.path ?? []).slice(-1)[0] ?? '',
            situation: doc.canonical.sceneSummary,
            settled: keptSettled(doc.gm.settled).map((x) => x.text),
            jobs: jobsLine(opposedJobs(planTexts(doc.gm), { player: [userName()] }), userName()),
            happenings: dueHappenings(doc.gm, doc.canonical.day, 1).map((x) => ({ id: x.id, text: x.text, when: x.when, due: x.day > doc.canonical.day ? 'tomorrow' : 'today', late: x.late, promise: x.source === 'promise' })),
            world: world?.part ?? null,
            // What the chat set a time for, beyond the last few messages ("a
            // major heist tonight at the Arcadia Museum"), and the beats to
            // come: the day plan saw only the gear being handed out, and
            // planned more of it.
            saidWhen: timedHappenings(chatMessages(40).map((m) => m.text).join('\n'), 6),
            coming: beatsOf(doc.gm.outline).filter((b) => b.status === 'pending').slice(0, 3).map((b) => b.text),
        });
        const plan = readDayPlan(await ask({ system, prompt }), { playerNames: [userName()] });
        if (!plan) throw new Error('The plan had no moments in it.');
        updateChatDoc(chatKey, (d) => {
            setDayPlan(d.gm, plan, { day: d.canonical.day, turn: d.gm.counters.turn, index: latestIndex() });
            d.gm.counters.sinceCheck = 0;
            d.gm.counters.lastCheck = new Date().toISOString();
            d.gm.checkWanted = false;
        });
        const moved = world && plan.world ? world.apply(plan.world) : null;
        if (moved) await takeWorldHooks(chatId, chatKey, settingId, moved.extras);
        const worldNote = moved && (moved.moved || moved.started || moved.situations) ? `; the world: ${worldWords(moved)}` : '';
        return `${plan.moments.length} moment${plan.moments.length === 1 ? '' : 's'} planned${worldNote}`;
    });
}

// What a pass did to the world, in a few words.
function worldWords(moved) {
    const n = moved.moved + moved.started;
    return `${n} scheme${n === 1 ? '' : 's'} moved${moved.started ? ` (${moved.started} new)` : ''}${moved.surfaced ? `, ${moved.surfaced} surfacing` : ''}${moved.changed ? `, ${moved.changed} change${moved.changed === 1 ? '' : 's'}` : ''}${moved.situations ? `, ${moved.situations} situation${moved.situations === 1 ? '' : 's'}` : ''}`;
}

// The world meanwhile's own pass (Lively and Turbulent - src/world/): the
// people and factions off scene move their schemes on, and some of it
// surfaces. Quiet moves the world in the DAY pass instead.
export async function runWorld(chatId, chatKey) {
    return runPass('world', chatKey, async () => {
        const settingId = await getBoundSettingId(chatId);
        if (!settingId) return 'no setting';
        const doc = getChatDoc(chatKey);
        const world = await worldMoves(chatId, chatKey, settingId, { aim: storyState(doc.gm).aim, userName: userName(), ownPass: true });
        if (!world) return 'nothing to move';
        const inputs = await gatherInputs(chatId, chatKey);
        const guidance = inputs.guidance;
        const { sceneContext } = await import('../director/run.js');
        const ctx = await sceneContext(chatId, chatKey, settingId, guidance);
        const answer = readWorld(await ask(buildWorldPrompt({
            dossier: await dossierWithNames(chatId, settingId, guidance, ctx),
            messages: chatMessages(4),
            userName: userName(),
            dateText: guidance.clock?.words ?? '',
            story: storyWords(doc.gm),
            world: world.part,
        })));
        const moved = world.apply(answer ?? { schemes: [] });
        await takeWorldHooks(chatId, chatKey, settingId, moved.extras);
        return moved.moved || moved.started || moved.situations ? worldWords(moved) : 'nobody acted';
    });
}

// Quest hooks the world surfaced: GM ideas like the ideas pass's own -
// proposed, or made at once in a setting set to add silently - never a
// second thing of a known name. A faction that split off (phase 3) is
// always a proposal, whatever the creation mode: a large change to the
// setting.
async function takeWorldHooks(chatId, chatKey, settingId, extras) {
    const hooks = (extras ?? []).filter((x) => x.way === 'hook');
    const splits = (extras ?? []).filter((x) => x.way === 'split');
    if ((!hooks.length && !splits.length) || !settingId || isCanonOnly(settingId)) return;
    try {
        const known = await knownEntries(chatId, settingId);
        const breakaways = splits.filter((x) => !knownAs(x.name, known)).map((x) => ({ kind: 'faction', name: x.name, text: x.text, why: x.why, ties: x.ties }));
        if (breakaways.length) updateChatDoc(chatKey, (d) => { addIdeas(d.gm, breakaways); });
        // A hook a mission giver is behind is that giver's mission
        // (src/quests/missions.js) - not a quest idea of its own.
        const { missionFromHook } = await import('../quests/missions.js');
        const left = [];
        for (const x of hooks.filter((h) => !knownAs(h.name, known))) if (!(await missionFromHook(chatId, chatKey, settingId, x))) left.push(x);
        const ideas = left.map((x) => ({ kind: 'quest', name: x.name, text: x.text, why: x.why, ties: x.ties }));
        if (!ideas.length) return;
        if (creationMode(settingId) === 'silent') {
            for (const idea of ideas) await applyIdea(chatId, chatKey, settingId, idea, { silent: true });
            updateChatDoc(chatKey, (d) => { for (const idea of addIdeas(d.gm, ideas)) resolveIdea(d.gm, idea.id, 'accepted'); });
        } else updateChatDoc(chatKey, (d) => { addIdeas(d.gm, ideas); });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not take in the quest hooks from the world', err);
    }
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
        const check = readCheck(await ask({ system, prompt }), { playerNames: [userName()] });
        // Nothing is done that the chat does not show: a moment's people,
        // and for the beat, a person no message has named yet.
        const seen = seenTexts();
        const beatDone = check.beatDone && beat && !beatNewcomers(doc.gm, doc).length;
        updateChatDoc(chatKey, (d) => {
            // Beats called done whose people never turned up are under way again.
            const back = undoUnseenBeats(d.gm, beatTexts(d.gm), userName(), textsFrom(0));
            if (back.length) console.info(LOG_PREFIX, `beats called done without ${back.join(', ')} in the story are back under way`);
            applyCheck(d.gm, check, { seen, player: userName(), absent: absentFor(d) });
            d.gm.counters.sinceCheck = 0;
            d.gm.counters.lastCheck = new Date().toISOString();
            d.gm.checkWanted = false;
            // The story's beat played out: the outline moves on.
            if (beatDone) finishBeat(d.gm, beat.id, { index: latestIndex() });
            stampBeats(d.gm, stampIndex());
            if (askTension && check.tension) addOwnReading(d.gm, check.tension, { index: d.gm.counters.turn });
        });
        return [check.done.length && `${check.done.length} done`, check.skipped.length && `${check.skipped.length} dropped`, check.add.length && `${check.add.length} added`, beatDone && 'beat done'].filter(Boolean).join(', ') || 'plan still holds';
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
            d.gm.counters.sinceIdeas += 1;
            settleAgenda(d.gm, d.canonical.day);
            stampBeats(d.gm, stampIndex());
        });
        await refreshTension(chatKey);
        const doc = getChatDoc(chatKey);
        const p = plannerSettings();
        let due = duePasses(doc.gm, { day: doc.canonical.day, turn: doc.gm.counters.turn, level: p.level, checkEvery: p.checkEvery, dayExpire: p.dayExpire, outlineEvery: p.outlineEvery, ideasEvery: p.ideasEvery });
        // While the story is away from a scene it must come back to (a vision,
        // a trial elsewhere - src/director/suspended.js), no new day plan: one
        // made from the detour plans the wrong day. It is made once the story is back.
        if (stillWaiting(doc.suspended, doc.turn).length) due = due.filter((x) => x !== 'day');
        for (const x of doc.gm.inspirations.filter((i) => !i.motifs.length && !i.error)) void runInspire(chatKey, x.id);
        // The outline first: the day plan follows the story's direction.
        void (async () => {
            // What has happened that people off scene would react to (no call).
            await noteRipples(chatId, chatKey, settingId);
            // A world with a pass of its own moves before the day is planned,
            // so the day plan takes in what it brings (src/world/).
            if (worldDueNow(chatKey) && !stillWaiting(getChatDoc(chatKey).suspended, getChatDoc(chatKey).turn).length) await runWorld(chatId, chatKey);
            if (due.includes('outline')) await runOutline(chatId, chatKey);
            if (due.includes('ideas')) await runIdeas(chatId, chatKey);
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
    // Fired story triggers reach the game master, planner on or off; each
    // once (a swipe of that reply sees it again). They are marked shown
    // when the reply is prepared (src/state/lifecycle.js), and reach the
    // narrator's guidance too, so a failed briefing never loses one.
    let triggered = '';
    try {
        triggered = triggerSection(getChatDoc(chatKey).gm, latestUserIndex());
    } catch (err) {
        console.warn(LOG_PREFIX, 'no story triggers for the director', err);
    }
    // What the story has settled: planner on or off.
    let settled = '';
    try {
        settled = settledSection(getChatDoc(chatKey).gm);
    } catch (err) {
        console.warn(LOG_PREFIX, 'nothing settled for the director', err);
    }
    const plan = plannedSection(chatKey, messages);
    // Whose job is whose (src/planner/aims.js): planner on or off - the
    // director's SETTLED lines and briefings said "the heist" for Enrique's.
    let jobs = '';
    try {
        const line = jobsLine(opposedJobs(planTexts(getChatDoc(chatKey).gm), { player: [userName()] }), userName());
        if (line) jobs = `WHOSE JOB IS WHOSE (say whose it is every time - never a bare "the heist")\n${line.replace(/^Whose job is whose: /, '')}`;
    } catch (err) {
        console.warn(LOG_PREFIX, 'no aims for the director', err);
    }
    // What the story set for today or keeps putting off: planner on or off.
    let due = '';
    try {
        const doc = getChatDoc(chatKey);
        due = dueSection(doc.gm, doc.canonical.day, doc.canonical.dayPart);
    } catch (err) {
        console.warn(LOG_PREFIX, 'nothing due for the director', err);
    }
    // Who the player character has had enough of: planner on or off.
    let company = '';
    try {
        const doc = getChatDoc(chatKey);
        company = companyLines(doc.company, { turn: doc.turn, player: userName() });
    } catch (err) {
        console.warn(LOG_PREFIX, 'no company lines for the director', err);
    }
    // The player's post played its action through ("spent several hours at
    // the gun range"): the briefing brings them the next thing, where they
    // are - it had Doc notice "his return" to a room he never went back to.
    let handBack = '';
    try {
        const post = [...(messages ?? [])].reverse().find((m) => m.isUser)?.text ?? '';
        if (closesOut(post)) {
            const doc = getChatDoc(chatKey);
            const due = dueToday(doc.gm, doc.canonical.day);
            // The beat waiting on someone: they are the next thing, not a
            // time skip to tonight's job (Zane, waited on for ten replies).
            const waiting = plannerSettings().enabled === true ? beatNewcomers(doc.gm, doc) : [];
            const theirs = waiting.length ? (Object.values(arrivalReasons(doc.gm, waiting))[0] ?? '') : '';
            handBack = `NEXT FOR ${userName().toUpperCase() || 'THE PLAYER'} (private)\n${nextThingLine({ player: userName(), lead: theirs || (notYet(due, { today: doc.canonical.day, nowPart: doc.canonical.dayPart })[0]?.text ?? due[0]?.text ?? '') })} The scene stays where ${userName() || 'they'} now is: no one there acts as if ${userName() || 'they'} came back elsewhere.`;
        }
    } catch (err) {
        console.warn(LOG_PREFIX, 'no hand-back for the director', err);
    }
    return [triggered, settled, jobs, due, handBack, company, plan].filter(Boolean).join('\n\n');
}

function plannedSection(chatKey, messages) {
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
        const newcomers = beatNewcomers(gm, getChatDoc(chatKey));
        let waited = 0;
        updateChatDoc(chatKey, (d) => {
            stampBeats(d.gm, stampIndex());
            waited = newcomerWait(d.gm, newcomers.length ? activeBeat(d.gm.outline)?.id : '', d.turn);
        });
        const plan = planSection(gm, { pace, aim: story.aim, story: { shape: story.shape?.label ?? '', act: story.act?.title ?? '', next: story.next?.text ?? '' }, motifs: motifsOf(gm, 3), newcomers, returning: beatReturning(gm, newcomers), waited });
        // The world meanwhile: nothing while the scene is tense or lingering;
        // the lead into what comes next while it moves on or builds.
        const meanwhile = meanwhileFor(chatKey, getChatDoc(chatKey).settingId, { aim: story.aim?.word ?? '', quiet: tense || pace.aim === 'linger', lead: pace.aim === 'move on' || story.aim?.word === 'build', userIndex: latestUserIndex() });
        return [plan, meanwhile].filter(Boolean).join('\n\n');
    } catch (err) {
        console.warn(LOG_PREFIX, 'no GM plan for the director', err);
        return '';
    }
}

// The director's BEAT lines: moments done or skipped. A skipped one asks
// for a CHECK on the next pass. A moment done with someone the chat has not
// shown yet waits for the CHECK after the reply.
export function takeBeats(chatKey, beats) {
    if (!beats?.length) return;
    try {
        let done = false;
        updateChatDoc(chatKey, (d) => {
            const before = new Set((d.gm.day?.moments ?? []).filter((m) => m.status === 'done').map((m) => m.id));
            // The chat only: the briefing says what the director means to
            // play, not what the reply showed (Adam "strode in" there, and
            // never in the story).
            // A seed is planted by the reply this briefing is for.
            applyBeats(d.gm, beats, { seen: seenTexts(), player: userName(), index: latestIndex() + 1, absent: absentFor(d) });
            done = (d.gm.day?.moments ?? []).some((m) => m.status === 'done' && !before.has(m.id));
        });
        if (done) markActive(chatKey);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not record the director\'s beats', err);
    }
}

// The director's SET lines: what the story set for a later time (a meeting
// agreed, a test arranged for tomorrow) goes on the agenda, so it is still
// there when its day comes - long after the chat that set it is out of
// every pass's sight. Adam Miller's test, agreed the evening before, was
// gone by morning: Vex ran "training" in his place. Planner on or off.
export function takeSets(chatKey, sets) {
    if (!sets?.length) return;
    try {
        updateChatDoc(chatKey, (d) => {
            for (const x of sets) {
                const when = readWhen(x.when, d.canonical.dayPart);
                const ties = x.who.split(/\s*(?:,|&|\band\b)\s*/i).map((n) => n.trim()).filter(Boolean);
                const made = setByStory(d.gm, { id: newLocalId('ag'), text: x.what, day: d.canonical.day + when.inDays, when: when.part || x.when, ties });
                if (made) console.info(LOG_PREFIX, `set by the story for day ${made.day}${made.when ? `, ${made.when}` : ''}: ${made.text}`);
            }
        });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not record what the story set', err);
    }
}

// The director's SETTLED lines: what the latest chat made true or agreed,
// kept so it is not undone or argued again. Planner on or off.
export function takeSettled(chatKey, lines) {
    if (!lines?.length) return;
    try {
        updateChatDoc(chatKey, (d) => {
            for (const text of lines) {
                const made = addSettled(d.gm, { id: newLocalId('st'), text, source: 'director', turn: d.turn });
                if (made) console.info(LOG_PREFIX, `settled in the story: ${made.text}`);
            }
        });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not record what the story settled', err);
    }
}

// ---------------------------------------------------------------- the user's side (GM Plan tab)

export function addSettledItem(chatKey, text) {
    let made = null;
    updateChatDoc(chatKey, (d) => { made = addSettled(d.gm, { id: newLocalId('st'), text, source: 'user' }); });
    return made;
}

export function removeSettledItem(chatKey, id) {
    updateChatDoc(chatKey, (d) => removeSettled(d.gm, id));
}

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

export function moveOutlineBeat(chatKey, id, actId, index) {
    let moved = false;
    updateChatDoc(chatKey, (d) => { moved = moveBeat(d.gm, id, actId, index); });
    return moved;
}

export function stepOutlineBeat(chatKey, id, step) {
    let moved = false;
    updateChatDoc(chatKey, (d) => { moved = stepBeat(d.gm, id, step); });
    return moved;
}

export function removeOutlineBeat(chatKey, id) {
    updateChatDoc(chatKey, (d) => removeBeat(d.gm, id));
}

export function addOutlineBeat(chatKey, actId, text) {
    let beat = null;
    updateChatDoc(chatKey, (d) => { beat = addBeat(d.gm, actId, text); });
    return beat;
}

export function restoreOutlineBeat(chatKey, id) {
    updateChatDoc(chatKey, (d) => { restoreBeat(d.gm, id); stampBeats(d.gm, stampIndex()); });
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
// A whole outline - several chapters of beats - needs more room than a
// small pass: cut off, it was no JSON at all.
const OUTLINE_TOKENS = 2400;
// The outline check's answer: a few fixed beats.
const CHECK_TOKENS = 1000;

// A volume's steer names people, places and groups the library lacks (its
// antagonist, the temple it sets out for): one call takes them out with the
// user's own words, and they are made - before the recap or the outline
// reads the steer - so the detail the user wrote lives on the objects. Made
// with the user's words as their description (enrichment, when on, fills
// only what is still empty), listed in Review, a place put inside the place
// the steer names. Never in a canon-only setting. -> the names made.
export async function steerObjects(chatId, chatKey, settingId, steer, { number = 0 } = {}) {
    if (!settingId || !String(steer ?? '').trim() || plannerSettings().steerObjects === false || isCanonOnly(settingId)) return [];
    try {
        const known = await knownEntries(chatId, settingId);
        const found = readSteerObjects(await ask(buildSteerObjectsPrompt({ steer, known: known.map((e) => e.name), userName: userName() })), {
            steer, userName: userName(), isKnown: (name) => !!knownAs(name, known),
        });
        if (!found.length) return [];
        const made = [];
        const roleNote = { protagonist: 'a protagonist', antagonist: 'the antagonist', ally: 'an ally' };
        for (const f of found) {
            const obj = await createEntry(chatId, settingId, f.type, { name: f.name, description: f.details }, {
                origin: 'steer',
                gmNotes: `From your steer for volume ${number || 'the next'}${f.role && roleNote[f.role] ? ` - ${roleNote[f.role]}` : ''}.`,
            }).catch((err) => { console.warn(LOG_PREFIX, `could not make ${f.name} from the steer`, err); return null; });
            if (obj) made.push({ ...f, id: obj.id });
        }
        // Places inside the place the steer puts them in: one it made, or one the library has.
        const places = [...made.filter((m) => m.type === 'location').map((m) => ({ id: m.id, name: m.name, aliases: [] })), ...known.filter((e) => e.type === 'location')];
        for (const m of made.filter((x) => x.type === 'location' && x.inside)) {
            const parent = knownAs(m.inside, places.filter((p) => p.id !== m.id));
            if (parent) setParent(settingId, m.id, parent.id);
        }
        // Listed in Review like the director's additions; detail added to
        // what the steer left empty when auto-enrich is on.
        const auto = getSettings().generation.autoEnrich === true;
        const items = made.map((m) => ({ id: newLocalId('a'), objectId: m.id, type: m.type, name: m.name, at: new Date().toISOString(), placedUnder: '', enrich: auto && mayAddGeneratedDetail(settingId, m.id) ? 'queued' : 'off', error: '' }));
        updateChatDoc(chatKey, (d) => { d.adopted = [...d.adopted, ...items]; });
        if (items.some((i) => i.enrich === 'queued')) {
            const { enqueueEnrichment } = await import('../generate/enrich.js');
            for (const i of items.filter((x) => x.enrich === 'queued')) enqueueEnrichment({ settingId, chatId, chatKey, objectId: i.objectId, name: i.name, adoptedId: i.id });
        }
        if (made.length) console.info(LOG_PREFIX, `made from the steer: ${made.map((m) => `${m.name} (${m.type})`).join(', ')}`);
        return made.map((m) => m.name);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not take the people and places out of the steer', err);
        return [];
    }
}

// Writes the recap of the volume under way, files it away and begins the
// next volume on `shape` with the user's steer. Nothing changes if the
// recap fails. -> an outcome line, or null on failure.
export async function finishVolume(chatId, chatKey, { shape = '', direction = '' } = {}) {
    return runPass('recap', chatKey, async () => {
        const doc = getChatDoc(chatKey);
        const gm = doc.gm;
        const settingId = await getBoundSettingId(chatId);
        // First of all: who and where the steer names that the world lacks.
        const madeFromSteer = await steerObjects(chatId, chatKey, settingId, direction, { number: gm.volume.number + 1 });
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
        }), RECAP_TOKENS, { salvage: (raw) => { const r = readRecapText(raw); return r ? { title: r.title, recap: r.recap, threads: r.threads } : null; } }));
        if (!recap) throw new Error('The recap came back empty.');
        // The last volume's triggers end with it.
        await retirePlannerTriggers(chatKey);
        const index = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system).length;
        let record = null;
        updateChatDoc(chatKey, (d) => {
            record = closeVolume(d.gm, recap, { shape: shapeOf(d.gm.shape)?.label ?? '', turn: d.gm.counters.turn, day: d.canonical.day, index, closedEarly: !complete });
            startVolume(d.gm, { shape: shapeOf(shape) ? shape : d.gm.shape, direction, turn: d.gm.counters.turn, day: d.canonical.day, index });
        });
        return `"${record.title}" filed; volume ${record.number + 1} begins${madeFromSteer.length ? `; made from your steer: ${madeFromSteer.join(', ')}` : ''}`;
    });
}

export function editFinishedVolume(chatKey, number, patch) {
    updateChatDoc(chatKey, (d) => editVolume(d.gm, number, patch));
}

export function removeChronicleLine(chatKey, index, text) {
    updateChatDoc(chatKey, (d) => removeChronicle(d.gm, index, text));
}

// ---------------------------------------------------------------- ideas (§3.4) and the agenda (§3.3)

const creationMode = (settingId) => (settingId ? getSettingDoc(settingId).gm?.creation : 'proposals') ?? 'proposals';

// The dossier, with names for anyone new from the culture where the scene
// is (src/naming/live.js): the same pool the director is handed, so a
// person the plan brings in has a name of the world's own.
async function dossierWithNames(chatId, settingId, guidance, ctx) {
    const text = dossierText({ ...guidance, ...ctx });
    if (!settingId || isCanonOnly(settingId) || getSettings().naming.live === false) return text;
    try {
        const line = poolLine(livePoolFor(settingId, byType(await knownEntries(chatId, settingId)), { placeId: guidance.location?.id ?? null }).pool);
        return line ? `${text}\n\n${line}` : text;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not roll names for the plan', err);
        return text;
    }
}

// The library as the guards need it: every entry, by name and aliases.
async function knownEntries(chatId, settingId) {
    const out = [];
    for (const t of await getObjectTypes().catch(() => [])) {
        for (const e of await listEntries(chatId, settingId, t.id).catch(() => [])) out.push({ id: e.id, type: t.id, name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [], description: e.base?.description ?? e.description ?? '' });
    }
    return out;
}

// The factions the story has hardly touched (src/planner/model.js
// factionsOutOfPlay), for the ideas, day and outline passes - so work and
// leads do not all go back to the one faction every quest and rivalry
// names. Never throws: [] when it cannot tell.
async function factionsToBringIn(chatId, settingId, known = null) {
    if (!settingId) return [];
    try {
        const entries = known ?? await knownEntries(chatId, settingId);
        const quests = await listEntries(chatId, settingId, 'quest').catch(() => []);
        return factionsOutOfPlay({
            factions: entries.filter((e) => e.type === 'faction'),
            questTexts: quests.map((q) => `${q.name} ${q.base?.description ?? q.description ?? ''}`),
            chatText: seenTexts(Infinity).join('\n'),
            relations: getSettingDoc(settingId).relations,
            nameOf: (id) => entries.find((e) => e.id === id)?.name ?? '',
        });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not tell which factions are out of play', err);
        return [];
    }
}

// Proactive worldbuilding: looks at the frictions, the standing quests and
// the lore not in play, and proposes (or, in a setting set to add silently,
// makes) new quests, quest detail, happenings and seeds.
export async function runIdeas(chatId, chatKey) {
    return runPass('ideas', chatKey, async () => {
        const settingId = await getBoundSettingId(chatId);
        if (!settingId) return 'no setting';
        const doc = getChatDoc(chatKey);
        const canonOnly = isCanonOnly(settingId);
        const inputs = await gatherInputs(chatId, chatKey);
        const guidance = inputs.guidance;
        const { sceneContext } = await import('../director/run.js');
        const ctx = await sceneContext(chatId, chatKey, settingId, guidance);
        const known = await knownEntries(chatId, settingId);
        const nameOf = (id) => known.find((e) => e.id === id)?.name ?? '';
        let cells = [];
        try {
            const compiled = typeof window.StateEngineArchivist?.getCompiledMemory === 'function' ? await window.StateEngineArchivist.getCompiledMemory() : null;
            cells = compiled?.relationship_map?.cells ?? [];
        } catch (err) {
            console.warn(LOG_PREFIX, 'no relationship map for the ideas pass', err);
        }
        const frictions = frictionLines({ cells, relations: getSettingDoc(settingId).relations, knowledge: await allKnowledge(settingId, nameOf).catch(() => []), nameOf });
        let quests = [];
        try {
            quests = (await questBoard(chatId, chatKey, settingId)).filter((q) => q.status === 'Active' || q.status === 'Not started')
                .map((q) => ({ name: q.name, status: q.status, type: q.type, objectives: q.objectives.length, description: q.description }));
        } catch (err) {
            console.warn(LOG_PREFIX, 'no quests for the ideas pass', err);
        }
        const inPlay = new Set([...doc.inPlay, ...(guidance.lore ?? []).map((l) => l.id)]);
        const lore = known.filter((e) => e.type === 'lore' && !inPlay.has(e.id)).slice(0, 10);
        const messages = chatMessages(6);
        const ideas = readIdeas(await ask(buildIdeasPrompt({
            dossier: await dossierWithNames(chatId, settingId, guidance, ctx),
            userName: userName(),
            messages,
            story: storyWords(doc.gm),
            frictions,
            quests,
            lore,
            untouched: await factionsToBringIn(chatId, settingId, known),
            agenda: doc.gm.agenda.filter((x) => x.status === 'coming' || x.status === 'planned').map((x) => ({ text: x.text, inDays: Math.max(0, x.day - doc.canonical.day) })),
            motifs: motifsOf(doc.gm),
            dismissed: doc.gm.ideas.filter((i) => i.status === 'dismissed').map((i) => i.name || i.text).slice(-20),
            canonOnly,
            gmStyle: guidance.overview?.gmStyle ?? '',
        })), { canonOnly });
        // The same guards as the director: never a second thing of a known
        // name, never at random (a quest grows out of something known or the
        // chat), and an enrichment only for an open quest.
        const recentText = messages.map((m) => m.text).join('\n');
        const openQuests = quests.map((q) => ({ name: q.name, aliases: [] }));
        const kept = ideas.filter((idea) => {
            if (idea.kind === 'quest') return !knownAs(idea.name, known) && relevance({ kind: 'quest', name: idea.name, why: [idea.why, ...idea.ties].join('; ') }, { recentText, quests: guidance.quests ?? [], known }).ok;
            if (idea.kind === 'enrich') return !!knownAs(idea.target, openQuests);
            return true;
        });
        updateChatDoc(chatKey, (d) => { d.gm.counters.sinceIdeas = 0; });
        if (!kept.length) return ideas.length ? 'nothing that fits' : 'no ideas this time';
        if (creationMode(settingId) === 'silent') {
            let made = 0;
            for (const idea of kept) if ((await applyIdea(chatId, chatKey, settingId, idea, { silent: true })).ok) made++;
            updateChatDoc(chatKey, (d) => { for (const idea of addIdeas(d.gm, kept)) resolveIdea(d.gm, idea.id, 'accepted'); });
            return `${made} added`;
        }
        let added = [];
        updateChatDoc(chatKey, (d) => { added = addIdeas(d.gm, kept); });
        return `${added.length} idea${added.length === 1 ? '' : 's'} to look at`;
    });
}

// Makes an idea real. -> { ok, message }.
async function applyIdea(chatId, chatKey, settingId, idea, { silent = false } = {}) {
    try {
        if (idea.kind === 'quest') {
            if (isCanonOnly(settingId)) return { ok: false, message: 'This setting is fixed canon: no new quests.' };
            const known = await knownEntries(chatId, settingId);
            if (knownAs(idea.name, known)) return { ok: false, message: `"${idea.name}" is already in the library.` };
            const ties = [...new Set(idea.ties.map((t) => knownAs(t, known)?.id).filter(Boolean))];
            const obj = await createEntry(chatId, settingId, 'quest', { name: idea.name, description: idea.text, ...(ties.length ? { related_entity_ids: ties } : {}) }, { origin: 'director' });
            if (!obj) return { ok: false, message: 'State Engine refused the quest.' };
            setQuestMeta(settingId, obj.id, { type: 'side' });
            // Made without asking: listed in Review like the director's additions.
            if (silent) {
                updateChatDoc(chatKey, (d) => {
                    d.adopted = [...d.adopted, { id: newLocalId('a'), objectId: obj.id, type: 'quest', name: obj.name, at: new Date().toISOString(), placedUnder: '', enrich: 'off', error: '' }];
                });
            }
            return { ok: true, message: `Quest "${obj.name}" added.` };
        }
        if (idea.kind === 'enrich') {
            const quest = knownAs(idea.target, (await listEntries(chatId, settingId, 'quest')).map((q) => ({ id: q.id, name: q.name, aliases: q.aliases ?? [], description: q.base?.description ?? q.description ?? '' })));
            if (!quest) return { ok: false, message: `No quest called "${idea.target}".` };
            if (!mayAddGeneratedDetail(settingId, quest.id)) return { ok: false, message: `"${quest.name}" takes no generated detail (canon).` };
            if (idea.text) await updateEntry(chatId, settingId, quest.id, { description: [quest.description, idea.text].filter(Boolean).join(' ') });
            if (idea.objectives.length) {
                const meta = questMeta(settingId, quest.id);
                const have = new Set(meta.objectives.map((o) => o.text.toLowerCase()));
                setQuestMeta(settingId, quest.id, { objectives: [...meta.objectives, ...idea.objectives.filter((o) => !have.has(o.toLowerCase())).map((text) => ({ text, status: 'pending', from: 'planner' }))] });
            }
            return { ok: true, message: `"${quest.name}" has more to it now.` };
        }
        if (idea.kind === 'happening') {
            let made = null;
            updateChatDoc(chatKey, (d) => { made = addHappening(d.gm, { id: newLocalId('ag'), text: idea.text, day: d.canonical.day + (idea.inDays ?? 3), when: idea.when, ties: idea.ties, source: 'ideas' }); });
            return made ? { ok: true, message: `On the calendar in ${idea.inDays ?? 3} days.` } : { ok: false, message: 'Could not put it on the calendar.' };
        }
        if (idea.kind === 'event') return await applyEventIdea(chatId, chatKey, settingId, idea);
        // A faction broken away from another (the world meanwhile, phase 3).
        if (idea.kind === 'faction') {
            if (isCanonOnly(settingId)) return { ok: false, message: 'This setting is fixed canon: no new factions.' };
            const known = await knownEntries(chatId, settingId);
            if (knownAs(idea.name, known)) return { ok: false, message: `"${idea.name}" is already in the library.` };
            const ties = [...new Set(idea.ties.map((t) => knownAs(t, known)?.id).filter(Boolean))];
            const obj = await createEntry(chatId, settingId, 'faction', { name: idea.name, description: idea.text, ...(ties.length ? { related_entity_ids: ties } : {}) }, { origin: 'director' });
            return obj ? { ok: true, message: `Faction "${obj.name}" added.` } : { ok: false, message: 'State Engine refused the faction.' };
        }
        if (idea.kind === 'seed') {
            let ok = false;
            updateChatDoc(chatKey, (d) => { ok = addSeed(d.gm, { text: idea.text, payoff: idea.why }); });
            return ok ? { ok: true, message: 'Planted in the outline.' } : { ok: false, message: 'There is no outline to plant it in yet.' };
        }
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not apply an idea', err);
        return { ok: false, message: String(err?.message ?? err) };
    }
    return { ok: false, message: 'Unknown idea.' };
}

// An event idea taken up: one call writes it from the setting (src/events/
// generate.js), and it is set up - on the calendar when it lies days ahead.
async function applyEventIdea(chatId, chatKey, settingId, idea) {
    const { generateEventForm } = await import('../events/generate.js');
    const { eventFromForm, foeMatcher } = await import('../events/setup.js');
    const { planEvent, makeRooms } = await import('../events/run.js');
    const known = await knownEntries(chatId, settingId);
    const place = idea.ties.map((t) => knownAs(t, known.filter((e) => e.type === 'location'))).find(Boolean);
    const kind = idea.eventKind || 'programme';
    let form = await generateEventForm(chatId, settingId, { kind, request: [idea.name, idea.text].filter(Boolean).join(': '), placeId: place?.id ?? '' });
    if (!form) return { ok: false, message: 'The event could not be written - try again, or set it up on the Event card.' };
    if (!form.name) form.name = idea.name;
    if (form.kind === 'crawl') {
        if (!form.placeId) return { ok: false, message: 'A dungeon crawl needs its dungeon: set it up on the Event card.' };
        form = { ...form, rooms: await makeRooms(chatId, settingId, form.placeId, form.rooms.map((r) => ({ ...r, leadsTo: r.leadsTo.split(/\s*,\s*/).filter(Boolean) }))) };
    }
    const foes = known.filter((e) => e.type === 'character' || e.type === 'creature');
    const characters = known.filter((e) => e.type === 'character');
    const playerName = characters.find((c) => c.id === playerIdOf(settingId, characters))?.name ?? userName();
    const event = eventFromForm(form, { matchFoe: foeMatcher(foes), playerName });
    if (!event) return { ok: false, message: 'The event came out empty - set it up on the Event card.' };
    const days = idea.inDays ?? 0;
    const doc = getChatDoc(chatKey);
    const startDay = days > 0 ? doc.canonical.day + days : null;
    if (!startDay && (doc.event?.status === 'running' || doc.event?.status === 'planned')) return { ok: false, message: 'An event is already set up or under way - end or discard it first.' };
    planEvent(chatKey, event, { startDay });
    return { ok: true, message: startDay ? `${event.name} is on the calendar, in ${days} day${days === 1 ? '' : 's'}.` : `${event.name} is set up on the Event card - start it when the story gets there.` };
}

// The user accepts a proposal (with any edits already made to it).
export async function acceptIdea(chatId, chatKey, id) {
    const idea = getChatDoc(chatKey).gm.ideas.find((i) => i.id === id);
    if (!idea || idea.status !== 'proposed') return { ok: false, message: 'That idea is gone.' };
    const settingId = await getBoundSettingId(chatId);
    const result = await applyIdea(chatId, chatKey, settingId, idea);
    if (result.ok) updateChatDoc(chatKey, (d) => resolveIdea(d.gm, id, 'accepted'));
    return result;
}

export function dismissIdea(chatKey, id) {
    updateChatDoc(chatKey, (d) => resolveIdea(d.gm, id, 'dismissed'));
}

export function editProposal(chatKey, id, patch) {
    updateChatDoc(chatKey, (d) => editIdea(d.gm, id, patch));
}

// The user's own happening, `inDays` from today.
export function addAgendaItem(chatKey, text, inDays, when = '') {
    updateChatDoc(chatKey, (d) => addHappening(d.gm, { id: newLocalId('ag'), text, day: d.canonical.day + Math.max(0, Math.round(inDays)), when, source: 'user' }));
}

// A moment, agenda ('agenda', index) or off-screen line ('offscreen',
// index) the user takes out of today's plan.
export function removeDayItem(chatKey, kind, key) {
    let done = false;
    updateChatDoc(chatKey, (d) => { done = removeFromDay(d.gm, kind, key); });
    return done;
}

export function removeAgendaItem(chatKey, id) {
    updateChatDoc(chatKey, (d) => removeHappening(d.gm, id));
}

// Where a setting's ideas land: 'proposals' or 'silent'.
export function setCreationMode(settingId, mode) {
    updateSettingDoc(settingId, (doc) => { doc.gm = { ...doc.gm, creation: mode === 'silent' ? 'silent' : 'proposals' }; });
}

// ---------------------------------------------------------------- the starter post

const STARTER_TOKENS = 900;

// An opening post for the current scene: where it is, who is here, the
// outline's beat now - never the player character's actions. Asked for on
// the GM Plan tab; not posted until the user says so. wish: the user's
// steer, or ''. -> the post. Throws with a readable reason.
export async function writeStarter(chatId, chatKey, { wish = '' } = {}) {
    const doc = getChatDoc(chatKey);
    const settingId = await getBoundSettingId(chatId);
    const inputs = await gatherInputs(chatId, chatKey);
    const guidance = inputs.guidance;
    const { sceneContext } = await import('../director/run.js');
    const ctx = await sceneContext(chatId, chatKey, settingId, guidance);
    const player = (guidance.cast ?? []).find((c) => c.player)?.name || userName();
    const input = {
        dossier: dossierText({ ...guidance, ...ctx }),
        userName: player,
        story: storyWords(doc.gm),
        premise: doc.gm.outline?.premise ?? '',
        gmStyle: guidance.overview?.gmStyle ?? '',
        pov: povRule(getSettings().director?.pov, player),
        messages: chatMessages(4),
        wish,
        rules: curatorRules(),
    };
    const ask = async (p) => readStarter(await callModel([{ role: 'system', content: p.system }, { role: 'user', content: p.prompt }], Math.max(plannerSettings().maxTokens || 0, STARTER_TOKENS)));
    let text = await ask(buildStarterPrompt(input));
    // It narrated the player: asked once more, told so.
    if (text && writesForPlayer(text, player)) {
        console.info(LOG_PREFIX, 'the starter wrote the player character\'s actions - asking again');
        const again = await ask(buildStarterPrompt({ ...input, retry: true }));
        if (again) text = again;
    }
    if (!text) throw new Error('The model wrote nothing usable - try again, or a larger model.');
    return text;
}

// The narrator rules the user keeps in Curator (its enabled system blocks,
// such as a GM card), macros filled in: a call made apart from the chat's
// prompt gets them too. '' without Curator.
function curatorRules() {
    try {
        const blocks = window.Curator?.getInjectionBlocks?.() ?? [];
        const fill = SillyTavern.getContext().substituteParams ?? ((t) => t);
        const text = blocks.filter((b) => b?.enabled && b.role === 'system' && String(b.text ?? '').trim()).map((b) => fill(String(b.text).trim())).join('\n\n');
        return text.length > 4000 ? `${text.slice(0, 3999)}…` : text;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read the Curator blocks', err);
        return '';
    }
}

// Who a post can be posted as: the open chat's character, or each member
// of the group. -> [{ name, avatar }]
export function starterSpeakers() {
    const c = SillyTavern.getContext();
    if (c.groupId) {
        const group = (c.groups ?? []).find((g) => g.id === c.groupId);
        return (group?.members ?? []).map((avatar) => c.characters.find((ch) => ch.avatar === avatar)).filter(Boolean).map((ch) => ({ name: ch.name, avatar: ch.avatar }));
    }
    const ch = c.characters?.[c.characterId];
    return ch ? [{ name: ch.name, avatar: ch.avatar }] : (c.name2 ? [{ name: c.name2, avatar: '' }] : []);
}

// Posts the text into the chat as a character's message, the way
// SillyTavern's /sendas does: received and rendered events (so State Engine
// and the extensions read it like any reply), then saved.
export async function postStarter(text, { as = '' } = {}) {
    const c = SillyTavern.getContext();
    const speakers = starterSpeakers();
    const who = speakers.find((s) => s.name === as) ?? speakers[0];
    if (!who) throw new Error('No chat is open.');
    const mes = String(text ?? '').trim();
    if (!mes) throw new Error('There is nothing to post.');
    const sendDate = typeof c.humanizedDateTime === 'function' ? c.humanizedDateTime() : new Date().toLocaleString();
    const extra = { gen_id: Date.now(), api: 'manual', model: 'Scenario Builder starter' };
    const message = {
        name: who.name,
        is_user: false,
        is_system: false,
        send_date: sendDate,
        mes,
        ...(c.groupId && who.avatar ? { original_avatar: who.avatar, force_avatar: typeof c.getThumbnailUrl === 'function' ? c.getThumbnailUrl('avatar', who.avatar) : undefined } : {}),
        extra,
        swipe_id: 0,
        swipes: [mes],
        swipe_info: [{ send_date: sendDate, gen_started: null, gen_finished: null, extra: { ...extra } }],
    };
    c.chat.push(message);
    const index = c.chat.length - 1;
    await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, index, 'command');
    c.addOneMessage(message);
    await c.eventSource.emit(c.eventTypes.CHARACTER_MESSAGE_RENDERED, index, 'command');
    await c.saveChat();
    return index;
}
