// The name generator's runner: reads the world (its naming document, front
// page and every name in it), asks the pure engine, and records what it
// handed out - the counter, the registry, and the shared list of names used
// in the user's worlds. The engine is src/naming/engine.js.

import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { getSettings, saveSettings } from '../settings.js';
import { planName, namePool } from './engine.js';
import { recordName } from './registry.js';
import { cultureChoices, defaultCultureId, defaultCultureChoice, resolveCulture, inheritedCulture, newCultureDef } from './cultures.js';
import { makeRng } from './random.js';
import { rollShifts } from './mutate.js';
import { tiesInBrief, tieRelation } from './classify.js';
import { getParents } from '../library/library.js';
import { fold } from './text.js';

const SHARED_MAX = 3000;

function seedOf(settingId) {
    const doc = getSettingDoc(settingId);
    if (doc.naming.seed) return doc.naming.seed;
    // Made once, when the world first needs a name: its own languages.
    const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    updateSettingDoc(settingId, (d) => { d.naming.seed = seed; });
    return seed;
}

// all: { typeId: entries[] } - every entry in the setting.
function worldOf(settingId, all = {}) {
    seedOf(settingId);
    const doc = getSettingDoc(settingId);
    const entries = Object.values(all).flat().map((e) => ({ name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [], type: e.type }));
    const names = entries.flatMap((e) => [e.name, ...e.aliases]).filter(Boolean);
    const settings = getSettings();
    return { naming: doc.naming, overview: doc.overview, names, entries, shared: settings.naming.avoidOtherWorlds ? settings.naming.shared : [] };
}

function record(settingId, counter, entries) {
    updateSettingDoc(settingId, (d) => {
        d.naming.counter = Math.max(d.naming.counter, counter);
        for (const e of entries) d.naming.registry = recordName(d.naming.registry, { ...e, counter: d.naming.counter });
    });
}

// The culture a new thing takes when none is picked: a faction it belongs
// to, else the place it is in or above (the Naming tab and the Culture
// field on places and factions set them), else '' - the world default.
// A faction the brief names counts only if the thing comes from it: a
// rival of the Vaskari does not take Vaskari names.
export function cultureIdFor(settingId, all = {}, { placeId = null, factionIds = [], brief = '' } = {}) {
    const doc = getSettingDoc(settingId);
    const factions = (all.faction ?? []).map((e) => ({ id: e.id, name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [], type: 'faction' }));
    const named = tiesInBrief(brief, factions).filter((t) => tieRelation(brief, t.matched) === 'from').map((t) => t.id);
    return inheritedCulture(doc.entries, getParents(settingId), { placeId, factionIds: [...factionIds, ...named] }).id;
}

// A name for a new thing. req: { typeId, brief, cultureId, gender,
// hasParent, placeText, placeId, factionIds }. -> the engine's plan (mode
// 'rolled' | 'derived' | 'given' | 'none'); a rolled name is recorded as
// offered.
export function rollNameFor(settingId, req, all) {
    const cultureId = req.cultureId || cultureIdFor(settingId, all, req);
    const plan = planName({ ...req, cultureId }, worldOf(settingId, all));
    if (plan.mode === 'rolled') record(settingId, plan.counter, [{ name: plan.name, kind: plan.kind, culture: plan.culture?.id, state: 'o' }]);
    else if (plan.counter) record(settingId, plan.counter, []);
    return plan;
}

// Names for any other person or place a generated text mentions.
export function namePoolFor(settingId, all, { cultureId = '', placeId = null, factionIds = [] } = {}) {
    const world = worldOf(settingId, all);
    const pool = namePool(world, { cultureId: cultureId || cultureIdFor(settingId, all, { placeId, factionIds }) });
    record(settingId, pool.counter, [...pool.people, ...pool.places].map((name) => ({ name, state: 'o' })));
    return pool;
}

// A handed-out name was taken: the registry keeps it for good, and other
// worlds avoid it.
export function markNameUsed(settingId, name) {
    if (!name) return;
    const doc = getSettingDoc(settingId);
    if (!doc.naming.registry.some((r) => fold(r.n) === fold(name))) return;
    record(settingId, doc.naming.counter, [{ name, state: 'u' }]);
    const settings = getSettings();
    const f = fold(name);
    if (!settings.naming.shared.includes(f)) {
        settings.naming.shared.push(f);
        if (settings.naming.shared.length > SHARED_MAX) settings.naming.shared.splice(0, settings.naming.shared.length - SHARED_MAX);
        saveSettings();
    }
}

// A rolled name the user rerolled away: never offered again.
export function markNameDeclined(settingId, name) {
    if (!name) return;
    const doc = getSettingDoc(settingId);
    if (!doc.naming.registry.some((r) => fold(r.n) === fold(name))) return;
    record(settingId, doc.naming.counter, [{ name, state: 'd' }]);
}

