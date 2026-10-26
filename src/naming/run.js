// The name generator's runner: reads the world (its naming document, front
// page and every name in it), asks the pure engine, and records what it
// handed out - the counter, the registry, and the shared list of names used
// in the user's worlds. The engine is src/naming/engine.js.

import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { getSettings, saveSettings } from '../settings.js';
import { planName, namePool } from './engine.js';
import { recordName } from './registry.js';
import { cultureChoices, defaultCultureId, resolveCulture } from './cultures.js';
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

// A name for a new thing. req: { typeId, brief, cultureId, gender,
// hasParent, placeText }. -> the engine's plan (mode 'rolled' | 'derived' |
// 'given' | 'none'); a rolled name is recorded as offered.
export function rollNameFor(settingId, req, all) {
    const plan = planName(req, worldOf(settingId, all));
    if (plan.mode === 'rolled') record(settingId, plan.counter, [{ name: plan.name, kind: plan.kind, culture: plan.culture?.id, state: 'o' }]);
    else if (plan.counter) record(settingId, plan.counter, []);
    return plan;
}

// Names for any other person or place a generated text mentions.
export function namePoolFor(settingId, all, { cultureId = '' } = {}) {
    const world = worldOf(settingId, all);
    const pool = namePool(world, { cultureId });
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
    return [{ value: '', label: `World default - ${label}` }, ...cultureChoices(doc.naming).map((c) => ({ value: c.value, label: `${c.group}: ${c.label}` }))];
}
