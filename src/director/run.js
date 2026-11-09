// Runs the director (src/director/prompt.js) for the open chat: reads the
// recent chat and the scene dossier, asks the generation connection for a
// game master's briefing, adds what the briefing says the scene needs -
// places, people, creatures, factions, lore, events, plot-point items -
// to the library (only what the chat brought up or what is tied to the
// setting: prompt.js relevance), and keeps the briefing in the chat
// document, where the guidance (src/guidance/sync.js) puts it first.
//
// Called before each reply (src/state/lifecycle.js, with a timeout: a late
// briefing is used next time, and the previous one stands meanwhile) and
// from the Preview's "Rethink" button. Never throws.

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { chooseParent, placeSize } from '../generate/place-parent.js';
import { getObjectTypes, getObjectType, getBoundSettingId, createEntry, updateEntry, setEntryMeta, findSimilar, listUnconfirmed, setParent, isCanonOnly, mayAddGeneratedDetail, getOverview, getPlaceOverview, listEntries, getParents, playerIdOf, saveKnowledge, listKnowledge, allKnowledge } from '../library/library.js';
import { bargainItem, sameBargain, fulfilledByReturn } from '../library/knowledge.js';
import { stillWaiting, steppedAway, suspend, returnTo, returnsHere, restorePatch, waitingIds, withoutWaiting, suspendedText, splitText, splitsUp, wentBack, rejoined, splitAt } from './suspended.js';
import { routesFrom, listRoutes, headingAlong, placesFurtherOn } from '../library/routes.js';
import { pathOf } from '../library/hierarchy.js';
import { listRelations, relationsFor, addRelation } from '../library/relations-edit.js';
import { setCanonical } from '../state/canonical.js';
import { advanceBy, advanceFrom, perTurnDefault, holdStoryWeather, setTime, travelAlong, setTimeOfDay } from '../calendar/clock.js';
import { postSpan } from '../calendar/post-span.js';
import { baselineFields } from '../library/fields.js';
import { describeMagic, describeTech } from '../library/world-options.js';
import { enqueueEnrichment } from '../generate/enrich.js';
import { callModelFirst } from '../generate/llm.js';
import { replyKeyOf, canUseAhead, shouldThinkAhead } from './ahead.js';
import { gatherInputs } from '../guidance/sync.js';
import { fitDirectorPrompt, promptBudget } from './fit.js';
import { nextFight, fightFacts, woundsOf, fightPaused } from './fight.js';
import { combatOptions, stanceFor, protectionOf, powerRatingOf, mayDie, protectedText } from './combat.js';
import { eventFacts } from '../events/model.js';
import { eventForBriefing, eventAfterFight, eventAfterMove, eventWays } from '../events/run.js';
import { opFacts, crewMet, isLive as opRunning } from '../ops/model.js';
import { opAfterBriefing, opFromDirector, setOpTapped } from '../ops/run.js';
import { alsoFacts, liveJobs, roomForJob } from '../ops/side-jobs.js';
import { rivalAtWork } from '../ops/detect.js';
import { whoCouldTurnUp, belongingHere, enemyGround, sharedScenes, lastSeen, firstMeetings, elsewhereEntering } from './whereabouts.js';
import { rankNearby } from './company.js';
import { arrivals, addRipple } from '../world/model.js';
import { isWorldOn, takeHeard, worldHereFor, noteHeartRipple, detainPerson } from '../world/run.js';
import { bondsOf, heartsSection, noteBrokenVows, takeHearts, jealousyOf } from './jealousy.js';
import { hasArchivist, storyRelationships, relationshipLine } from '../library/story-relations.js';
import { isPower, patronsOf, powersAtWork, powersText, powersNarratorText } from '../library/powers.js';
import { namedAtAll } from '../validate/drift.js';
import { circling } from './loops.js';
import { shownLeaving, shownArriving } from './departures.js';
import { goesAlone, goesTogether, namedGoing, leftOut, MOVING, sameGround, goesThere, namesPlace, leavesHere, leftBehind } from './going-along.js';
import { timedHappenings } from '../planner/timed.js';

// How many replies a broken-off fight's wounds are remembered.
const WOUNDS_KEPT = 30;
import { markDead, deadText, deadByName, bringBack } from '../state/death.js';
import { isDetained, detainedText, detainedByName, soundsHeld, heldByOwnSide, release } from '../state/detained.js';
import { captivesLine } from '../guidance/captives.js';
import { heldBySheet } from '../guidance/spoken.js';
import { narrationOf } from './departures.js';
import { activeBeat } from '../planner/model.js';
import { overJobsIn, overBriefing } from '../planner/aims.js';
import { contextualPlace } from '../library/place-context.js';
import { personGender } from '../naming/classify.js';
import { creatureFormOf, readCount, addCount, takeCount, creatureLabel } from '../library/creature-form.js';
import { namesSomething, parseDirectorNote, matchPlace, peopleNamedIn, callNames, relevance, mentionedIn, alsoRelevant, withoutPlayerActions, withoutEcho, knownAs, strayName, looksLikePlaceName, routeName, creatureNamedIn, parentForNewPlace, placeNamedIn, samePlaceName } from './prompt.js';
import { libraryMemberships, briefMemberships } from '../library/faction-sync.js';
import { buildPeoplePrompt, readPeople } from './people.js';
import { unknownsFor, toldInChat, mergeTold, PERSPECTIVE_TOKENS } from './perspective.js';
import { getSettingDoc, getEntryMeta } from '../store/setting-store.js';
import { planStamp, arrivalReasons } from '../planner/model.js';
import { directorPlan, takeBeats, takeSets, takeSettled, markActive, overdueNewcomers, beatWaitingOn } from '../planner/run.js';
import { livePoolFor, takeFromPool, byType, rollNameFor, markNameUsed } from '../naming/run.js';
import { poolLine, swapInvented, applySwaps } from '../naming/live.js';
import { bloodlinesOf, decideLineage, mixFor } from '../library/bloodlines.js';
import { noticeStoryBloodlines } from '../library/bloodline-store.js';

export const DIRECTOR_EVENT = 'scenario_builder_director';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

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
        // Before SillyTavern posts it, the message is still in the input box.
        const pending = String(document.getElementById('send_textarea')?.value ?? '').trim();
        const last = list[list.length - 1];
        if (pending && !pending.startsWith('/') && !(last?.isUser && last.text.trim() === pending)) list.push({ name: context.name1, text: pending, isUser: true });
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

// Perspective (src/director/perspective.js): for each person here other
// than the player, the recent memories they did not witness. [] when it is
// off or Archivist is not there.
// messages: the recent chat - what the player told the people here in it is
// theirs from then on (kept in doc.perspectiveTold).
async function unknownsHere(cast, recentText, characters, { chatKey = null, messages = [] } = {}) {
    const director = getSettings().director;
    const archivist = window.StateEngineArchivist;
    if (director.perspective === false || typeof archivist?.getAllMemories !== 'function') return [];
    try {
        const memories = await archivist.getAllMemories();
        const names = new Map([...(characters ?? []), ...(cast ?? [])].filter((c) => c?.id).map((c) => [c.id, c.name]));
        const budget = Number(director.perspectiveTokens);
        let told = chatKey ? getChatDoc(chatKey).perspectiveTold : {};
        const heard = toldInChat(memories, { messages, cast });
        if (chatKey && Object.keys(heard).length) {
            told = mergeTold(told, heard);
            updateChatDoc(chatKey, (d) => { d.perspectiveTold = told; });
        }
        return unknownsFor(memories, { cast, recentText, nameOf: (id) => names.get(id) ?? '', maxTokens: Number.isFinite(budget) && budget > 0 ? budget : PERSPECTIVE_TOKENS, told });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read who knows what from Archivist', err);
        return [];
    }
}

// The ref field on `typeId` that points at a location ('location' first).
async function locationFieldOf(settingId, typeId) {
    const type = await getObjectType(typeId);
    if (!type) return null;
    const fields = await baselineFields(settingId, type);
    const refs = fields.filter((f) => f.kind === 'ref' && f.refType === 'location');
    return (refs.find((f) => f.name === 'location') ?? refs[0])?.name ?? null;
}

// The groups at play in the scene, for the dossier: the factions of the
// people present (the library's memberships and their runtime factions)
// and those tied to the place or the places it is in.
// -> [{ name, description, goals, members: [names here], why }]
export function factionsAtPlay(factions, { cast = [], placeIds = [], relations = [], runtimeOf = () => [] } = {}) {
    const members = libraryMemberships(factions, relations);
    const out = [];
    for (const f of factions ?? []) {
        const here = cast.filter((c) => (members.get(c.id) ?? []).includes(f.id) || (runtimeOf(c.id) ?? []).includes(f.id)).map((c) => c.name);
        const record = f.base ?? f;
        const holdsPlace = Object.values(record).some((v) => (Array.isArray(v) ? v : [v]).some((x) => placeIds.includes(x)))
            || placeIds.some((id) => (runtimeOf(id) ?? []).includes(f.id));
        if (!here.length && !holdsPlace) continue;
        out.push({ name: f.name, description: record.description ?? f.description ?? '', goals: Array.isArray(record.goals) ? record.goals.join(', ') : (record.goals ?? ''), members: here, why: holdsPlace ? 'holds or is tied to this place' : '' });
    }
    return out;
}

// Kinds that are something the story did, not something in the world:
// written from the chat, never made up.
const STORY_KINDS = ['event', 'scene'];

// Adds what the briefing says the scene needs. Places go under the current
// location; items, creatures and people who are here are placed in it;
// what a new thing is tied to becomes its related entries. Never adds a
// duplicate of something the library already has.
export async function createNeeded(chatId, chatKey, settingId, created, locationId, chain = [], places = [], recentText = '') {
    const made = [];
    // A new person's bloodline (docs/DESIGN - BLOODLINES.md, phase 2): the
    // one its own words give ("an elf courier"), else rolled from who lives
    // where the scene is. A kind the world has no bloodline for is left as
    // the story wrote it.
    const bloodlines = created.some((i) => i.kind === 'character') ? bloodlinesOf(await listEntries(chatId, settingId, 'lore').catch(() => [])) : [];
    const doc = getSettingDoc(settingId);
    let factions = null;
    let placesFull = null;
    const mix = bloodlines.length ? mixFor({ world: doc.overview.population, parents: getParents(settingId), metaById: doc.entries, placeId: locationId }).mix : [];
    for (const item of created) {
        try {
            // Checked again here, just before making it: State Engine's review
            // may have taken the same person in while the briefing was written.
            if ((await findSimilar(chatId, settingId, item.kind, item.name, { pending: true })).length) continue;
            // An event or scene the story just had: the director's own line
            // is its description when it gave no other, so the enrichment
            // never starts from a title alone.
            const data = { name: item.name, description: item.description || (STORY_KINDS.includes(item.kind) ? item.name : '') };
            if (item.tiedIds?.length) data.related_entity_ids = [...new Set(item.tiedIds)];
            if (item.kind === 'quest') data.startValues = { status: 'Active' };
            // Only people and creatures the briefing has here are put in the
            // place. An item is never placed by default: a cache the story
            // only talks about is not in the room the talk happens in.
            if (locationId && ['character', 'creature'].includes(item.kind) && item.here) {
                const field = await locationFieldOf(settingId, item.kind);
                if (field) data[field] = locationId;
            } else if (item.kind === 'item') {
                // Where its own words put it, when that is a known place.
                const at = placeNamedIn(item, places);
                const field = at ? await locationFieldOf(settingId, item.kind) : null;
                if (field) data[field] = at;
            }
            const kin = item.kind === 'character' && bloodlines.length ? decideLineage({ brief: `${item.name}. ${item.description}`, bloodlines, mix }) : null;
            const obj = await createEntry(chatId, settingId, item.kind, data, { origin: 'director', ...(item.provisional ? { provisional: true } : {}), ...(kin?.ids.length ? { lineage: { ids: kin.ids, note: '' } } : {}) });
            if (!obj) continue;
            // A nickname the story gave ("Ice") stays findable.
            if (item.aliases?.length) await updateEntry(chatId, settingId, obj.id, { aliases: item.aliases }).catch((err) => console.warn(LOG_PREFIX, `could not keep ${item.name}'s other names`, err));
            // "An Iron Hand enforcer": one of its people, as the briefing says.
            if (item.kind === 'character') {
                factions ??= await listEntries(chatId, settingId, 'faction').catch(() => []);
                for (const m of briefMemberships(`${item.name}. ${item.description}`, factions)) addRelation(settingId, { from: obj.id, to: m.id, kind: m.kind, role: typeof item.role === 'string' ? item.role : '' });
            }
            let parent = item.kind === 'location' ? parentForNewPlace(item, chain) : null;
            // Not a part of where the scene is: the place its words name, the
            // district it fits (a warehouse in the docks), or the town or
            // country around the story - as a place made in the catalog
            // (src/generate/place-parent.js). The Medina Syndicate's
            // warehouse went under the whole city.
            let atTop = false;
            if (item.kind === 'location' && (!parent || parent === chain[chain.length - 1]?.id)) {
                placesFull ??= await listEntries(chatId, settingId, 'location').catch(() => []);
                const chosen = chooseParent({ brief: [item.name, item.why].filter(Boolean).join('. '), description: item.description ?? '', locations: placesFull.filter((p) => p.id !== obj.id).map((p) => ({ id: p.id, name: p.name, aliases: p.aliases ?? p.base?.aliases ?? [], description: p.description ?? p.base?.description ?? '' })), parents: getParents(settingId), sceneId: locationId, where: item.where ?? '' });
                // 'top' is the place around the story - the town the scene is
                // in, not the nation above it - and it is placed again once
                // it is written.
                if (chosen) parent = chosen.id;
                atTop = !chosen || chosen.why === 'top';
            }
            if (parent) setParent(settingId, obj.id, parent);
            // `here` travels with it: State Engine may store the name a little
            // differently, so matching back by name loses it.
            made.push({ id: obj.id, kind: item.kind, name: obj.name, parent, atTop, here: item.here === true, unknownKind: kin?.unknown ? { id: obj.id, description: item.description } : null });
        } catch (err) {
            console.warn(LOG_PREFIX, `the director could not add ${item.name}`, err);
        }
    }
    if (!made.length) return made;
    // A kind of being the world has no bloodline for comes in as one (phase 3).
    const strangers = made.map((m) => m.unknownKind).filter(Boolean);
    if (strangers.length) await noticeStoryBloodlines(chatId, chatKey, settingId, strangers).catch((err) => console.warn(LOG_PREFIX, 'could not take in a bloodline', err));
    const at = new Date().toISOString();
    const adopted = made.map((m) => ({ id: newLocalId('a'), objectId: m.id, type: m.kind, name: m.name, at, placedUnder: m.kind === 'location' ? m.parent ?? '' : '', enrich: 'off', error: '' }));
    updateChatDoc(chatKey, (d) => {
        const known = new Set(d.adopted.map((a) => a.objectId));
        d.adopted = [...d.adopted, ...adopted.filter((a) => !known.has(a.objectId))];
    });
    if (getSettings().generation.autoEnrich) {
        // An event or scene is written from the chat it came from, not made up.
        // A place left at the top of the map is placed again once it is
        // written - its description may name the district it is in.
        for (const a of adopted) enqueueEnrichment({ settingId, chatId, chatKey, objectId: a.objectId, name: a.name, adoptedId: a.id, ...(STORY_KINDS.includes(a.type) && recentText ? { story: recentText } : {}), ...(made.find((m) => m.id === a.objectId)?.atTop ? { placeAfter: true } : {}) });
    }
    return made;
}

