// The name stocks: real-world names, by language, that cultures grow from
// (docs/DESIGN - NAMING.md, section 3.1). Pure data and lookups.
//
// A stock as written (north.js, west.js, ...):
//   id, label, detect      words in a premise that point to it ("reykjavik")
//   era                    the period its base lists are from
//   convention             how a full name is put together (src/naming/conventions.js)
//   patronym               { m, f } templates for 'patronym' ("{father}sson")
//   adjective              endings that make a demonym ("-i": Morvathi)
//   given: { m, f }        given names, space-separated, most common first
//   family                 family names, most common first ('' = none)
//   oldFamily              older family-name forms (farm, house and place names)
//   prefixes               [[particle, percent]] ("van", 22)
//   femalePrefixes         { Ó: 'Ní' }
//   bynames                epithets
//   eras: { era: { given, family } }   other periods' lists
//   places: { words: { meaning: word }, endings: [[ending, meaning]],
//             starts: [[start, meaning]] }
//   streets, businesses    real-world templates (a real culture's local names)
// An underscore in a list is a space ("Le_Gall").

import north from './north.js';
import west from './west.js';
import southEast from './south-east.js';
import nearEast from './near-east.js';
import asia from './asia.js';
import south from './south.js';

const RAW = [...north, ...west, ...southEast, ...nearEast, ...asia, ...south];

// Languages that put the head of a place name first ("Afon Ddu", "Bab
// al-Hadid"), so a feature reads "<river> <black>" and is written apart.
const HEAD_FIRST = new Set(['welsh', 'scottish_gaelic', 'irish', 'breton', 'latin', 'italian', 'spanish', 'mexican_spanish', 'portuguese', 'brazilian_portuguese', 'french', 'quebecois', 'arabic', 'hebrew', 'persian', 'swahili', 'yoruba', 'igbo', 'hausa', 'vietnamese', 'thai', 'filipino', 'hawaiian', 'maori', 'byzantine_greek']);
// Languages whose compounds are written as one word ("Schwarzwald").
const COMPOUNDING = new Set(['finnish', 'icelandic', 'old_norse', 'norwegian', 'swedish', 'danish', 'old_english', 'english', 'german', 'dutch', 'hungarian', 'turkish', 'mongolian', 'japanese', 'korean', 'mandarin', 'sanskrit', 'nahuatl', 'quechua', 'basque', 'ancient_greek', 'russian', 'ukrainian', 'polish', 'akkadian', 'ancient_egyptian', 'tamil', 'hindi', 'american']);

const words = (text) => String(text ?? '').split(/\s+/).filter(Boolean).map((w) => w.replace(/_/g, ' '));

function lists(src) {
    return {
        m: words(src?.given?.m),
        f: words(src?.given?.f),
        family: src?.family === undefined ? null : words(src.family),
    };
}

function normalize(raw) {
    const base = lists(raw);
    const eras = { [raw.era]: base };
    for (const [era, over] of Object.entries(raw.eras ?? {})) {
        const l = lists(over);
        eras[era] = {
            m: l.m.length ? l.m : base.m,
            f: l.f.length ? l.f : base.f,
            // An era's own family list; '' means that era had none.
            family: l.family ?? (raw.oldFamily ? words(raw.oldFamily) : base.family),
        };
    }
    return Object.freeze({
        id: raw.id,
        label: raw.label,
        detect: raw.detect ?? [],
        era: raw.era,
        eraNames: Object.keys(eras),
        eras,
        oldFamily: words(raw.oldFamily),
        convention: raw.convention ?? 'western',
        patronym: raw.patronym ?? null,
        patronymSuffix: raw.patronymSuffix ?? null,
        adjective: raw.adjective ?? ['ian'],
        prefixes: raw.prefixes ?? [],
        femalePrefixes: raw.femalePrefixes ?? {},
        // Whether a real-world name takes a random particle (Portuguese 'da',
        // Gaelic 'Mac'); elsewhere the stock writes it on the names that have it.
        realPrefixes: raw.realPrefixes === true,
        bynames: words(raw.bynames),
        roman: raw.roman ? { praenomina: words(raw.roman.praenomina) } : null,
        places: {
            words: raw.places?.words ?? {},
            endings: raw.places?.endings ?? [],
            starts: raw.places?.starts ?? [],
        },
        headFirst: HEAD_FIRST.has(raw.id),
        compounding: COMPOUNDING.has(raw.id),
        streets: raw.streets ?? [],
        businesses: raw.businesses ?? [],
    });
}

export const STOCKS = Object.freeze(Object.fromEntries(RAW.map((r) => [r.id, normalize(r)])));
export const STOCK_IDS = Object.freeze(Object.keys(STOCKS));

export const stockOf = (id) => STOCKS[id] ?? null;

// A stock's lists for an era: its own era's, or the base lists. 'old' asks
// for the older family-name forms where the stock keeps them.
export function listsFor(stock, era = '') {
    const l = stock.eras[era] ?? stock.eras[stock.era];
    if (era === 'old' && stock.oldFamily.length) return { ...l, family: stock.oldFamily };
    return l;
}

// The real-world cultures: every stock in each of its periods.
const ERA_LABELS = { modern: 'modern', medieval: 'medieval', classical: 'classical', ancient: 'ancient', victorian: 'Victorian', '1920s': '1920s', premodern: 'pre-modern', ottoman: 'Ottoman', imperial: 'imperial' };
export const REAL_CULTURES = Object.freeze(Object.values(STOCKS).flatMap((s) => s.eraNames.map((era) => ({
    id: `real:${s.id}:${era}`,
    stock: s.id,
    era,
    label: `${s.label} (${ERA_LABELS[era] ?? era})`,
}))));
