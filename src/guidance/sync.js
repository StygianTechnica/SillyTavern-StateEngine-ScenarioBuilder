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
import { getVariableValues, setVariableValue, VARIABLES_CHANGED_EVENT } from '../api/variables.js';
import { getObject } from '../api/objects.js';
import { PRESET_NAME } from '../preset/blueprint.js';
import { getPresetStatus, PRESET_STATUS_EVENT } from '../preset/scenario-preset.js';
import { getBoundSettingId, readField } from '../library/library.js';
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

    let location = null;
    let locationPath = [];
    if (c.locationId) {
        const obj = await getObject(chatId, c.locationId);
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
            // The story's current description wins over the base one.
            location = { path: locationPath, description: doc.narrative[obj.id]?.text || obj.description || '', environment, indoor: c.indoor };
        }
    }

    const cast = [];
    for (const id of c.castIds) {
        const obj = await getObject(chatId, id);
        if (!obj) continue;
        names.set(id, obj.name);
        // Runtime values by field role (SB-441); GM notes are never read here (SB-123).
        cast.push({
            name: obj.name,
            role: await readField(chatId, id, 'se__character.role', 'role'),
            description: doc.narrative[id]?.text || obj.description || '',
            mood: await readField(chatId, id, 'se__character.mood', 'mood'),
            intent: await readField(chatId, id, 'se__character.intent', 'intent'),
            relations: [],
            id,
            why: 'canonically present',
        });
    }
    // How the characters present relate to each other: the relationships
    // the user authored first, then the story's (Archivist) for pairs the
    // user has not written.
    if (cast.length > 1) {
        const present = new Set(c.castIds);
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
