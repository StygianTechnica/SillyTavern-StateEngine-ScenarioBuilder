// The name generator (docs/DESIGN - NAMING.md). Pure: everything it needs
// comes in - the world's naming document, its front page, the names already
// in it - and a name (or the reason none is rolled) comes out. The caller
// stores the new counter and registry entry (src/naming/run.js).

import { stockOf, listsFor } from './stocks/index.js';
import { makeRng, pick, weighted, rankWeight, chance } from './random.js';
import { trainMarkov, generateMarkov } from './markov.js';
import { mutate, rollEndings } from './mutate.js';
import { composePerson } from './conventions.js';
import { KITS, POOLS, headsFor, wordWeight, wordOf, moodOf } from './kits.js';
import { resolveCulture, defaultCultureId } from './cultures.js';
import { buildIndex, acceptable, spreadScore } from './registry.js';
import { nameKindFor, nameInBrief, tiesInBrief, tieRelation } from './classify.js';
import { capitalize, titleCase, isVowel, nameTokens } from './text.js';
import { isLaterAge } from '../library/world-options.js';

const CANDIDATES = 10;
const MAX_LEN = 26;

// ---- names from the stocks and the blend

const modelCache = new Map();

function listOf(culture, language, part) {
    const st = stockOf(language);
    if (!st) return [];
    const era = culture.real ? culture.era : (part === 'family' && culture.family.old ? 'old' : culture.era);
    const l = listsFor(st, era);
    return (part === 'family' ? l.family : l[part]) ?? [];
}

// The Markov model for one part of a name. part: 'm' | 'f' | 'family'.
function modelFor(culture, part) {
    const seeds = part === 'family' && culture.family.seeds.length ? culture.family.seeds : culture.seeds;
    const key = JSON.stringify([culture.real, culture.era, seeds, part, culture.family.old, culture.learned]);
    if (modelCache.has(key)) return modelCache.get(key);
    const sets = seeds.map((sd) => ({ names: listOf(culture, sd.language, part).map((n) => n.split(' ').pop()), weight: sd.weight }));
    // The user's own example names are a seed of their own (section 3.2).
    if (part !== 'family' && culture.learned.length) {
        const total = seeds.reduce((a, b) => a + b.weight, 0) || 1;
        sets.push({ names: culture.learned.map((n) => String(n).split(/\s+/)[0]), weight: culture.learnedWeight * total / Math.max(1, seeds.length) });
    }
    const model = sets.some((x) => x.names.length) ? trainMarkov(sets, 3) : null;
    if (modelCache.size > 200) modelCache.clear();
    modelCache.set(key, model);
    return model;
}

const endingsCache = new Map();
function endingsFor(culture) {
    const key = `${culture.id}|${culture.shifts.join(',')}`;
    if (!endingsCache.has(key)) {
        const names = culture.seeds.flatMap((sd) => [...listOf(culture, sd.language, 'm'), ...listOf(culture, sd.language, 'f')]);
        // Its own stream: a cache must not change what the next roll is.
        endingsCache.set(key, rollEndings(makeRng(key, 'endings'), names, culture.shifts));
    }
    return endingsCache.get(key);
}

// One real name from a list, the common ones more often.
const realPick = (rand, list) => (list.length ? weighted(rand, list.map((n, i) => [n, rankWeight(i)]), ([, w]) => w)[0] : '');

// The stock a place or word is drawn from: the culture's own for a real
// one, else one of its seeds by weight.
const stockForRoll = (culture, rand) => stockOf(culture.real ? culture.root : weighted(rand, culture.seeds)?.language ?? culture.root);

const gendered = (rand, gender) => (gender === 'm' || gender === 'f' ? gender : chance(rand, 0.5) ? 'm' : 'f');

// One part of a person's name: 'm' | 'f' (given names) or 'family'.
// A name built from a culture's sounds (an alien tongue): syllables of its
// shapes, filled from its consonants and vowels by weight.
function soundName(sound, rand, { min = sound.syllables[0], max = sound.syllables[1] } = {}) {
    for (let tries = 0; tries < 30; tries++) {
        const count = min + Math.floor(rand() * (max - min + 1));
        let out = '';
        for (let i = 0; i < count; i++) {
            const [shape] = weighted(rand, sound.shapes, ([, w]) => w) ?? ['CV'];
            for (const slot of shape) out += (weighted(rand, slot === 'C' ? sound.consonants : sound.vowels, ([, w]) => w) ?? [''])[0];
        }
        if (out.length >= 2 && out.length <= 14 && !/(.)/.test(out)) return capitalize(out);
    }
    return '';
}