// The culture picker: the world default first, then the world's own,
// the presets and the real-world cultures.
export function cultureOptions(settingId) {
    const doc = getSettingDoc(settingId);
    const id = defaultCultureId(doc.overview, doc.naming);
    const label = resolveCulture(id, { naming: doc.naming, seed: doc.naming.seed || 'world' })?.label ?? id;
    return [{ value: '', label: `Automatic - its place or faction's, else ${label}` }, ...cultureChoices(doc.naming).map((c) => ({ value: c.value, label: `${c.group}: ${c.label}` }))];
}

// ---- the Naming tab

// The world default and why: { id, label, why, auto } (auto: chosen from
// the front page, not by the user).
export function worldDefault(settingId) {
    const doc = getSettingDoc(settingId);
    const { id, why } = defaultCultureChoice(doc.overview, doc.naming);
    const seed = doc.naming.seed || 'world';
    const label = (x) => resolveCulture(x, { naming: doc.naming, seed })?.label ?? x;
    // What the front page alone would choose, shown even when the user chose.
    const automatic = defaultCultureChoice(doc.overview, { ...doc.naming, defaultCulture: '' });
    return { id, why, auto: !doc.naming.defaultCulture, label: label(id), automatic: { ...automatic, label: label(automatic.id) } };
}

// '' = chosen from the front page.
export function setWorldDefault(settingId, cultureId) {
    updateSettingDoc(settingId, (d) => { d.naming.defaultCulture = cultureId || ''; });
}

// A new culture of the world's own (from a preset, a real culture, 'sound'
// or 'blank'). -> its id.
export function addCulture(settingId, from) {
    const seed = seedOf(settingId);
    const doc = getSettingDoc(settingId);
    const def = newCultureDef(from, { seed, ids: Object.keys(doc.naming.cultures) });
    updateSettingDoc(settingId, (d) => { d.naming.cultures[def.id] = def; });
    return def.id;
}

export function updateCulture(settingId, id, mutate) {
    updateSettingDoc(settingId, (d) => {
        const def = d.naming.cultures[id];
        if (def) mutate(def);
    });
}

// Rolls a culture's sound shifts again for its mutation level.
export function rerollShifts(settingId, id) {
    const seed = seedOf(settingId);
    updateCulture(settingId, id, (def) => {
        const rand = makeRng(seed, 'reroll', id, Date.now());
        def.shifts = def.mutation ? rollShifts(rand, def.mutation) : [];
    });
}

// Removes a culture; places, factions and the default that used it go back
// to inheriting.
export function removeCulture(settingId, id) {
    updateSettingDoc(settingId, (d) => {
        delete d.naming.cultures[id];
        if (d.naming.defaultCulture === id) d.naming.defaultCulture = '';
        for (const meta of Object.values(d.entries)) if (meta.culture === id) meta.culture = '';
    });
}

// Places and factions that carry a culture: [{ id, culture }].
export function cultureHolders(settingId) {
    return Object.entries(getSettingDoc(settingId).entries).filter(([, m]) => m.culture).map(([id, m]) => ({ id, culture: m.culture }));
}

export function setEntryCulture(settingId, entryId, cultureId) {
    updateSettingDoc(settingId, (d) => {
        d.entries[entryId] = { ...(d.entries[entryId] ?? {}), culture: cultureId || '' };
    });
}

// A name never to be handed out: in the culture's own list when it is the
// world's, else world-wide.
export function banName(settingId, cultureId, name) {
    updateSettingDoc(settingId, (d) => {
        const def = d.naming.cultures[cultureId];
        if (def) def.banned = [...new Set([...(def.banned ?? []), name])];
        else d.naming.banned = [...new Set([...(d.naming.banned ?? []), name])];
    });
}

// Sample names for the tab: rows of `count` names per kind, rolled from a
// sample stream (round) so nothing is recorded or used up.
// kinds: [{ key, typeId, brief }]. -> { [key]: [{ name, meaning }] }
export function sampleNames(settingId, cultureId, kinds, all, { round = 0, count = 6 } = {}) {
    const world = worldOf(settingId, all);
    const out = {};
    let counter = 0;
    for (const k of kinds) {
        const names = [...world.names];
        out[k.key] = [];
        for (let i = 0; i < count * 3 && out[k.key].length < count; i++) {
            const plan = planName({ typeId: k.typeId, brief: k.brief, cultureId, kindInfo: k.kindInfo }, { ...world, names, naming: { ...world.naming, seed: `${world.naming.seed}:sample:${round}`, counter: counter++ } });
            if (plan.mode !== 'rolled' || names.includes(plan.name)) continue;
            names.push(plan.name);
            out[k.key].push({ name: plan.name, meaning: plan.meaning });
        }
    }
    return out;
}
