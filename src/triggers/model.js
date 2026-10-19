// Story triggers - events that fire on conditions (SB-435), built on State
// Engine's variables rather than on more model calls (the user's choice):
//
//   when  what has to happen - and how it is watched:
//         story   a prompted FLAG (boolean, flagMode: once true it stays
//                 true) State Engine answers in its ordinary update
//         place   a CALCULATED variable: sb__canon_location == "<id>"
//         person  a CALCULATED variable: sb__canon_characters contains "<id>"
//         day     no variable: the canonical day reaching N
//   then  what happens because of it, told to the game master in private
//         for the next reply.
//
// Each chat has its own small preset for them ("Story triggers · <chat>"),
// active only there. After each reply Scenario Builder reads them; one that
// has borne fruit is marked fired, its "then" goes to the game master once,
// and its variable is deleted - State Engine's update stays lean. Pure: the
// runner is src/triggers/run.js.

export const TRIGGER_KINDS = Object.freeze(['story', 'place', 'person', 'day']);
export const TRIGGER_STATUSES = Object.freeze(['armed', 'fired', 'done', 'retired']);
// At most this many armed at once, so State Engine's update stays small.
export const ARMED_LIMIT = 12;
export const PLANNER_ARMED_LIMIT = 4;

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const str = (v) => (typeof v === 'string' ? v : '');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function normalizeTrigger(t) {
    if (!isObject(t) || !clean(t.id) || !clean(t.then)) return null;
    const kind = TRIGGER_KINDS.includes(t.kind) ? t.kind : 'story';
    return {
        id: clean(t.id),
        kind,
        when: clean(t.when).slice(0, 300),
        target: clean(t.target),
        day: Number.isInteger(t.day) && t.day > 0 ? t.day : null,
        then: clean(t.then).slice(0, 500),
        variable: clean(t.variable),
        source: t.source === 'planner' ? 'planner' : 'user',
        status: TRIGGER_STATUSES.includes(t.status) ? t.status : 'armed',
        at: str(t.at),
        firedAt: str(t.firedAt),
        // The player's message the "then" was first shown for: a swipe of
        // that reply sees it again, the next turn does not.
        shownFor: Number.isInteger(t.shownFor) ? t.shownFor : null,
    };
}

export const normalizeTriggers = (list) => (Array.isArray(list) ? list.map(normalizeTrigger).filter(Boolean) : []).slice(-60);

// The preset that holds one chat's triggers (presets are shared by every
// chat that activates them, so each chat has its own).
export function triggerPresetName(chatKey) {
    let h = 0;
    for (const ch of String(chatKey ?? '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return `Story triggers · ${h.toString(36)}`;
}

// A trigger's variable: unique in Scenario Builder's namespace.
export const triggerVariableName = (chatKey, id) => `trg_${triggerPresetName(chatKey).split(' · ')[1]}_${String(id).replace(/[^a-z0-9]+/gi, '').slice(0, 16)}`;

// State Engine's definition of the variable that watches a trigger, or
// null when it needs none (a day). canon: qualified names of Scenario
// Builder's canonical variables.
export function triggerVariableDef(t, { location = 'sb__canon_location', characters = 'sb__canon_characters' } = {}) {
    const label = clean(t.when).slice(0, 60) || 'Story trigger';
    const base = { label, description: `Story trigger: ${clean(t.when)}`, scope: 'chat', showInTracker: false, defaultValue: 'false' };
    if (t.kind === 'story') {
        return {
            ...base, type: 'boolean', flagMode: true,
            behaviors: { prompted: true, increment: false },
            prompted: { instructions: `true once the story has SHOWN this happen: ${clean(t.when)}. Not when it is only planned, expected, feared or talked about. Otherwise false.`, newEachTurn: false },
        };
    }
    const id = clean(t.target).replace(/"/g, '');
    if (t.kind === 'place' && id) return { ...base, defaultValue: 0, type: 'calculated', dependencies: [location], expression: `${location} == "${id}"`, behaviors: { prompted: false, increment: false } };
    if (t.kind === 'person' && id) return { ...base, defaultValue: 0, type: 'calculated', dependencies: [characters], expression: `${characters}.contains("${id}")`, behaviors: { prompted: false, increment: false } };
    return null;
}

const truthy = (v) => v === true || v === 1 || String(v ?? '').trim().toLowerCase() === 'true' || String(v ?? '').trim() === '1';

// The armed triggers that have borne fruit. values: { [variable]: value };
// day: the canonical day. -> [trigger id]
export function firedTriggers(triggers, { values = {}, day = null } = {}) {
    return (triggers ?? []).filter((t) => t.status === 'armed' && (t.kind === 'day'
        ? Number.isInteger(day) && Number.isInteger(t.day) && day >= t.day
        : truthy(values[t.variable]))).map((t) => t.id);
}

// The private lines for the game master: triggers fired and not yet played,
// for the player's message `userIndex` (the latest one).
export function triggerLines(triggers, userIndex) {
    return (triggers ?? [])
        .filter((t) => t.status === 'fired' && (t.shownFor === null || t.shownFor === userIndex))
        .map((t) => `- Now, because ${clean(t.when) || 'the moment has come'}: ${clean(t.then)} - make it happen in this reply, from the world's side (never for the player character).`);
}

// Whether two trigger conditions are the same one in other words.
export function sameWhen(a, b) {
    const words = (s) => new Set((clean(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 4));
    const wa = words(a);
    const wb = words(b);
    if (!wa.size || !wb.size) return false;
    const shared = [...wa].filter((w) => wb.has(w)).length;
    return shared / Math.min(wa.size, wb.size) >= 0.7;
}
