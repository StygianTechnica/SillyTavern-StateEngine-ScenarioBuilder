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
// Actions: 'accept' (canonical := observed), 'adjust' (write canonical
// back, add a correction line to the guidance), 'ask' (queue for review).
//
// The story leads (the user's decision, over the spec's conservative
// SB-222/SB-225 defaults): by default whatever the roleplay establishes is
// accepted - never overridden. Something new the story invents is accepted
// into the scene as State Engine created it (an unconfirmed object);
// CONFIRMING it into the setting is State Engine's own object review (its
// "detected for review" notification), not repeated here. Once confirmed,
// src/library/intake.js takes it into the library and enriches it.
// 'canonical' and 'ask' remain per-field options.

import { relation } from '../library/hierarchy.js';

// Resolution policy per field (SB-222): 'canonical' | 'observed' | 'ask'.
export const DEFAULT_POLICIES = Object.freeze({
    location: 'observed',
    cast: 'observed',
    weather: 'observed',
    temperature: 'observed',
    indoor: 'observed',
    title: 'observed',
    creatures: 'observed',
    summary: 'observed',
});

export const POLICY_VALUES = Object.freeze(['canonical', 'observed', 'ask']);

export const FIELD_LABELS = Object.freeze({
    location: 'Location',
    cast: 'Characters present',
    weather: 'Weather',
    temperature: 'Temperature',
    indoor: 'Indoors / outdoors',
    title: 'Scene title',
    creatures: 'Creatures present',
    summary: 'Scene summary',
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
    creatures: { variable: 'scene_creatures', canonical: 'creatureIds' },
    summary: { variable: 'scene_summary', canonical: 'sceneSummary' },
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
        creatures: list(r.scene_creatures),
        summary: typeof r.scene_summary === 'string' ? r.scene_summary.trim() : '',
    };
}

// State Engine's own scene tracker: who it says is present.
export const SE_CAST = 'se__scene_characters';

// Folds State Engine's scene tracker into the story's reading of who is
// here: a character is present while EITHER lists them, and gone only once
// both have dropped them. The story's reading starts from the canonical
// cast and often leaves out someone who came back (Niamh, God War); State
// Engine's tracker keeps its own list. Removals the user made by hand
// still hold (applyHolds). `seCast`: the tracker's ids, or null.
export function withStateEngineCast(observed, seCast) {
    if (!Array.isArray(seCast)) return observed;
    return { ...observed, cast: [...new Set([...observed.cast, ...seCast])] };
}

// State Engine's scene tracker for creatures (se__scene_creatures).
export const SE_CREATURES = 'se__scene_creatures';

// The same for creatures: one is here while either list has it (the story's
// reading often comes back empty while State Engine's tracker has the dead
// that just rushed in). `seCreatures`: the tracker's ids of confirmed
// library creatures (not those still waiting for review), or null.
export function withStateEngineCreatures(observed, seCreatures) {
    if (!Array.isArray(seCreatures)) return observed;
    return { ...observed, creatures: [...new Set([...observed.creatures, ...seCreatures])] };
}

// Scene titles are kept short: at most this many words.
export const TITLE_MAX_WORDS = 6;
const wordCount = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

