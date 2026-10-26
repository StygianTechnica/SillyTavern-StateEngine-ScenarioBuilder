// Naming cultures: the presets, the real-world cultures, a world's own, and
// the world default chosen from the front page when nothing is set up
// (docs/DESIGN - NAMING.md, sections 2, 3.2b and 3.5).
//
// A culture id is one of:
//   preset:<id>          a ready-made culture (Elves, Dwarves, ...)
//   real:<stock>:<era>   a real-world culture ("real:icelandic:modern")
//   auto:blend           a blend rolled from the world seed (science fiction)
//   <id>                 one of the world's own (naming.cultures, phase 2)

import { STOCKS, STOCK_IDS, REAL_CULTURES, stockOf } from './stocks/index.js';
import { makeRng, pick, weighted } from './random.js';
import { rollShifts, SHIFTS } from './mutate.js';

// Per kind, whether a culture names it in its own tongue, with a kit, or
// either: 'native' | 'kit' | 'both'.
const STYLE_HUMAN = { settlement: 'native', region: 'native', feature: 'both', building: 'kit', ship: 'kit', faction: 'kit', house: 'native' };
const STYLE_ELDER = { settlement: 'native', region: 'native', feature: 'native', building: 'native', ship: 'native', faction: 'native', house: 'native' };

const s = (pairs) => pairs.map(([language, weight]) => ({ language, weight }));

export const PRESETS = Object.freeze([
    { id: 'elves', label: 'Elves', seeds: s([['finnish', 3], ['welsh', 2], ['icelandic', 1]]), mutation: 2, family: { from: 'places', mutation: 2 }, style: STYLE_ELDER },
    { id: 'dwarves', label: 'Dwarves', seeds: s([['old_norse', 3], ['german', 1], ['scottish_gaelic', 1]]), mutation: 1, family: { seeds: s([['german', 2], ['old_norse', 1]]), mutation: 2, old: true }, style: { ...STYLE_HUMAN, feature: 'native', building: 'native' } },
    { id: 'empire', label: 'Empire', seeds: s([['latin', 3], ['byzantine_greek', 1]]), mutation: 1, style: STYLE_HUMAN },
    { id: 'desert', label: 'Desert kingdom', seeds: s([['persian', 3], ['arabic', 2], ['turkish', 1]]), mutation: 1, style: STYLE_HUMAN },
    { id: 'steppe', label: 'Steppe nomads', seeds: s([['mongolian', 3], ['turkish', 1]]), mutation: 1, style: { ...STYLE_HUMAN, feature: 'native' } },
    { id: 'northern', label: 'Northern seafarers', seeds: s([['old_norse', 3], ['old_english', 1]]), mutation: 1, style: STYLE_HUMAN },
    { id: 'old_kingdom', label: 'Old kingdom (feudal)', seeds: s([['old_english', 3], ['french', 1], ['breton', 1]]), mutation: 1, family: { seeds: s([['english', 2], ['french', 1]]), mutation: 1, old: true }, style: STYLE_HUMAN },
    { id: 'shirefolk', label: 'Halflings / shire-folk', seeds: s([['old_english', 2], ['dutch', 2]]), mutation: 1, family: { seeds: s([['english', 2], ['dutch', 1]]), mutation: 1, old: true }, style: { ...STYLE_HUMAN, feature: 'kit' } },
    { id: 'orcs', label: 'Orcs / raiders', seeds: s([['akkadian', 2], ['hungarian', 1], ['basque', 1]]), mutation: 3, style: { ...STYLE_HUMAN, feature: 'native', building: 'native' } },
    { id: 'jungle', label: 'Jungle empire', seeds: s([['nahuatl', 3], ['quechua', 2]]), mutation: 1, style: { ...STYLE_HUMAN, feature: 'native' } },
    { id: 'island', label: 'Island folk', seeds: s([['hawaiian', 2], ['maori', 2]]), mutation: 1, style: { ...STYLE_HUMAN, feature: 'native' } },
    { id: 'eastern', label: 'Eastern court', seeds: s([['japanese', 2], ['korean', 1], ['mandarin', 1]]), mutation: 1, style: { ...STYLE_HUMAN, feature: 'native' } },
    { id: 'holy', label: 'Holy order', seeds: s([['latin', 2], ['hebrew', 2]]), mutation: 1, style: STYLE_HUMAN },
    { id: 'sun', label: 'Sun kingdom', seeds: s([['ancient_egyptian', 3], ['akkadian', 1]]), mutation: 1, style: STYLE_HUMAN },
    { id: 'fey', label: 'Fey', seeds: s([['irish', 2], ['welsh', 2]]), mutation: 3, family: { from: 'places' }, style: STYLE_ELDER },
]);

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

