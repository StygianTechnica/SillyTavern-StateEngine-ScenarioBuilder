// Keeps the open chat's outputs current: gathers the inputs (library,
// canonical state, object runtime values), builds sb__guidance and
// sb__state_block (src/guidance/build.js), and writes them - plus the
// canonical sb__canon_* variables - through State Engine's write path,
// only when a value actually changed (SB-306).
//
// Rebuilt (debounced) when the chat document, the library, State Engine's
// variables, the settings or the chat change, and immediately before each
// generation (SB-213, after validation - SB-502). Gathering reads only
// local State Engine data: it never waits on a network call (SB-801).
//
// Inert (outputs '') when Scenario Builder is disabled or paused, no chat
// is open, or the Scenario State preset is missing or inactive (SB-203,
// SB-304, SB-503).

import { LOG_PREFIX } from '../constants.js';
import { getSettings, isActive } from '../settings.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { getChatDoc, updateChatDoc, SCENARIO_CHANGED_EVENT } from '../store/chat-store.js';
import { getSettingDoc, LIBRARY_CHANGED_EVENT } from '../store/setting-store.js';
import { getVariableValues, getRawValues, setVariableValue, VARIABLES_CHANGED_EVENT } from '../api/variables.js';
import { getObject, listObjects } from '../api/objects.js';
import { PRESET_NAME } from '../preset/blueprint.js';
import { getPresetStatus, PRESET_STATUS_EVENT } from '../preset/scenario-preset.js';
import { triggerLines } from '../triggers/model.js';
import { deadText } from '../state/death.js';
import { creatureFormOf } from '../library/creature-form.js';
import { latestUserIndex } from '../triggers/run.js';
import { getBoundSettingId, readField, listEntries, playerIdOf, allKnowledge } from '../library/library.js';
import { sceneKnowledge } from '../library/knowledge.js';
import { pathOf, inheritedEnvironment } from '../library/hierarchy.js';
import { buildGuidance, buildStateBlock, buildCast, guidanceParts, GUIDANCE_PARTS, timeText } from './build.js';
import { isIntimate } from './intimacy.js';
import { hasArchivist, storyRelationships } from '../library/story-relations.js';
import { relevantLore } from '../library/lore.js';
import { placeOverview } from '../library/world-options.js';
import { relationsFor, pairCovered } from '../library/relations-edit.js';
import { activeQuests } from '../quests/sync.js';
import { momentAt } from '../calendar/clock.js';
import { routesFrom, placesFurtherOn } from '../library/routes.js';
import { splitNote } from '../director/prompt.js';
import { weatherText } from '../calendar/weather.js';

export const GUIDANCE_CHANGED_EVENT = 'scenario_builder_guidance_changed';

// The latest build, for the preview (SB-314) and the public API:
// { chatKey, guidance: { text, tokens, sections }, stateBlock, inert, reason }.
let last = { chatKey: null, guidance: { text: '', tokens: 0, sections: [] }, cast: '', stateBlock: '', inert: true, reason: 'Not started yet.' };

export function getLastBuild() {
    return structuredClone(last);
}

function announce() {
    try {
        SillyTavern.getContext().eventSource.emit(GUIDANCE_CHANGED_EVENT, last.chatKey);
    } catch {
        // No event bus.
    }
}

// When Scenario Builder has no canonical location or cast yet: what the
// story says (its own prompted scene variables), else State Engine's Scene
// Context, else the characters State Engine marks present.
async function sceneFallbacks(chatId) {
    const out = { locationId: '', castIds: [] };
    try {
        const v = await getRawValues(chatId, ['sb__scene_location', 'sb__scene_characters', 'se__scene_location', 'se__scene_characters']);
        out.locationId = (typeof v.sb__scene_location === 'string' && v.sb__scene_location) || (typeof v.se__scene_location === 'string' && v.se__scene_location) || '';
        const list = (x) => (Array.isArray(x) ? x.filter((id) => typeof id === 'string' && id) : []);
        out.castIds = list(v.sb__scene_characters).length ? list(v.sb__scene_characters) : list(v.se__scene_characters);
        if (!out.castIds.length) out.castIds = (await listObjects(chatId, 'character')).filter((o) => o.runtime?.present === true || o.present === true).map((o) => o.id);
    } catch (err) {
        console.debug(LOG_PREFIX, 'no scene fallbacks', err);
    }
    return out;
}

