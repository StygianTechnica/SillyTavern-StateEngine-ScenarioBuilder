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
import { getObjectTypes, getObjectType, getBoundSettingId, createEntry, updateEntry, setEntryMeta, findSimilar, setParent, isCanonOnly, mayAddGeneratedDetail, getOverview, getPlaceOverview, listEntries, getParents, playerIdOf } from '../library/library.js';
import { routesFrom, listRoutes } from '../library/routes.js';
import { pathOf } from '../library/hierarchy.js';
import { listRelations, relationsFor } from '../library/relations-edit.js';
import { setCanonical } from '../state/canonical.js';
import { advanceBy, perTurnDefault, holdStoryWeather, setTime, travelAlong, setTimeOfDay } from '../calendar/clock.js';
import { baselineFields } from '../library/fields.js';
import { describeMagic, describeTech } from '../library/world-options.js';
import { enqueueEnrichment } from '../generate/enrich.js';
import { callModelFirst } from '../generate/llm.js';
import { gatherInputs } from '../guidance/sync.js';
import { buildDirectorPrompt, parseDirectorNote, matchPlace, peopleNamedIn, callNames, relevance, mentionedIn, alsoRelevant, withoutPlayerActions } from './prompt.js';
import { libraryMemberships } from '../library/faction-sync.js';
import { getSettingDoc, getEntryMeta } from '../store/setting-store.js';

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

