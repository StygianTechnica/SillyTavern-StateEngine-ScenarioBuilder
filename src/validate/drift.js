// World-state validation (spec 7.3) as pure functions: compare what State
// Engine extracted into the prompted sb__ variables (OBSERVED) with what
// Scenario Builder holds as true (CANONICAL), classify each difference,
// and decide what to do with it. No SillyTavern imports (SB-804); the
// runner is src/validate/reconcile.js.
//
// Value types are already valid - State Engine checks them (SB-222a).
// Only MEANING is checked here, against the library.
//
// Classifications (SB-221):
//   consistent     observed matches canonical                  -> nothing
//   natural        an allowed change (moving within the same place's
//                  part of the tree, a character leaving, weather)
//   library_match  an existing library object not yet in play
//   candidate      an object the library does not hold yet (State Engine
//                  created it unconfirmed while extracting)
//   contradiction  breaks library facts (a rejected name, a missing object)
//   ambiguous      cannot decide (e.g. everyone gone at once)
//
// Actions: 'accept' (canonical := observed), 'adopt' (something new the
// story introduced: it joins the library and the scene), 'adjust' (write
// canonical back, add a correction line to the guidance), 'ask' (queue for
// review), 'candidate' (review queue; observed kept, canonical unchanged).
//
// The story leads (the user's decision, over the spec's conservative
// SB-222/SB-225 defaults): by default whatever the roleplay establishes is
// accepted, and anything new it invents is adopted into the library to be
// fleshed out - never overridden. 'canonical' and 'ask' remain per-field
// options, and a setting marked canon-only (`adoptNew: false`) sends new
// inventions to the review queue instead of adopting them.

import { relation } from '../library/hierarchy.js';

// Resolution policy per field (SB-222): 'canonical' | 'observed' | 'ask'.
export const DEFAULT_POLICIES = Object.freeze({
    location: 'observed',
    cast: 'observed',
    weather: 'observed',
    temperature: 'observed',
    indoor: 'observed',
    title: 'observed',
});

export const POLICY_VALUES = Object.freeze(['canonical', 'observed', 'ask']);

export const FIELD_LABELS = Object.freeze({
    location: 'Location',
    cast: 'Characters present',
    weather: 'Weather',
    temperature: 'Temperature',
    indoor: 'Indoors / outdoors',
    title: 'Scene title',
});

// The prompted variables (local names, src/preset/blueprint.js) each
// validated field is read from, and the canonical key it is checked
// against.
export const OBSERVED_FIELDS = Object.freeze({
    location: { variable: 'scene_location', canonical: 'locationId' },
    cast: { variable: 'scene_characters', canonical: 'castIds' },
    weather: { variable: 'scene_weather', canonical: 'weather' },
    temperature: { variable: 'scene_temperature', canonical: 'temperature' },
    indoor: { variable: 'scene_isindoor', canonical: 'indoor' },
    title: { variable: 'scene_title', canonical: 'sceneTitle' },
});

const list = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v) : []);
const sameSet = (a, b) => {
    const x = new Set(list(a));
    const y = new Set(list(b));
    return x.size === y.size && [...x].every((v) => y.has(v));
};

// Observed values normalized to the canonical shapes. `raw` is
// { [variableName]: value } as State Engine holds it.
export function readObserved(raw) {
    const r = raw ?? {};
    const indoor = r.scene_isindoor;
    return {
        location: typeof r.scene_location === 'string' ? r.scene_location : '',
        cast: list(r.scene_characters),
        weather: list(r.scene_weather),
        temperature: typeof r.scene_temperature === 'string' ? r.scene_temperature : '',
        indoor: typeof indoor === 'boolean' ? indoor : (indoor === 'true' ? true : (indoor === 'false' ? false : null)),
        title: typeof r.scene_title === 'string' ? r.scene_title : '',
    };
}

export function valuesEqual(field, a, b) {
    if (field === 'cast' || field === 'weather') return sameSet(a, b);
    return (a ?? '') === (b ?? '');
}

// Nothing to compare: the model said nothing about this field.
function isBlank(field, value) {
    if (field === 'indoor') return value === null || value === undefined;
    if (field === 'weather') return list(value).length === 0;
    if (field === 'cast') return false; // an empty list means "everyone left"
    return !value;
}