// Everything buildGuidance()/buildStateBlock() need, for one chat.
export async function gatherInputs(chatId, chatKey) {
    const settings = getSettings();
    const doc = getChatDoc(chatKey);
    const settingId = await getBoundSettingId(chatId);
    const library = settingId ? getSettingDoc(settingId) : { overview: {}, entries: {} };
    const parents = Object.fromEntries(Object.entries(library.entries).filter(([, m]) => m.parentId).map(([id, m]) => [id, m.parentId]));
    const c = doc.canonical;

    const names = new Map();
    const nameOf = async (id) => {
        if (!names.has(id)) names.set(id, (await getObject(chatId, id))?.name ?? '');
        return names.get(id);
    };

    // Where the scene is: the canonical location; failing that, what the
    // story says (sb__scene_location), or State Engine's own Scene Context.
    const fallback = await sceneFallbacks(chatId);
    const locationId = c.locationId || fallback.locationId;
    const castIds = c.castIds.length ? c.castIds : fallback.castIds;
    const sceneSource = c.locationId ? 'canonical' : (locationId ? 'from the story' : '');

    let location = null;
    let locationPath = [];
    if (locationId) {
        const obj = await getObject(chatId, locationId);
        if (obj) {
            names.set(obj.id, obj.name);
            for (const id of pathOf(parents, obj.id)) {
                const name = await nameOf(id);
                if (name) locationPath.push(name);
            }
            const envById = Object.fromEntries(Object.entries(library.entries).map(([id, m]) => [id, m.environment]));
            const environment = {};
            for (const [key, { value, from }] of Object.entries(inheritedEnvironment(parents, envById, obj.id))) {
                environment[key] = { value, from: from === obj.id ? '' : await nameOf(from) };
            }
            // What is here: places off it (rooms, streets), the place it is
            // part of, and the items and creatures the library puts here.
            const allLocations = await listEntries(chatId, settingId, 'location');
            const short = (o) => ({ name: o.name, description: doc.narrative[o.id]?.text || o.description || '' });
            const places = allLocations.filter((l) => parents[l.id] === obj.id).map(short);
            const partOf = parents[obj.id] ? allLocations.find((l) => l.id === parents[obj.id]) : null;
            // The story's current description wins over the base one.
            location = {
                path: locationPath,
                description: doc.narrative[obj.id]?.text || obj.description || '',
                conditions: await readField(chatId, obj.id, 'se__location.conditions', 'conditions'),
                environment,
                indoor: c.indoor,
                places,
                partOf: partOf ? short(partOf) : null,
                // Routes to other places, with their travel time.
                routes: routesFrom(obj.id, library.routes).map(({ route, otherId }) => ({ name: allLocations.find((l) => l.id === otherId)?.name ?? '', travel: route.travel, note: route.note })).filter((r) => r.name),
                // Places a few routes further on, with the way on they are
                // reached through - a journey there goes straight there.
                further: placesFurtherOn(obj.id, library.routes).map(({ id, via }) => ({ name: allLocations.find((l) => l.id === id)?.name ?? '', via: allLocations.find((l) => l.id === via)?.name ?? '' })).filter((r) => r.name && r.via).slice(0, 8),
                items: (await listEntries(chatId, settingId, 'item'))
                    .filter((o) => (o.base?.location ?? o.location) === obj.id || castIds.includes(o.base?.owner ?? o.owner))
                    .map((o) => ({ ...short(o), id: o.id, carriedBy: (o.base?.location ?? o.location) === obj.id ? '' : (o.base?.owner ?? o.owner) })),
                // Creatures the library places here, and those the story or
                // the director has in the scene. `active`: in the scene now;
                // otherwise it only lives here, unseen until the story brings
                // it in. What the director acts on: its traits, danger and
                // State Engine's live state for it.
                creatures: await Promise.all((await listEntries(chatId, settingId, 'creature'))
                    .filter((o) => (o.base?.location ?? o.location) === obj.id || c.creatureIds.includes(o.id))
                    .map(async (o) => {
                        const base = o.base ?? o;
                        return {
                            ...short(o),
                            id: o.id,
                            active: c.creatureIds.includes(o.id),
                            // One being, or a kind with its count here
                            // (src/library/creature-form.js).
                            form: creatureFormOf(o),
                            count: Number.isInteger(c.creatureCounts?.[o.id]) ? c.creatureCounts[o.id] : null,
                            traits: Array.isArray(base.traits) ? base.traits.join(', ') : (typeof base.traits === 'string' ? base.traits : ''),
                            danger: typeof base.danger_level === 'string' ? base.danger_level : '',
                            state: await readField(chatId, o.id, '', 'state'),
                        };
                    })),
                source: sceneSource,
                id: obj.id,
            };
        }
    }

    // The character the user plays: marked so nothing speaks for them.
    const allCharacters = settingId ? await listEntries(chatId, settingId, 'character') : [];
    const playerId = settingId ? playerIdOf(settingId, allCharacters) : '';
    const cast = [];
    for (const id of castIds) {
        const obj = await getObject(chatId, id);
        if (!obj) continue;
        names.set(id, obj.name);
        const base = obj.base ?? obj;
        const text = (v) => (Array.isArray(v) ? v.join(', ') : (typeof v === 'string' ? v : ''));
        // Runtime values by field role (SB-441); GM notes are never read here (SB-123).
        cast.push({
            name: obj.name,
            aliases: obj.aliases ?? base.aliases ?? [],
            role: await readField(chatId, id, 'se__character.role', 'role'),
            description: doc.narrative[id]?.text || obj.description || '',
            personality: text(base.personality),
            voice: text(base.voice),
            goals: text(base.goals),
            mood: await readField(chatId, id, 'se__character.mood', 'mood'),
            intent: await readField(chatId, id, 'se__character.intent', 'intent'),
            thought: await readField(chatId, id, 'se__character.thought', 'thought'),
            relations: [],
            id,
            // Read only while the scene is intimate (src/guidance/intimacy.js).
            nsfw: settingId ? library.entries?.[id]?.nsfw ?? '' : '',
            player: id === playerId,
            provisional: settingId ? (library.entries?.[id]?.provisional === true) : false,
            why: c.castIds.length ? 'canonically present' : 'present in the story',
        });
    }
    // How the characters present relate to each other: the relationships
    // the user authored first, then the story's (Archivist) for pairs the
    // user has not written.
    if (cast.length > 1) {
        const present = new Set(castIds);
        const nameById = new Map(cast.map((m) => [m.id, m.name]));
        const authored = settingId ? library.relations ?? [] : [];
        for (const member of cast) {
            const lines = relationsFor(member.id, authored).filter((r) => present.has(r.otherId))
                .map((r) => `toward ${nameById.get(r.otherId)}: ${r.kind}${r.rel.note ? ` (${r.rel.note})` : ''}`);
            if (hasArchivist()) {
                const rels = (await storyRelationships({ id: member.id, name: member.name }))
                    .filter((r) => r.direction === 'out' && present.has(r.otherId) && !pairCovered(member.id, r.otherId, authored));
                lines.push(...rels.map((r) => `toward ${r.otherName}: ${[r.type, r.polarityLabel, r.trend].filter(Boolean).join(', ')}`));
            }
            member.relations = lines.sort();
            if (lines.length) member.why = 'canonically present; relationships';
        }
    }

    // People the user took out of the scene by hand (src/validate/reconcile.js
    // holdUserScene), while that holds.
    const absent = [];
    for (const h of doc.held.filter((x) => x.field === 'cast' && x.op === 'remove' && x.until > doc.turn && !castIds.includes(x.objectId))) {
        const name = (await getObject(chatId, h.objectId))?.name;
        if (name) absent.push(name);
    }

    // Whether State Engine's own scene tracker has anyone here besides the
    // player character (and those taken out by hand): then the "no one
    // else is here" guidance is never given, even when the canonical cast
    // lags behind.
    let othersTracked = false;
    try {
        const heldOut = new Set(doc.held.filter((x) => x.field === 'cast' && x.op === 'remove' && x.until > doc.turn).map((x) => x.objectId));
        const tracked = (await getRawValues(chatId, ['se__scene_characters'])).se__scene_characters;
        othersTracked = Array.isArray(tracked) && tracked.some((id) => typeof id === 'string' && id !== playerId && !heldOut.has(id));
    } catch (err) {
        console.debug(LOG_PREFIX, "could not read State Engine's scene tracker", err);
    }

    // Secrets and oaths (src/library/knowledge.js): what each person here
    // knows and has sworn, and who here must not know a secret.
    let secretRules = [];
    if (settingId && cast.length) {
        try {
            const nameById = new Map(allCharacters.map((c) => [c.id, c.name]));
            const knowledge = await allKnowledge(settingId, (id) => nameById.get(id) ?? '');
            const { members, rules } = sceneKnowledge(knowledge, cast);
            for (const member of cast) {
                const k = members.get(member.id ?? member.name);
                if (k) Object.assign(member, { knows: k.knows, sworn: k.sworn, owed: k.owed });
            }
            secretRules = rules;
        } catch (err) {
            console.debug(LOG_PREFIX, 'no secrets or oaths for the guidance', err);
        }
    }

    // The active quests (most important first, a few at most).
    let quests = [];
    if (settingId) {
        try {
            quests = (await activeQuests(chatId, chatKey, settingId)).slice(0, 3).map((q) => ({
                name: q.name,
                type: q.type,
                priority: q.priority.level,
                current: q.runtime.current || q.current?.text || '',
                progress: q.runtime.progress || (q.progress.total ? `${q.progress.done} of ${q.progress.total} objectives done` : ''),
                description: q.description,
                // Where it is heading: the story can work toward its end.
                completion: q.completion ?? '',
                // A mission's parts: who it is for, from whom, what it pays.
                mission: q.mission ? { client: q.mission.client, giver: q.mission.giverName, reward: q.mission.reward, difficulty: q.mission.difficulty } : null,
                why: [q.priority.level, ...q.priority.reasons].join(', '),
            }));
        } catch (err) {
            console.debug(LOG_PREFIX, 'no quests for the guidance', err);
        }
    }

    const time = { day: c.day, dayPart: c.dayPart };

    // The clock (src/calendar/clock.js): the date, the sky, what people
    // feel at this hour, holidays.
    let moment = null;
    if (settings.time.enabled && Number.isFinite(c.time)) {
        try {
            moment = await momentAt(settingId, c.time, { locationId, indoor: c.indoor });
        } catch (err) {
            console.debug(LOG_PREFIX, 'no clock for the guidance', err);
        }
    }
    const clock = moment ? {
        words: moment.dateWords,
        clock: moment.timeText,
        dayPart: c.dayPart,
        season: moment.season,
        sky: moment.sky.text,
        needs: moment.needs,
        holiday: moment.holidayText,
        open: moment.place.open,
    } : null;
    const events = moment ? [
        ...moment.holidays.today.map((t) => t.holiday.name),
        ...moment.holidays.soon.map((x) => `${x.holiday.name} (${x.inDays === 1 ? 'tomorrow' : `in ${x.inDays} days`})`),
    ] : [];

    // Lore that matters here (src/library/lore.js): named in the last few
    // messages (or a distinctive part of its name is), tied to someone or
    // something they name, or tied to this place, the places it is in or the
    // people present. Most relevant first.
    let lore = [];
    if (settingId) {
        try {
            const sceneIds = [...(locationId ? [locationId, ...pathOf(parents, locationId)] : []), ...castIds];
            const recentText = (SillyTavern.getContext().chat ?? []).slice(-6).map((m) => String(m?.mes ?? '')).join('\n');
            const mentioned = [];
            for (const type of ['character', 'location', 'faction', 'item', 'creature']) {
                for (const o of await listEntries(chatId, settingId, type)) mentioned.push({ id: o.id, names: [o.name, ...(o.aliases ?? o.base?.aliases ?? [])] });
            }
            lore = relevantLore(await listEntries(chatId, settingId, 'lore'), { recentText, sceneIds, mentioned })
                .map(({ entry: o, why }) => ({ id: o.id, name: o.name, description: doc.narrative[o.id]?.text || o.description || '', why }));
        } catch (err) {
            console.warn(LOG_PREFIX, 'no lore for the guidance', err);
        }
    }
    let questIds = [];
    if (settingId) {
        try {
            questIds = (await activeQuests(chatId, chatKey, settingId)).map((q) => q.id);
        } catch {
            questIds = [];
        }
    }

    return {
        guidance: {
            // The game master's briefing (src/director/), written before
            // the reply; the rest is the scene it was written from.
            // Split again from the note when the record has no direction (a
            // briefing stored before the split, or one the split missed).
            director: settings.director.enabled
                ? (doc.director.direction ? { summary: doc.director.summary, direction: doc.director.direction } : splitNote(doc.director.note))
                : '',
            // The world as it holds where the scene is (a planet's tech level...).
            overview: placeOverview(library.overview, parents, library.entries, locationId),
            location,
            time,
            clock,
            weather: c.weather,
            temperature: c.temperature,
            weatherText: weatherText({ weather: c.weather, temperature: c.temperature }, { indoor: c.indoor === true, open: clock?.open !== false }),
            scene: { title: c.sceneTitle, premise: c.scenePremise },
            cast,
            // An intimate scene: the people's own notes for it are given.
            intimate: isIntimate(doc.nsfwMode, (await getVariableValues(chatId, ['scene_nsfw']).catch(() => ({}))).scene_nsfw),
            // Taken out of the scene by hand, while that holds.
            absent,
            // Story triggers set off for this reply (src/triggers/): the
            // narrator gets them even when the director fails.
            triggered: triggerLines(doc.gm.triggers, latestUserIndex()),
            // Who has died in this story (src/state/death.js).
            dead: deadText(doc),
            // The fight the director keeps (src/director/fight.js).
            fight: settings.director.enabled ? doc.fight : null,
            othersTracked,
            // Secrets kept from those present; oaths binding them.
            secrets: secretRules,
            lore,
            corrections: doc.corrections.map((x) => x.text),
            quests,
            sections: settings.sections,
            budget: settings.tokenBudget,
        },
        stateBlock: {
            locationPath,
            time,
            weather: c.weather,
            temperature: c.temperature,
            indoor: c.indoor,
            sceneTitle: c.sceneTitle,
            castNames: cast.map((x) => (x.player ? `${x.name} (player character)` : x.name)),
        },
        canonicalValues: {
            canon_location: c.locationId || '',
            canon_characters: [...c.castIds],
            canon_weather: [...c.weather],
            canon_temperature: c.temperature || '',
            canon_setting: c.indoor === true ? 'indoors' : (c.indoor === false ? 'outdoors' : ''),
            canon_time: timeText(time),
            canon_scene: c.sceneTitle || '',
            canon_summary: c.sceneSummary || '',
            canon_datetime: Number.isFinite(c.time) ? c.time : 0,
            canon_date: moment?.dateWords || moment?.dateText || '',
            canon_clock: moment?.timeText || '',
            canon_daypart: c.dayPart || '',
            canon_season: moment?.season || '',
            canon_sky: moment?.sky.text || '',
            canon_holiday: moment ? moment.holidays.today.map((t) => t.holiday.name).join(', ') : '',
            canon_items: (location?.items ?? []).map((x) => x.id).filter(Boolean),
            canon_creatures: (location?.creatures ?? []).map((x) => x.id).filter(Boolean),
            canon_quests: questIds,
            canon_lore: lore.map((x) => x.id),
            canon_events: events,
        },
        settingId,
        calendarId: moment?.calendarId ?? '',
    };
}