// The choices for a culture picker: [{ value, label, group }].
export function cultureChoices(naming = {}) {
    return [
        ...Object.values(naming.cultures ?? {}).map((c) => ({ value: c.id, label: c.name || c.id, group: 'This world' })),
        ...PRESETS.map((p) => ({ value: `preset:${p.id}`, label: `${p.label} (${p.seeds.map((x) => STOCKS[x.language]?.label).join(', ')})`, group: 'Invented' })),
        ...REAL_CULTURES.map((r) => ({ value: r.id, label: r.label, group: 'Real world' })),
    ];
}

// A culture's full working shape from a definition. Shifts and other
// rolled parts come from the world seed and the culture id, so they are
// the same every time unless stored.
function build(def, seed) {
    const rand = makeRng(seed, 'culture', def.id);
    const seeds = (def.seeds ?? []).filter((x) => STOCKS[x.language] && x.weight > 0);
    const root = stockOf(def.root) ?? stockOf(seeds[0]?.language) ?? STOCKS.english;
    const mutation = def.real ? 0 : Math.max(0, Math.min(3, def.mutation ?? 1));
    return {
        id: def.id,
        label: def.label ?? def.name ?? def.id,
        real: def.real === true,
        stock: def.real ? root.id : '',
        era: def.era ?? (def.real ? root.era : 'medieval'),
        root: root.id,
        seeds: seeds.length ? seeds : [{ language: root.id, weight: 1 }],
        mutation,
        family: {
            seeds: (def.family?.seeds ?? []).filter((x) => STOCKS[x.language]),
            mutation: def.real ? 0 : Math.max(0, Math.min(3, def.family?.mutation ?? mutation)),
            old: def.family?.old ?? !def.real,
            // 'places': house names made like place names (elves have no
            // surnames; their houses are named for where they are from).
            from: def.family?.from ?? '',
        },
        // An invented culture given family-name seeds names people with a
        // surname, whatever its root does (an Old English kingdom with houses).
        convention: def.convention ?? (!def.real && def.family?.seeds?.length ? 'western' : root.convention),
        patronym: def.patronym ?? root.patronym,
        patronymSuffix: root.patronymSuffix,
        adjective: def.adjective ?? root.adjective,
        prefixes: def.prefixes ?? root.prefixes,
        femalePrefixes: def.femalePrefixes ?? root.femalePrefixes,
        style: { ...STYLE_HUMAN, ...(def.real ? { feature: 'kit', building: 'kit', settlement: 'native' } : {}), ...(def.style ?? {}) },
        shifts: def.shifts ?? (mutation ? rollShifts(rand, mutation) : []),
        familyShifts: def.familyShifts ?? (def.family?.mutation > mutation ? rollShifts(rand, def.family.mutation) : null),
        learned: def.learned ?? [],
        learnedWeight: def.learnedWeight ?? 2,
    };
}