// Someone known only by a description has been named by the story: the
// entry takes the name and keeps the description as an alias, so what was
// remembered about them stays theirs and later mentions still find them.
// Only provisional entries, and only to a name the recent chat gives.
export function renamePlan(renames, characters, isProvisional, recentText) {
    const out = [];
    for (const r of renames ?? []) {
        const key = r.from.toLowerCase();
        const c = (characters ?? []).find((x) => isProvisional(x.id) && [x.name, ...(x.aliases ?? x.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === key));
        if (!c || !mentionedIn(r.to, recentText)) continue;
        if ((characters ?? []).some((x) => x.id !== c.id && String(x.name).toLowerCase() === r.to.toLowerCase())) continue;
        const aliases = [...new Set([...(c.aliases ?? c.base?.aliases ?? []), c.name])];
        out.push({ id: c.id, from: c.name, to: r.to, aliases });
    }
    return out;
}

async function renameNamed(chatId, chatKey, settingId, renames, characters, recentText) {
    const plan = renamePlan(renames, characters, (id) => getEntryMeta(settingId, id).provisional === true, recentText);
    for (const r of plan) {
        try {
            if (!await updateEntry(chatId, settingId, r.id, { name: r.to, aliases: r.aliases })) continue;
            setEntryMeta(settingId, r.id, { provisional: false });
            console.info(LOG_PREFIX, `${r.from} is named: ${r.to}`);
        } catch (err) {
            console.warn(LOG_PREFIX, `could not rename ${r.from}`, err);
        }
    }
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

const isNewTurn = (type) => !type || type === 'normal';

// Those the beat has waited on past the firm line (src/planner/run.js
// overdueNewcomers) who can come in now: not taken out by hand, not
// waiting where the story left off, not dead. One already in the cast whom
// the chat has not shown since the beat began is among them: in the cast
// is not in the story (Zane, left in the cast by a replaced swipe, never
// written in) - they are written arriving, the cast unchanged.
function overdueHere(chatKey, characters, castIds, { heldOut = new Set(), waitingNow = new Set(), dead = [] } = {}) {
    return overdueNewcomers(chatKey)
        .map((tie) => characters.find((c) => !isPower(c) && callNames(c).some((n) => n.toLowerCase() === tie.toLowerCase() || n.toLowerCase().startsWith(`${tie.toLowerCase()} `))))
        .filter((c, i, all) => c && all.indexOf(c) === i && !heldOut.has(c.id) && !waitingNow.has(c.id) && !dead.some((d) => d.id === c.id));
}

// Who arrives and leaves, by name (and the new people who are here).
function castAfter(characters, castIds, { enters, leaves }, made, playerId = '') {
    const byName = new Map();
    for (const c of characters) for (const n of [c.name, ...(c.aliases ?? c.base?.aliases ?? [])]) if (n) byName.set(String(n).toLowerCase(), c.id);
    const idOf = (name) => byName.get(String(name).toLowerCase()) ?? characters.find((c) => c.name.toLowerCase().includes(String(name).toLowerCase()))?.id ?? null;
    const next = new Set(castIds);
    const names = { in: [], out: [] };
    for (const name of enters) { const id = idOf(name); if (id && !next.has(id)) { next.add(id); names.in.push(name); } }
    for (const m of made) if (m.kind === 'character' && m.here && !next.has(m.id)) { next.add(m.id); names.in.push(m.name); }
    // The player character never leaves: the scene goes with them (MOVE).
    for (const name of leaves) { const id = idOf(name); if (id && id !== playerId && next.has(id)) { next.delete(id); names.out.push(name); } }
    return { castIds: [...next], names };
}

// Moves the scene: finds (or makes) the place, takes the player character
// and the named companions along. -> { from, castIds } or null.
async function moveScene(chatId, chatKey, settingId, move, { guidance, characters, castIds, recentText, latestText = '', known = [], canCreate, playerNames = [], headed = false }) {
    const doc = getChatDoc(chatKey);
    const from = doc.canonical.locationId || guidance.location?.id || '';
    const places = await listEntries(chatId, settingId, 'location');
    const parents = getParents(settingId);
    const parentId = from ? parents[from] ?? '' : '';
    const nearIds = [
        ...(from ? routesFrom(from, listRoutes(settingId)).map((r) => r.otherId) : []),
        ...places.filter((p) => from && (parents[p.id] === from || (parentId && parents[p.id] === parentId))).map((p) => p.id),
        ...(parentId ? [parentId] : []),
    ];
    let place = matchPlace(move.place, places, nearIds);
    // "The ruins" is the ruins the scene is at, not the ones a road leads to
    // (src/library/place-context.js).
    const meant = place ? contextualPlace({ observedId: place.id, currentId: from, places, parents, recentText }) : null;
    if (meant) {
        console.info(LOG_PREFIX, `the director's MOVE read in context: ${meant.why}`);
        place = places.find((p) => p.id === meant.id) ?? place;
    }
    if (place?.id === from) return null;
    // Only a real place name - never a sentence the model wrote as one
    // ("Remus leans against a pole inside the gate").
    // "The road to the bridge" is not a place: on to the bridge when the
    // library has it, else the scene stays where it is.
    const way = place ? null : routeName(move.place);
    if (way) {
        place = way.to ? matchPlace(way.to, places, nearIds) : null;
        console.info(LOG_PREFIX, `the director moved the scene to "${move.place}", a way rather than a place: ${place ? `on to ${place.name}` : 'not made'}`);
        if (!place || place.id === from) return null;
    }
    let made = false;
    if (!place && canCreate && looksLikePlaceName(move.place, playerNames) && mentionedIn(move.place, recentText) && !knownAs(move.place, known)) {
        // A place the chat named that the library lacks (under any type):
        // beside this one.
        place = await createEntry(chatId, settingId, 'location', { name: move.place, description: '' }, { origin: 'director' });
        // Where it goes by its name and size, as any new place
        // (src/generate/place-parent.js): a place it names ("Saint Aora's
        // Museum Corridors" is in the museum), a part of where the scene
        // is inside it, a building beside it. "Beside this one" alone put
        // the museum's corridors under Arcadia City, next to the museum.
        const chosen = place ? chooseParent({
            brief: move.place,
            locations: places.map((p) => ({ id: p.id, name: p.name, aliases: p.aliases ?? p.base?.aliases ?? [], description: p.description ?? p.base?.description ?? '' })),
            parents,
            sceneId: from || null,
            // A move is a short hop: a part of the place goes in it, a
            // building is nearby.
            where: (placeSize({ name: move.place }) ?? 1) >= 1 ? 'nearby' : 'inside',
        }) : null;
        const under = chosen?.id && chosen.id !== place?.id ? chosen.id : parentId;
        if (place && under) setParent(settingId, place.id, under);
        made = !!place;
        // Listed in Review like anything else the director adds, so a wrong
        // one is seen - and Reject takes the scene back where it was.
        if (place) {
            const item = { id: newLocalId('a'), objectId: place.id, type: 'location', name: place.name, at: new Date().toISOString(), placedUnder: under, enrich: 'off', error: '' };
            updateChatDoc(chatKey, (d) => { if (!d.adopted.some((a) => a.objectId === place.id)) d.adopted = [...d.adopted, item]; });
        }
    }
    if (!place) {
        console.info(LOG_PREFIX, `the director moved the scene to "${move.place}", which is not in the library`);
        return null;
    }
    // The same ground at another scale, and the post goes nowhere: out to
    // the place around it is no move at all; in to a part of it names the
    // spot more closely. No one is left behind either way.
    const ground = made || headed || !clean(latestText) ? '' : sameGround(parents, from, place.id);
    const placeNames = [place.name, move.place, ...(place.aliases ?? place.base?.aliases ?? [])];
    const staying = !!ground && !goesThere(latestText, placeNames);
    // Further in, while the post runs out and does not say to there: Cyril
    // sprinted out of the surveillance room as the MOVE took the scene into
    // it, and Tadam, waiting there, was "met again".
    const runningOff = leavesHere(latestText, { playerNames, people: characters.filter((c) => castIds.includes(c.id)).map((c) => ({ id: c.id, names: callNames(c) })) });
    if (ground === 'in' && runningOff && !namesPlace(latestText, placeNames)) {
        console.info(LOG_PREFIX, `MOVE to ${place.name} left alone: the player's post runs out, and not to there`);
        return null;
    }
    if (staying && ground === 'out') {
        console.info(LOG_PREFIX, `MOVE to ${place.name} left alone: it is around where the scene already is, and the player's post goes nowhere`);
        return null;
    }
    const playerId = playerIdOf(settingId, characters);
    const byName = (name) => characters.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === String(name).toLowerCase()))?.id
        ?? characters.find((c) => c.name.toLowerCase().includes(String(name).toLowerCase()))?.id ?? null;
    // A short hop - into a place inside this one, out to the place it is
    // part of, next door, or a place just made beside this one (a crypt
    // under the graveyard, the next room) - is not a journey: those here
    // whom the recent chat names come along, and the scene's creatures with
    // them (the dead that rushed the party down the stairs). On a real
    // journey creatures stay where they were.
    const near = made || parents[place.id] === from || parents[from] === place.id || (!!parentId && parents[place.id] === parentId);
    // On a short hop those the player's message shows going come along -
    // everyone the recent chat names only when it moves the whole company
    // ("the party rushed down the stairs"). Going alone, no one does: not
    // even those the MOVE line lists.
    const alone = goesAlone(latestText, playerNames);
    const along = alone ? [] : move.along.map(byName).filter(Boolean);
    const here = characters.filter((c) => castIds.includes(c.id));
    const hereNames = here.map((c) => ({ id: c.id, names: callNames(c) }));
    // Those the post leaves out never come: "without Doc and Galice".
    const out = new Set(leftOut(latestText, hereNames));
    // On a journey too, the post's own going counts: "They went all
    // together, without Doc and Galice, to the art museum" left Inji and
    // Zane behind, the MOVE line listing no one.
    const named = alone ? []
        : near ? (!clean(latestText) || goesTogether(latestText) ? peopleNamedIn(recentText, here).map((c) => c.id) : namedGoing(latestText, hereNames))
            : goesTogether(latestText) ? here.map((c) => c.id) : namedGoing(latestText, hereNames);
    if (alone) console.info(LOG_PREFIX, `${playerNames[0] || 'the player character'} goes alone - no one comes along`);
    const next = staying ? [...new Set([...(playerId ? [playerId] : []), ...castIds])] : [...new Set([...(playerId ? [playerId] : []), ...along, ...named])].filter((id) => id === playerId || !out.has(id));
    const left = castIds.filter((id) => !next.includes(id)).map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean);
    const patch = { locationId: place.id, castIds: next, creatureIds: near ? [...doc.canonical.creatureIds] : [] };
    if (move.indoor !== null) patch.indoor = move.indoor;
    setCanonical(chatKey, patch, { chatId, source: 'director', note: `The scene moves to ${place.name}${left.length ? `; ${left.join(', ')} stay${left.length === 1 ? 's' : ''} behind` : ''}` });
    return { from, castIds: next };
}

