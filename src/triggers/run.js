// Story triggers - the runner (the model and the why: src/triggers/model.js).
// Arms a trigger (its variable in the chat's own preset), checks the armed
// ones after each reply, marks those that bore fruit and deletes their
// variables, and retires triggers no longer wanted. Never throws.

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { findPreset, createPreset, activatePreset } from '../api/presets.js';
import { createVariable, deleteVariable, getVariableValues } from '../api/variables.js';
import { triggerPresetName, triggerVariableName, triggerVariableDef, firedTriggers, ARMED_LIMIT, PLANNER_ARMED_LIMIT, sameWhen } from './model.js';

// The chat's trigger preset, made and active in this chat.
async function ensurePreset(chatId, chatKey) {
    const name = triggerPresetName(chatKey);
    if (!await findPreset(name)) {
        const made = await createPreset({ name, description: 'Story triggers for one chat (Scenario Builder): conditions the story is watched for. Made and retired automatically.', triggers: ['ai'], showInTracker: false });
        if (!made) throw new Error('State Engine would not make the triggers preset');
    }
    await activatePreset(chatId, name);
    return name;
}

// Arms a trigger: { kind, when, then, target?, day?, source? }.
// -> the trigger, or null (refused: too many armed, nothing to watch).
export async function armTrigger(chatId, chatKey, { kind = 'story', when = '', then = '', target = '', day = null, source = 'user' } = {}) {
    try {
        const doc = getChatDoc(chatKey);
        const armed = doc.gm.triggers.filter((t) => t.status === 'armed');
        if (armed.length >= ARMED_LIMIT) return null;
        if (source === 'planner' && armed.filter((t) => t.source === 'planner').length >= PLANNER_ARMED_LIMIT) return null;
        if (armed.some((t) => t.kind === kind && (kind === 'story' ? sameWhen(t.when, when) : t.target === target && t.day === day))) return null;
        const trigger = { id: newLocalId('trg'), kind, when, then, target, day, source, status: 'armed', at: new Date().toISOString(), firedAt: '', shownFor: null, variable: '' };
        const def = triggerVariableDef(trigger);
        if (def) {
            const preset = await ensurePreset(chatId, chatKey);
            trigger.variable = triggerVariableName(chatKey, trigger.id);
            if (!await createVariable(preset, trigger.variable, def)) throw new Error('State Engine would not make its variable');
        }
        updateChatDoc(chatKey, (d) => { d.gm.triggers = [...d.gm.triggers, trigger]; });
        return trigger;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not arm the trigger', err);
        return null;
    }
}

async function dropVariable(chatKey, t) {
    if (!t?.variable) return;
    try {
        await deleteVariable(triggerPresetName(chatKey), t.variable);
    } catch (err) {
        console.debug(LOG_PREFIX, `could not delete ${t.variable}`, err);
    }
}

// Takes a trigger down (the user, or a new outline that no longer wants it).
export async function retireTrigger(chatKey, id) {
    const t = getChatDoc(chatKey).gm.triggers.find((x) => x.id === id);
    if (!t) return;
    await dropVariable(chatKey, t);
    updateChatDoc(chatKey, (d) => { d.gm.triggers = d.gm.triggers.map((x) => (x.id === id ? { ...x, status: x.status === 'armed' ? 'retired' : x.status } : x)); });
}

// Forgets triggers that are done or retired (the list's history).
export function clearFinishedTriggers(chatKey) {
    updateChatDoc(chatKey, (d) => { d.gm.triggers = d.gm.triggers.filter((t) => t.status === 'armed' || t.status === 'fired'); });
}

// After a reply: the armed triggers that bore fruit are marked fired (their
// "then" goes to the game master next) and their variables deleted.
// -> the fired triggers.
export async function checkTriggers(chatId, chatKey) {
    try {
        const doc = getChatDoc(chatKey);
        const armed = doc.gm.triggers.filter((t) => t.status === 'armed');
        if (!armed.length) return [];
        const names = armed.map((t) => t.variable).filter(Boolean);
        const values = names.length ? await getVariableValues(chatId, names) : {};
        const ids = new Set(firedTriggers(armed, { values, day: doc.canonical.day }));
        if (!ids.size) return [];
        const at = new Date().toISOString();
        updateChatDoc(chatKey, (d) => { d.gm.triggers = d.gm.triggers.map((t) => (ids.has(t.id) ? { ...t, status: 'fired', firedAt: at } : t)); });
        const fired = armed.filter((t) => ids.has(t.id));
        for (const t of fired) await dropVariable(chatKey, t);
        console.info(LOG_PREFIX, `story triggers fired: ${fired.map((t) => t.when || t.then).join('; ')}`);
        return fired;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not check the story triggers', err);
        return [];
    }
}

// The planner's triggers from an outline pass: [{ when, then }]. Those it
// still wants stay, new ones are armed (story flags), and its earlier ones
// that the new outline no longer wants are retired.
export async function plannerTriggers(chatId, chatKey, wanted = []) {
    const list = (wanted ?? []).filter((w) => w?.when && w?.then);
    const mine = getChatDoc(chatKey).gm.triggers.filter((t) => t.source === 'planner' && t.status === 'armed');
    for (const t of mine) if (!list.some((w) => sameWhen(w.when, t.when))) await retireTrigger(chatKey, t.id);
    for (const w of list) await armTrigger(chatId, chatKey, { kind: 'story', when: w.when, then: w.then, source: 'planner' });
}

// Every armed trigger the planner made, retired (a volume closes).
export async function retirePlannerTriggers(chatKey) {
    for (const t of getChatDoc(chatKey).gm.triggers.filter((x) => x.source === 'planner' && x.status === 'armed')) await retireTrigger(chatKey, t.id);
}

// The game master has seen the fired triggers for the player's message
// `userIndex`: a swipe of that reply sees them again, the next turn not.
export function markTriggersShown(chatKey, userIndex) {
    updateChatDoc(chatKey, (d) => {
        d.gm.triggers = d.gm.triggers.map((t) => {
            if (t.status !== 'fired') return t;
            if (t.shownFor === null) return { ...t, shownFor: userIndex };
            return t.shownFor === userIndex ? t : { ...t, status: 'done' };
        });
    });
}