// ---- a world's own cultures (naming.cultures, the Naming tab)
//
// def = { id, name, notes, kind: 'invented' | 'real' | 'sound',
//   invented: seeds, mutation, family { seeds, mutation, old, from },
//             learned (the user's example names), learnedWeight, shifts
//             (stored once rolled, so editing does not change them),
//   real:     realId ('real:<stock>:<era>'),
//   sound:    sound { consonants, vowels, shapes, syllables: [min, max],
//             surnames } - a tongue like no human one,
//   all:      style { kind: 'native' | 'kit' | 'both' }, banned: [names],
//             from (the preset or real culture it was made from) }

export const CULTURE_KINDS = Object.freeze([['invented', 'Invented - grown from real languages'], ['real', 'Real world - real names as they are'], ['sound', 'Alien - built from sounds']]);
export const STYLE_KINDS = Object.freeze([['settlement', 'Towns and cities'], ['region', 'Regions and realms'], ['feature', 'Woods, rivers, mountains'], ['building', 'Inns and shops'], ['faction', 'Orders and companies'], ['ship', 'Ships']]);
export const STYLE_CHOICES = Object.freeze([['native', 'In its own tongue'], ['kit', 'Descriptive English'], ['both', 'Either']]);
export const DEFAULT_SOUND = Object.freeze({ consonants: 'k:3 r:3 t:2 v:2 z:2 s:2 th sh x q', vowels: 'a:3 o:2 i:2 e u', shapes: 'CV:3 CVC:2 V:1 CVV:1', syllables: [2, 3], surnames: false });

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : '');
const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);
const seedList = (v) => (Array.isArray(v) ? v.filter((x) => isObj(x) && STOCKS[x.language]).map((x) => ({ language: x.language, weight: clamp(x.weight, 1, 5, 1) })) : []);
const nameList = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x).trim()).filter(Boolean))] : []);
const SHIFT_IDS = new Set(SHIFTS.map((x) => x.id));
const STYLE_IDS = new Set(STYLE_CHOICES.map(([k]) => k));

export function normalizeCultureDef(raw, id) {
    const d = isObj(raw) ? raw : {};
    const kind = ['invented', 'real', 'sound'].includes(d.kind) ? d.kind : 'invented';
    const style = {};
    if (isObj(d.style)) for (const [k] of STYLE_KINDS) if (STYLE_IDS.has(d.style[k])) style[k] = d.style[k];
    const out = { id, name: text(d.name).trim() || 'New culture', notes: text(d.notes), kind, style, banned: nameList(d.banned), from: text(d.from) };
    if (kind === 'real') return { ...out, realId: REAL_CULTURES.some((r) => r.id === d.realId) ? d.realId : 'real:english:modern' };
    if (kind === 'sound') {
        const s = isObj(d.sound) ? d.sound : {};
        const syl = Array.isArray(s.syllables) ? s.syllables : DEFAULT_SOUND.syllables;
        const min = clamp(syl[0], 1, 5, 2);
        return { ...out, sound: { consonants: text(s.consonants) || DEFAULT_SOUND.consonants, vowels: text(s.vowels) || DEFAULT_SOUND.vowels, shapes: text(s.shapes) || DEFAULT_SOUND.shapes, syllables: [min, Math.max(min, clamp(syl[1], 1, 6, 3))], surnames: s.surnames === true } };
    }
    const f = isObj(d.family) ? d.family : {};
    return {
        ...out,
        seeds: seedList(d.seeds).length ? seedList(d.seeds) : [{ language: 'english', weight: 1 }],
        mutation: clamp(d.mutation, 0, 3, 1),
        family: { seeds: seedList(f.seeds), mutation: clamp(f.mutation, 0, 3, clamp(d.mutation, 0, 3, 1)), old: f.old !== false, from: f.from === 'places' ? 'places' : '' },
        learned: nameList(d.learned).slice(0, 300),
        learnedWeight: clamp(d.learnedWeight, 1, 5, 2),
        shifts: Array.isArray(d.shifts) ? d.shifts.filter((x) => SHIFT_IDS.has(x)) : [],
    };
}