// What the director (and the planner, src/planner/run.js) knows about the
// world around the scene beyond the guidance: the people, the rules where
// the scene is, the factions at play, events and earlier scenes.
export async function sceneContext(chatId, chatKey, settingId, guidance) {
    const doc = getChatDoc(chatKey);
    const characters = settingId ? await listEntries(chatId, settingId, 'character') : [];
    const castIds = (guidance.cast ?? []).map((c) => c.id).filter(Boolean);
    // Who could turn up - those seen near here not long ago - and who is
    // elsewhere: left far behind, or not seen in a long while (src/director/
    // whereabouts.js). Graxx in Redhaven does not walk into a crypt in Belatorre.
    const relations = settingId ? listRelations(settingId) : [];
    const parents = settingId ? getParents(settingId) : {};
    const locationId = doc.canonical.locationId || guidance.location?.id || '';
    const people = characters.filter((c) => !isPower(c) && !doc.dead.some((d) => d.id === c.id) && !isDetained(doc, c.id));
    const factionList = settingId ? await listEntries(chatId, settingId, 'faction').catch(() => []) : [];
    const placeName = new Map((settingId ? await listEntries(chatId, settingId, 'location').catch(() => []) : []).map((p) => [p.id, p.name]));
    // Those at home here - the head of the crew whose headquarters this is -
    // can turn up though no scene has shown them yet.
    const groundInput = settingId && locationId ? {
        placeIds: [...pathOf(parents, locationId)], parents, characters: people, factions: factionList,
        relations: getSettingDoc(settingId).relations, memberships: libraryMemberships(factionList, getSettingDoc(settingId).relations),
        placeName: (id) => placeName.get(id) ?? '',
    } : null;
    const belongs = groundInput ? belongingHere(groundInput).filter((b) => b.id !== playerIdOf(settingId, characters)) : [];
    // Enemy ground: those on a side against whoever holds this place
    // cannot be inside it (src/director/whereabouts.js enemyGround); the
    // player character is never kept out.
    const ground = groundInput ? enemyGround(groundInput) : { holders: [], leaders: [], barred: new Map() };
    ground.barred.delete(playerIdOf(settingId, characters));
    ground.placeName = placeName.get(locationId) ?? '';
    ground.leaderNames = ground.leaders.map((id) => people.find((c) => c.id === id)?.name).filter(Boolean);
    const { near: found, elsewhere, barred } = whoCouldTurnUp({
        characters: characters.filter((c) => !isPower(c)), castIds, locationId, parents,
        history: doc.history, current: doc.canonical, inPlay: doc.inPlay, tiesOf: (id) => relationsFor(id, relations),
        // Those the world meanwhile has brought near (src/world/model.js).
        arrived: isWorldOn() ? arrivals(doc.gm.world, doc.canonical.day) : [],
        // Where the world has moved people off scene, and how they are now.
        moved: isWorldOn() ? doc.gm.world.overlays.people : {},
        belongs,
        barred: ground.barred,
    });
    for (const e of elsewhere) e.lastAt = placeName.get(e.lastAt) ?? '';
    // Whom to reach for when someone should come along: not those the
    // player character has had enough of, every scene (src/director/company.js).
    const nearby = rankNearby(found, { company: doc.company, turn: doc.turn, seen: lastSeen(doc.history, doc.canonical), total: doc.history.length, player: SillyTavern.getContext().name1 ?? '' });
    // The world's rules as they hold where the scene is.
    const overview = settingId ? getPlaceOverview(settingId, guidance.location?.id) : {};
    const limits = [...describeMagic(overview.magic).limits, ...describeTech(overview.tech).limits];
    const canonOnly = settingId ? isCanonOnly(settingId) : true;
    // Factions, events and earlier scenes: what the guidance does not carry.
    // The place and the places it is in.
    const placeIds = settingId && guidance.location?.id ? [...pathOf(getParents(settingId), guidance.location.id)].reverse() : [];
    const placeEntries = placeIds.length ? await listEntries(chatId, settingId, 'location').catch(() => []) : [];
    const runtimeFactions = new Map();
    for (const o of [...characters.filter((c) => castIds.includes(c.id)), ...placeEntries.filter((p) => placeIds.includes(p.id))]) {
        const value = o.runtime?.values?.factions;
        if (Array.isArray(value)) runtimeFactions.set(o.id, value);
    }
    const factions = settingId ? factionsAtPlay(factionList, { cast: (guidance.cast ?? []).filter((c) => c.id), placeIds, relations: getSettingDoc(settingId).relations, runtimeOf: (id) => runtimeFactions.get(id) ?? [] }) : [];
    // Those out of the scene keep their side: without it, a member who had
    // stepped out (Riven of White Cerberus) was briefed as a threat to it.
    if (settingId) {
        const memberships = libraryMemberships(factionList, getSettingDoc(settingId).relations);
        const factionName = new Map(factionList.map((f) => [f.id, f.name]));
        for (const c of [...nearby, ...elsewhere, ...barred]) c.sides = (memberships.get(c.id) ?? []).map((id) => factionName.get(id)).filter(Boolean);
    }
    // She or he for those out of the scene too, from their own text as for
    // those here (src/guidance/sync.js): without it the plan wrote about Inji
    // away from the scene from the name alone - "Inji uses her connections" -
    // and the narrator was handed it.
    for (const c of [...nearby, ...elsewhere, ...barred]) {
        const obj = characters.find((x) => x.id === c.id);
        if (!obj || c.gender) continue;
        const base = obj.base ?? obj;
        const text = (v) => (typeof v === 'string' ? v : '');
        c.gender = personGender({ name: obj.name, own: [doc.narrative?.[obj.id]?.text, obj.description], more: [text(base.personality), text(base.voice), text(base.goals), text(base.background)] });
    }
    // Someone who turns up picks up where they left off with those here:
    // whom they have met, and how the story has them stand toward them.
    // Without it Riven, who had confronted Cyril over his family, came back
    // to introduce himself as a cheerful stranger.
    const met = sharedScenes(doc.history, doc.canonical);
    const nameHere = new Map(characters.filter((c) => castIds.includes(c.id)).map((c) => [c.id, c.name]));
    for (const c of nearby.slice(0, 12)) {
        c.met = [...(met.get(c.id) ?? [])].map((id) => nameHere.get(id)).filter(Boolean);
        c.standing = hasArchivist() ? (await storyRelationships({ id: c.id, name: c.name }))
            .filter((r) => r.direction === 'out' && nameHere.has(r.otherId))
            .map((r) => relationshipLine(c.name, r)) : [];
    }
    const eventObjects = settingId ? (await listEntries(chatId, settingId, 'event').catch(() => [])).slice(-8).map((e) => ({ name: e.name, description: e.base?.description ?? e.description ?? '', when: e.base?.when ?? e.when ?? e.base?.date ?? e.base?.timestamp ?? e.timestamp ?? '' })) : [];
    const scenes = settingId ? (await listEntries(chatId, settingId, 'scene').catch(() => [])).map((x) => ({ name: x.name, description: x.base?.description ?? x.description ?? '' })) : [];
    return { characters, castIds, nearby, elsewhere, barred, ground, overview, limits, canonOnly, factions, placeIds, eventObjects, scenes };
}

// Who is bound to whom, for the HEARTS section and for taking in the
// JEALOUS / ROMANCE / SOOTHED lines (src/director/jealousy.js): the
// relationships the user wrote, the story's (Archivist) for those here
// both ways - so someone away who loves one of them is found too - and
// vows of love. A vow of love newly broken is noted as a grievance. null
// when jealousy is off for everyone. Never throws.
async function heartsContext(chatKey, settingId, characters, castIds, { ahead = false } = {}) {
    const globalOn = getSettings().director.jealousy !== false;
    const people = characters.filter((c) => !isPower(c));
    if (!settingId || (!globalOn && !people.some((c) => jealousyOf(c) === 'jealous'))) return null;
    try {
        const byId = new Map(people.map((c) => [c.id, c]));
        const nameOf = (id) => byId.get(id)?.name ?? '';
        const modeOf = (id) => jealousyOf(byId.get(id));
        const playerId = playerIdOf(settingId, characters);
        const story = [];
        for (const id of castIds.filter((x) => byId.has(x))) {
            for (const r of await storyRelationships({ id, name: nameOf(id) })) {
                if (!r.otherId) continue;
                story.push(r.direction === 'out' ? { fromId: id, toId: r.otherId, type: r.type, polarity: r.polarity, text: r.text } : { fromId: r.otherId, toId: id, type: r.type, polarity: r.polarity, text: r.text });
            }
        }
        const oaths = (await allKnowledge(settingId, nameOf).catch(() => [])).filter((k) => k.kind === 'oath');
        const bonds = bondsOf({ authored: listRelations(settingId), story, oaths, nameOf });
        if (!ahead) updateChatDoc(chatKey, (d) => noteBrokenVows(d.hearts, oaths, { day: d.canonical.day, turn: d.turn, playerId, newId: () => newLocalId('g') }));
        const doc = getChatDoc(chatKey);
        const present = castIds.filter((id) => byId.has(id)).map((id) => ({ id, name: nameOf(id), player: id === playerId }));
        const { text, report } = heartsSection({ present, bonds, grievances: doc.hearts.grievances, modeOf, globalOn, day: doc.canonical.day, userName: nameOf(playerId) || SillyTavern.getContext().name1, nameOf });
        const resolve = (name) => {
            const key = String(name ?? '').trim().toLowerCase();
            if (!key) return null;
            const hit = people.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === key))
                ?? people.find((c) => castIds.includes(c.id) && String(c.name).toLowerCase().split(/\s+/).includes(key));
            return hit?.id ?? (key === String(SillyTavern.getContext().name1 ?? '').trim().toLowerCase() ? playerId || null : null);
        };
        return { text, report, bonds, modeOf, globalOn, nameOf, playerId, resolve };
    } catch (err) {
        console.warn(LOG_PREFIX, 'no HEARTS for the director', err);
        return null;
    }
}

// The director's JEALOUS / ROMANCE / SOOTHED lines: grievances kept in the
// chat; word that may reach someone away is also something for the world
// meanwhile to carry (a ripple), when it is on.
function takeHeartLines(chatKey, parsed, hearts) {
    if (!hearts || !(parsed.jealous?.length || parsed.romance?.length || parsed.soothed?.length)) return;
    try {
        let out = null;
        updateChatDoc(chatKey, (d) => {
            out = takeHearts(d.hearts, parsed, { ...hearts, present: d.canonical.castIds, day: d.canonical.day, turn: d.turn, newId: () => newLocalId('g') });
        });
        for (const g of out?.added ?? []) console.info(LOG_PREFIX, `${g.whoName} is ${g.kind === 'word' ? 'away, and may hear of it' : 'jealous'}: ${g.what}`);
        for (const w of out?.word ?? []) noteHeartRipple(chatKey, { text: `${w.what} - and ${hearts.nameOf(w.who)} would mind, if word reached them.`, ties: [w.who, w.over, w.rival] });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not take in the jealousy lines', err);
    }
}