// Adds what the briefing says the scene needs. Places go under the current
// location; items, creatures and people who are here are placed in it;
// what a new thing is tied to becomes its related entries. Never adds a
// duplicate of something the library already has.
async function createNeeded(chatId, chatKey, settingId, created, locationId) {
    const made = [];
    for (const item of created) {
        try {
            if ((await findSimilar(chatId, settingId, item.kind, item.name)).length) continue;
            const data = { name: item.name, description: item.description };
            if (item.tiedIds?.length) data.related_entity_ids = [...new Set(item.tiedIds)];
            if (item.kind === 'quest') data.startValues = { status: 'Active' };
            // Only things that are physically here are put in the place.
            if (locationId && ['character', 'item', 'creature'].includes(item.kind) && item.here) {
                const field = await locationFieldOf(settingId, item.kind);
                if (field) data[field] = locationId;
            }
            const obj = await createEntry(chatId, settingId, item.kind, data, { origin: 'director', ...(item.provisional ? { provisional: true } : {}) });
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

// People who are not here but could turn up: those seen earlier in this
// chat, and those the people present have ties to.
function nearbyPeople(characters, castIds, inPlay, relations) {
    const present = new Set(castIds);
    const why = new Map();
    for (const id of inPlay) if (!present.has(id)) why.set(id, 'seen earlier in this story');
    for (const id of castIds) {
        for (const r of relationsFor(id, relations)) if (!present.has(r.otherId) && !why.has(r.otherId)) why.set(r.otherId, `tied to someone here (${r.kind})`);
    }
    return characters.filter((c) => why.has(c.id)).map((c) => ({ id: c.id, name: c.name, role: c.base?.role ?? c.role ?? '', why: why.get(c.id) }));
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
async function moveScene(chatId, chatKey, settingId, move, { guidance, characters, castIds, recentText, canCreate }) {
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
    if (place?.id === from) return null;
    if (!place && canCreate && mentionedIn(move.place, recentText)) {
        // A place the chat named that the library lacks: beside this one.
        place = await createEntry(chatId, settingId, 'location', { name: move.place, description: '' }, { origin: 'director' });
        if (place && parentId) setParent(settingId, place.id, parentId);
    }
    if (!place) {
        console.info(LOG_PREFIX, `the director moved the scene to "${move.place}", which is not in the library`);
        return null;
    }
    const playerId = playerIdOf(settingId, characters);
    const byName = (name) => characters.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === String(name).toLowerCase()))?.id
        ?? characters.find((c) => c.name.toLowerCase().includes(String(name).toLowerCase()))?.id ?? null;
    const along = move.along.map(byName).filter(Boolean);
    const next = [...new Set([...(playerId && castIds.includes(playerId) ? [playerId] : playerId ? [playerId] : []), ...along])];
    const left = castIds.filter((id) => !next.includes(id)).map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean);
    // Creatures stay where they were.
    const patch = { locationId: place.id, castIds: next, creatureIds: [] };
    if (move.indoor !== null) patch.indoor = move.indoor;
    setCanonical(chatKey, patch, { chatId, source: 'director', note: `The scene moves to ${place.name}${left.length ? `; ${left.join(', ')} stay${left.length === 1 ? 's' : ''} behind` : ''}` });
    return { from, castIds: next };
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

    const characters = settingId ? await listEntries(chatId, settingId, 'character') : [];
    const castIds = (guidance.cast ?? []).map((c) => c.id).filter(Boolean);
    const nearby = nearbyPeople(characters, castIds, doc.inPlay, settingId ? listRelations(settingId) : []);
    // The world's rules as they hold where the scene is.
    const overview = settingId ? getPlaceOverview(settingId, guidance.location?.id) : {};
    const limits = [...describeMagic(overview.magic).limits, ...describeTech(overview.tech).limits];
    const canonOnly = settingId ? isCanonOnly(settingId) : true;
    // Factions, events and earlier scenes: what the guidance does not carry.
    const factionList = settingId ? await listEntries(chatId, settingId, 'faction').catch(() => []) : [];
    // The place and the places it is in.
    const placeIds = settingId && guidance.location?.id ? [...pathOf(getParents(settingId), guidance.location.id)].reverse() : [];
    const placeEntries = placeIds.length ? await listEntries(chatId, settingId, 'location').catch(() => []) : [];
    const runtimeFactions = new Map();
    for (const o of [...characters.filter((c) => castIds.includes(c.id)), ...placeEntries.filter((p) => placeIds.includes(p.id))]) {
        const value = o.runtime?.values?.factions;
        if (Array.isArray(value)) runtimeFactions.set(o.id, value);
    }
    const factions = settingId ? factionsAtPlay(factionList, { cast: (guidance.cast ?? []).filter((c) => c.id), placeIds, relations: getSettingDoc(settingId).relations, runtimeOf: (id) => runtimeFactions.get(id) ?? [] }) : [];
    const eventObjects = settingId ? (await listEntries(chatId, settingId, 'event').catch(() => [])).slice(-8).map((e) => ({ name: e.name, description: e.base?.description ?? e.description ?? '', when: e.base?.when ?? e.when ?? e.base?.date ?? '' })) : [];
    const scenes = settingId ? (await listEntries(chatId, settingId, 'scene').catch(() => [])).map((x) => ({ name: x.name, description: x.base?.description ?? x.description ?? '' })) : [];
    // Every entry of every type, for "also relevant" and for checking what
    // the director adds.
    const types = await getObjectTypes().catch(() => []);
    const everything = [];
    if (settingId) for (const t of types) everything.push(...await listEntries(chatId, settingId, t.id).catch(() => []));
    const labelOf = new Map(types.map((t) => [t.id, t.label]));
    const covered = new Set([
        ...castIds, ...placeIds, ...nearby.map((c) => c.id),
        ...(guidance.location?.items ?? []).map((x) => x.id), ...(guidance.location?.creatures ?? []).map((x) => x.id),
        ...(guidance.lore ?? []).map((x) => x.id),
        ...[...(guidance.location?.places ?? []), ...factions, ...eventObjects, ...scenes, ...(guidance.quests ?? [])].map((x) => String(x.name ?? '').trim().toLowerCase()),
    ].filter(Boolean));
    const relevant = alsoRelevant(everything, { recentText: messages.slice(-6).map((m) => m.text).join('\n'), sceneIds: [...placeIds, ...castIds], covered, typeLabel: (t) => labelOf.get(t) ?? t });
    const { system, prompt } = buildDirectorPrompt({
        ...guidance,
        messages,
        userName: SillyTavern.getContext().name1,
        previousNote: doc.director.note,
        memories: memoriesFor([guidance.location?.id, ...(guidance.cast ?? []).map((c) => c.id)].filter(Boolean)),
        limits,
        allowCreate: settings.director.allowCreate && !!settingId,
        canonOnly,
        nearby,
        factions,
        eventObjects,
        events: inputs.canonicalValues?.canon_events ?? [],
        scenes,
        relevant,
        timeKeeping: settings.time.enabled && !!settingId,
        askNow: settings.time.enabled && !!settingId && doc.clock.needsNow,
    });
    const raw = await callModelFirst([{ role: 'system', content: system }, { role: 'user', content: prompt }], settings.director.maxTokens);
    const parsed = parseDirectorNote(raw);
    // Whatever the director wrote of the player character's own actions,
    // thoughts or feelings goes - the narrator would copy it.
    const playerChar = settingId ? characters.find((c) => c.id === playerIdOf(settingId, characters)) : null;
    const playerNames = [...(playerChar ? callNames(playerChar) : []), clean(SillyTavern.getContext().name1)].filter(Boolean);
    for (const key of ['note', 'summary', 'direction', 'situation']) parsed[key] = withoutPlayerActions(parsed[key], playerNames);
    const { note, created } = parsed;
    if (!note) throw new Error('The model wrote no briefing.');

    // Only what the recent chat brought up (the last few messages).
    const recentText = messages.slice(-4).map((m) => m.text).join('\n');
    const latestUserText = [...messages].reverse().find((m) => m.isUser)?.text ?? '';
    // Never at random: brought up by the chat, or tied to what the setting
    // already has (prompt.js relevance). Items only for plot points.
    const known = everything.map((e) => ({ id: e.id, name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [] }));
    const typeIds = new Set(types.map((t) => t.id));
    const wanted = [];
    for (const c of created) {
        // Only kinds State Engine has.
        if (!typeIds.has(c.kind)) continue;
        const r = relevance(c, { recentText, latestUserText, quests: guidance.quests, known });
        if (r.ok) wanted.push({ ...c, tiedIds: r.tiedIds });
    }
    if (wanted.length < created.length) console.info(LOG_PREFIX, `the director left out ${created.length - wanted.length} new thing(s): not brought up by the chat or tied to the setting, or an item that is only flavour`);
    const made = settingId && settings.director.allowCreate && !canonOnly
        ? await createNeeded(chatId, chatKey, settingId, wanted, guidance.location?.id ?? null)
        : [];
    if (settingId) enrichThin(chatId, chatKey, settingId, guidance);
    if (settingId && isNewTurn(type)) await renameNamed(chatId, chatKey, settingId, parsed.renames, characters, recentText);

    // The scene's title: the game master names it, and renames it when the
    // scene moves on (sb__canon_scene; also written into sb__scene_title).
    const currentTitle = getChatDoc(chatKey).canonical.sceneTitle;
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
    if (isNewTurn(type) && settingId && parsed.move) {
        const moved = await moveScene(chatId, chatKey, settingId, parsed.move, { guidance, characters, castIds, recentText, canCreate: settings.director.allowCreate && !canonOnly });
        if (moved) {
            movedFrom = moved.from;
            baseCast = moved.castIds;
        }
    }

    if (isNewTurn(type) && settingId) {
        // Whoever the SITUATION line has doing something is in the scene -
        // the game master does not always write ENTERS for someone who was
        // already there or came back - unless the user took them out by hand.
        const doc = getChatDoc(chatKey);
        const heldOut = new Set(doc.held.filter((h) => h.field === 'cast' && h.op === 'remove' && h.until > doc.turn).map((h) => h.objectId));
        const left = new Set(parsed.leaves.map((n) => String(n).toLowerCase()));
        const seen = peopleNamedIn(parsed.situation, characters).filter((c) => !baseCast.includes(c.id) && !heldOut.has(c.id) && !callNames(c).some((n) => left.has(n.toLowerCase())));
        if (seen.length) parsed.enters = [...new Set([...parsed.enters, ...seen.map((c) => c.name)])];
        const after = castAfter(characters, baseCast, parsed, made.map((m) => ({ ...m, here: created.find((c) => c.name === m.name)?.here })), playerIdOf(settingId, characters));
        // ENTERS and LEAVES that name creatures (the zombies) change the
        // creatures in the scene.
        const creatures = await listEntries(chatId, settingId, 'creature');
        const findCreature = (name) => creatures.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n).toLowerCase() === String(name).toLowerCase()))
            ?? creatures.find((c) => mentionedIn(name, c.name));
        const creatureIds = new Set(getChatDoc(chatKey).canonical.creatureIds);
        const creatureNames = { in: [], out: [] };
        for (const name of parsed.enters) { const c = !characters.some((x) => x.name.toLowerCase() === name.toLowerCase()) && findCreature(name); if (c && !creatureIds.has(c.id)) { creatureIds.add(c.id); creatureNames.in.push(c.name); } }
        for (const name of parsed.leaves) { const c = findCreature(name); if (c && creatureIds.has(c.id)) { creatureIds.delete(c.id); creatureNames.out.push(c.name); } }
        if (creatureNames.in.length || creatureNames.out.length) {
            setCanonical(chatKey, { creatureIds: [...creatureIds] }, { chatId, source: 'director', note: [creatureNames.in.length ? `${creatureNames.in.join(', ')} appear` : '', creatureNames.out.length ? `${creatureNames.out.join(', ')} gone` : ''].filter(Boolean).join('; ') });
        }
        moves = after.names;
        if (moves.in.length || moves.out.length) {
            const note2 = [moves.in.length ? `${moves.in.join(', ')} arrive${moves.in.length === 1 ? 's' : ''}` : '', moves.out.length ? `${moves.out.join(', ')} leave${moves.out.length === 1 ? 's' : ''}` : ''].filter(Boolean).join('; ');
            setCanonical(chatKey, { castIds: after.castIds }, { chatId, source: 'director', note: note2 });
        }
        if (settings.time.enabled) {
            // The clock just started: first the story's own time of day.
            if (getChatDoc(chatKey).clock.needsNow) await setTimeOfDay(chatId, chatKey, settingId, parsed.now);
            const wanted = parsed.time?.text || perTurnDefault();
            const moved = await advanceBy(chatId, chatKey, settingId, wanted, { planned: true, source: 'director', note: `Time passes: ${wanted}${parsed.time?.why ? ` (${parsed.time.why})` : ''}` })
                ?? await advanceBy(chatId, chatKey, settingId, perTurnDefault(), { planned: true, source: 'director', note: `Time passes: ${perTurnDefault()}` });
            if (moved) timeText = wanted;
            // A move along a route takes at least its travel time.
            if (movedFrom) await travelAlong(chatId, chatKey, settingId, movedFrom, getChatDoc(chatKey).canonical.locationId);
            // A change of weather the plot calls for: held a while, like the
            // story's own, then the simulation takes over again.
            if (parsed.weather) {
                await holdStoryWeather(chatKey, settingId, parsed.weather.values, undefined);
                const now = getChatDoc(chatKey).canonical.time;
                if (Number.isFinite(now)) await setTime(chatId, chatKey, settingId, now, { source: 'director', note: `The weather turns: ${parsed.weather.values.join(', ')}${parsed.weather.why ? ` (${parsed.weather.why})` : ''}` });
            }
        }
    }

    const result = { note, summary: parsed.summary, direction: parsed.direction, key, at: new Date().toISOString(), created: [...doc.director.created, ...made].slice(-20), error: '', time: timeText, moves };
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