// A new culture of the world's own, made from a preset ('preset:elves'), a
// real culture ('real:icelandic:modern'), 'sound' (alien) or 'blank'.
// Its sound shifts are rolled now and kept. ids: the ids already taken.
export function newCultureDef(from, { seed = 'world', ids = [], name = '' } = {}) {
    let n = 1;
    let id = 'c1';
    while (ids.includes(id)) id = `c${++n}`;
    const rand = makeRng(seed, 'new-culture', id, from);
    if (String(from).startsWith('real:')) {
        const r = REAL_CULTURES.find((x) => x.id === from);
        return normalizeCultureDef({ kind: 'real', realId: from, name: name || r?.label || 'Real culture', from }, id);
    }
    if (from === 'sound') return normalizeCultureDef({ kind: 'sound', name: name || 'Alien tongue', sound: DEFAULT_SOUND }, id);
    const p = PRESET_BY_ID.get(String(from).replace(/^preset:/, ''));
    const base = p ?? { label: 'New culture', seeds: [{ language: pick(rand, STOCK_IDS), weight: 3 }], mutation: 1 };
    const def = normalizeCultureDef({ ...base, kind: 'invented', name: name || base.label, from: p ? `preset:${p.id}` : '' }, id);
    def.shifts = def.mutation ? rollShifts(rand, def.mutation) : [];
    return def;
}

// The sound shifts as the user reads them: "th becomes d".
const SHIFT_WORDS = (s) => `${s.from.replace(/\(\?<=\[[^\]]+\]\)|\(\?=\[[^\]]+\]\)|\(\?=[^)]*\)|\(\?<=[^)]*\)/g, '').replace(/\^/, 'starting ').replace(/\$$/, ' at the end') || 'a start'} → ${s.to || 'nothing'}`;
export const describeShift = (id) => {
    const s = SHIFTS.find((x) => x.id === id);
    return s ? SHIFT_WORDS(s) : id;
};

// The working shape of a world's own culture.
function buildOwn(def, seed) {
    if (def.kind === 'real') {
        const base = resolveCulture(def.realId, { seed });
        return { ...base, id: def.id, label: def.name, style: { ...base.style, ...def.style }, banned: def.banned };
    }
    if (def.kind === 'sound') {
        return {
            id: def.id, label: def.name, real: false, stock: '', era: 'medieval', root: 'english', seeds: [], mutation: 0,
            family: { seeds: [], mutation: 0, old: false, from: '' }, convention: def.sound.surnames ? 'western' : 'single',
            patronym: null, patronymSuffix: null, adjective: ['i', 'an'], prefixes: [], femalePrefixes: {},
            style: { ...STYLE_ELDER, building: 'kit', faction: 'kit', ...def.style }, shifts: [], familyShifts: null, learned: [], learnedWeight: 2,
            sound: parseSound(def.sound), banned: def.banned,
        };
    }
    // No shifts kept yet (mutation raised since): rolled, as for a preset.
    return { ...build({ ...def, label: def.name, shifts: def.shifts.length ? def.shifts : undefined }, seed), banned: def.banned };
}

// "k:3 r th" -> [['k', 3], ['r', 1], ['th', 1]].
const weightedUnits = (s) => String(s ?? '').split(/[\s,]+/).filter(Boolean).map((u) => {
    const [unit, w] = u.split(':');
    return [unit, Math.max(0.1, Number(w) || 1)];
});
export function parseSound(sound) {
    return {
        consonants: weightedUnits(sound.consonants),
        vowels: weightedUnits(sound.vowels),
        shapes: weightedUnits(sound.shapes).filter(([sh]) => /^[CV]+$/.test(sh)),
        syllables: sound.syllables,
    };
}

// A blend for a world that has no people of its own to model (science
// fiction, a multiverse): three languages from anywhere, mutated hard.
function rolledBlend(seed, mutation = 2) {
    const rand = makeRng(seed, 'blend');
    const picked = [];
    while (picked.length < 3) {
        const id = pick(rand, STOCK_IDS);
        if (!picked.includes(id)) picked.push(id);
    }
    return { id: 'auto:blend', label: `A blend of ${picked.map((id) => STOCKS[id].label).join(', ')}`, seeds: picked.map((language, i) => ({ language, weight: 3 - i })), mutation };
}