// A title cut down to TITLE_MAX_WORDS words, without trailing punctuation.
export function shortTitle(text) {
    const words = String(text ?? '').replace(/^["'*]+|["'*.]+$/g, '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, TITLE_MAX_WORDS).join(' ').replace(/[,;:\-\u2013\u2014]+$/, '');
}

export function valuesEqual(field, a, b) {
    if (field === 'cast' || field === 'weather' || field === 'creatures') return sameSet(a, b);
    return (a ?? '') === (b ?? '');
}

// Nothing to compare: the model said nothing about this field.
function isBlank(field, value) {
    if (field === 'indoor') return value === null || value === undefined;
    if (field === 'weather') return list(value).length === 0;
    if (field === 'cast' || field === 'creatures') return false; // an empty list means "everyone left"
    // A summary that is not a sentence (a name, a word) says nothing; a
    // title that rambles is not taken either.
    if (field === 'summary') return wordCount(value) < 4;
    if (field === 'title') return !value || wordCount(value) > TITLE_MAX_WORDS + 4;
    return !value;
}

const isRejected = (rejected, obj) => !!obj && (rejected ?? []).some((r) => r.type === obj.type && String(r.name).toLowerCase() === String(obj.name).toLowerCase());
const isCandidateObject = (obj) => !!obj && obj.confirmed === false;

export function decide(classification, policy) {
    switch (classification) {
        case 'consistent': return 'none';
        case 'candidate': return policy === 'canonical' ? 'adjust' : (policy === 'ask' ? 'ask' : 'accept');
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
//            parents (location parent map), policies, rejected }
// A field is looked at only when its observed value differs from canonical
// AND changed since the last reconciliation - so a question still waiting
// in the review queue is not asked again, and running twice on the same
// values does nothing (SB-223: reconciliation is idempotent).
// -> [{ field, op?, objectId?, canonical, observed, classification, action, reason }]
export function detectDrift({ canonical, observed, lastObserved = {}, objects = new Map(), parents = {}, policies = DEFAULT_POLICIES, rejected = [] }) {
    const items = [];
    const policyOf = (field) => (POLICY_VALUES.includes(policies?.[field]) ? policies[field] : DEFAULT_POLICIES[field]);
    const decideFor = decide;

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
                // Nobody at all is far more often a missed reading than everyone
                // leaving at once: asked, not taken (who leaves one by one
                // still follows the story, and the director says who leaves).
                items.push({ field, op: 'clear', canonical: [...before], observed: [], classification: 'ambiguous', action: policy === 'canonical' ? 'adjust' : 'ask', reason: 'the story lists nobody present - everyone left, or the reading missed them' });
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
        case 'title': next.sceneTitle = shortTitle(item.observed); break;
        case 'creatures': next.creatureIds = list(item.observed); break;
        case 'summary': next.sceneSummary = String(item.observed ?? '').trim(); break;
        default: break;
    }
    return next;
}

// The scene follows the player character, who never leaves it. When the
// story's reading drops them from those present and also puts the scene
// somewhere else, the scene went with them: the people still listed are the
// ones left behind. When only their name is missing (a reading that forgot
// them), they are simply still here. Pure: the observed values to validate
// instead. playerId: '' when no player character is known.
export function followPlayer(observed, canonical, playerId) {
    if (!playerId || !canonical.castIds?.includes(playerId) || observed.cast.includes(playerId)) return observed;
    const moved = !!observed.location && observed.location !== canonical.locationId;
    // After a move, those listed who were not in the old scene are at the
    // new place; whether anyone from the old scene came along cannot be
    // told from this reading (the director's MOVE line says who goes along).
    const there = observed.cast.filter((id) => !canonical.castIds.includes(id));
    return { ...observed, cast: moved ? [playerId, ...there] : [...observed.cast, playerId] };
}

// Changes the user made by hand win for a few replies (chat document
// `held`): the story putting back someone the user took out, or moving the
// scene from where the user put it, is turned back (a correction tells the
// model) instead of taken. Pure. held: [{ field, op?, objectId?, value? }].
export function applyHolds(items, held) {
    if (!held?.length) return items;
    const heldAs = (field, op, id) => held.some((h) => h.field === field && h.op === op && h.objectId === id);
    return items.map((item) => {
        let turnBack = false;
        if (item.field === 'location') turnBack = held.some((h) => h.field === 'location' && h.value && item.observed !== h.value);
        else if (item.field === 'cast') {
            if (item.op === 'add') turnBack = heldAs('cast', 'remove', item.objectId);
            else if (item.op === 'remove') turnBack = heldAs('cast', 'add', item.objectId);
            else if (item.op === 'clear') turnBack = held.some((h) => h.field === 'cast' && h.op === 'add');
        } else if (item.field === 'creatures') {
            turnBack = list(item.observed).some((id) => heldAs('creatures', 'remove', id))
                || list(item.canonical).some((id) => heldAs('creatures', 'add', id) && !list(item.observed).includes(id));
        }
        return turnBack ? { ...item, action: 'adjust', reason: `${item.reason ? `${item.reason}; ` : ''}you changed this by hand` } : item;
    });
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
        scene_creatures: [...(canonical.creatureIds ?? [])],
        scene_summary: canonical.sceneSummary || '',
    };
}

// What stands in for a name that can't be found (an object deleted since):
// never its id.
export const UNKNOWN_PLACE = 'a place no longer in the library';
export const UNKNOWN_ONE = 'someone no longer in the library';

// A short correction line for the guidance after an adjustment (SB-221),
// written for the model. `nameOf(id)` -> display name, `placeOf(id)` ->
// the location's path text; '' for one that can't be found, which leaves
// that part (or the whole line) out - the model never reads an id.
export function correctionText(item, { nameOf = () => '', placeOf = (id) => nameOf(id) } = {}) {
    switch (item.field) {
        case 'location': {
            const at = item.canonical ? placeOf(item.canonical) : '';
            if (!at) return '';
            const not = item.observed ? nameOf(item.observed) : '';
            return `The scene is still at ${at}${not ? `, not ${not}` : ''}.`;
        }
        case 'cast': {
            const who = nameOf(item.objectId);
            if (!who) return '';
            if (item.op === 'add') return `${who} is not present in this scene.`;
            if (item.op === 'remove') return `${who} is still present in this scene.`;
            return '';
        }
        case 'weather': return item.canonical?.length ? `The weather is ${item.canonical.join(', ').toLowerCase()}.` : '';
        case 'temperature': return item.canonical ? `It is ${String(item.canonical).toLowerCase()}.` : '';
        case 'indoor': return item.canonical === true ? 'The scene is indoors.' : (item.canonical === false ? 'The scene is outdoors.' : '');
        case 'title': return '';
        case 'creatures': {
            if (!item.canonical?.length) return 'There are no creatures in this scene.';
            const named = item.canonical.map(nameOf).filter(Boolean);
            return named.length ? `The creatures present are: ${named.join(', ')}.` : '';
        }
        default: return '';
    }
}

// How an item reads in the review queue and history: "Location: Old Quarter
// -> Harbor (moved to an unconnected place)".
export function describeItem(item, nameOf = () => '') {
    const label = FIELD_LABELS[item.field] ?? item.field;
    const place = (id) => nameOf(id) || UNKNOWN_PLACE;
    const one = (id) => nameOf(id) || UNKNOWN_ONE;
    const show = (value) => {
        if (Array.isArray(value)) return value.length ? value.map(one).join(', ') : '(none)';
        if (value === true) return 'indoors';
        if (value === false) return 'outdoors';
        return value ? (item.field === 'location' ? place(value) : String(value)) : '(unset)';
    };
    if (item.field === 'cast' && item.op === 'add') return `${label}: ${one(item.objectId)} joined (${item.reason})`;
    if (item.field === 'cast' && item.op === 'remove') return `${label}: ${one(item.objectId)} left`;
    return `${label}: ${show(item.canonical)} → ${show(item.observed)}${item.reason ? ` (${item.reason})` : ''}`;
}

// An object id as it appears in stored text ("loc_822af7b3-25fb-...").
export const OBJECT_ID = /\b[a-z]{3}_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;

// Text written before names were checked can hold ids: they read as words.
export function scrubIds(text) {
    return String(text ?? '').replace(OBJECT_ID, (id) => (id.toLowerCase().startsWith('loc_') ? UNKNOWN_PLACE : UNKNOWN_ONE));
}

const PRESENT_PARTS = /^(?:voice|eyes?|gaze|face|expression|hands?|grip|touch|arms?|shoulders?|jaw|brow|lips|mouth|smile|grin|laugh|words|tone|breath|footsteps|presence|features|head|fingers|fist|back)$/i;

// Whether the latest turn names someone only as someone's - "Graxx's two",
// "Niamh's orders" - and never as themselves: a mention, not a presence.
// names: their name (and first name, aliases); text: the turn's messages.
// false when they are not named at all (that is no evidence either way).
// Whether the text names someone at all - by any of their names, as a whole
// word. Someone the latest turn never names has not been shown leaving: a
// reply about Remus and Maziel says nothing of the others still in the room.
export function namedAtAll(names, text) {
    const t = String(text ?? '');
    return (names ?? []).some((raw) => {
        const n = String(raw ?? '').trim();
        if (n.length < 3) return false;
        const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^\\p{L}])${esc}(?=$|[^\\p{L}])`, 'iu').test(t);
    });
}

export function namedOnlyAsOwner(names, text) {
    const t = String(text ?? '');
    let any = false;
    for (const raw of names ?? []) {
        const n = String(raw ?? '').trim();
        if (n.length < 3) continue;
        const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const m of t.matchAll(new RegExp(`(^|[^\\p{L}])${esc}(?=$|[^\\p{L}])(['’]s\\b\\s*(\\p{L}+))?`, 'giu'))) {
            any = true;
            if (!m[2]) return false;
            // "Graxx's voice boomed", "Graxx's eyes narrowed": he is there.
            if (PRESENT_PARTS.test(m[3] ?? '')) return false;
        }
    }
    return any;
}