function namePart(culture, part, rand, other = '') {
    if (culture.sound) return soundName(culture.sound, rand, part === 'family' ? { min: 2, max: 3 } : {});
    if (culture.real) {
        const st = stockOf(culture.root);
        return realPick(rand, listOf(culture, st.id, part));
    }
    const model = modelFor(culture, part);
    if (!model) return '';
    const raw = generateMarkov(model, rand);
    if (!raw) return '';
    const shifts = part === 'family' ? culture.familyShifts ?? culture.shifts : culture.shifts;
    const level = part === 'family' ? culture.family.mutation : culture.mutation;
    const second = level >= 3 ? generateMarkov(model, rand) : '';
    const out = mutate(raw, { level, shifts, endings: part === 'family' ? [] : endingsFor(culture), rand, other: second || other });
    return titleCase(out);
}

const EPITHETS = ['the Elder', 'the Younger', 'the Bold', 'the Wise', 'the Red', 'the Black', 'the Grey', 'the Tall', 'the Lame', 'the Fair', 'the Old', 'the Silent', 'the Proud', 'the Quick', 'One-Eye', 'Ironhand', 'Longstride', 'the Smith', 'the Hunter', 'the Wanderer', 'the Stranger', 'the Lucky'];

function prefixFor(culture, rand, gender) {
    if (culture.real && !stockOf(culture.root)?.realPrefixes) return '';
    const list = culture.prefixes ?? [];
    let roll = rand() * 100;
    for (const [p, pct] of list) {
        roll -= pct;
        if (roll < 0) return gender === 'f' ? culture.femalePrefixes?.[p] ?? p : p;
    }
    return '';
}

// A person: { name, aliases, gender }. father / family may be given (a
// child takes their family's name).
function personName(culture, rand, { gender = '', father = '', family = '' } = {}) {
    const g = gendered(rand, gender);
    const st = stockOf(culture.root);
    const convention = culture.real ? culture.convention : ({ roman: 'western', greek: 'patronym' }[culture.convention] ?? culture.convention);
    const given = namePart(culture, g, rand);
    if (!given) return null;
    const fam = () => family || (culture.family.from === 'places' ? houseFromPlace(culture, rand) : namePart(culture, 'family', rand)) || houseFromPlace(culture, rand);
    const parts = { given };
    switch (convention) {
        case 'icelandic': case 'patronym': case 'tamil':
            parts.father = father || namePart(culture, 'm', rand);
            if (convention === 'patronym' && chance(rand, 0.25)) parts.byname = pickByname(culture, rand);
            break;
        case 'greek':
            parts.father = father || namePart(culture, 'm', rand);
            break;
        case 'russian':
            parts.father = father || namePart(culture, 'm', rand);
            parts.family = fam();
            break;
        case 'spanish': case 'portuguese':
            parts.family = fam();
            parts.family2 = namePart(culture, 'family', rand);
            parts.prefix = prefixFor(culture, rand, g);
            break;
        case 'roman':
            parts.praenomen = realPick(rand, st.roman?.praenomina ?? []) || given;
            parts.family = fam();
            parts.byname = realPick(rand, st.bynames);
            break;
        case 'arabic':
            parts.father = father || namePart(culture, 'm', rand);
            if (culture.era === 'modern') parts.family = fam();
            else if (chance(rand, 0.5)) parts.byname = pickByname(culture, rand);
            break;
        case 'single':
            // An alien tongue takes no English epithet.
            if (!culture.sound && chance(rand, 0.3)) parts.byname = pickByname(culture, rand);
            break;
        case 'vietnamese':
            parts.family = fam();
            parts.middle = chance(rand, 0.6) ? (g === 'f' ? 'Thị' : 'Văn') : '';
            break;
        default:
            parts.family = fam();
            parts.prefix = prefixFor(culture, rand, g);
    }
    const composed = composePerson(convention, g, parts, { patronym: culture.patronym, patronymSuffix: culture.patronymSuffix, era: culture.era });
    return { ...composed, gender: g, parts };
}