export function resolveCulture(id, { naming = {}, seed = 'world' } = {}) {
    const key = String(id ?? '');
    if (naming.cultures?.[key]) return buildOwn(normalizeCultureDef(naming.cultures[key], key), seed);
    if (key.startsWith('preset:')) {
        const p = PRESET_BY_ID.get(key.slice(7));
        if (p) return build({ ...p, id: key }, seed);
    }
    if (key.startsWith('real:')) {
        const [, stockId, era] = key.split(':');
        const st = stockOf(stockId);
        if (!st) return null;
        // A period the stock has no lists for: its base names with the older
        // family-name forms where it keeps them (medieval French: Montfort).
        const old = ['medieval', 'premodern'].includes(era) && st.oldFamily.length;
        return build({ id: key, real: true, root: st.id, era: st.eras[era] ? era : old ? 'old' : st.era, label: REAL_CULTURES.find((r) => r.id === key)?.label ?? `${st.label} (${era})` }, seed);
    }
    if (key === 'auto:blend') return build(rolledBlend(seed), seed);
    return null;
}

// ---- whose names a new thing takes (docs/DESIGN - NAMING.md, section 2)

// The first of: a faction it belongs to that has a culture; the place it is
// in, or the nearest place above with one. entries: { id: entry meta }
// (meta.culture); parents: { placeId: parentId }.
// -> { id, from } (from: the entry it was taken from) or { id: '', from: '' }.
export function inheritedCulture(entries = {}, parents = {}, { placeId = null, factionIds = [] } = {}) {
    for (const f of factionIds) if (entries[f]?.culture) return { id: entries[f].culture, from: f };
    const seen = new Set();
    for (let at = placeId; at && !seen.has(at); at = parents[at]) {
        seen.add(at);
        if (entries[at]?.culture) return { id: entries[at].culture, from: at };
    }
    return { id: '', from: '' };
}

// ---- the world default

const TEXT_OF = (o) => [o?.premise, o?.era, o?.rules, o?.themes].filter(Boolean).join(' ').toLowerCase();
const has = (text, words) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text));

// Historical eras (src/library/world-options.js ERAS) and the culture they
// mean when the premise does not say where.
const HISTORICAL = [
    [['viking'], 'real:old_norse:medieval'], [['feudal japan', 'sengoku', 'edo'], 'real:japanese:premodern'],
    [['classical antiquity', 'roman'], 'real:latin:classical'], [['crusade'], 'real:french:medieval'],
    [['victorian', 'regency', 'edwardian'], 'real:english:victorian'], [['wild west', 'frontier'], 'real:american:1920s'],
    [['world war', '1920s', '1930s', '1940s', 'prohibition', 'jazz age'], 'real:american:1920s'],
    [['bronze age'], 'real:akkadian:ancient'], [['age of exploration'], 'real:portuguese:modern'],
];

// Which stock the premise points to, by its place words ("Reykjavik").
function detectStock(text) {
    let best = null;
    for (const st of Object.values(STOCKS)) {
        const hits = st.detect.filter((w) => has(text, [w])).length;
        if (hits && (!best || hits > best.hits)) best = { st, hits };
    }
    return best?.st ?? null;
}

// The stock's era for the world's era.
function eraFor(st, worldEra) {
    const e = String(worldEra ?? '').toLowerCase();
    if (/19[0-4]0s|1920|war|prohibition|wild west/.test(e) && st.eras['1920s']) return '1920s';
    if (/victorian|edwardian|regency/.test(e) && st.eras.victorian) return 'victorian';
    if (/medieval|crusade|viking|feudal/.test(e)) return st.eras.medieval ? 'medieval' : st.eras.premodern ? 'premodern' : st.eras.ottoman ? 'ottoman' : st.era;
    if (/antiquity|ancient|bronze|classical/.test(e)) return st.eras.classical ? 'classical' : st.eras.ancient ? 'ancient' : st.eras.imperial ? 'imperial' : st.era;
    return st.eras.modern ? 'modern' : st.era;
}