async function writeIfChanged(chatId, values) {
    const current = await getVariableValues(chatId, Object.keys(values));
    for (const [name, value] of Object.entries(values)) {
        if (JSON.stringify(current[name] ?? (Array.isArray(value) ? [] : '')) === JSON.stringify(value)) continue;
        await setVariableValue(chatId, PRESET_NAME, name, value);
    }
}

// Rebuilds and writes the open chat's outputs. Never throws.
export async function syncGuidance() {
    try {
        const ref = getCurrentChatRef();
        if (!ref) {
            last = { chatKey: null, guidance: { text: '', tokens: 0, sections: [] }, stateBlock: '', inert: true, reason: 'No chat is open.' };
            announce();
            return;
        }
        const chatKey = chatKeyFor(ref);
        const status = await getPresetStatus(ref.chatId);
        if (!status.active) {
            // The preset is not bound: State Engine holds no values for it
            // in this chat, so there is nothing to write - Curator sends nothing.
            last = { chatKey, guidance: { text: '', tokens: 0, sections: [] }, stateBlock: '', inert: true, reason: status.exists ? 'The Scenario State preset is not active in this chat.' : 'The Scenario State preset is missing.' };
            announce();
            return;
        }
        if (!isActive()) {
            await writeIfChanged(ref.chatId, { guidance: '', ...Object.fromEntries(GUIDANCE_PARTS.map(([name]) => [name, ''])), cast: '', state_block: '' });
            last = { chatKey, guidance: { text: '', tokens: 0, sections: [] }, stateBlock: '', inert: true, reason: getSettings().enabled ? 'Paused.' : 'Scenario Builder is disabled.' };
            announce();
            return;
        }

        const inputs = await gatherInputs(ref.chatId, chatKey);
        const guidance = buildGuidance(inputs.guidance);
        const stateBlock = getSettings().stateBlockEnabled ? buildStateBlock(inputs.stateBlock) : '';
        const cast = buildCast(inputs.guidance);
        const parts = guidanceParts(guidance);
        await writeIfChanged(ref.chatId, { ...inputs.canonicalValues, guidance: guidance.text, ...parts, cast, state_block: stateBlock });

        const doc = getChatDoc(chatKey);
        if (doc.settingId !== inputs.settingId) updateChatDoc(chatKey, (d) => { d.settingId = inputs.settingId; });

        last = { chatKey, guidance, parts, cast, stateBlock, inert: false, reason: '' };
        announce();
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not update the guidance', err);
    }
}

const DEBOUNCE_MS = 400;
let timer = null;

// Schedules a rebuild (debounced).
export function requestSync() {
    clearTimeout(timer);
    timer = setTimeout(() => void syncGuidance(), DEBOUNCE_MS);
}

// Builds now, cancelling a scheduled rebuild.
export async function syncNow() {
    clearTimeout(timer);
    await syncGuidance();
}

export function startGuidanceSync() {
    const { eventSource, eventTypes } = SillyTavern.getContext();
    for (const event of [SCENARIO_CHANGED_EVENT, LIBRARY_CHANGED_EVENT, PRESET_STATUS_EVENT, VARIABLES_CHANGED_EVENT, eventTypes.CHAT_CHANGED]) {
        eventSource.on(event, requestSync);
    }
    requestSync();
}