function pickByname(culture, rand) {
    const st = stockOf(culture.root);
    const own = st?.bynames ?? [];
    return own.length && chance(rand, culture.real ? 1 : 0.6) ? realPick(rand, own) : pick(rand, EPITHETS);
}

// ---- places in the culture's tongue

const QUALITIES = ['black', 'white', 'red', 'green', 'old', 'new', 'high', 'holy', 'iron', 'wolf', 'oak', 'raven', 'bear', 'eagle', 'gold', 'silver', 'sun', 'moon', 'star', 'dragon', 'ash', 'birch', 'pine', 'stone', 'salt', 'thorn', 'falcon', 'lion', 'fox', 'deer', 'swan', 'rose'];
const FEATURE_WORDS = { forest: ['wood', 'forest'], mountain: ['mountain'], hills: ['hill'], river: ['river'], lake: ['lake'], marsh: ['marsh'], coast: ['bay', 'sea', 'point', 'head'], cave: ['stone', 'rock'], plain: ['field', 'valley', 'steppe'], island: ['island'], desert: ['field'], site: ['fort', 'stone', 'house'] };

const shift = (culture, rand, text) => (culture.real || !culture.mutation ? text : mutate(text, { level: Math.min(culture.mutation, 1), shifts: culture.shifts, rand }));

// Joins a start/ending onto a stem: "Aber" + "du", "Vod" + "mund",
// "San " + "Lorenzo", "Bab " + "al-Hadid".
const join = (a, b) => (a.endsWith(' ') || a.endsWith('-') || b.startsWith(' ') || b.startsWith('-') ? `${a}${b}` : `${a}${b.toLowerCase()}`);

function founderStem(culture, rand) {
    const n = namePart(culture, chance(rand, 0.7) ? 'm' : 'f', rand).split(' ')[0];
    // Drop a weak final vowel: Harold -> Harold, Alda -> Ald.
    return n.length > 4 && isVowel(n.at(-1)) ? n.slice(0, -1) : n;
}

// A settlement: { name, meaning }. prefer: a test on an ending's meaning
// (a fort's "castle", a region's "land").
function settlementName(culture, rand, { prefer = null } = {}) {
    if (culture.sound) return { name: soundName(culture.sound, rand, { min: 2, max: 3 }), meaning: '' };
    const st = stockForRoll(culture, rand);
    const { words, endings, starts } = st.places;
    const wordKeys = Object.keys(words);
    const preferred = prefer ? endings.filter(([, m]) => prefer.test(m)) : [];
    const ends = preferred.length && chance(rand, 0.75) ? preferred : endings;
    const methods = [
        ['word', wordKeys.length && ends.length ? 5 : 0],
        ['start', starts.length && wordKeys.length ? 2 : 0],
        ['founder', ends.length ? 2 : 0],
    ];
    const method = weighted(rand, methods, ([, w]) => w)?.[0];
    let name = '';
    let meaning = '';
    if (method === 'word') {
        const key = pick(rand, wordKeys);
        const [end, endMeaning] = pick(rand, ends);
        name = join(capitalize(words[key]), end);
        meaning = /\bof$/.test(endMeaning) ? `${endMeaning} ${key}` : `${key} ${endMeaning}`.trim();
    } else if (method === 'start') {
        const [start, startMeaning] = pick(rand, starts);
        if (/saint/i.test(startMeaning) || chance(rand, 0.3)) {
            const founder = namePart(culture, chance(rand, 0.6) ? 'm' : 'f', rand).split(' ')[0];
            name = `${start}${start.endsWith(' ') || start.endsWith('-') ? founder : founder.toLowerCase()}`;
            meaning = `${startMeaning} ${founder}`;
        } else {
            const key = pick(rand, wordKeys);
            name = join(start.endsWith(' ') || start.endsWith('-') ? start : capitalize(start), start.endsWith(' ') ? capitalize(words[key]) : words[key]);
            meaning = `${startMeaning} ${key}`;
        }
    } else if (method === 'founder') {
        const stem = founderStem(culture, rand);
        const [end, endMeaning] = pick(rand, ends);
        name = join(stem, end);
        meaning = `${stem}'s ${endMeaning}`.replace(/ of$/, '');
    } else {
        name = founderStem(culture, rand);
    }
    return { name: titleCase(shift(culture, rand, name).replace(/\s+/g, ' ').trim()), meaning };
}