// Preset by what the premise is about.
const PRESET_CUES = [
    [['desert', 'dune', 'sands', 'oasis', 'caliph', 'sultan', 'djinn'], 'desert'], [['steppe', 'nomad', 'horse lords', 'horselords', 'khagan'], 'steppe'],
    [['viking', 'fjord', 'longship', 'jarl', 'raider'], 'northern'], [['legion', 'senate', 'emperor', 'imperial', 'empire'], 'empire'],
    [['jungle', 'rainforest', 'step pyramid', 'sun priest'], 'jungle'], [['archipelago', 'atoll', 'islands', 'island chain', 'reef'], 'island'],
    [['samurai', 'shogun', 'ronin', 'daimyo', 'jade emperor', 'cultivation', 'wuxia'], 'eastern'], [['pharaoh', 'sun god', 'pyramid'], 'sun'],
    [['feudal', 'knight', 'baron', 'castle', 'kingdom', 'crown'], 'old_kingdom'], [['inquisition', 'paladin', 'templar', 'holy order'], 'holy'],
    [['fey', 'faerie', 'fairy court', 'seelie'], 'fey'],
];

// The culture the world uses when nothing more specific applies, and why:
// naming.defaultCulture if set, else chosen from the front page.
// -> { id, why }
export function defaultCultureChoice(overview = {}, naming = {}) {
    if (naming.defaultCulture) return { id: naming.defaultCulture, why: 'chosen by you' };
    const type = overview.worldType ?? '';
    const typeLabel = String(type).replace(/_/g, ' ');
    const text = TEXT_OF(overview);
    const era = String(overview.era ?? '');
    const realWorld = ['modern', 'historical', 'urban_fantasy', 'cosmic_horror'].includes(type);
    const where = detectStock(text);
    const word = where ? where.detect.find((w) => has(text, [w])) : '';
    if (realWorld) {
        if (where) return { id: `real:${where.id}:${eraFor(where, era)}`, why: `"${word}" on the front page` };
        const hist = HISTORICAL.find(([cues]) => has(`${era} ${text}`, cues));
        if (hist) return { id: hist[1], why: `the era: ${era || hist[0][0]}` };
        if (type === 'cosmic_horror') return { id: 'real:american:1920s', why: 'a cosmic horror world' };
        return type === 'historical'
            ? { id: 'real:english:medieval', why: 'a historical world that names no place' }
            : { id: 'real:american:modern', why: `a ${typeLabel} world that names no place` };
    }
    if (type === 'science_fiction' || type === 'multiverse') return { id: 'auto:blend', why: `a ${typeLabel} world: three languages blended` };
    if (type === 'post_apocalyptic') return where ? { id: `real:${where.id}:modern`, why: `"${word}" on the front page` } : { id: 'real:american:modern', why: 'a post-apocalyptic world' };
    const cue = PRESET_CUES.find(([cues]) => has(text, cues));
    if (cue) return { id: `preset:${cue[1]}`, why: `"${cue[0].find((c) => has(text, [c]))}" on the front page` };
    // A fantasy world that says nothing: a human culture rolled from the
    // seed - so not every such world is the same old kingdom.
    const rand = makeRng(naming.seed ?? 'world', 'default');
    const id = `preset:${weighted(rand, [['old_kingdom', 3], ['northern', 1], ['empire', 1], ['desert', 1], ['eastern', 1], ['steppe', 1], ['island', 1], ['holy', 1]], ([, w]) => w)[0]}`;
    return { id, why: 'rolled for this world - the front page names no people' };
}

export const defaultCultureId = (overview = {}, naming = {}) => defaultCultureChoice(overview, naming).id;