const isRejected = (rejected, obj) => !!obj && (rejected ?? []).some((r) => r.type === obj.type && String(r.name).toLowerCase() === String(obj.name).toLowerCase());
const isCandidateObject = (obj) => !!obj && obj.confirmed === false;

function decide(classification, policy, adoptNew = true) {
    switch (classification) {
        case 'consistent': return 'none';
        case 'candidate':
            if (policy === 'canonical') return 'adjust';
            return policy === 'observed' && adoptNew ? 'adopt' : 'candidate';
        case 'contradiction': return 'adjust';
        case 'ambiguous': return 'ask';
        case 'natural': return policy === 'canonical' ? 'adjust' : 'accept';
        case 'library_match': return policy === 'canonical' ? 'adjust' : (policy === 'ask' ? 'ask' : 'accept');
        default: return 'ask';
    }
}

// Every difference worth acting on.
//   input: { canonical, observed (readObserved), lastObserved (readObserved
//            or {}), objects: Map id -> { id, type, name, confirmed },
//            parents (location parent map), policies, rejected,
//            adoptNew (false for a canon-only setting) }
// A field is looked at only when its observed value differs from canonical
// AND changed since the last reconciliation - so a question still waiting
// in the review queue is not asked again, and running twice on the same
// values does nothing (SB-223: reconciliation is idempotent).
// -> [{ field, op?, objectId?, canonical, observed, classification, action, reason }]
export function detectDrift({ canonical, observed, lastObserved = {}, objects = new Map(), parents = {}, policies = DEFAULT_POLICIES, rejected = [], adoptNew = true }) {
    const items = [];
    const policyOf = (field) => (POLICY_VALUES.includes(policies?.[field]) ? policies[field] : DEFAULT_POLICIES[field]);
    const decideFor = (classification, policy) => decide(classification, policy, adoptNew);

    for (const [field, { canonical: key }] of Object.entries(OBSERVED_FIELDS)) {
        const obs = observed[field];
        const can = canonical[key];
        if (isBlank(field, obs)) continue;
        if (valuesEqual(field, obs, can)) continue;
        if (field in lastObserved && valuesEqual(field, obs, lastObserved[field])) continue;
        const policy = policyOf(field);

        if (field === 'location') {
            const obj = objects.get(obs);
            let classification;
            let reason;
            if (!obj) {
                classification = 'ambiguous';
                reason = 'the named place is not in the library any more';
            } else if (isRejected(rejected, obj)) {
                classification = 'contradiction';
                reason = `"${obj.name}" was rejected earlier`;
            } else if (isCandidateObject(obj)) {
                classification = 'candidate';
                reason = `"${obj.name}" is new to the setting`;
            } else if (!can) {
                classification = 'library_match';
                reason = 'no location was set yet';
            } else {
                const rel = relation(parents, can, obs);
                if (rel === 'ancestor' || rel === 'descendant' || rel === 'sibling') {
                    classification = 'natural';
                    reason = `moved to a ${rel === 'sibling' ? 'neighbouring place' : rel === 'ancestor' ? 'surrounding place' : 'place within'}`;
                } else {
                    classification = 'library_match';
                    reason = rel === 'related' ? 'moved elsewhere in the same region' : 'moved to an unconnected place';
                }
            }
            // With no location set yet, the first one named is simply taken.
            const action = !can && classification === 'library_match' ? 'accept' : decideFor(classification, policy);
            items.push({ field, canonical: can, observed: obs, classification, action, reason });
            continue;
        }

        if (field === 'cast') {
            const before = new Set(list(can));
            const after = new Set(list(obs));
            const added = [...after].filter((id) => !before.has(id)).sort();
            const removed = [...before].filter((id) => !after.has(id)).sort();
            if (after.size === 0 && before.size > 1) {
                items.push({ field, op: 'clear', canonical: [...before], observed: [], classification: 'natural', action: decideFor('natural', policy), reason: 'everyone left' });
                continue;
            }
            for (const id of added) {
                const obj = objects.get(id);
                let classification = 'library_match';
                let reason = 'a library character joined the scene';
                if (!obj) { classification = 'ambiguous'; reason = 'the named character is not in the library any more'; }
                else if (isRejected(rejected, obj)) { classification = 'contradiction'; reason = `"${obj.name}" was rejected earlier`; }
                else if (isCandidateObject(obj)) { classification = 'candidate'; reason = `"${obj.name}" is new to the setting`; }
                items.push({ field, op: 'add', objectId: id, canonical: [...before], observed: [...after], classification, action: decideFor(classification, policy), reason });
            }
            for (const id of removed) {
                items.push({ field, op: 'remove', objectId: id, canonical: [...before], observed: [...after], classification: 'natural', action: decideFor('natural', policy), reason: 'left the scene' });
            }
            continue;
        }

        const reason = field === 'title' ? 'the scene moved on' : 'the story changed it';
        const classification = 'natural';
        items.push({ field, canonical: can, observed: obs, classification, action: decideFor(classification, policy), reason });
    }
    return items;
}