// ahead: write ahead (after an AI reply) - only the model's answer is kept
// (doc.director.ahead), nothing applied. preRaw: an answer written ahead,
// taken in place of the model call - and applied now, as any new turn's.
async function run(chatId, chatKey, type, force, { ahead = false, preRaw = null } = {}) {
    const settings = getSettings();
    const settingId = await getBoundSettingId(chatId);
    const inputs = await gatherInputs(chatId, chatKey);
    const guidance = inputs.guidance;
    const messages = recentMessages(type);
    // One of their radios taken up to listen in (or got rid of), by the
    // player's latest post - before the other side is briefed (src/ops/).
    const lastPost = [...messages].reverse().find((m) => m.isUser);
    if (lastPost) setOpTapped(chatKey, { text: lastPost.text });
    const doc = getChatDoc(chatKey);
    // The same messages in the same place: the briefing already written.
    // A place changed by hand since (the user deleted a wrong one and sent
    // the message again) is a new situation - the scene must move again.
    // So is a plan revised since (the day plan, the beat, a settled line).
    const key = hashOf(JSON.stringify([messages.map((m) => [m.name, m.text]), doc.canonical.locationId || '', planStamp(doc.gm)]));
    if (!ahead && !force && doc.director.key === key && doc.director.note) return doc.director;

    const { characters, castIds, nearby, elsewhere, barred, ground, overview, limits, canonOnly, factions, placeIds, eventObjects, scenes } = await sceneContext(chatId, chatKey, settingId, guidance);
    // Every entry of every type, for "also relevant" and for checking what
    // the director adds.
    const types = await getObjectTypes().catch(() => []);
    const everything = [];
    if (settingId) for (const t of types) everything.push(...await listEntries(chatId, settingId, t.id).catch(() => []));
    const labelOf = new Map(types.map((t) => [t.id, t.label]));
    const covered = new Set([
        ...castIds, ...placeIds, ...nearby.map((c) => c.id), ...elsewhere.map((c) => c.id), ...barred.map((c) => c.id),
        ...(guidance.location?.items ?? []).map((x) => x.id), ...(guidance.location?.creatures ?? []).map((x) => x.id),
        ...(guidance.lore ?? []).map((x) => x.id),
        ...[...(guidance.location?.places ?? []), ...factions, ...eventObjects, ...scenes, ...(guidance.quests ?? [])].map((x) => String(x.name ?? '').trim().toLowerCase()),
    ].filter(Boolean));
    const relevant = alsoRelevant(everything, { recentText: messages.slice(-6).map((m) => m.text).join('\n'), sceneIds: [...placeIds, ...castIds], covered, typeLabel: (t) => labelOf.get(t) ?? t, placeName: (id) => everything.find((e) => e.id === id)?.name ?? '' });
    // Gods and forces that bear on this reply - invoked, a champion failing,
    // or their occasional turn (src/library/powers.js). Most replies: none.
    const powerEntries = characters.filter(isPower);
    // Who is calling (the player's latest message) and the dead the recent
    // story speaks of - a power's own champion calling on it is answered, and
    // a power whose champion lies dead comes forward.
    const recentSix = messages.slice(-6).map((m) => m.text).join('\n');
    const callerText = [...messages].reverse().find((m) => m.isUser)?.text ?? '';
    const caller = characters.find((c) => c.id === playerIdOf(settingId, characters)) ?? null;
    const deadHere = characters.filter((c) => doc.dead.some((d) => d.id === c.id) && namedAtAll([c.name, String(c.name).split(/[\s,]+/)[0]], recentSix));
    const atWork = powerEntries.length ? powersAtWork({
        powers: powerEntries,
        cast: characters.filter((c) => castIds.includes(c.id)),
        recentText: messages.slice(-2).map((m) => m.text).join('\n'),
        callerText,
        caller,
        dead: deadHere,
        // A paused fight is no moment for a blessing.
        fight: fightPaused(doc.fight) ? null : doc.fight,
        turn: doc.turn,
        lastActed: doc.powersActed,
        lastDid: doc.powersDid,
        every: Number.isInteger(settings.director.powersEvery) ? settings.director.powersEvery : 8,
    }) : [];
    // The narrator hears a power called on by its champion (or over its dead
    // champion) directly, so a briefing that leaves it out cannot lose it.
    if (!ahead) updateChatDoc(chatKey, (d) => { d.powersNarrator = powersNarratorText(atWork); });
    // A structured event (src/events/): moved on when its stage ended in an
    // earlier reply; the director sees the stage under way only.
    const event = await eventForBriefing(chatId, chatKey, settingId);
    const ways = await eventWays(settingId, event).catch(() => []);
    // Scenes the story stepped away from and must come back to (src/director/suspended.js).
    const waiting = stillWaiting(doc.suspended, doc.turn);
    const nameOfId = (id) => everything.find((e) => e.id === id)?.name ?? '';
    // Names for anyone or anywhere new, from the culture where the scene is
    // (src/naming/live.js); a made-up one is swapped for the next of them.
    let live = null;
    if (settingId && settings.director.allowCreate && !canonOnly && settings.naming.live !== false) {
        try { live = livePoolFor(settingId, byType(everything), { placeId: guidance.location?.id ?? null }); } catch (err) { console.warn(LOG_PREFIX, 'could not roll names for the director', err); }
    }
    // Jealousy (src/director/jealousy.js) and the world as it stands here
    // (src/world/situations.js).
    const hearts = await heartsContext(chatKey, settingId, characters, castIds, { ahead });
    const worldHere = settingId ? await worldHereFor(chatId, chatKey, settingId, { userText: callerText }) : '';
    // Those meeting the player character for the first time claim no shared
    // past with them (src/director/whereabouts.js firstMeetings).
    if (settingId) {
        const met = firstMeetings({
            cast: (guidance.cast ?? []).filter((c) => c.id && !c.player).map((c) => ({ id: c.id, names: callNames(characters.find((x) => x.id === c.id) ?? c) })),
            chat: (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system).map((m) => String(m.mes ?? '')),
            playerId: playerIdOf(settingId, characters),
            relations: getSettingDoc(settingId).relations,
        });
        for (const c of guidance.cast ?? []) if (met.has(c.id)) c.firstMeeting = true;
    }
    // Trimmed to fit the director model's context (src/director/fit.js).
    const fitted = fitDirectorPrompt({
        ...guidance,
        namePoolLine: live ? poolLine(live.pool) : '',
        messages,
        userName: SillyTavern.getContext().name1,
        previousNote: doc.director.note,
        memories: memoriesFor([guidance.location?.id, ...(guidance.cast ?? []).map((c) => c.id)].filter(Boolean)),
        limits,
        allowCreate: settings.director.allowCreate && !!settingId,
        canonOnly,
        nearby,
        elsewhere,
        barred,
        ground: { holders: ground.holders.map((h) => h.name).filter(Boolean), leaders: ground.leaderNames, place: ground.placeName },
        factions,
        eventObjects,
        events: inputs.canonicalValues?.canon_events ?? [],
        scenes,
        relevant,
        timeKeeping: settings.time.enabled && !!settingId,
        askNow: settings.time.enabled && !!settingId && doc.clock.needsNow,
        gmPlan: settingId ? [worldHere, directorPlan(chatKey, messages, { here: (guidance.cast ?? []).map((c) => c.name), notInPerson: guidance.notInPerson ?? [], later: guidance.savedForLater ?? [] })].filter(Boolean).join('\n\n') : '',
        heartsText: hearts?.text ?? '',
        heartsReport: hearts?.report ?? null,
        unknowns: await unknownsHere(guidance.cast ?? [], messages.slice(-6).map((m) => m.text).join('\n'), characters, { chatKey, messages: messages.slice(-4) }),
        pov: settings.director.pov ?? 'free',
        ahead,
        travelAtNight: settings.director.travelAtNight === true,
        fightFacts: fightFacts(doc.fight, settings.director.fightReplies),
        // Who cannot be killed here (src/director/combat.js).
        protectedText: protectedText([
            ...characters.filter((c) => castIds.includes(c.id) && !isPower(c)),
            ...(guidance.location?.creatures ?? []).filter((x) => x.active !== false && x.form !== 'kind').map((x) => everything.find((e) => e.id === x.id)).filter(Boolean),
        ].filter((e) => e.id !== playerIdOf(settingId, characters)), { stance: stanceFor(doc, settings) }),
        eventFacts: eventFacts(event, { placeName: event?.placeId ? everything.find((e) => e.id === event.placeId)?.name ?? '' : '', turn: getChatDoc(chatKey).turn, ways }),
        // The other side's operation, which the director plays (src/ops/).
        // Where the player character is, so the briefing says what is there.
        opFacts: [opFacts(getChatDoc(chatKey).op, { turn: getChatDoc(chatKey).turn, here: nameOfId(getChatDoc(chatKey).canonical.locationId) || guidance.location?.name || '', player: (guidance.cast ?? []).find((c) => c.player)?.name ?? SillyTavern.getContext().name1, post: lastPost?.text ?? '' }), alsoFacts(getChatDoc(chatKey).opsAlso)].filter(Boolean).join('\n'),
        jobsOver: overBriefing(overJobsIn(getChatDoc(chatKey), [SillyTavern.getContext().name1 ?? ''])),
        opLive: opRunning(getChatDoc(chatKey).op),
        opRoom: roomForJob(getChatDoc(chatKey)),
        opAware: getChatDoc(chatKey).op?.aware === true,
        opposition: settings.director.opposition !== false && !!settingId,
        // Only the dead the latest messages speak of.
        // The story going in circles, or the player asking whether it is over.
        loopLine: circling(messages.slice(-8), { names: (guidance.cast ?? []).filter((c) => !c.player).map((c) => c.name) }).line,
        deadText: deadText(doc, { recentText: messages.slice(-6).map((m) => m.text).join('\n'), about: (id) => {
            const ch = characters.find((x) => x.id === id);
            const patrons = patronsOf(ch).map((p) => characters.find((x) => x.id === p)?.name).filter(Boolean);
            return [ch?.base?.role ?? ch?.role ?? '', patrons.length ? `champion of ${patrons.join(' and ')}` : ''].filter((x) => String(x).trim()).join(', ');
        } }),
        detainedText: detainedText(doc, { recentText: messages.slice(-6).map((m) => m.text).join('\n') }),
        captivesText: captivesLine(guidance.captives, { side: `${clean(SillyTavern.getContext().name1) || 'the player character'}'s side` }),
        powersText: powersText(atWork),
        suspendedText: suspendedText(waiting, nameOfId),
        splitText: splitText(waiting, nameOfId),
    }, promptBudget(settings.director.contextTokens, settings.director.maxTokens));
    if (fitted.trimmed.length) console.info(LOG_PREFIX, `the director's prompt was trimmed to fit (~${fitted.tokens} of ${fitted.budget} tokens): ${fitted.trimmed.join(', ')}`);
    if (!fitted.fits) console.warn(LOG_PREFIX, `the director's prompt is still ~${fitted.tokens} tokens, over the ${fitted.budget} its model's context leaves - raise "Model context" if the model allows, or expect it to fail`);
    const { system, prompt } = fitted;
    if (ahead) {
        // Called at once, not queued: a queued call waits out any reply, and
        // the next reply waits for this briefing.
        const after = replyKeyOf(SillyTavern.getContext().chat);
        // The plan this briefing is written from (a later revision makes it stale).
        const plan = hashOf(planStamp(doc.gm));
        const answer = await callModelFirst([{ role: 'system', content: system }, { role: 'user', content: prompt }], settings.director.maxTokens);
        if (!String(answer ?? '').trim()) throw new Error('The model wrote no briefing.');
        // The chat moved on meanwhile (an edit, a swipe, a new reply): no use.
        if (replyKeyOf(SillyTavern.getContext().chat) !== after) return getChatDoc(chatKey).director;
        updateChatDoc(chatKey, (d) => { d.director = { ...d.director, ahead: { after, plan, raw: String(answer), at: new Date().toISOString() } }; });
        return getChatDoc(chatKey).director;
    }
    const raw = preRaw ?? await callModelFirst([{ role: 'system', content: system }, { role: 'user', content: prompt }], settings.director.maxTokens);
    const parsed = parseDirectorNote(raw);
    // The chat message this briefing's reply will be (SillyTavern's index): a
    // swipe, a regeneration or a continue rewrites the last one. A death in
    // it goes if that message is taken back (src/state/death.js).
    const chatNow = SillyTavern.getContext().chat ?? [];
    const replyIndex = ['swipe', 'regenerate', 'continue'].includes(type) ? Math.max(0, chatNow.length - 1) : chatNow.length;
    // A small model now and then tells the story instead of briefing it and
    // runs out of room before any format line (SCENE, TIME, MOVE...).
    const wroteLines = !!(parsed.scene || parsed.situation || parsed.time || parsed.move || parsed.enters.length || parsed.leaves.length);
    // Cut off or told as story: parseDirectorNote trimmed it to whole
    // sentences and took out the dialogue; what is left still goes on.
    if (parsed.flaws.length) console.warn(LOG_PREFIX, `the briefing was ${parsed.flaws.join(' and ')}${wroteLines ? '' : ', with no format lines'}; trimmed to:`, parsed.note);
    // Whatever the director wrote of the player character's own actions,
    // thoughts or feelings goes - the narrator would copy it.
    const playerChar = settingId ? characters.find((c) => c.id === playerIdOf(settingId, characters)) : null;
    const playerNames = [...(playerChar ? callNames(playerChar) : []), clean(SillyTavern.getContext().name1)].filter(Boolean);
    for (const key of ['note', 'summary', 'direction', 'situation']) parsed[key] = withoutPlayerActions(parsed[key], playerNames);
    // Nor what it copied out of the player's own post (withoutEcho).
    const playerPost = [...messages].reverse().find((m) => m.isUser)?.text ?? '';
    const echoed = parsed.note;
    for (const key of ['note', 'summary', 'direction', 'situation']) parsed[key] = withoutEcho(parsed[key], playerPost);
    if (echoed && parsed.note !== echoed) console.warn(LOG_PREFIX, 'the briefing copied the player\'s post; that part was left out');
    let { note } = parsed;
    const { created } = parsed;
    // Nothing left of the prose once the player character's own actions
    // and the echo of their post are out (Cyril stepping out of the Signal
    // Box was all the briefing said): its MOVE, TIME and SCENE lines still
    // stand, and the player's post can still move the scene. Only a new
    // turn goes on so; otherwise the old briefing stays.
    if (!note && !(isNewTurn(type) && (wroteLines || String(raw ?? '').trim()))) throw new Error('The model wrote no briefing.');
    if (!note) console.warn(LOG_PREFIX, 'the briefing had nothing left for the narrator once the player character\'s part was out; its format lines are still taken in');

    // Only what the recent chat brought up (the last few messages).
    const recentText = messages.slice(-4).map((m) => m.text).join('\n');
    const latestUserText = [...messages].reverse().find((m) => m.isUser)?.text ?? '';
    // Never at random: brought up by the chat, or tied to what the setting
    // already has (prompt.js relevance). Items only for plot points.
    const known = everything.map((e) => ({ id: e.id, type: e.type, name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [] }));
    // What State Engine's review detected in the same reply is the story's
    // own and is about to be confirmed: never a second one of it.
    const pending = [];
    if (settingId && created.length) for (const t of types) pending.push(...await listUnconfirmed(chatId, t.id).catch(() => []));
    const knownOrPending = [...known, ...pending.map((e) => ({ id: e.id, type: e.type, name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [] }))];
    const typeIds = new Set(types.map((t) => t.id));
    const wanted = [];
    for (const c of created) {
        // Only kinds State Engine has.
        if (!typeIds.has(c.kind)) continue;
        // Never a second thing of a name the library has, whatever its type.
        const existing = knownAs(c.name, knownOrPending);
        if (existing) {
            console.info(LOG_PREFIX, `the director did not add ${c.kind} "${c.name}": the library already has "${existing.name}"${existing.type ? ` (${existing.type})` : ''}`);
            continue;
        }
        if (c.kind === 'location' && routeName(c.name)) {
            console.info(LOG_PREFIX, `the director did not add location "${c.name}": a way to somewhere, not a place`);
            continue;
        }
        // A sentence is not a name ("Maziel serves Morvath, god of Death").
        if (!namesSomething(c.name, c.kind)) {
            console.info(LOG_PREFIX, `the director did not add ${c.kind} "${c.name}": a sentence about something, not a name`);
            continue;
        }
        const r = relevance(c, { recentText, latestUserText, quests: guidance.quests, known });
        if (r.ok) wanted.push({ ...c, tiedIds: r.tiedIds });
    }
    if (wanted.length < created.length) console.info(LOG_PREFIX, `the director left out ${created.length - wanted.length} new thing(s): not brought up by the chat or tied to the setting, or an item that is only flavour`);
    // A new person or place with a name the model made up takes the next
    // pool name, and the briefing is changed to match before the narrator
    // sees it. A name in the chat or the notes is the story's and stays.
    if (live && wanted.length) {
        const swapped = swapInvented(wanted, live.pool, {
            // What it was shown, and what the world says (a prompt trimmed to fit leaves some out).
            allowedText: [prompt, ...messages.map((m) => m.text), ...everything.map((e) => e.base?.description ?? e.description ?? '')].join('\n'),
            known: known.flatMap((e) => [e.name, ...e.aliases]),
            // A new place named for what it is (a nightclub, a ruin), rolled in code.
            rollPlace: (c) => {
                try {
                    const plan = rollNameFor(settingId, { typeId: 'location', brief: c.description, hasParent: !!guidance.location?.id, placeId: guidance.location?.id ?? null }, byType(everything));
                    if (plan.mode !== 'rolled') return '';
                    markNameUsed(settingId, plan.name);
                    return plan.name;
                } catch {
                    return '';
                }
            },
        });
        if (swapped.swaps.length) {
            console.info(LOG_PREFIX, `made-up names swapped for the world's own: ${swapped.swaps.map((s) => `${s.from} -> ${s.to}`).join(', ')}`);
            wanted.splice(0, wanted.length, ...swapped.created);
            note = applySwaps(note, swapped.swaps);
            for (const k of ['summary', 'direction', 'situation']) parsed[k] = applySwaps(parsed[k], swapped.swaps);
            if (parsed.move?.place) parsed.move = { ...parsed.move, place: applySwaps(parsed.move.place, swapped.swaps) };
            parsed.enters = parsed.enters.map((n) => applySwaps(n, swapped.swaps));
        }
        try { takeFromPool(settingId, live.key, swapped.used); } catch { /* the pool tops itself up next time */ }
    }
    const made = settingId && settings.director.allowCreate && !canonOnly
        ? await createNeeded(chatId, chatKey, settingId, wanted, guidance.location?.id ?? null, placeIds.map((id) => ({ id, names: [known.find((e) => e.id === id)?.name, ...(known.find((e) => e.id === id)?.aliases ?? [])].filter(Boolean) })), known.filter((e) => e.type === 'location'), recentText)
        : [];
    if (settingId) enrichThin(chatId, chatKey, settingId, guidance);
    if (settingId && isNewTurn(type)) await renameNamed(chatId, chatKey, settingId, parsed.renames, characters, recentText);

    // The scene's title: the game master names it, and renames it when the
    // scene moves on (sb__canon_scene; also written into sb__scene_title).
    const currentTitle = getChatDoc(chatKey).canonical.sceneTitle;
    // Never a title or situation that names something the scene doesn't
    // stand on (a place only the notes mention): the model drifting. The
    // names and aliases of where the scene is and who is here count.
    const allowedText = [...messages.filter((m) => m.isUser).map((m) => m.text), ...(guidance.location?.path ?? []), ...(guidance.cast ?? []).map((c) => c.name), ...known.filter((e) => placeIds.includes(e.id) || castIds.includes(e.id)).flatMap((e) => [e.name, ...e.aliases]), currentTitle, parsed.move?.place ?? ''].join('\n');
    for (const key of ['scene', 'situation']) {
        const stray = parsed[key] ? strayName(parsed[key], { known, allowedText }) : '';
        if (stray) {
            console.info(LOG_PREFIX, `the director's ${key} line names "${stray}", which the scene does not stand on - not taken: ${parsed[key]}`);
            parsed[key] = '';
        }
    }
    if (parsed.scene && parsed.scene !== currentTitle && (isNewTurn(type) || !currentTitle)) {
        setCanonical(chatKey, { sceneTitle: parsed.scene }, { chatId, source: 'director', note: `Scene: ${parsed.scene}` });
    }
    // What is going on, in a sentence (sb__canon_summary; also written into
    // sb__scene_summary). Rewritten every reply - it moves faster than the title.
    if (parsed.situation && parsed.situation.split(/\s+/).length >= 4) {
        setCanonical(chatKey, { sceneSummary: parsed.situation }, { chatId, source: 'director', note: '' });
    }

    // The game master keeps the scene: who arrives and leaves, and how much
    // time the reply covers.
    let moves = { in: [], out: [] };
    let timeText = '';
    // The scene moves with the player character: to the place a MOVE line
    // names (made when the chat named a place the library lacks), with the
    // people going along; everyone else stays behind.
    let movedFrom = null;
    let baseCast = castIds;
    // Where the player's message sets out for - a known place the routes
    // from here reach, further on too (setting out for the bridge goes to
    // the bridge, not to the first stop on the way). It wins over a MOVE to
    // a place the library does not have (a small model names the scenery on
    // the way: "Barren plains stretching into the distance"), and stands in
    // when there is no MOVE line. No extra call.
    let move = parsed.move;
    let headed = false;
    if (isNewTurn(type) && settingId) {
        const from = getChatDoc(chatKey).canonical.locationId || guidance.location?.id || '';
        const routes = listRoutes(settingId);
        // With no place for the scene yet (or after one was deleted), any
        // place the library has.
        // The rooms and buildings beside this one count too, though no route
        // joins them yet: "left Adam Miller's office to head to the armory"
        // goes to the Armory down the hall (a route is guessed on the way).
        const parents = getParents(settingId);
        const up = from ? parents[from] ?? '' : '';
        const beside = from ? known.filter((e) => e.type === 'location' && e.id !== from && (parents[e.id] === from || (up && (parents[e.id] === up || e.id === up)))).map((e) => e.id) : [];
        const reach = from ? [...new Set([...routesFrom(from, routes).map((r) => r.otherId), ...placesFurtherOn(from, routes).map((p) => p.id), ...beside])] : known.filter((e) => e.type === 'location').map((e) => e.id);
        const ways = reach.map((id) => known.find((e) => e.id === id)).filter(Boolean).map((e) => ({ id: e.id, names: [e.name, ...e.aliases] }));
        let heading = headingAlong(latestUserText, ways);
        // Outside it: the place around it (the street outside the Signal Box
        // is in Bearville District, not in the Signal Box).
        if (heading?.outside && parents[heading.id]) {
            const around = known.find((e) => e.id === parents[heading.id]);
            if (around) heading = { ...heading, id: around.id, name: around.name };
        }
        // Further than the routes reach: a place the library has, named
        // whole in the player's going sentence ("to the art museum" - Saint
        // Aora's Museum, across the city), when the MOVE names somewhere the
        // post never does (the director sent the team to the Signal Box).
        if (!heading && move) {
            const anywhere = known.filter((e) => e.type === 'location' && e.id !== from).map((e) => ({ id: e.id, names: [e.name, ...e.aliases] }));
            const far = headingAlong(latestUserText, anywhere);
            if (far && !far.byKind && !mentionedIn(move.place, latestUserText)) heading = far;
        }
        const invented = move && (routeName(move.place) || !knownAs(move.place, known.filter((e) => e.type === 'location')) || (heading && !mentionedIn(move.place, latestUserText)));
        if (heading && (!move || invented)) {
            console.info(LOG_PREFIX, move ? `the director moved the scene to "${move.place}", which the library does not have; the player's message sets out for ${heading.name}, so the scene goes there` : `no MOVE line; the player's message sets out for ${heading.name}`);
            const along = move?.along?.length ? move.along : heading.together ? (guidance.cast ?? []).filter((c) => !c.player).map((c) => c.name) : [];
            move = { place: known.find((e) => e.id === heading.id)?.name ?? heading.name, along, indoor: move?.indoor ?? null };
            headed = true;
        }
    }
    // Back from a detour (BACK, or a MOVE to where the scene waits): the scene
    // the story stepped away from is put back as it was, in place of the move.
    let returned = null;
    // The newest detour let go (splits wait on, wherever they are in the list).
    const lastDetourOff = (list, turn) => {
        const now = stillWaiting(list, turn);
        const i = now.map((s) => s.split).lastIndexOf(false);
        return i < 0 ? now : [...now.slice(0, i), ...now.slice(i + 1)];
    };
    if (isNewTurn(type) && settingId && waiting.length) {
        // Back from a step away in the same world only when the player's
        // message goes back: the museum's BACK while Cyril searched on
        // took him to Inji and Zane.
        const goesBack = (entry) => headed || wentBack(latestUserText, {
            placeNames: [nameOfId(entry.locationId)].filter(Boolean),
            waitingNames: entry.castIds.map((id) => characters.find((c) => c.id === id)).filter(Boolean).flatMap(callNames),
            playerNames, moving: MOVING,
        });
        returned = returnTo(waiting, { back: parsed.back, movePlace: move?.place ?? '', matchesPlace: (name, id) => { const p = known.find((e) => e.id === id); return !!p && samePlaceName(name, p); }, goesBack });
        if (!returned && parsed.back) console.info(LOG_PREFIX, `BACK left alone: ${playerNames[0] || 'the player character'} does not go back to where the story stepped away from`);
        if (returned && returnsHere(returned, getChatDoc(chatKey).canonical.locationId)) {
            // Back where the scene already is: the wait ends, the cast stays.
            updateChatDoc(chatKey, (d) => { d.suspended = lastDetourOff(d.suspended, d.turn); });
            console.info(LOG_PREFIX, `"back" to ${nameOfId(returned.locationId) || 'the scene'}, where the story already is - no one is put back or dropped`);
            move = null;
        } else if (returned) {
            const patch = restorePatch(returned, { playerId: playerIdOf(settingId, characters), dead: getChatDoc(chatKey).dead.map((d) => d.id) });
            if (!parsed.scene && returned.sceneTitle) patch.sceneTitle = returned.sceneTitle;
            if (!parsed.situation && returned.sceneSummary) patch.sceneSummary = returned.sceneSummary;
            setCanonical(chatKey, patch, { chatId, source: 'director', note: `The story returns to ${nameOfId(returned.locationId) || 'where it left off'}${returned.hanging ? ` - ${returned.hanging}` : ''}` });
            updateChatDoc(chatKey, (d) => { d.suspended = lastDetourOff(d.suspended, d.turn); });
            console.info(LOG_PREFIX, `the story comes back to "${returned.sceneTitle || nameOfId(returned.locationId)}"`);
            baseCast = patch.castIds;
            move = null;
        }
    }
    if (isNewTurn(type) && settingId && move) {
        const moved = await moveScene(chatId, chatKey, settingId, move, { guidance, characters, castIds, recentText, latestText: latestUserText, known, playerNames, headed, canCreate:!headed && settings.director.allowCreate && !canonOnly });
        if (moved) {
            movedFrom = moved.from;
            baseCast = moved.castIds;
            // A crawl's room follows the scene (src/events/).
            await eventAfterMove(chatId, chatKey, settingId);
        }
    }
    // Stepping away (AWAY, or a move into a vision or another realm): the
    // scene as it stood before this reply waits until the story returns.
    if (isNewTurn(type) && settingId && !returned) {
        const to = getChatDoc(chatKey).canonical.locationId;
        const lately = messages.slice(-2).map((m) => m.text).join('\n');
        // Those the move left behind, alive.
        const dead = new Set(getChatDoc(chatKey).dead.map((d) => d.id));
        const behind = movedFrom ? castIds.filter((id) => !baseCast.includes(id) && !dead.has(id) && id !== playerIdOf(settingId, characters)) : [];
        const away = steppedAway({ away: parsed.away, moved: !!movedFrom, newPlace: !!to && !doc.inPlay.includes(to), latestText: lately });
        const otherworld = steppedAway({ moved: true, newPlace: true, latestText: lately });
        const hereNow = characters.filter((c) => castIds.includes(c.id) && c.id !== playerIdOf(settingId, characters)).map((c) => ({ id: c.id, names: callNames(c) }));
        const ranOff = leavesHere(latestUserText, { playerNames, people: hereNow });
        const parting = ranOff || splitsUp(messages.slice(-3).map((m) => m.text).join('\n'));
        // Ran out with no move to go with it: those not going along are left
        // where they are, not carried off in the cast. Someone the user put
        // in the scene by hand stays with it.
        if (ranOff && !movedFrom && !away) {
            const kept = new Set(doc.held.filter((h) => h.field === 'cast' && h.op === 'add' && h.until > doc.turn).map((h) => h.objectId));
            const stay = leftBehind(latestUserText, { playerNames, people: hereNow }).filter((id) => baseCast.includes(id) && !kept.has(id) && !dead.has(id));
            if (stay.length) {
                baseCast = baseCast.filter((id) => !stay.includes(id));
                const names = stay.map((id) => nameOfId(id)).filter(Boolean);
                setCanonical(chatKey, { castIds: baseCast }, { chatId, source: 'director', note: `${names.join(', ')} stay${names.length === 1 ? 's' : ''} behind as ${playerNames[0] || 'the player character'} leaves` });
                updateChatDoc(chatKey, (d) => { d.suspended = suspend(stillWaiting(d.suspended, d.turn), { ...doc.canonical, castIds: stay }, { hanging: doc.canonical.sceneSummary, turn: d.turn, at: new Date().toISOString(), split: true }); });
            }
        }
        if (away && !(behind.length && !otherworld && parting)) {
            const hanging = parsed.away || doc.canonical.sceneSummary;
            updateChatDoc(chatKey, (d) => { d.suspended = suspend(stillWaiting(d.suspended, d.turn), doc.canonical, { hanging, turn: d.turn, at: new Date().toISOString(), otherworld }); });
            console.info(LOG_PREFIX, `the story steps away from "${doc.canonical.sceneTitle || nameOfId(doc.canonical.locationId)}"; it waits: ${hanging}`);
        } else if (behind.length && !otherworld && parting) {
            // The group split up: those who stayed carry on where they were,
            // kept out of the player character's scene until it goes back
            // there or the story brings them.
            const names = behind.map((id) => nameOfId(id)).filter(Boolean);
            const hanging = clean(parsed.situation) && peopleNamedIn(parsed.situation, characters).some((c) => behind.includes(c.id)) ? clean(parsed.situation) : doc.canonical.sceneSummary;
            updateChatDoc(chatKey, (d) => { d.suspended = suspend(stillWaiting(d.suspended, d.turn), { ...doc.canonical, castIds: behind }, { hanging, turn: d.turn, at: new Date().toISOString(), split: true }); });
            console.info(LOG_PREFIX, `the group split: ${names.join(', ')} stay at ${nameOfId(doc.canonical.locationId) || 'where they were'}`);
        }
    }
    // Going to where some of the group stayed: they are met again there.
    if (isNewTurn(type) && settingId && movedFrom) {
        const met = splitAt(getChatDoc(chatKey).suspended, getChatDoc(chatKey).canonical.locationId);
        if (met) {
            const dead = new Set(getChatDoc(chatKey).dead.map((d) => d.id));
            const back = met.castIds.filter((id) => !dead.has(id) && !baseCast.includes(id));
            baseCast = [...baseCast, ...back];
            setCanonical(chatKey, { castIds: baseCast }, { chatId, source: 'director', note: `Back with ${back.map((id) => nameOfId(id)).filter(Boolean).join(', ') || 'the others'} at ${nameOfId(met.locationId)}` });
            updateChatDoc(chatKey, (d) => { d.suspended = rejoined(d.suspended, met.castIds); });
        }
    }
    // Those waiting where the story left off stay there. Those a split left
    // elsewhere may still come when the story brings them (ENTERS), but not
    // by a loose mention.
    const waitingList = stillWaiting(getChatDoc(chatKey).suspended, getChatDoc(chatKey).turn);
    const waitingNow = returned ? new Set() : waitingIds(waitingList, baseCast);
    const detourNow = returned ? new Set() : waitingIds(waitingList, baseCast, { splits: false });

    if (isNewTurn(type) && settingId) {
        // Whoever the SITUATION line has doing something is in the scene -
        // the game master does not always write ENTERS for someone who was
        // already there or came back - unless the user took them out by hand.
        const doc = getChatDoc(chatKey);
        const heldOut = new Set(doc.held.filter((h) => h.field === 'cast' && h.op === 'remove' && h.until > doc.turn).map((h) => h.objectId));
        const left = new Set(parsed.leaves.map((n) => String(n).toLowerCase()));
        const seen = peopleNamedIn(parsed.situation, characters).filter((c) => !baseCast.includes(c.id) && !heldOut.has(c.id) && !waitingNow.has(c.id) && !callNames(c).some((n) => left.has(n.toLowerCase())));
        if (seen.length) parsed.enters = [...new Set([...parsed.enters, ...seen.map((c) => c.name)])];
        // Whoever the briefing's own prose has arriving where the player is,
        // with no ENTERS line: Zane "suddenly appeared on the scene", and the
        // narrator - told the player was alone - wrote the team elsewhere.
        const playerHere = playerIdOf(settingId, characters);
        const cameIn = characters.filter((c) => !isPower(c) && c.id !== playerHere && !baseCast.includes(c.id) && !heldOut.has(c.id) && !waitingNow.has(c.id)
            && !doc.dead.some((d) => d.id === c.id) && !parsed.enters.some((n) => callNames(c).some((x) => x.toLowerCase() === String(n).toLowerCase()))
            && shownArriving(callNames(c), parsed.note));
        if (cameIn.length) {
            console.info(LOG_PREFIX, `${cameIn.map((c) => c.name).join(', ')} arrive${cameIn.length === 1 ? 's' : ''} in the briefing with no ENTERS line - taken as entering`);
            parsed.enters = [...parsed.enters, ...cameIn.map((c) => c.name)];
        }
        // Someone the latest chat shows walking out does not come straight
        // back in: the reply they left in still shows them there.
        const latestText = [...messages.slice(-2).map((m) => m.text), parsed.situation ?? ''].join('\n');
        const walkedOut = parsed.enters.filter((name) => {
            const c = characters.find((x) => callNames(x).some((n) => n.toLowerCase() === String(name).toLowerCase()));
            return c && !baseCast.includes(c.id) && shownLeaving(callNames(c), latestText);
        });
        if (walkedOut.length) {
            console.info(LOG_PREFIX, `${walkedOut.join(', ')} walked out in the latest chat - not brought back in`);
            parsed.enters = parsed.enters.filter((n) => !walkedOut.includes(n));
        }
        // A newcomer the beat has waited on past the firm line comes in now:
        // the game master only ever wrote Adam's arrival as what comes next
        // (src/planner/run.js overdueNewcomers).
        const overdue = overdueHere(chatKey, characters, baseCast, { heldOut, waitingNow, dead: doc.dead });
        if (overdue.length) {
            console.info(LOG_PREFIX, `${overdue.map((c) => c.name).join(', ')} brought in - the beat has waited on them too long`);
            parsed.enters = [...new Set([...parsed.enters, ...overdue.map((c) => c.name)])];
        }
        // Someone listed ELSEWHERE cannot turn up in this scene - unless the
        // player's own post brings them (src/director/whereabouts.js).
        // Those the beat has waited on too long are not kept out for being
        // away a while: they come to the player, as the beat needs.
        // So are those the beat now is waiting on (src/planner/run.js
        // beatWaitingOn): the game master bringing Zane to Cyril is the beat.
        const awaited = beatWaitingOn(chatKey).map((t) => t.toLowerCase());
        const wanted = (n) => overdue.some((c) => c.name === n) || awaited.some((t) => { const c = characters.find((x) => callNames(x).some((y) => y.toLowerCase() === String(n).toLowerCase())); return !!c && callNames(c).some((y) => y.toLowerCase() === t || y.toLowerCase().startsWith(`${t} `)); });
        const farAway = elsewhereEntering(parsed.enters.filter((n) => !wanted(n)), { characters, elsewhere, castIds: baseCast, userPost: [...messages].reverse().find((m) => m.isUser)?.text ?? '', namedIn: peopleNamedIn, namesOf: callNames });
        if (farAway.length) {
            console.info(LOG_PREFIX, `${farAway.join(', ')} ${farAway.length === 1 ? 'is' : 'are'} elsewhere - not brought into this scene`);
            parsed.enters = parsed.enters.filter((n) => !farAway.includes(n));
        }
        // Enemy ground: someone on a side against whoever holds this place
        // is not walked in - unless the player's own post brings them. What
        // the game master wanted of them becomes pressure at the edges, a
        // ripple the world takes up: sentries notice them about, someone
        // outside runs into them, word reaches the holders' leaders.
        const userPost = [...messages].reverse().find((m) => m.isUser)?.text ?? '';
        const keptOut = elsewhereEntering(parsed.enters, { characters, elsewhere: [...ground.barred.values()], castIds: baseCast, userPost, namedIn: peopleNamedIn, namesOf: callNames });
        if (keptOut.length) {
            console.info(LOG_PREFIX, `${keptOut.join(', ')} kept out of ${ground.placeName || 'this place'} - enemy ground`);
            parsed.enters = parsed.enters.filter((n) => !keptOut.includes(n));
            if (isWorldOn()) {
                updateChatDoc(chatKey, (d) => {
                    for (const n of keptOut) {
                        const c = characters.find((x) => callNames(x).some((k) => k.toLowerCase() === String(n).toLowerCase()));
                        const b = c && ground.barred.get(c.id);
                        if (b) addRipple(d.gm.world, { id: newLocalId('r'), kind: 'user', text: edgePressure(c.name, b, ground), day: d.canonical.day, ties: [c.id, ...b.against, ...ground.leaders].slice(0, 8), reach: 'local' });
                    }
                });
            }
        }
        // Their sheet keeps them out (src/guidance/spoken.js): the note before
        // the reply only says so once someone has named them, so the game
        // master walked Enrique out of an alley with no one having said a word
        // of him. Only a post that shows them coming, or the beat, brings them.
        const beatTies = settings.planner?.enabled === true ? activeBeat(doc.gm.outline)?.ties ?? [] : [];
        const sheetSaysNo = elsewhereEntering(parsed.enters, { characters, elsewhere: heldBySheet(characters, { here: baseCast, beatTies }), castIds: baseCast, userPost: narrationOf(userPost), namedIn: peopleNamedIn, namesOf: callNames });
        if (sheetSaysNo.length) {
            console.info(LOG_PREFIX, `${sheetSaysNo.join(', ')} kept out: their sheet has them stay away from the scene`);
            parsed.enters = parsed.enters.filter((n) => !sheetSaysNo.includes(n));
        }
        // Taken out by hand: the game master's own ENTERS line does not undo
        // that. Adam Miller was back 29 seconds after the user removed him.
        parsed.enters = withoutWaiting(parsed.enters, characters, heldOut);
        const keptBack = parsed.enters.length - withoutWaiting(parsed.enters, characters, detourNow).length;
        if (keptBack) {
            console.info(LOG_PREFIX, `${keptBack} named to enter wait where the story left off - kept out of the detour`);
            parsed.enters = withoutWaiting(parsed.enters, characters, detourNow);
        }
        const after = castAfter(characters.filter((c) => !isPower(c)), baseCast, parsed, made, playerIdOf(settingId, characters));
        // Those a split left elsewhere whom the story brought over: with the
        // player character again.
        const cameBack = after.castIds.filter((id) => waitingNow.has(id) && !detourNow.has(id));
        if (cameBack.length) updateChatDoc(chatKey, (d) => { d.suspended = rejoined(d.suspended, cameBack); });
        // A power that acted: quiet again for a while.
        const acted = (parsed.powers ?? []).map((p) => powerEntries.find((e) => [e.name, ...(e.aliases ?? [])].some((n) => String(n).toLowerCase() === p.name.toLowerCase()) || mentionedIn(p.name, e.name))).filter(Boolean);
        if (acted.length) {
            updateChatDoc(chatKey, (d) => {
                for (const e of acted) {
                    d.powersActed = { ...d.powersActed, [e.id]: d.turn };
                    // What it did, for the next time it is put before the director.
                    const said = (parsed.powers ?? []).find((p) => [e.name, ...(e.aliases ?? [])].some((n) => String(n).toLowerCase() === p.name.toLowerCase()) || mentionedIn(p.name, e.name));
                    if (said?.what) d.powersDid = { ...d.powersDid, [e.id]: said.what };
                }
            });
            // A price demanded is a debt owed to the power (an oath, pending -
            // the director hears of it wherever its debtor is): by whoever the
            // price names among those here, else the player character.
            for (const p of parsed.powers ?? []) {
                const power = powerEntries.find((e) => [e.name, ...(e.aliases ?? [])].some((n) => String(n).toLowerCase() === p.name.toLowerCase()) || mentionedIn(p.name, e.name));
                if (!power || !p.price) continue;
                const here = characters.filter((c) => castIds.includes(c.id) && !isPower(c));
                const debtors = peopleNamedIn(p.price, here).map((c) => c.id);
                const playerId = playerIdOf(settingId, characters);
                saveKnowledge(settingId, { kind: 'oath', text: `${power.name}'s price${p.what ? ` for ${p.what}` : ''}: ${p.price}`, madeBy: debtors.length ? debtors : [playerId].filter(Boolean), madeTo: [power.id], status: 'pending' });
                console.info(LOG_PREFIX, `${power.name} demands a price: ${p.price}`);
            }
            console.info(LOG_PREFIX, `a power acted: ${(parsed.powers ?? []).map((p) => `${p.name}${p.what ? ` - ${p.what}` : ''}`).join('; ')}`);
        }
        // A bargain the story shows (BARGAIN): a pending oath, sworn by the
        // one who promises to those the promise is for - whoever its words
        // name among those here, else the player character - and before the
        // director until the story fulfils it (src/library/knowledge.js).
        for (const b of parsed.bargains ?? []) {
            const by = characters.find((e) => [e.name, ...(e.aliases ?? e.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === b.by.toLowerCase()) || mentionedIn(b.by, e.name));
            const here = characters.filter((c) => castIds.includes(c.id) && !isPower(c) && c.id !== by?.id);
            const named = peopleNamedIn(`${b.what} ${b.price}`, here).map((c) => c.id);
            const playerId = playerIdOf(settingId, characters);
            const item = bargainItem({ what: by ? b.what : `${b.by} promises ${b.what}`, price: b.price }, { byIds: by ? [by.id] : [], toIds: named.length ? named : [playerId].filter(Boolean) });
            if (!item || sameBargain(listKnowledge(settingId), item)) continue;
            saveKnowledge(settingId, item);
            if (by && isPower(by)) {
                updateChatDoc(chatKey, (d) => {
                    d.powersActed = { ...d.powersActed, [by.id]: d.turn };
                    d.powersDid = { ...d.powersDid, [by.id]: `promised ${b.what}${b.price ? `, for ${b.price}` : ''}` };
                });
            }
            console.info(LOG_PREFIX, `a bargain: ${by?.name ?? b.by} - ${item.text}`);
        }
        // ENTERS and LEAVES that name creatures (the zombies) change the
        // creatures in the scene.
        const creatures = await listEntries(chatId, settingId, 'creature');
        const findCreature = (name) => creatures.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === String(name).toLowerCase()))
            ?? creatures.find((c) => mentionedIn(name, c.name));
        // Creatures are one being (a pet, a mount - like a person) or a kind
        // that comes in numbers, with a count here (src/library/creature-form.js).
        const scene0 = getChatDoc(chatKey).canonical;
        const creatureIds = new Set(scene0.creatureIds);
        let counts = { ...scene0.creatureCounts };
        const creatureNames = { in: [], out: [] };
        const justIn = new Set();
        const isKind = (c) => creatureFormOf(c) === 'kind';
        const isPerson = (name) => characters.some((x) => x.name.toLowerCase() === String(name).toLowerCase());
        const creatureFor = (raw) => { const { count, name } = readCount(raw); return { c: findCreature(name) ?? findCreature(raw), count }; };
        const bringIn = (c, count) => {
            if (isKind(c)) counts = creatureIds.has(c.id) ? addCount(counts, c.id, count) : (count ? { ...counts, [c.id]: count } : counts);
            if (creatureIds.has(c.id) && !(isKind(c) && count)) return;
            creatureIds.add(c.id);
            justIn.add(c.id);
            creatureNames.in.push(creatureLabel(c.name, { form: isKind(c) ? 'kind' : 'individual', count: isKind(c) ? (counts[c.id] ?? null) : null }));
        };
        const takeOut = (c, n = null, { all = false } = {}) => {
            if (!creatureIds.has(c.id)) return;
            if (isKind(c)) {
                const out = takeCount(counts, c.id, n, { all });
                counts = out.counts;
                if (!out.gone) return;
            }
            creatureIds.delete(c.id);
            creatureNames.out.push(c.name);
        };
        for (const raw of parsed.enters) { if (isPerson(raw)) continue; const { c, count } = creatureFor(raw); if (c) bringIn(c, count); }
        // "LEAVES | 2 zombies": two go; "LEAVES | the zombies": all of them.
        for (const raw of parsed.leaves) { const { c, count } = creatureFor(raw); if (c) takeOut(c, count, { all: !count }); }
        // Creatures the SITUATION line has in the scene ("skeletal warriors
        // surge at the breach") are here, as the people it names are - when
        // the story itself names them too: the director's own wording is not
        // enough ("the skeletal warrior's grip" was the Eternal Champion, not
        // the Skeleton Warriors).
        const gone = new Set(creatureNames.out);
        for (const c of creatures) if (!creatureIds.has(c.id) && !gone.has(c.name) && creatureNamedIn(parsed.situation, c) && creatureNamedIn(recentText, c)) bringIn(c, null);
        // A KIND the story has stopped speaking of has gone (fled, fallen,
        // left behind): out of the scene once the last few messages no longer
        // name it - unless the user put it in by hand, or this briefing just
        // brought it in. Otherwise it would linger, and be made to act. One
        // being (a pet, a mount) comes and goes like a person instead.
        const storyText = messages.slice(-6).map((m) => m.text).join('\n');
        const heldIn = new Set(getChatDoc(chatKey).held.filter((h) => h.field === 'creatures' && h.op === 'add' && h.until > getChatDoc(chatKey).turn).map((h) => h.objectId));
        for (const c of creatures) {
            if (creatureIds.has(c.id) && isKind(c) && !heldIn.has(c.id) && !justIn.has(c.id) && !creatureNamedIn(storyText, c)) takeOut(c, null, { all: true });
        }
        // Deaths among the creatures (DIES | 2 zombies): a kind's numbers go
        // down; one being dies like a person (below, src/state/death.js).
        const creatureDeaths = [];
        for (const d of parsed.deaths ?? []) {
            if (isPerson(d.name)) continue;
            const { c, count } = creatureFor(d.name);
            if (!c || !creatureIds.has(c.id)) continue;
            if (isKind(c)) takeOut(c, count);
            else creatureDeaths.push({ c, how: d.how });
        }
        if (creatureNames.in.length || creatureNames.out.length || JSON.stringify(counts) !== JSON.stringify(scene0.creatureCounts)) {
            setCanonical(chatKey, { creatureIds: [...creatureIds], creatureCounts: counts }, { chatId, source: 'director', note: [creatureNames.in.length ? `${creatureNames.in.join(', ')} appear` : '', creatureNames.out.length ? `${creatureNames.out.join(', ')} gone` : ''].filter(Boolean).join('; ') || 'Creature numbers change' });
        }
        // Who may die here (src/director/combat.js): an unkillable one, a plot
        // device, or anyone the chat's stance spares lives on.
        const stance = stanceFor(getChatDoc(chatKey), settings);
        const foughtFor = (name) => (getChatDoc(chatKey).fight?.fighters ?? []).some((f) => f.side === 'ally' && f.name.toLowerCase() === String(name).toLowerCase());
        const spared = (entry) => {
            if (mayDie(entry, { stance, wasAlly: foughtFor(entry.name) })) return false;
            console.info(LOG_PREFIX, `${entry.name} cannot be killed in this story - the death is not kept`);
            return true;
        };
        for (const { c, how } of creatureDeaths) {
            if (spared(c)) continue;
            if (await markDead(chatKey, { id: c.id, name: c.name, how, source: 'director', chatId, reply: replyIndex })) console.info(LOG_PREFIX, `${c.name} died: ${how || 'in the story'}`);
        }
        moves = after.names;
        // In the cast but never shown since the beat began: written arriving.
        const unshown = overdue.filter((c) => baseCast.includes(c.id) && after.castIds.includes(c.id)).map((c) => c.name);
        if (unshown.length) {
            console.info(LOG_PREFIX, `${unshown.join(', ')} in the cast but never shown - written arriving`);
            moves = { ...moves, in: [...new Set([...moves.in, ...unshown])] };
        }
        if (moves.in.length || moves.out.length) {
            const note2 = [moves.in.length ? `${moves.in.join(', ')} arrive${moves.in.length === 1 ? 's' : ''}` : '', moves.out.length ? `${moves.out.join(', ')} leave${moves.out.length === 1 ? 's' : ''}` : ''].filter(Boolean).join('; ');
            setCanonical(chatKey, { castIds: after.castIds }, { chatId, source: 'director', note: note2 });
        }
        // Deaths the briefing reports (src/state/death.js): marked, out of the
        // scene, never back. Never the player character.
        for (const d of parsed.deaths ?? []) {
            const key = d.name.toLowerCase();
            const who = characters.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === key))
                ?? characters.find((c) => getChatDoc(chatKey).canonical.castIds.includes(c.id) && c.name.toLowerCase().includes(key));
            if (who && !playerNames.some((p) => p.toLowerCase() === who.name.toLowerCase()) && !spared(who) && await markDead(chatKey, { id: who.id, name: who.name, how: d.how, source: 'director', chatId, reply: replyIndex })) {
                console.info(LOG_PREFIX, `${who.name} died: ${d.how || 'in the story'}`);
            }
        }
        // Jailed or held for a time (src/state/detained.js): out of the scene
        // until freed. Never the player character, and only someone the
        // recent chat has in it, on words that say custody.
        const namedHere = (c) => namedAtAll([c.name, String(c.name).split(/[\s,]+/)[0], ...(c.aliases ?? c.base?.aliases ?? [])], storyText);
        const whoIs = (name) => {
            const key = String(name).toLowerCase();
            return characters.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === key))
                ?? characters.find((c) => String(c.name).toLowerCase().includes(key)) ?? null;
        };
        for (const d of parsed.detentions ?? []) {
            const who = whoIs(d.name);
            if (!who || playerNames.some((p) => p.toLowerCase() === who.name.toLowerCase()) || !namedHere(who) || !soundsHeld(d.how)) continue;
            // Still with the player's own side, it is a prisoner in the scene,
            // not someone led away: Tadam, "in Inji's custody" in the back of
            // their car, went out of the cast and spoke from it anyway.
            const ownSide = (guidance.cast ?? []).filter((c) => c.player || (c.factionIds ?? []).some((id) => (guidance.cast ?? []).find((p) => p.player)?.factionIds?.includes(id)));
            if ((guidance.captives ?? []).some((c) => c.name === who.name) || heldByOwnSide(d.how, ownSide.flatMap((c) => [c.name, String(c.name).split(/\s+/)[0]]))) {
                console.info(LOG_PREFIX, `${who.name} left in the scene: still in the hands of the player's side (${d.how})`);
                continue;
            }
            if (await detainPerson(chatId, chatKey, settingId, { id: who.id, name: who.name, how: d.how, source: 'director', reply: replyIndex })) console.info(LOG_PREFIX, `${who.name} detained: ${d.how}`);
        }
        for (const r of parsed.releases ?? []) {
            const held = getChatDoc(chatKey).detained;
            const who = whoIs(r.name);
            const record = (who ? held.find((x) => x.id === who.id) : null) ?? detainedByName(held, r.name);
            if (!record || !namedAtAll([record.name, record.name.split(/[\s,]+/)[0]], storyText)) continue;
            if (await release(chatKey, record.id, { chatId })) console.info(LOG_PREFIX, `${record.name} released: ${r.how || 'in the story'}`);
        }
        // Back from the dead, when the story itself brings them back (RISES):
        // only someone on the dead list whom the recent chat names.
        for (const r of parsed.risings ?? []) {
            const dead = deadByName(getChatDoc(chatKey).dead, r.name);
            if (!dead || !mentionedIn(dead.name, storyText)) continue;
            const intoScene = dead.wasHere || (dead.id.startsWith('crt_') ? 'creatureIds' : 'castIds');
            if (await bringBack(chatKey, dead.id, { intoScene, chatId, note: `${dead.name} is back from the dead${r.how ? ` - ${r.how}` : ''}` })) {
                console.info(LOG_PREFIX, `${dead.name} rose: ${r.how || 'back from the dead'}`);
                // A bargain that promised their return is kept.
                for (const k of fulfilledByReturn(listKnowledge(settingId), dead.name)) {
                    saveKnowledge(settingId, { ...k, status: 'kept' });
                    console.info(LOG_PREFIX, `a bargain is fulfilled: ${k.text}`);
                }
            }
        }
        // The fight (src/director/fight.js): each fighter's condition kept
        // from reply to reply, so blows tell and the fight ends.
        const before = getChatDoc(chatKey);
        // Wounds from a fight broken off are remembered a while
        // (WOUNDS_KEPT replies), so a fight taken up again goes on from them.
        const remembered = Object.fromEntries(Object.entries(before.wounds ?? {}).filter(([, w]) => before.turn - w.turn <= WOUNDS_KEPT).map(([k, w]) => [k, w.condition]));
        const fight = nextFight(before.fight, parsed.fights, {
            present: (name) => mentionedIn(name, storyText),
            limit: settings.director.fightReplies,
            playerNames,
            remembered,
            // Each fighter's power rating and protection, from the entry
            // they are; a creature of a kind is never spared as a whole.
            traitsOf: (name, side) => {
                const key = String(name).toLowerCase();
                const entry = characters.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === key)) ?? creatureFor(name).c;
                return { power: powerRatingOf(entry), protect: protectionOf(entry && creatures.includes(entry) && isKind(entry) ? null : entry, { stance, side }) };
            },
            foesFall: combatOptions(settings).foesFall,
            alliesPressed: combatOptions(settings).alliesPressed,
        });
        updateChatDoc(chatKey, (d) => {
            d.fight = fight;
            // Remember how everyone stood when a fight stops or ends; drop
            // what is old.
            const stopped = before.fight && (!fight || fight.ended) ? woundsOf(fight ?? before.fight) : {};
            const kept = Object.fromEntries(Object.entries(d.wounds ?? {}).filter(([, w]) => d.turn - w.turn <= WOUNDS_KEPT));
            for (const [name, condition] of Object.entries(stopped)) kept[name] = { condition, turn: d.turn };
            // A fighter now fighting again carries their wounds in the fight.
            for (const f of fight?.fighters ?? []) delete kept[f.name.toLowerCase()];
            d.wounds = kept;
        });
        // A bout of a structured event is decided by the fight (src/events/).
        eventAfterFight(chatKey, fight);
        // The other side's step, and its crew as the fight left them (src/ops/).
        // Those the player character is at or headed to hold their step up.
        const met = crewMet(getChatDoc(chatKey).op, { here: nameOfId(getChatDoc(chatKey).canonical.locationId) || guidance.location?.name || '', post: latestUserText }).map((m) => m.name);
        opAfterBriefing(chatKey, { report: parsed.operation, fight, deaths: parsed.deaths ?? [], moves: parsed.crewMoves ?? [], lost: parsed.crewLost ?? [], met, metBy: playerNames[0] ?? '' });
        // A rival group at work with no plan: one is written for the next
        // reply, in the background (one call, once per side and place).
        // Or one the recent chat shows - a rival faction's people on a job -
        // when a small model wrote no OPPOSED line (src/ops/detect.js).
        if (roomForJob(getChatDoc(chatKey)) && settings.director.opposition !== false) {
            let opposed = parsed.opposed;
            if (!opposed) {
                try {
                    const factionList = await listEntries(chatId, settingId, 'faction').catch(() => []);
                    const relations = getSettingDoc(settingId).relations ?? [];
                    const byPerson = libraryMemberships(factionList, relations);
                    const members = new Map();
                    for (const [personId, ids] of byPerson) for (const id of ids) members.set(id, [...(members.get(id) ?? []), characters.find((c) => c.id === personId)].filter(Boolean));
                    const playerId = playerIdOf(settingId, characters);
                    // The chat, the threads followed, and the briefings (the
                    // last and this one) - "disrupting Enrique's art heist"
                    // was only ever in the director's own words.
                    const texts = [
                        ...(guidance.quests ?? []).map((q) => [q.name, q.current].filter(Boolean).join('. ')),
                        doc.director.note ?? '',
                        ...messages.slice(-4).map((m) => m.text),
                        parsed.note ?? '',
                    ];
                    opposed = rivalAtWork({ texts, factions: factionList, relations, mine: byPerson.get(playerId) ?? [], playerId, members, skip: liveJobs(getChatDoc(chatKey)).map((o) => o.sideId).filter(Boolean) });
                    if (opposed) console.info(LOG_PREFIX, `the other side: the chat shows ${opposed.who} at work - "${opposed.what}"`);
                } catch (err) {
                    console.warn(LOG_PREFIX, 'could not look for a rival crew at work', err);
                }
            }
            if (opposed) void opFromDirector(chatId, chatKey, settingId, opposed);
        }
        // A kind of creature beaten or driven off in the fight is gone from
        // the scene (one being that goes down is only down, not dead).
        const beaten = (fight?.fighters ?? []).filter((f) => f.side === 'foe' && (f.condition === 'down' || f.condition === 'fled'))
            .map((f) => creatureFor(f.name).c).filter((c) => c && isKind(c) && getChatDoc(chatKey).canonical.creatureIds.includes(c.id));
        if (beaten.length) {
            const now = getChatDoc(chatKey).canonical;
            let left = { ...now.creatureCounts };
            for (const c of beaten) left = takeCount(left, c.id, null, { all: true }).counts;
            setCanonical(chatKey, { creatureIds: now.creatureIds.filter((id) => !beaten.some((c) => c.id === id)), creatureCounts: left }, { chatId, source: 'director', note: `${beaten.map((c) => c.name).join(', ')} beaten off` });
        }
        if (fight) console.info(LOG_PREFIX, `the fight, reply ${fight.round}${fight.ended ? ' (it ends)' : ''}: ${fight.fighters.map((f) => `${f.name} ${f.condition}`).join(', ')}`);
        if (settings.time.enabled) {
            // The clock just started: first the story's own time of day.
            if (getChatDoc(chatKey).clock.needsNow) await setTimeOfDay(chatId, chatKey, settingId, parsed.now);
            let wanted = parsed.time?.text || perTurnDefault();
            // What the player's post says its action took is the least the
            // turn covers: "spent several hours at the gun range" was "A few
            // minutes" by the TIME line (src/calendar/post-span.js).
            const said = postSpan(latestUserText);
            if (said) {
                const start = getChatDoc(chatKey).canonical.time;
                const [byLine, byPost] = Number.isFinite(start) ? await Promise.all([advanceFrom(settingId, start, wanted), advanceFrom(settingId, start, said)]) : [null, null];
                if (byPost !== null && (byLine === null || byPost > byLine)) {
                    console.info(LOG_PREFIX, `the player's post says it took ${said}; the TIME line said "${wanted}" - ${said} it is`);
                    wanted = said;
                }
            }
            const moved = await advanceBy(chatId, chatKey, settingId, wanted, { planned: true, source: 'director', told: !!parsed.time?.text, note: `Time passes: ${wanted}${parsed.time?.why ? ` (${parsed.time.why})` : ''}` })
                ?? await advanceBy(chatId, chatKey, settingId, perTurnDefault(), { planned: true, source: 'director', note: `Time passes: ${perTurnDefault()}` });
            if (moved) timeText = wanted;
            // A move along a route takes at least its travel time.
            if (movedFrom) await travelAlong(chatId, chatKey, settingId, movedFrom, getChatDoc(chatKey).canonical.locationId, '', { text: [[...messages].reverse().find((m) => m.isUser)?.text ?? ''] });
            // A change of weather the plot calls for: held a while, like the
            // story's own, then the simulation takes over again.
            if (parsed.weather) {
                await holdStoryWeather(chatKey, settingId, parsed.weather.values, undefined);
                const now = getChatDoc(chatKey).canonical.time;
                if (Number.isFinite(now)) await setTime(chatId, chatKey, settingId, now, { source: 'director', note: `The weather turns: ${parsed.weather.values.join(', ')}${parsed.weather.why ? ` (${parsed.weather.why})` : ''}` });
            }
        }
    }

    // A swipe keeps the cast the turn began with - but someone the beat has
    // waited on past the firm line still comes in. Swipes never changed the
    // cast, so Zane, waited on for ten replies, could not reach Cyril at the
    // gun range however often the reply was swiped (Assassins Inc). Only
    // ever adds, so swiping again does not stack.
    // Whoever came in with this turn - on its first reply or an earlier
    // swipe - is still arriving in the next swipe: the reply that showed
    // them coming is gone. Zane, brought in on one swipe, stayed in the cast
    // and was never written into the swipes after it.
    // (Keyed by the reply index: every swipe counts as a turn.)
    const turnNow = replyIndex;
    const cameThisTurn = !isNewTurn(type) && doc.director.turnIn?.turn === turnNow ? (doc.director.turnIn.names ?? []) : [];
    if (!isNewTurn(type) && settingId) {
        const doc2 = getChatDoc(chatKey);
        const castNow = doc2.canonical.castIds;
        const sameIn = (c) => cameThisTurn.some((n) => callNames(c).some((x) => x.toLowerCase() === String(n).toLowerCase()));
        const still = characters.filter((c) => castNow.includes(c.id) && sameIn(c));
        const heldOut = new Set(doc2.held.filter((h) => h.field === 'cast' && h.op === 'remove' && h.until > doc2.turn).map((h) => h.objectId));
        const overdue = overdueHere(chatKey, characters, castNow, { heldOut, waitingNow, dead: doc2.dead })
            .filter((c) => !elsewhereEntering([c.name], { characters, elsewhere: [...ground.barred.values()], castIds: castNow, userPost: [...messages].reverse().find((m) => m.isUser)?.text ?? '', namedIn: peopleNamedIn, namesOf: callNames }).length);
        const joining = overdue.filter((c) => !castNow.includes(c.id));
        if (joining.length) {
            const names = joining.map((c) => c.name);
            console.info(LOG_PREFIX, `${names.join(', ')} brought in on the swipe - the beat has waited on them too long`);
            setCanonical(chatKey, { castIds: [...castNow, ...joining.map((c) => c.id)] }, { chatId, source: 'director', note: `${names.join(', ')} arrive${names.length === 1 ? 's' : ''}` });
        }
        if (overdue.length > joining.length) console.info(LOG_PREFIX, `${overdue.filter((c) => castNow.includes(c.id)).map((c) => c.name).join(', ')} in the cast but never shown - written arriving`);
        const names = [...new Set([...still, ...overdue].map((c) => c.name))];
        if (names.length) moves = { in: names, out: [] };
    }

    // The planner hears what played out (BEAT lines) and whether the scene
    // changed - its pace count (src/planner/model.js) treats a turn with
    // no change as idle.
    if (isNewTurn(type) && settingId) {
        takeBeats(chatKey, parsed.beats);
        // What the latest chat set for a time, when no SET line took it in
        // ("a major heist tonight at the Arcadia Museum"): it waits for then.
        const caught = parsed.sets.length ? [] : timedHappenings(messages.slice(-2).map((m) => m.text).join('\n')).map((x) => ({ who: '', what: x.what, when: x.when }));
        if (caught.length) console.info(LOG_PREFIX, `set for a time in the chat, with no SET line: ${caught.map((x) => `${x.what} (${x.when})`).join('; ')}`);
        takeSets(chatKey, parsed.sets.length ? parsed.sets : caught);
        takeSettled(chatKey, parsed.settled);
        takeHeard(chatKey, parsed.heard);
        takeHeartLines(chatKey, parsed, hearts);
        if (made.length || movedFrom || moves.in.length || moves.out.length) markActive(chatKey);
    }

    // A briefing written ahead is used once. Its key holds the place the
    // scene ended up in, so a swipe after a move is not a new situation.
    const settledKey = hashOf(JSON.stringify([messages.map((m) => [m.name, m.text]), getChatDoc(chatKey).canonical.locationId || '']));
    // Who arrives, and why, from the plan: told to the narrator with them.
    let arrivingFor = {};
    try {
        arrivingFor = moves.in.length ? arrivalReasons(getChatDoc(chatKey).gm, moves.in) : {};
    } catch (err) {
        console.warn(LOG_PREFIX, 'no reasons for those arriving', err);
    }
    const turnIn = moves.in.length ? { turn: turnNow, names: [...new Set([...cameThisTurn, ...moves.in])] } : (cameThisTurn.length ? doc.director.turnIn : null);
    const result = { note, summary: parsed.summary, direction: parsed.direction, key: settledKey, at: new Date().toISOString(), created: [...doc.director.created, ...made].slice(-20), error: '', time: timeText, moves, arrivingFor, turnIn, ahead: preRaw ? null : getChatDoc(chatKey).director.ahead };
    updateChatDoc(chatKey, (d) => { d.director = result; });
    return result;
}

