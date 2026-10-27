// The name generator's runner: reads the world (its naming document, front
// page and every name in it), asks the pure engine, and records what it
// handed out - the counter, the registry, and the shared list of names used
// in the user's worlds. The engine is src/naming/engine.js.

import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { getSettings, saveSettings } from '../settings.js';
import { planName, namePool, rollPool, familyNameIn } from './engine.js';
import { prunePool, shortfall } from './live.js';
import { recordName } from './registry.js';
import { cultureChoices, defaultCultureId, defaultCultureChoice, resolveCulture, inheritedCulture, newCultureDef } from './cultures.js';
import { makeRng } from './random.js';
import { rollShifts } from './mutate.js';
import { tiesInBrief, tieRelation, typeForBrief } from './classify.js';
import { getParents } from '../library/library.js';
import { fold } from './text.js';
import { buildNamingRulesPrompt, readNamingRules, proposalToDef, learnedNames, learnInto } from './premise.js';
import { callModel } from '../generate/llm.js';

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
// hasParent, placeText, placeId, factionIds, familyCulture }. -> the
// engine's plan (mode 'rolled' | 'derived' | 'given' | 'none'); a rolled
// name is recorded as offered.
// familyCulture: { id } - mixed heritage (src/library/bloodlines.js
// namesOfLineage): the family name in that culture ('' - the place's),
// the given name in `cultureId`.
export function rollNameFor(settingId, req, all) {
    const cultureId = req.cultureId || cultureIdFor(settingId, all, req);
    const world = worldOf(settingId, all);
    let family = req.family ?? '';
    if (req.familyCulture && req.typeId === 'character' && !family) {
        const familyId = req.familyCulture.id || cultureIdFor(settingId, all, req);
        if (familyId !== cultureId) family = familyNameIn(familyId, world);
    }
    const plan = planName({ ...req, cultureId, family }, world);
    if (plan.mode === 'rolled') record(settingId, plan.counter, [{ name: plan.name, kind: plan.kind, culture: plan.culture?.id, state: 'o', meaning: plan.meaning }]);
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

// Whether the front page offers to make cultures from the premise: a
// premise written, no cultures of the world's own yet, not put away.
export function premiseOffer(settingId) {
    const doc = getSettingDoc(settingId);
    if (doc.naming.offerDismissed || Object.keys(doc.naming.cultures).length || !String(doc.overview?.premise ?? '').trim()) return null;
    return worldDefault(settingId);
}

export function dismissPremiseOffer(settingId) {
    updateSettingDoc(settingId, (d) => { d.naming.offerDismissed = true; });
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
// extra: { id: culture def } not stored yet (a proposal being looked at).
export function sampleNames(settingId, cultureId, kinds, all, { round = 0, count = 6, extra = null } = {}) {
    const base = worldOf(settingId, all);
    const world = extra ? { ...base, naming: { ...base.naming, cultures: { ...base.naming.cultures, ...extra } } } : base;
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

// ---- rules from the premise (src/naming/premise.js)

const ofType = (all, type) => (all[type] ?? []).map((e) => ({ id: e.id, type, name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [], description: e.description ?? e.base?.description ?? '', fields: e.base ?? e.fields ?? {} }));

// The entry a proposal's "used by" name means: a place or faction by its
// name or an alias, "the" or not.
function entryNamed(name, entries) {
    const f = fold(String(name).replace(/^the\s+/i, ''));
    return entries.find((e) => [e.name, ...e.aliases].some((n) => fold(String(n).replace(/^the\s+/i, '')) === f)) ?? null;
}

// One model call: the cultures the premise suggests. Nothing is stored.
// -> [proposal + { def (to preview and add), users: [{ id, name }],
// unknown: [name] }]. Throws (model) with a message for the user.
// With `bloodlines` ({ section, cultures(raw), read(raw) } from
// src/library/bloodline-store.js), the same call also proposes the world's
// bloodlines. -> [proposal], with .bloodlines = { proposals, only } then.
export async function proposeCultures(settingId, all, { wish = '', bloodlines = null } = {}) {
    const seed = seedOf(settingId);
    const doc = getSettingDoc(settingId);
    const parents = getParents(settingId);
    const places = ofType(all, 'location');
    const factions = ofType(all, 'faction');
    const people = ofType(all, 'character');
    // The main places: the top of the tree and the level below it.
    const depth = (id) => { let n = 0; for (let at = parents[id]; at && n < 20; at = parents[at]) n++; return n; };
    const prompt = buildNamingRulesPrompt({
        overview: doc.overview,
        places: places.filter((p) => depth(p.id) <= 1),
        factions,
        names: people.map((p) => p.name),
        cultures: Object.values(doc.naming.cultures).map((c) => c.name),
        canonOnly: doc.canonOnly,
        wish,
        bloodlines: bloodlines?.section ?? '',
    });
    const raw = await callModel([{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.prompt }], Math.max(getSettings().generation?.maxTokens || 0, 900));
    const kin = bloodlines ? bloodlines.read(raw) : null;
    const proposals = readNamingRules(bloodlines ? bloodlines.cultures(raw) : raw, { existing: Object.values(doc.naming.cultures).map((c) => c.name) });
    if (!proposals.length && !kin?.proposals.length) throw new Error('The model proposed no cultures in the expected format - try again, or a larger model.');
    const holders = [...places, ...factions];
    const ids = Object.keys(doc.naming.cultures);
    const out = proposals.map((p) => {
        const users = [];
        const unknown = [];
        for (const n of p.users) {
            const e = entryNamed(n, holders);
            if (e && !users.some((u) => u.id === e.id)) users.push({ id: e.id, name: e.name });
            else if (!e) unknown.push(n);
        }
        let def = proposalToDef(p, { seed, ids });
        ids.push(def.id);
        // A canon-only world's cultures sound like the names it already has.
        if (doc.canonOnly) def = learnInto(def, learnedNames(users.map((u) => u.id), [...places, ...factions, ...people], parents));
        return { ...p, def, users, unknown };
    });
    if (kin) out.bloodlines = kin;
    return out;
}

// Adds the chosen proposals as the world's own cultures: each one's places
// and factions use it (not one that already has a culture, unless `retake`),
// and the default becomes the world default when the user has not chosen
// one. -> { added: [id], assigned, kept: [name] (had a culture already) }
export function acceptProposals(settingId, proposals, { retake = false } = {}) {
    const added = [];
    const kept = [];
    let assigned = 0;
    updateSettingDoc(settingId, (d) => {
        for (const p of proposals) {
            let id = p.def.id;
            for (let n = 1; d.naming.cultures[id]; n++) id = `c${Object.keys(d.naming.cultures).length + n}`;
            d.naming.cultures[id] = { ...p.def, id };
            added.push(id);
            for (const u of p.users ?? []) {
                const meta = d.entries[u.id] ?? {};
                if (meta.culture && !retake) { kept.push(u.name); continue; }
                d.entries[u.id] = { ...meta, culture: id };
                assigned++;
            }
            if (p.isDefault && !d.naming.defaultCulture) d.naming.defaultCulture = id;
        }
    });
    return { added, assigned, kept };
}

// Each of the world's own grown cultures learns from the names its places,
// factions and their people already have - the default culture from every
// name not under another. -> [{ id, name, count }] (the names it learned).
export function learnFromWorld(settingId, all) {
    const parents = getParents(settingId);
    const entries = [...ofType(all, 'location'), ...ofType(all, 'faction'), ...ofType(all, 'character')];
    const holders = cultureHolders(settingId);
    const out = [];
    updateSettingDoc(settingId, (d) => {
        for (const def of Object.values(d.naming.cultures)) {
            if (def.kind !== 'invented') continue;
            const users = holders.filter((x) => x.culture === def.id).map((x) => x.id);
            let names = learnedNames(users, entries, parents);
            if (d.naming.defaultCulture === def.id) {
                const others = new Set(learnedNames(holders.filter((x) => x.culture !== def.id).map((x) => x.id), entries, parents));
                const everyone = learnedNames(entries.filter((e) => e.type !== 'character').map((e) => e.id), entries, parents);
                names = [...new Set([...names, ...everyone.filter((n) => !others.has(n))])];
            }
            const before = def.learned?.length ?? 0;
            Object.assign(def, learnInto(def, names));
            out.push({ id: def.id, name: def.name, count: (def.learned?.length ?? 0) - before });
        }
    });
    return out;
}

// ---- live play (src/naming/live.js)

// The pool for where the story is: the culture of the place (or the
// factions), its names kept from earlier replies, topped up to a few of
// each. A pool name the world has taken since is marked used and replaced.
// -> { key, cultureId, pool: { men, women, places } }
export function livePoolFor(settingId, all, { placeId = null, factionIds = [] } = {}) {
    const cultureId = cultureIdFor(settingId, all, { placeId, factionIds });
    const key = cultureId || 'world';
    const world = worldOf(settingId, all);
    const { pool, gone } = prunePool(getSettingDoc(settingId).naming.pools[key], world.names);
    for (const name of gone) markNameUsed(settingId, name);
    const want = shortfall(pool);
    const rolling = want.men || want.women || want.places;
    if (rolling) {
        const fresh = rollPool({ ...world, names: [...world.names, ...pool.men, ...pool.women, ...pool.places] }, { cultureId, ...want });
        pool.men.push(...fresh.men);
        pool.women.push(...fresh.women);
        pool.places.push(...fresh.places);
        record(settingId, fresh.counter, [...fresh.men, ...fresh.women].map((name) => ({ name, kind: 'person', culture: cultureId, state: 'o' }))
            .concat(fresh.places.map((name) => ({ name, kind: 'settlement', culture: cultureId, state: 'o' }))));
    }
    // Saved only when it changed: the guidance asks on every refresh.
    if (rolling || gone.length) updateSettingDoc(settingId, (d) => { d.naming.pools[key] = pool; });
    return { key, cultureId, pool };
}

// Pool names that were taken (by the model, or by a swap): out of the
// pool and used for good.
export function takeFromPool(settingId, key, names = []) {
    if (!names.length) return;
    const gone = new Set(names.map(fold));
    updateSettingDoc(settingId, (d) => {
        const p = d.naming.pools[key];
        if (!p) return;
        for (const k of ['men', 'women', 'places']) p[k] = p[k].filter((n) => !gone.has(fold(n)));
    });
    for (const n of names) markNameUsed(settingId, n);
}

// { typeId: entries[] } from a flat list of entries with a `type`.
export function byType(entries = []) {
    const out = {};
    for (const e of entries) (out[e.type] ??= []).push(e);
    return out;
}

// What the registry knows of a name on a sheet: its meaning in its own
// tongue and the culture it was rolled in. -> { meaning, culture } or null.
export function nameNote(settingId, name) {
    if (!settingId || !name) return null;
    const doc = getSettingDoc(settingId);
    const f = fold(name);
    const r = doc.naming.registry.find((x) => fold(x.n) === f && x.s !== 'd');
    if (!r || (!r.m && !r.c)) return null;
    const culture = r.c ? resolveCulture(r.c, { naming: doc.naming, seed: doc.naming.seed || 'world' })?.label ?? '' : '';
    return r.m || culture ? { meaning: r.m ?? '', culture } : null;
}

// The culture a /sb-name culture= argument means: an id, or a word of a
// culture's label ("vaskari", "icelandic"). '' when none matches.
export function cultureNamed(settingId, text) {
    const want = fold(text);
    if (!want) return '';
    const options = cultureOptions(settingId).filter((o) => o.value);
    return (options.find((o) => o.value === text) ?? options.find((o) => fold(o.label.replace(/^[^:]*:\s*/, '')) === want) ?? options.find((o) => fold(o.label).includes(want)))?.value ?? '';
}

// /sb-name: a few names for a brief, rolled as Generate would roll them
// (the place the scene is in sets the culture unless one is named), each
// recorded as offered so it is not handed out twice. -> [{ name, meaning }]
export function namesForCommand(settingId, all, { brief = '', typeId = '', cultureId = '', count = 5, placeId = null } = {}) {
    const type = typeId || typeForBrief(brief);
    const out = [];
    for (let i = 0; i < count * 2 && out.length < count; i++) {
        const plan = rollNameFor(settingId, { typeId: type, brief, cultureId, placeId, hasParent: type === 'location' && !!placeId }, all);
        if (plan.mode !== 'rolled' || out.some((o) => o.name === plan.name)) continue;
        out.push({ name: plan.name, meaning: plan.meaning ?? '' });
    }
    return { typeId: type, names: out };
}

// ---- names kept for later (the Naming tab's samples)

// A sample name the user keeps: never handed out to anything else, listed
// until an entry takes it (then it is used) or the user lets it go.
export function keepName(settingId, { name, meaning = '', cultureId = '', kind = '' }) {
    if (!name) return;
    const doc = getSettingDoc(settingId);
    record(settingId, doc.naming.counter, [{ name, meaning, culture: cultureId, kind, state: 'k' }]);
}

// Let a kept name go: it may come round again.
export function releaseName(settingId, name) {
    const f = fold(name);
    updateSettingDoc(settingId, (d) => { d.naming.registry = d.naming.registry.filter((r) => !(r.s === 'k' && fold(r.n) === f)); });
}

// -> [{ name, meaning, culture (label) }], newest first.
export function keptNames(settingId) {
    const doc = getSettingDoc(settingId);
    const label = (id) => (id ? resolveCulture(id, { naming: doc.naming, seed: doc.naming.seed || 'world' })?.label ?? '' : '');
    return doc.naming.registry.filter((r) => r.s === 'k').reverse().map((r) => ({ name: r.n, meaning: r.m ?? '', culture: label(r.c) }));
}