function houseFromPlace(culture, rand) {
    return settlementName(culture, rand).name;
}

const REGION_ENDINGS = [['ia', 'land'], ['a', 'land'], ['and', 'land'], ['mark', 'march'], ['or', 'realm'], ['eth', 'realm']];
function regionName(culture, rand) {
    if (culture.sound) return { name: soundName(culture.sound, rand, { min: 2, max: 4 }), meaning: '' };
    if (chance(rand, 0.55)) {
        const s = settlementName(culture, rand, { prefer: /land|realm|country|kingdom|province|people/ });
        return s;
    }
    const stem = founderStem(culture, rand);
    const [end, m] = pick(rand, REGION_ENDINGS);
    return { name: titleCase(shift(culture, rand, isVowel(stem.at(-1)) && isVowel(end[0]) ? stem.slice(0, -1) + end : stem + end)), meaning: `${stem}'s ${m}` };
}

// A landscape feature in the culture's tongue: "Afon Du", "Schwarzwald".
function nativeFeature(culture, rand, feature) {
    if (culture.sound) return { name: soundName(culture.sound, rand), meaning: '' };
    const st = stockForRoll(culture, rand);
    const { words } = st.places;
    const headKey = (FEATURE_WORDS[feature] ?? ['wood']).find((k) => words[k]);
    const quals = QUALITIES.filter((q) => words[q] && q !== headKey);
    if (!headKey || !quals.length) return null;
    const q = pick(rand, quals);
    const head = shift(culture, rand, words[headKey]);
    const qual = shift(culture, rand, words[q]);
    const name = st.headFirst ? `${capitalize(head)} ${capitalize(qual)}` : st.compounding ? capitalize(`${qual}${head}`) : `${capitalize(qual)} ${capitalize(head)}`;
    return { name, meaning: `${q} ${headKey}` };
}

// ---- kits

