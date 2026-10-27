// Naming rules from the premise (docs/DESIGN - NAMING.md, section 5): the
// one model call that proposes a world's cultures, and the forgiving reader
// of its answer. Pure.
//
// The model picks each culture's RECIPE - a preset, a real-world culture, or
// seed languages from the list with weights, how far from the real names,
// where family names come from, who uses it - never the names themselves.
// The names come from the stocks and the seeded generator, so the model's
// favourite names cannot leak in. A language not on the list is dropped;
// anything missing gets a default.
//
// A canon-only world's cultures also learn from the names already in it
// (learnedNames): they grow to sound like the canon, adding no detail to
// any entry.

import { STOCKS, REAL_CULTURES } from './stocks/index.js';
import { PRESETS, newCultureDef, normalizeCultureDef, DEFAULT_SOUND } from './cultures.js';
import { makeRng } from './random.js';
import { rollShifts } from './mutate.js';
import { fold } from './text.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (clean(s).length > n ? `${clean(s).slice(0, n - 1).trimEnd()}…` : clean(s));
// Lower-case letters and spaces only, accents folded: "Old Norse" = "old norse".
const words = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const MAX_PROPOSED = 6;

// Real-world cultures as one line per language: "Icelandic (modern, medieval)".
function realLines() {
    const byStock = new Map();
    for (const r of REAL_CULTURES) {
        const list = byStock.get(r.stock) ?? [];
        list.push(r.label.replace(/^.*\(|\)$/g, ''));
        byStock.set(r.stock, list);
    }
    return [...byStock].map(([id, eras]) => `${STOCKS[id].label} (${eras.join(', ')})`).join('; ');
}

// The prompt. input: { overview, places: [{ name, description }],
// factions: [{ name, description }], names: [string] (people already in the
// world), cultures: [string] (the world's own already), canonOnly, wish,
// bloodlines: the bloodlines part (src/library/bloodline-prompts.js) - the
// same call proposes them, so the call budget stays flat }.
// -> { system, prompt }
export function buildNamingRulesPrompt(input = {}) {
    const o = input.overview ?? {};
    const front = [
        o.premise && `Premise: ${cut(o.premise, 1500)}`,
        o.worldType && `Kind of world: ${String(o.worldType).replace(/_/g, ' ')}`,
        o.era && `Era: ${o.era}`,
        o.tone && `Tone: ${o.tone}`,
        o.themes && `Themes: ${cut(o.themes, 300)}`,
        o.rules && `World rules: ${cut(o.rules, 600)}`,
    ].filter(Boolean);
    const list = (items, n) => (items ?? []).slice(0, n).map((e) => `- ${clean(e.name)}${e.description ? `: ${cut(e.description, 140)}` : ''}`);
    const places = list(input.places, 30);
    const factions = list(input.factions, 30);
    const names = [...new Set((input.names ?? []).map(clean).filter(Boolean))].slice(0, 40);
    const system = [
        'You design the naming cultures of a fictional world for a name generator. A culture is a people, nation, species or group whose names sound alike.',
        'You choose each culture\'s recipe from the lists you are given. You never write example names: the generator makes every name itself.',
        'Answer in the plain format asked for, nothing else.',
    ].join(' ');
    const prompt = [
        'THE WORLD',
        ...front,
        places.length ? `\nIts main places:\n${places.join('\n')}` : '',
        factions.length ? `\nIts factions:\n${factions.join('\n')}` : '',
        names.length ? `\nNames already in it${input.canonOnly ? ' (canon - the cultures must sound like these)' : ''}: ${names.join(', ')}` : '',
        input.cultures?.length ? `\nCultures it already has (do not repeat them): ${input.cultures.join(', ')}` : '',
        '',
        'THE CHOICES',
        `Presets (invented cultures): ${PRESETS.map((p) => p.label).join('; ')}.`,
        `Real-world cultures, real names as they are (for a real place and time): ${realLines()}.`,
        `Seed languages, blended by weight 1-5 and then changed so they sound new: ${Object.values(STOCKS).map((s) => s.label).join(', ')}.`,
        'Or an alien tongue built from sounds, only for a people the premise makes inhuman (insect hives, machines, the truly alien).',
        '',
        'THE TASK',
        `Propose the cultures this world needs - usually two to four, at most ${MAX_PROPOSED}: the main people first, then the peoples, nations or groups whose names should sound different. A world set in a real place and time uses that real culture. A group does not need its own culture if its people are named like everyone else.`,
        input.wish ? `The user asks: ${cut(input.wish, 400)}` : '',
        '',
        'For each culture, write this block (a blank line between blocks):',
        'CULTURE: its name in the world',
        'WHO: one line - who they are and how their names should feel',
        'BASED ON: a preset name, OR a real-world culture with its period ("Icelandic, modern"), OR seed languages with weights ("Old Norse 3, German 1")',
        'DISTANCE: how far from the real names - 0 (as they are), 1 (a little changed), 2 (clearly changed), 3 (barely recognisable). Real-world cultures are 0.',
        'FAMILY NAMES: "same" (from the same languages), other seed languages with weights, "places" (houses named for where they are from), or "none"',
        'PLACES: how it names woods, rivers and mountains - "own tongue", "descriptive English" ("Whispering Woods") or "either"',
        'USED BY: the places and factions above that use it, by their exact names, comma-separated (or "none")',
        'DEFAULT: "yes" for the one culture used for everything else - only one',
        'SOUNDS: only for an alien tongue - "consonants: k:3 r:2 th; vowels: a:3 o i; syllables: 2-3"',
        input.bloodlines ? `\n${input.bloodlines}` : '',
    ].filter((x) => x !== '').join('\n').replace(/\n{3,}/g, '\n\n');
    return { system, prompt };
}

