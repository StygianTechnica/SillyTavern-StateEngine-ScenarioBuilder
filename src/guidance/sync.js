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
import { getBoundSettingId, readField, listEntries } from '../library/library.js';
import { pathOf, inheritedEnvironment } from '../library/hierarchy.js';
import { buildGuidance, buildStateBlock, timeText } from './build.js';
import { hasArchivist, storyRelationships } from '../library/story-relations.js';
import { relationsFor, pairCovered } from '../library/relations-edit.js';
import { activeQuests } from '../quests/sync.js';

export const GUIDANCE_CHANGED_EVENT = 'scenario_builder_guidance_changed';

// The latest build, for the preview (SB-314) and the public API:
// { chatKey, guidance: { text, tokens, sections }, stateBlock, inert, reason }.
let last = { chatKey: null, guidance: { text: '', tokens: 0, sections: [] }, stateBlock: '', inert: true, reason: 'Not started yet.' };

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
            const placedHere = async (typeId) => (await listEntries(chatId, settingId, typeId)).filter((o) => (o.base?.location ?? o.location) === obj.id).map(short);
            // The story's current description wins over the base one.
            location = {
                path: locationPath,
                description: doc.narrative[obj.id]?.text || obj.description || '',
                conditions: await readField(chatId, obj.id, 'se__location.conditions', 'conditions'),
                environment,
                indoor: c.indoor,
                places,
                partOf: partOf ? short(partOf) : null,
                items: await placedHere('item'),
                creatures: await placedHere('creature'),
                source: sceneSource,
                id: obj.id,
            };
        }
    }

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
            role: await readField(chatId, id, 'se__character.role', 'role'),
            description: doc.narrative[id]?.text || obj.description || '',
            personality: text(base.personality),
            goals: text(base.goals),
            mood: await readField(chatId, id, 'se__character.mood', 'mood'),
            intent: await readField(chatId, id, 'se__character.intent', 'intent'),
            thought: await readField(chatId, id, 'se__character.thought', 'thought'),
            relations: [],
            id,
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
                why: [q.priority.level, ...q.priority.reasons].join(', '),
            }));
        } catch (err) {
            console.debug(LOG_PREFIX, 'no quests for the guidance', err);
        }
    }

    const time = { day: c.day, dayPart: c.dayPart };
    return {
        guidance: {
            // The game master's briefing (src/director/), written before
            // the reply; the rest is the scene it was written from.
            director: settings.director.enabled ? doc.director.note : '',
            overview: library.overview,
            location,
            time,
            weather: c.weather,
            temperature: c.temperature,
            scene: { title: c.sceneTitle, premise: c.scenePremise },
            cast,
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
            castNames: cast.map((x) => x.name),
        },
        canonicalValues: {
            canon_location: c.locationId || '',
            canon_characters: [...c.castIds],
            canon_weather: [...c.weather],
            canon_temperature: c.temperature || '',
            canon_setting: c.indoor === true ? 'indoors' : (c.indoor === false ? 'outdoors' : ''),
            canon_time: timeText(time),
            canon_scene: c.sceneTitle || '',
        },
        settingId,
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
            await writeIfChanged(ref.chatId, { guidance: '', state_block: '' });
            last = { chatKey, guidance: { text: '', tokens: 0, sections: [] }, stateBlock: '', inert: true, reason: getSettings().enabled ? 'Paused.' : 'Scenario Builder is disabled.' };
            announce();
            return;
        }

        const inputs = await gatherInputs(ref.chatId, chatKey);
        const guidance = buildGuidance(inputs.guidance);
        const stateBlock = getSettings().stateBlockEnabled ? buildStateBlock(inputs.stateBlock) : '';
        await writeIfChanged(ref.chatId, { ...inputs.canonicalValues, guidance: guidance.text, state_block: stateBlock });

        const doc = getChatDoc(chatKey);
        if (doc.settingId !== inputs.settingId) updateChatDoc(chatKey, (d) => { d.settingId = inputs.settingId; });

        last = { chatKey, guidance, stateBlock, inert: false, reason: '' };
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