// Writes a fresh briefing for the open chat (unless the situation has not
// changed since the last one, or `force`). Resolves to the chat's director
// record; on failure the previous briefing stays and `error` says why.
export async function runDirector(chatId, chatKey, { type = 'normal', force = false, preRaw = null } = {}) {
    if (!getSettings().director.enabled) return null;
    const id = `${chatKey}|${type}|${force}`;
    if (inFlight.has(id)) return inFlight.get(id);
    status = { running: true, chatKey, error: '' };
    announce();
    const job = run(chatId, chatKey, type, force, { preRaw })
        .catch((err) => {
            console.warn(LOG_PREFIX, 'the director could not write a briefing', err);
            const error = String(err?.message ?? err);
            // The last reply's arrivals are not this one's (the narrator is told who arrives).
            updateChatDoc(chatKey, (d) => { d.director = { ...d.director, error, ...(isNewTurn(type) ? { moves: { in: [], out: [] } } : {}) }; });
            status = { ...status, error };
            if (isNewTurn(type) && getSettings().time.enabled) {
                void getBoundSettingId(chatId).then((settingId) => settingId && advanceBy(chatId, chatKey, settingId, perTurnDefault(), { planned: true, note: 'A reply\'s worth of time' })).catch(() => {});
            }
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
    const { enabled, timeout, thinkAhead } = getSettings().director;
    if (!enabled) return false;
    const ms = Math.max(5, Number(timeout) || 45) * 1000;
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve('late'), ms); });
    // Thinking ahead: the briefing written after the latest AI reply, once
    // it is ready (a run still going is waited for, as an ordinary one is).
    const newTurn = isNewTurn(type);
    if (thinkAhead && newTurn && aheadJob?.chatKey === chatKey) await Promise.race([aheadJob.promise, late]);
    const ahead = getChatDoc(chatKey).director.ahead;
    const preRaw = canUseAhead(ahead, replyKeyOf(SillyTavern.getContext().chat), { enabled: thinkAhead, type, plan: hashOf(planStamp(getChatDoc(chatKey).gm)) }) ? ahead.raw : null;
    if (preRaw) console.info(LOG_PREFIX, 'using the briefing written after the last reply');
    const outcome = await Promise.race([runDirector(chatId, chatKey, { type, preRaw }), late]);
    clearTimeout(timer);
    if (outcome === 'late') console.info(LOG_PREFIX, `the director took longer than ${ms / 1000}s; the previous briefing is used for this reply`);
    return outcome !== 'late' && !!outcome?.note;
}