// ---- reading the answer

const KEYS = [
    ['name', /^(?:culture|name)$/],
    ['who', /^(?:who|notes?|about|description)$/],
    ['basis', /^(?:based on|basis|base|from|seeds?|languages?|recipe)$/],
    ['distance', /^(?:distance|mutation|change|how far)$/],
    ['family', /^(?:family names?|family|surnames?)$/],
    ['places', /^(?:places|place names|landscape|features)$/],
    ['users', /^(?:used by|users|who uses it|holders)$/],
    ['default', /^(?:default|world default)$/],
    ['sounds', /^(?:sounds?|alien|phonology)$/],
];

// "**Based on:** x" / "- Based on - x" -> ['basis', 'x'], or null.
function keyLine(line) {
    const m = String(line).replace(/[*_#`]/g, '').match(/^\s*(?:[-•\d.)]+\s*)?([A-Za-z][A-Za-z ]{1,20}?)\s*[:=–—-]\s*(.*)$/);
    if (!m) return null;
    const k = words(m[1]);
    const hit = KEYS.find(([, re]) => re.test(k));
    return hit ? [hit[0], clean(m[2])] : null;
}

const STOCK_BY_WORDS = Object.values(STOCKS).map((s) => [words(s.label), s.id]).sort((a, b) => b[0].length - a[0].length);
// The words a model may use for each preset, longest first ("old kingdom"
// before "kingdom" could be read as the desert one).
const PRESET_WORDS = {
    elves: ['elves', 'elf', 'elven'], dwarves: ['dwarves', 'dwarf', 'dwarven'], empire: ['empire', 'imperial'], desert: ['desert kingdom', 'desert'],
    steppe: ['steppe nomads', 'steppe', 'nomads'], northern: ['northern seafarers', 'seafarers'], old_kingdom: ['old kingdom', 'feudal'],
    shirefolk: ['halflings', 'halfling', 'shire folk', 'shirefolk'], orcs: ['orcs', 'orc', 'raiders'], jungle: ['jungle empire', 'jungle'],
    island: ['island folk', 'island'], eastern: ['eastern court'], holy: ['holy order'], sun: ['sun kingdom'], fey: ['fey', 'faerie', 'fairy'],
};
const PRESET_BY_WORDS = Object.entries(PRESET_WORDS).filter(([id]) => PRESETS.some((p) => p.id === id))
    .flatMap(([id, list]) => list.map((w) => [w, id])).sort((a, b) => b[0].length - a[0].length);

// Seed languages named in text, longest label first so "Old Norse" is not
// read as Norse, with the weight after each: [{ language, weight }].
export function readLanguages(text) {
    let rest = ` ${words(text)} `;
    const out = [];
    for (const [label, id] of STOCK_BY_WORDS) {
        const re = new RegExp(` ${label}(?: ([0-9]))?(?= )`);
        const m = rest.match(re);
        if (!m) continue;
        // Blanked, not removed, so the positions stay those of the text.
        rest = rest.replace(m[0], ' '.repeat(m[0].length));
        if (out.some((x) => x.language === id)) continue;
        out.push({ language: id, weight: m[1] ? Math.max(1, Math.min(5, Number(m[1]))) : 0, at: m.index });
    }
    // In the order written; an unweighted list gets falling weights.
    out.sort((a, b) => a.at - b.at);
    const anyWeight = out.some((x) => x.weight);
    return out.map((x, i) => ({ language: x.language, weight: anyWeight ? (x.weight || 1) : Math.max(1, 3 - i) }));
}

const ERA_WORDS = [['victorian', /victorian|regency|edwardian|19th/], ['1920s', /1920|1930|1940|jazz|prohibition|interwar/], ['medieval', /medieval|middle ages|viking|feudal/], ['premodern', /premodern|pre modern|edo|sengoku|early modern/], ['classical', /classical|antiquity|roman|republic/], ['ancient', /ancient|bronze/], ['imperial', /imperial/], ['ottoman', /ottoman/], ['modern', /modern|today|present|contemporary/]];

// A real-world culture named in text ("Icelandic, modern") -> its id, or ''.
// One language, and the text says "real" or names a period - "Old Norse 3,
// German 1" is a blend, and "Finnish" alone is a seed to grow from.
export function readReal(text) {
    const w = words(text);
    const langs = readLanguages(text);
    if (langs.length !== 1) return '';
    const era = ERA_WORDS.find(([, re]) => re.test(w))?.[0];
    if (!era && !/\breal\b/.test(w)) return '';
    const options = REAL_CULTURES.filter((r) => r.stock === langs[0].language);
    if (!options.length) return '';
    return (options.find((r) => r.era === era) ?? options.find((r) => r.era === 'modern') ?? options[0]).id;
}

// A preset named in text -> its id, or ''.
function readPreset(text) {
    const w = ` ${words(text)} `;
    return PRESET_BY_WORDS.find(([label]) => w.includes(` ${label} `))?.[1] ?? '';
}

function readDistance(text) {
    const w = words(text);
    const n = w.match(/\b([0-3])\b/);
    if (n) return Number(n[1]);
    if (/\b(?:none|as they are|unchanged|real)\b/.test(w)) return 0;
    if (/\b(?:wild|barely|unrecognis|unrecogniz)/.test(w)) return 3;
    if (/\b(?:strong|clearly|heavy)\b/.test(w)) return 2;
    if (/\b(?:light|little|slight)\b/.test(w)) return 1;
    return null;
}

// "k:3 r th" pieces from a SOUNDS line.
function readSounds(text) {
    const t = String(text ?? '');
    const part = (key) => t.match(new RegExp(`${key}\\s*[:=]\\s*([^;\\n]+)`, 'i'))?.[1]?.trim() ?? '';
    const syl = t.match(/syllables?\s*[:=]?\s*([1-5])\s*(?:-|to|–)\s*([1-6])/i);
    const units = (s) => s.split(/[\s,]+/).filter((u) => /^[a-zʼ'’]{1,3}(?::[1-5])?$/i.test(u)).join(' ');
    return {
        consonants: units(part('consonants')) || DEFAULT_SOUND.consonants,
        vowels: units(part('vowels')) || DEFAULT_SOUND.vowels,
        syllables: syl ? [Number(syl[1]), Math.max(Number(syl[1]), Number(syl[2]))] : DEFAULT_SOUND.syllables,
    };
}

const listNames = (text) => (/^\W*(?:none|nothing|n\/a|-)?\W*$/i.test(String(text ?? '')) ? [] : String(text).split(/\s*[,;]\s*|\s+and\s+/).map((x) => clean(x).replace(/^["'“]|["'”.]$/g, '')).filter((x) => x && !/^none$/i.test(x)));

// One culture block -> a proposal, or null without a name.
// { name, who, basis: { kind: 'preset' | 'real' | 'languages' | 'sound', id, seeds },
//   distance, family: { mode: 'same' | 'languages' | 'places' | 'none', seeds },
//   places: 'native' | 'kit' | 'both' | '', users: [name], isDefault, sounds }
function readBlock(fields) {
    const name = clean(fields.name).replace(/^["'“]|["'”]$/g, '').slice(0, 60);
    if (!name) return null;
    const basisText = fields.basis ?? '';
    const alien = /\balien|sounds?\b/i.test(basisText) || (!!fields.sounds && !readLanguages(basisText).length);
    const realId = readReal(basisText);
    const preset = realId ? '' : readPreset(basisText);
    const seeds = readLanguages(basisText);
    const basis = alien ? { kind: 'sound' }
        : realId ? { kind: 'real', id: realId }
            : preset && seeds.length === 0 ? { kind: 'preset', id: preset }
                : seeds.length ? { kind: 'languages', seeds }
                    : preset ? { kind: 'preset', id: preset } : { kind: 'languages', seeds: [] };
    const fam = words(fields.family ?? '');
    const famSeeds = readLanguages(fields.family ?? '');
    const family = famSeeds.length ? { mode: 'languages', seeds: famSeeds }
        : /\b(?:place|places|house|houses|where)\b/.test(fam) ? { mode: 'places', seeds: [] }
            : /\b(?:none|no)\b/.test(fam) ? { mode: 'none', seeds: [] } : { mode: 'same', seeds: [] };
    const pl = words(fields.places ?? '');
    const places = /either|both|mix/.test(pl) ? 'both' : /english|descriptive/.test(pl) ? 'kit' : /own|native|tongue/.test(pl) ? 'native' : '';
    return {
        name,
        who: cut(fields.who ?? '', 300),
        basis,
        distance: readDistance(fields.distance ?? ''),
        family,
        places,
        users: listNames(fields.users ?? ''),
        isDefault: /^\W*(?:yes|true|y)\b/i.test(fields.default ?? ''),
        sounds: alien ? readSounds(fields.sounds ?? '') : null,
    };
}

// The model's answer -> [proposal], at most MAX_PROPOSED, one default (the
// first marked, else the first). Names already taken (`existing`) are
// skipped.
export function readNamingRules(raw, { existing = [] } = {}) {
    const blocks = [];
    let cur = null;
    for (const line of String(raw ?? '').split(/\r?\n/)) {
        const kv = keyLine(line);
        if (!kv) continue;
        const [key, value] = kv;
        if (key === 'name') {
            cur = { name: value };
            blocks.push(cur);
        } else if (cur && !(key in cur)) cur[key] = value;
    }
    const taken = new Set(existing.map(fold));
    const out = [];
    for (const b of blocks) {
        const p = readBlock(b);
        if (!p || taken.has(fold(p.name))) continue;
        taken.add(fold(p.name));
        out.push(p);
        if (out.length >= MAX_PROPOSED) break;
    }
    const firstDefault = out.findIndex((p) => p.isDefault);
    out.forEach((p, i) => { p.isDefault = i === (firstDefault < 0 ? 0 : firstDefault); });
    return out;
}

// ---- proposals into cultures

const STYLE_FOR_PLACES = { native: { feature: 'native' }, kit: { feature: 'kit' }, both: { feature: 'both' } };

// A proposal -> a culture definition of the world's own (normalizeCultureDef
// shape), with its sound shifts rolled. ids: ids already taken.
export function proposalToDef(p, { seed = 'world', ids = [] } = {}) {
    const style = STYLE_FOR_PLACES[p.places] ?? {};
    const notes = p.who ?? '';
    if (p.basis.kind === 'real') return { ...newCultureDef(p.basis.id, { seed, ids, name: p.name }), notes };
    if (p.basis.kind === 'sound') {
        const def = newCultureDef('sound', { seed, ids, name: p.name });
        return normalizeCultureDef({ ...def, notes, style, sound: { ...def.sound, ...(p.sounds ?? {}), surnames: p.family?.mode === 'languages' || p.family?.mode === 'same' ? def.sound.surnames : false } }, def.id);
    }
    const base = newCultureDef(p.basis.kind === 'preset' ? `preset:${p.basis.id}` : 'blank', { seed, ids, name: p.name });
    const rand = makeRng(seed, 'proposal', base.id, p.name);
    const seeds = p.basis.kind === 'languages' && p.basis.seeds.length ? p.basis.seeds : base.seeds;
    const mutation = p.distance ?? base.mutation ?? 1;
    const family = { ...base.family };
    if (p.family?.mode === 'languages') { family.seeds = p.family.seeds; family.from = ''; }
    if (p.family?.mode === 'places') { family.seeds = []; family.from = 'places'; }
    const def = normalizeCultureDef({
        ...base, kind: 'invented', name: p.name, notes, seeds, mutation, family: { ...family, mutation: Math.max(family.mutation ?? 0, mutation) },
        style: { ...base.style, ...style }, from: base.from,
    }, base.id);
    def.shifts = def.mutation ? rollShifts(rand, def.mutation) : [];
    return def;
}

// The proposal in words, for its card: "Old Norse ×3, German, changed a
// little; houses named for places".
export function describeProposal(p) {
    const DIST = ['as they are', 'a little changed', 'clearly changed', 'barely recognisable'];
    const lang = (seeds) => seeds.map((x) => `${STOCKS[x.language]?.label ?? x.language}${x.weight > 1 ? ` ×${x.weight}` : ''}`).join(', ');
    const parts = [];
    if (p.basis.kind === 'real') parts.push(`real names: ${REAL_CULTURES.find((r) => r.id === p.basis.id)?.label ?? p.basis.id}`);
    else if (p.basis.kind === 'sound') parts.push('an alien tongue, built from sounds');
    else if (p.basis.kind === 'preset') parts.push(`like the ${PRESETS.find((x) => x.id === p.basis.id)?.label ?? p.basis.id} preset`);
    else parts.push(p.basis.seeds.length ? `grown from ${lang(p.basis.seeds)}` : 'grown from a language rolled for it');
    if (p.basis.kind !== 'real' && p.basis.kind !== 'sound' && p.distance != null) parts.push(DIST[p.distance]);
    if (p.family?.mode === 'languages') parts.push(`family names from ${lang(p.family.seeds)}`);
    if (p.family?.mode === 'places') parts.push('houses named for places');
    if (p.places === 'kit') parts.push('descriptive English for the land');
    if (p.places === 'native') parts.push('the land named in its own tongue');
    return parts.join('; ');
}

// ---- learning from the world's names

// Names the world already gives the users of a culture: the places and
// factions themselves, the places inside those places, and the characters
// who live in them or belong to them. users: [entryId]; entries: [{ id,
// type, name, fields }]; parents: { placeId: parentId }. -> [name]
export function learnedNames(users, entries, parents = {}) {
    const holders = new Set(users);
    const inside = (id) => {
        for (let at = id, guard = 0; at && guard < 30; at = parents[at], guard++) if (holders.has(at)) return true;
        return false;
    };
    const out = [];
    for (const e of entries) {
        const refs = Object.values(e.fields ?? {}).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v) => typeof v === 'string');
        const tied = e.type === 'location' ? inside(e.id) : e.type === 'faction' ? holders.has(e.id) : e.type === 'character' ? refs.some((r) => holders.has(r) || inside(r)) : false;
        if (!tied) continue;
        // People by their own names; a place or faction by its distinctive
        // words ("the Iron Covenant" teaches nothing about how names sound).
        const name = clean(e.name).replace(/^the\s+/i, '');
        if (e.type === 'character') out.push(...name.split(' ').filter((w) => w.length > 2 && /^\p{Lu}/u.test(w)));
        else out.push(...name.split(' ').filter((w) => w.length > 3 && /^\p{Lu}/u.test(w) && !COMMON_WORDS.has(w.toLowerCase())));
    }
    return [...new Set(out.map((w) => w.replace(/['’]s$/, '').replace(/[^\p{L}'-]/gu, '')).filter((w) => w.length > 2))];
}

const COMMON_WORDS = new Set('house order guild company city town village kingdom empire republic forest woods river mountain mountains hall keep tower temple church inn tavern street road district quarter market harbour harbor port castle fort fortress valley lake isle island islands north south east west upper lower great high new old saint holy iron golden silver black white red green blue grey gray dark bright first last council court circle brotherhood sisterhood society league union corporation industries holdings group'.split(' '));

// A world's names as one more seed for a culture: the names join its
// learned list (never handed out themselves). -> the def changed.
export function learnInto(def, names, { weight = 3 } = {}) {
    if (def.kind !== 'invented' || !names.length) return def;
    const learned = [...new Set([...(def.learned ?? []), ...names])].slice(0, 300);
    return { ...def, learned, learnedWeight: Math.max(def.learnedWeight ?? 2, weight) };
}
