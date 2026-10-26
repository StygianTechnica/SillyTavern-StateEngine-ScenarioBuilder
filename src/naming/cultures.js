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
import { rollShifts } from './mutate.js';

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
    if (naming.cultures?.[key]) return build(naming.cultures[key], seed);
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

// The culture id the world uses when nothing more specific applies:
// naming.defaultCulture if set, else chosen from the front page.
export function defaultCultureId(overview = {}, naming = {}) {
    if (naming.defaultCulture) return naming.defaultCulture;
    const type = overview.worldType ?? '';
    const text = TEXT_OF(overview);
    const era = String(overview.era ?? '');
    const realWorld = ['modern', 'historical', 'urban_fantasy', 'cosmic_horror'].includes(type);
    const where = detectStock(text);
    if (realWorld) {
        if (where) return `real:${where.id}:${eraFor(where, era)}`;
        const hist = HISTORICAL.find(([cues]) => has(`${era} ${text}`, cues));
        if (hist) return hist[1];
        if (type === 'cosmic_horror') return 'real:american:1920s';
        return type === 'historical' ? 'real:english:medieval' : 'real:american:modern';
    }
    if (type === 'science_fiction' || type === 'multiverse') return 'auto:blend';
    if (type === 'post_apocalyptic') return where ? `real:${where.id}:modern` : 'real:american:modern';
    const cue = PRESET_CUES.find(([cues]) => has(text, cues));
    if (cue) return `preset:${cue[1]}`;
    // A fantasy world that says nothing: a human culture rolled from the
    // seed - so not every such world is the same old kingdom.
    const rand = makeRng(naming.seed ?? 'world', 'default');
    return `preset:${weighted(rand, [['old_kingdom', 3], ['northern', 1], ['empire', 1], ['desert', 1], ['eastern', 1], ['steppe', 1], ['island', 1], ['holy', 1]], ([, w]) => w)[0]}`;
}