// Thinking ahead (settings.director.thinkAhead, src/director/ahead.js):
// after an AI reply has settled, the briefing for the next turn is written
// in the background - only kept, not applied, until the player's message is
// sent. Never throws.
let aheadJob = null;
export function thinkAfterReply(chatId, chatKey) {
    try {
        const { enabled, thinkAhead } = getSettings().director;
        if (!enabled || !thinkAhead) return;
        const chat = SillyTavern.getContext().chat;
        if (!shouldThinkAhead(getChatDoc(chatKey).director.ahead, chat, { enabled: true })) return;
        const after = replyKeyOf(chat);
        if (aheadJob?.after === after) return;
        const promise = run(chatId, chatKey, 'ahead', true, { ahead: true })
            .catch((err) => console.warn(LOG_PREFIX, 'the director could not think ahead', err))
            .finally(() => { if (aheadJob?.promise === promise) aheadJob = null; });
        aheadJob = { chatKey, after, promise };
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not start thinking ahead', err);
    }
}

// After a reply: the people the last few messages name who are not in the
// library yet become characters (src/director/people.js) - when the
// setting allows the game master to add things. Background, queued; one
// question per reply. Never throws. -> the names made.
let peopleStamp = '';
export async function addNamedPeople(chatId, chatKey) {
    try {
        const settings = getSettings();
        if (!settings.director.enabled || !settings.director.allowCreate) return [];
        const settingId = await getBoundSettingId(chatId);
        if (!settingId || isCanonOnly(settingId)) return [];
        const chat = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system && typeof m.mes === 'string');
        const last = chat[chat.length - 1];
        if (!last || last.is_user) return [];
        const stamp = `${chatKey}|${chat.length}|${last.mes.length}|${last.mes.slice(0, 40)}`;
        if (stamp === peopleStamp) return [];
        peopleStamp = stamp;
        const text = chat.slice(-4).map((m) => `${m.name ?? ''}: ${m.mes}`).join('\n\n');
        const everything = [];
        for (const t of await getObjectTypes().catch(() => [])) {
            for (const e of await listEntries(chatId, settingId, t.id).catch(() => [])) everything.push({ id: e.id, type: t.id, name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [] });
        }
        const known = everything.flatMap((e) => [e.name, ...e.aliases]).filter((n) => typeof n === 'string');
        const playerNames = [clean(SillyTavern.getContext().name1)].filter(Boolean);
        const { askReliably } = await import('../generate/run.js');
        const input = { text, known, playerNames };
        const result = await askReliably(buildPeoplePrompt(input), (_p, answer) => {
            const people = readPeople(answer, input);
            return people ? { values: { people }, dropped: [], error: null } : { values: {}, dropped: [], error: 'no "Name | ..." lines' };
        }, 250);
        if (result.error) return [];
        // The same guards as the game master's own additions.
        const wanted = result.values.people
            .filter((p) => !knownAs(p.name, everything))
            .filter((p) => !(p.aliases ?? []).some((a) => knownAs(a, everything)))
            .map((p) => ({ kind: 'character', name: p.name, description: p.description, here: false, ...(p.aliases ? { aliases: p.aliases } : {}) }));
        if (!wanted.length) return [];
        const made = await createNeeded(chatId, chatKey, settingId, wanted, null);
        if (made.length) console.info(LOG_PREFIX, `the story named new people: ${made.map((m) => m.name).join(', ')}`);
        return made.map((m) => m.name);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not look for newly named people', err);
        return [];
    }
}

// A ripple for someone kept off enemy ground (run - keptOut): their side
// is about the place more than usual, never inside it.
export function edgePressure(name, barred, ground) {
    const side = barred.sides?.length ? ` and ${barred.sides.join(' and ')}` : '';
    const place = ground.placeName || 'the place';
    const holders = ground.holders.filter((h) => barred.against.includes(h.id)).map((h) => h.name).join(' and ') || 'its holders';
    const leaders = ground.leaderNames?.length ? `; word of it could reach ${ground.leaderNames.join(' and ')}` : '';
    return `${name}${side} ${side ? 'are' : 'is'} taking an interest in ${place}, ${holders} ground - seen about its edges more than usual, never inside${leaders}.`;
}