const plural = (w) => (/(s|x|ch|sh)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

function fillKit(kitId, rand, { mood = {}, feature = 'forest', trade = '', venue = 'Club', purpose = '', person, place }) {
    const kit = KITS[kitId];
    const [pattern] = weighted(rand, kit.patterns, ([, w]) => w);
    const used = new Set();
    const from = (key) => {
        const list = POOLS[key];
        for (let i = 0; i < 6; i++) {
            const w = wordOf(weighted(rand, list, (raw) => wordWeight(raw, mood)));
            if (!used.has(w)) { used.add(w); return w; }
        }
        return wordOf(pick(rand, list));
    };
    const name = pattern.replace(/\{(\w+)\}/g, (_, key) => {
        switch (key) {
            case 'head': return pick(rand, headsFor(feature));
            case 'adj': return from(kitId === 'inn' || kitId === 'shop' ? 'adjInn' : 'adj');
            case 'thingP': return plural(from('thing'));
            case 'trade': return trade ? capitalize(trade) : from('trade');
            case 'given': return person('').split(' ')[0];
            case 'givenF': return person('f').split(' ')[0];
            case 'family': return person('', true);
            case 'place': return place();
            case 'venue': return venue;
            case 'purpose': return from(`purpose_${purpose}`);
            case 'digit': return String(1 + Math.floor(rand() * 9));
            case 'num2': return String(10 + Math.floor(rand() * 90));
            // A company's initials: "KTM Systems".
            case 'initials': return Array.from({ length: chance(rand, 0.6) ? 3 : 2 }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join('');
            default: return POOLS[key] ? from(key) : key;
        }
    });
    return { name: name.replace(/\s+/g, ' ').trim(), meaning: '', kit: kitId };
}

// What a venue is called on its sign: a nightclub is a Club.
const VENUE_WORDS = { nightclub: 'Club', offices: 'Offices', office: 'Offices', cafe: 'Café', theater: 'Theatre', parlour: 'Parlour', hq: 'Headquarters' };
const venueWord = (noun) => VENUE_WORDS[noun] ?? capitalize(noun || 'Club');
const HOSPITALITY = new Set(['restaurant', 'cafe', 'café', 'diner', 'hotel', 'motel', 'brothel', 'teahouse', 'bathhouse', 'lounge', 'club', 'nightclub']);

// ---- names built from an existing entry (section 4.1, step 3)

function demonym(name, culture) {
    const base = String(name).replace(/^the\s+/i, '').split(/\s+/).pop();
    const end = pick(makeRng(base), culture.adjective ?? ['ian']);
    return isVowel(base.at(-1)) && isVowel(end[0]) ? base.slice(0, -1) + end : base + end;
}

// A business's name: one ending in a corporate or trade word (Omicron
// Innovations, Halloran & Sons, the Ledger Bank).
const BUSINESS_TAIL = /\b(innovations|industries|holdings|group|corporation|corp|inc|incorporated|ltd|limited|llc|dynamics|systems|technologies|tech|labs|works|enterprises|international|global|solutions|partners|capital|consolidated|conglomerate|biologics|pharmaceuticals|logistics|robotics|cybernetics|aerospace|media|energy|mining|freight|bank|trading company|trading house|mercantile|& sons|brothers|and company|co)\.?$/i;
export const looksLikeBusiness = (name) => BUSINESS_TAIL.test(String(name ?? '').trim());
// The brand of a business's name, without its corporate tail: "Omicron".
const brandOf = (name) => String(name).replace(/^the\s+/i, '').replace(BUSINESS_TAIL, '').replace(/[\s,&]+$/, '').trim() || String(name);

export function derivedNames(tie, kindInfo, culture, rand) {
    const X = String(tie.name).replace(/^the\s+/i, '').trim();
    const last = X.split(/\s+/).pop();
    const adj = demonym(X, culture);
    const kind = kindInfo?.kind ?? '';
    const isPerson = tie.type === 'character' || tie.type === 'creature';
    const isPlace = tie.type === 'location';
    let list = [];
    if (kind === 'faction' || kind === 'house') {
        if (kind === 'house') list = isPerson ? [`House ${last}`, `The House of ${X}`, `The ${adj}`] : [`House ${X}`, `The Lords of ${X}`];
        else if (isPerson) list = [`Children of ${X}`, `${X}'s Hand`, `The ${adj}`, `The Sworn of ${X}`, `Disciples of ${X}`, `The Order of ${X}`, `Keepers of ${X}`, `${X}'s Chosen`];
        else if (isPlace) list = kindInfo.subtype === 'business'
            ? [`${X} ${wordOf(pick(rand, POOLS.sector))}`, `The ${X} ${wordOf(pick(rand, POOLS.tradeHouse))}`, `${X} ${wordOf(pick(rand, POOLS.corpSuffix))}`]
            : [`The ${X} ${pick(rand, ['Watch', 'Guard', 'Company', 'Council', 'League', 'Guild', 'Wardens'])}`, `The ${X} Free Company`, `The Lords of ${X}`, `The ${adj} League`];
        // A subsidiary or a division of a business keeps the parent's brand
        // and names its own trade: Omicron Innovations -> Omicron Biologics.
        else if (kindInfo.subtype === 'business' || looksLikeBusiness(X)) {
            const brand = brandOf(X);
            list = [`${brand} ${wordOf(pick(rand, POOLS.sector))}`, `${brand} ${wordOf(pick(rand, POOLS.sector))}`, `${brand} ${wordOf(pick(rand, POOLS.corpSuffix))}`, `${brand} Labs`];
        } else list = [`The True ${X}`, `${X} Reborn`, `The Last of ${X}`, `The ${adj} Remnant`];
    } else if (kind === 'ship') {
        list = isPlace ? [X, `Pride of ${X}`, `${X} Trader`, `Spirit of ${X}`] : [`${X}'s Pride`, `${X}'s Revenge`, `Spirit of ${X}`, `${X}'s Fortune`];
    } else if (kind === 'person') {
        return [];
    } else if (tie.type === 'faction') {
        // A group's own place: its headquarters, its hall, its club.
        const brand = brandOf(X);
        if (kind === 'district') list = [`${X} ${wordOf(pick(rand, POOLS.districtWord))}`, `The ${X} ${wordOf(pick(rand, POOLS.districtWord))}`];
        else if (kindInfo?.subtype === 'venue') list = [`${brand} ${venueWord(kindInfo.noun)}`, `The ${brand} ${venueWord(kindInfo.noun)}`];
        else {
            // The brief's own word first: "the Ledger Guild hall" is The Ledger Guild Hall.
            const own = kindInfo?.noun ? `The ${X} ${venueWord(kindInfo.noun)}` : '';
            list = [own, `${X} Headquarters`, `The ${X} Hall`, `${brand} House`, `${brand} Tower`].filter(Boolean);
        }
    } else if (isPerson) {
        list = kindInfo?.subtype === 'temple'
            ? [`Temple of ${X}`, `Shrine of ${X}`, `The House of ${X}`, `${X}'s Sanctum`]
            : kindInfo?.subtype === 'inn' ? [`The ${X}'s Head`, `The ${X} Arms`, `${X}'s Rest`]
                : [`${X}'s Rest`, `${X}'s Hall`, `${X}'s Hold`, `${X}'s Reach`, `The House of ${X}`, `Temple of ${X}`];
    } else if (isPlace) {
        // An inn takes the town's name without its "City": The Arcadia Arms.
        const town = X.replace(/\s+(?:city|town|village|township|borough)$/i, '') || X;
        list = kindInfo?.subtype === 'inn' ? [`The ${town} Arms`, `The ${town} ${wordOf(pick(rand, POOLS.beast))}`]
            : kind === 'feature' ? [`${X} ${pick(rand, headsFor(kindInfo.feature))}`, `The ${X} ${pick(rand, headsFor(kindInfo.feature))}`]
                // A new town near it may be New X; a district, a club or a base
                // inside a city has a name of its own.
                : kind === 'settlement' && !kindInfo.subtype ? [`New ${X}`, `${X}'s ${pick(rand, ['Landing', 'Crossing', 'Reach', 'End', 'Gate', 'Rest'])}`, `Upper ${X}`, `Lower ${X}`, `Little ${X}`]
                    : [];
    }
    return list;
}

// ---- the request

// What the generator does for a new thing. req: { typeId, brief, cultureId,
// gender, hasParent, placeText (its place's name and description, for the
// mood), father, family }. world: { naming, overview, names (every name and
// alias in the setting), entries ([{ name, aliases, type }], for ties),
// shared (folded names from other worlds) }.
// -> { mode: 'none' | 'given' | 'derived' | 'rolled', name, aliases,
//      meaning, candidates, tie, kind, culture: { id, label }, counter }
export function planName(req, world) {
    const naming = world.naming ?? {};
    const counter = naming.counter ?? 0;
    const given = nameInBrief(req.brief);
    if (given) return { mode: 'given', name: given, aliases: [], meaning: '', candidates: [], counter };
    let kindInfo = req.kindInfo ?? nameKindFor(req.typeId, req.brief, { hasParent: req.hasParent });
    const cultureId = req.cultureId || defaultCultureId(world.overview, naming);
    const culture = resolveCulture(cultureId, { naming, seed: naming.seed ?? 'world' }) ?? resolveCulture('preset:old_kingdom', { seed: naming.seed });
    const meta = { kind: kindInfo?.kind ?? '', culture: { id: culture.id, label: culture.label } };
    const rand = makeRng(naming.seed ?? 'world', 'name', counter, culture.id);
    const index = buildIndex({ names: world.names, registry: naming.registry, shared: world.shared, counter, real: culture.real, cliches: naming.cliches !== false, banned: [...(naming.banned ?? []), ...(culture.banned ?? [])] });

    // Tied to an existing entry the brief names: built from its name.
    const ties = req.typeId === 'character' ? [] : tiesInBrief(req.brief, world.entries ?? []);
    // ...if it comes from that entry (its followers, its temple). A rival or
    // an enemy gets a name of its own, sharing no word with the other's.
    const relation = ties.length ? tieRelation(req.brief, ties[0].matched) : '';
    // A group whose kind the brief leaves open takes its tie's: a rival of a
    // corporation is a business.
    if (kindInfo?.guessed && ties.length && looksLikeBusiness(ties[0].name)) kindInfo = { kind: 'faction', subtype: 'business' };
    // A secret base is never named for its owner: a cover name instead.
    if (relation === 'from' && kindInfo && !kindInfo.secret) {
        const candidates = [...new Set(derivedNames(ties[0], kindInfo, culture, rand))].filter((n) => n.length <= 48 && acceptable(n, index, { kit: true }));
        if (candidates.length) return { mode: 'derived', name: '', aliases: [], meaning: '', candidates: candidates.slice(0, 4), tie: ties[0].name, counter: counter + 1, ...meta };
    }
    const apart = relation === 'apart' ? ties[0].name : '';
    const apartWords = new Set(apart ? nameTokens(apart) : kindInfo?.secret && ties.length ? nameTokens(ties[0].name) : []);
    if (!kindInfo) return { mode: 'none', name: '', aliases: [], meaning: '', candidates: [], counter, apart, ...meta };

    const later = isLaterAge(world.overview);
    const mood = { ...moodOf(world.overview?.tone, `${req.brief ?? ''} ${req.placeText ?? ''}`), later };
    const person = (g, familyOnly = false) => {
        const p = personName(culture, rand, { gender: g });
        if (!p) return 'Anon';
        // A house or a shop sign wants a family name: one the tradition has,
        // else a place-made one (an Icelandic farm, an elven house).
        return familyOnly ? (p.parts.family || namePart(culture, 'family', rand) || houseFromPlace(culture, rand)) : p.name;
    };
    const place = () => settlementName(culture, rand).name;
    const style = (k) => culture.style[k] ?? 'native';
    const oneOf = (k) => (style(k) === 'both' ? (chance(rand, 0.5) ? 'native' : 'kit') : style(k));

    const roll = () => {
        switch (kindInfo.kind) {
            case 'person': return personName(culture, rand, { gender: req.gender || kindInfo.gender, father: req.father, family: req.family });
            case 'settlement':
                if (kindInfo.subtype === 'fort') return chance(rand, 0.3) ? { name: `Castle ${person('', true)}`, meaning: '' } : settlementName(culture, rand, { prefer: /fort|castle|stronghold|keep|tower|burg|walled/ });
                if (kindInfo.subtype === 'temple') return chance(rand, 0.5) ? { name: `The Temple of the ${wordOf(weighted(rand, POOLS.orderNoun, (r) => wordWeight(r, mood)))}`, meaning: '', kit: 'order' } : settlementName(culture, rand, { prefer: /holy|church|temple|shrine|sanctuary|monastery/ });
                return settlementName(culture, rand);
            case 'region': return regionName(culture, rand);
            case 'feature': {
                if (kindInfo.feature !== 'site' && oneOf('feature') === 'native') {
                    const n = nativeFeature(culture, rand, kindInfo.feature);
                    if (n) return n;
                }
                return fillKit('wilderness', rand, { mood, feature: kindInfo.feature, person, place });
            }
            case 'base':
                if (kindInfo.secret) return fillKit(later ? 'base_secret' : 'hideout', rand, { mood, person, place });
                return fillKit(later ? 'base_open' : 'hideout', rand, { mood, person, place });
            case 'district': return kindInfo.purpose ? fillKit('district_purpose', rand, { mood, purpose: kindInfo.purpose, person, place }) : fillKit('district', rand, { mood, person, place });
            case 'street': {
                // A real culture's own street patterns where its stock has them.
                const st = stockOf(culture.root);
                if (culture.real && st?.streets?.length && chance(rand, 0.6)) {
                    const words = Object.values(st.places.words);
                    return { name: pick(rand, st.streets).replace(/{word}/g, () => capitalize(pick(rand, words) ?? '')).replace(/{family}/g, () => person('', true)), meaning: '', kit: 'street' };
                }
                return fillKit('street', rand, { mood, person, place });
            }
            case 'building':
                // A club, a clinic, a hotel: its own words in a later age; an inn's
                // or a shop's before.
                if (kindInfo.subtype === 'venue') {
                    if (later && /club/.test(kindInfo.noun ?? '') && chance(rand, 0.3)) return { name: `Club ${wordOf(pick(rand, POOLS.callWord))}`, meaning: '', kit: 'venue' };
                    // A bar or a club has a sign; a hospital or an office has a name.
                    if (later) return fillKit(HOSPITALITY.has(kindInfo.noun) ? 'venue' : 'institution', rand, { mood, venue: venueWord(kindInfo.noun), person, place });
                    return HOSPITALITY.has(kindInfo.noun) ? fillKit('inn', rand, { mood, person, place }) : fillKit('shop', rand, { mood, trade: venueWord(kindInfo.noun), person, place });
                }
                if (oneOf('building') === 'native') return settlementName(culture, rand);
                return fillKit(kindInfo.subtype === 'shop' ? 'shop' : 'inn', rand, { mood, trade: kindInfo.noun && kindInfo.noun !== 'shop' && kindInfo.noun !== 'store' ? kindInfo.noun : '', person, place });
            case 'house': {
                const fam = person('', true);
                return { name: culture.root === 'scottish_gaelic' ? `Clan Mac${fam}` : `House ${fam}`, meaning: '' };
            }
            case 'faction':
                // A business: a corporation in a later age, a merchant house before.
                if (kindInfo.subtype === 'business') return fillKit(isLaterAge(world.overview) ? 'business_modern' : 'business_trade', rand, { mood, person, place });
                if (oneOf('faction') === 'native' && kindInfo.subtype === 'order') return { name: `The ${pick(rand, POOLS.orderHead).replace(/s$/, '')} of ${place()}`, meaning: '', kit: 'order' };
                return fillKit(kindInfo.subtype, rand, { mood, person, place });
            // An alias: a callsign from the kit (src/library/alias-kinds.js).
            case 'codename': return fillKit('codename', rand, { mood, person, place });
            case 'ship':
                if (kindInfo.subtype === 'native' || oneOf('ship') === 'native') return { name: person('f').split(' ')[0], meaning: '' };
                return fillKit(`ship_${kindInfo.subtype}`, rand, { mood, person, place });
            default: return null;
        }
    };

    const found = [];
    for (let i = 0; i < CANDIDATES * 4 && found.length < CANDIDATES; i++) {
        const r = roll();
        if (!r?.name || r.name.length > MAX_LEN + (r.kit ? 16 : 0)) continue;
        if (!acceptable(r.name, index, { kit: Boolean(r.kit) })) continue;
        if (apartWords.size && nameTokens(r.name).some((t) => apartWords.has(t))) continue;
        if (found.some((f) => f.name === r.name)) continue;
        found.push(r);
    }
    if (!found.length) return { mode: 'none', name: '', aliases: [], meaning: '', candidates: [], counter: counter + 1, apart, ...meta };
    // The best spread: the candidate whose pieces have been used least.
    let best = found[0];
    let bestScore = Infinity;
    for (const f of found) {
        const sc = spreadScore(f.name, index);
        if (sc < bestScore) { best = f; bestScore = sc; }
    }
    return { mode: 'rolled', name: best.name, aliases: best.aliases ?? [], meaning: best.meaning ?? '', gender: best.gender ?? '', candidates: [], counter: counter + 1, apart, ...meta };
}

// A few names for any other person or place a text may mention ("her
// brother", "the village she fled"): { people, places }.
export function namePool(world, { cultureId = '', people = 3, places = 2 } = {}) {
    const naming = world.naming ?? {};
    let counter = naming.counter ?? 0;
    const out = { people: [], places: [] };
    const extra = [];
    const take = (typeId, brief) => {
        const r = planName({ typeId, brief, cultureId }, { ...world, names: [...(world.names ?? []), ...extra], naming: { ...naming, counter } });
        counter = r.counter;
        if (r.mode === 'rolled') { extra.push(r.name); return r.name; }
        return '';
    };
    for (let i = 0; i < people; i++) { const n = take('character', i % 2 ? 'a woman' : 'a man'); if (n) out.people.push(n); }
    for (let i = 0; i < places; i++) { const n = take('location', i % 2 ? 'a village' : 'a town'); if (n) out.places.push(n); }
    return { ...out, counter };
}