// The canonical state after accepting `item` (observed wins). Pure: a new
// object.
export function applyAccepted(canonical, item) {
    const next = { ...canonical, castIds: [...(canonical.castIds ?? [])], weather: [...(canonical.weather ?? [])] };
    switch (item.field) {
        case 'location': next.locationId = item.observed || ''; break;
        case 'cast':
            if (item.op === 'add' && !next.castIds.includes(item.objectId)) next.castIds.push(item.objectId);
            else if (item.op === 'remove') next.castIds = next.castIds.filter((id) => id !== item.objectId);
            else if (item.op === 'clear') next.castIds = [];
            break;
        case 'weather': next.weather = list(item.observed); break;
        case 'temperature': next.temperature = item.observed || ''; break;
        case 'indoor': next.indoor = typeof item.observed === 'boolean' ? item.observed : null; break;
        case 'title': next.sceneTitle = item.observed || ''; break;
        default: break;
    }
    return next;
}

// What the observed variables should hold so they agree with canonical
// again, after `item` was adjusted: { [variableName]: value }.
export function observedRestore(canonical) {
    return {
        scene_location: canonical.locationId || '',
        scene_characters: [...(canonical.castIds ?? [])],
        scene_weather: [...(canonical.weather ?? [])],
        scene_temperature: canonical.temperature || '',
        scene_isindoor: canonical.indoor === null || canonical.indoor === undefined ? '' : canonical.indoor,
        scene_title: canonical.sceneTitle || '',
    };
}

// A short correction line for the guidance after an adjustment (SB-221),
// written for the model. `nameOf(id)` -> display name, `placeOf(id)` ->
// the location's path text.
export function correctionText(item, { nameOf = (id) => id, placeOf = (id) => nameOf(id) } = {}) {
    switch (item.field) {
        case 'location':
            if (!item.canonical) return '';
            return `The scene is still at ${placeOf(item.canonical)}${item.observed ? `, not ${nameOf(item.observed)}` : ''}.`;
        case 'cast':
            if (item.op === 'add') return `${nameOf(item.objectId)} is not present in this scene.`;
            if (item.op === 'remove') return `${nameOf(item.objectId)} is still present in this scene.`;
            return '';
        case 'weather': return item.canonical?.length ? `The weather is ${item.canonical.join(', ').toLowerCase()}.` : '';
        case 'temperature': return item.canonical ? `It is ${String(item.canonical).toLowerCase()}.` : '';
        case 'indoor': return item.canonical === true ? 'The scene is indoors.' : (item.canonical === false ? 'The scene is outdoors.' : '');
        case 'title': return '';
        default: return '';
    }
}

// How an item reads in the review queue and history: "Location: Old Quarter
// -> Harbor (moved to an unconnected place)".
export function describeItem(item, nameOf = (id) => id) {
    const label = FIELD_LABELS[item.field] ?? item.field;
    const show = (value) => {
        if (Array.isArray(value)) return value.length ? value.map(nameOf).join(', ') : '(none)';
        if (value === true) return 'indoors';
        if (value === false) return 'outdoors';
        return value ? (item.field === 'location' ? nameOf(value) : String(value)) : '(unset)';
    };
    if (item.field === 'cast' && item.op === 'add') return `${label}: ${nameOf(item.objectId)} joined (${item.reason})`;
    if (item.field === 'cast' && item.op === 'remove') return `${label}: ${nameOf(item.objectId)} left`;
    return `${label}: ${show(item.canonical)} → ${show(item.observed)}${item.reason ? ` (${item.reason})` : ''}`;
}
