// The choices offered on a setting's front page (spec SB-139a/b world
// definition): world type, era, tone, themes - and magic and technology,
// each described on its own terms rather than as one "capability level".
// Suggested defaults, not a closed schema (OPEN-15): every list also takes
// the user's own values. Pure (no SillyTavern imports).
//
// Magic:  which kinds exist, which kinds do NOT exist (a hard limit the
//         model must respect - a world of divine magic with no arcane
//         magic at all), the rules that restrict it (ritual required,
//         social limits...), how widespread it is, how strong it can get, and
//         the user's own prose for anything the choices can't say.
// Technology: its level (suggested from the era), its flavour (steampunk,
//         salvaged...), how it is spread and understood (home-grown, or
//         adopted from outside and poorly understood), what does not exist,
//         and prose.

export const WORLD_TYPES = Object.freeze([
    ['fantasy', 'Fantasy'], ['science_fiction', 'Science fiction'], ['modern', 'Modern'], ['historical', 'Historical'],
    ['post_apocalyptic', 'Post-apocalyptic'], ['urban_fantasy', 'Urban fantasy'], ['cosmic_horror', 'Cosmic horror'], ['multiverse', 'Multiverse'],
]);

// Multi-select (OPEN-15: decided yes for tone).
export const TONES = Object.freeze([
    'serious', 'whimsical', 'gritty', 'romantic', 'dark', 'heroic', 'comedic',
    'melancholy', 'hopeful', 'mysterious', 'bleak', 'epic', 'cozy', 'tense', 'satirical', 'dreamlike', 'brutal', 'noir',
]);

export const THEMES = Object.freeze([
    'power and corruption', 'redemption', 'survival', 'identity', 'love and loss', 'revenge', 'faith and doubt', 'freedom',
    'family', 'betrayal', 'ambition', 'coming of age', 'war and its cost', 'the unknown', 'debt and obligation',
    'tradition vs change', 'class and inequality', 'nature vs civilisation', 'memory', 'forbidden knowledge', 'found family', 'sacrifice',
]);

// Eras, grouped by the world type they suit best (all are offered; the
// chosen world type's group comes first).
export const ERAS = Object.freeze({
    fantasy: ['age of myth', 'ancient empires', 'early medieval', 'high medieval', 'late medieval', 'renaissance', 'age of sail', 'gunpowder and sorcery', 'industrial magic', 'twilight of an age'],
    science_fiction: ['near future', 'first colonies', 'interstellar age', 'galactic empire', 'post-singularity', 'generation ship', 'far future decline'],
    modern: ['present day', '1920s', '1950s', '1970s', '1980s', '1990s', 'early 2000s'],
    historical: ['bronze age', 'classical antiquity', 'viking age', 'feudal japan', 'crusades', 'age of exploration', 'victorian', 'wild west', 'world war era'],
    post_apocalyptic: ['days after the fall', 'a generation after', 'centuries after', 'rebuilding'],
    urban_fantasy: ['present day', 'a hidden age', 'gaslight', 'near future'],
    cosmic_horror: ['1920s', 'victorian', 'present day', 'timeless'],
    multiverse: ['all eras at once', 'shifting'],
});

// ---- magic

export const MAGIC_KINDS = Object.freeze([
    'divine', 'arcane', 'nature / druidic', 'elemental', 'spirit / shamanic', 'psionic', 'blood', 'necromancy',
    'runes and glyphs', 'alchemy', 'innate / bloodline', 'pacts with powers', 'fae / glamour', 'wild / chaotic', 'ritual', 'artifice / enchanting',
]);

export const MAGIC_PRESENCE = Object.freeze([
    ['none', 'None - there is no magic'],
    ['lost', 'Lost or legendary - only in old stories'],
    ['rare', 'Rare - a handful of practitioners'],
    ['uncommon', 'Uncommon - known, but few can use it'],
    ['common', 'Common - many people use some'],
    ['everywhere', 'Everywhere - woven into daily life'],
]);

export const MAGIC_POWER = Object.freeze([
    ['tricks', 'Parlor tricks'],
    ['modest', 'Modest - useful, not decisive'],
    ['formidable', 'Formidable - can turn a battle'],
    ['mighty', 'Mighty - reshapes cities and armies'],
    ['worldbreaking', 'World-breaking'],
]);

// Rules that limit magic in a world (after the "restrictions on magic"
// idea in GURPS Magic, in our own words). Any number may apply; the user
// can add their own. [label, what it means] - the meaning goes to the model.
export const MAGIC_RESTRICTIONS = Object.freeze([
    ['Low mana', "the world's magical energy is thin: spells are weaker, harder and more tiring"],
    ['Dead zones', 'there are places where magic simply does not work'],
    ['Rare talent', 'very few people are born able to use magic at all'],
    ['Ceremony required', 'spells are slow, loud and obvious to everyone nearby; magic items are precious and rare'],
    ['Ritual required', 'no spell can be cast without a ritual and focused concentration - never instantly or casually'],
    ['Power ceiling', 'only lesser magic can be learned; the great spells are lost, forbidden or impossible'],
    ['Social limits', 'only a privileged group (such as the nobility or a priesthood) may learn magic'],
    ['Outlawed', 'practising magic is a crime; those who can, hide it'],
    ['Costly', 'magic takes a real price from the caster - health, years, sanity or memories'],
    ['Material components', 'spells need rare or expensive ingredients and foci'],
    ['Bound to a source', "magic works only near its source - holy ground, ley lines - or by a patron's favour"],
    ['Backlash', 'failed or overused magic turns on the caster or the surroundings'],
    ['Years of study', 'learning even simple magic takes long, disciplined study'],
]);

// ---- technology

// Tech levels on a GURPS-style scale, TL0 to TL15, with TL8 added for the
// information age (internet, AI) and the later levels moved up one.
// [id, label, what defines it] - the examples go to the model too, so it
// knows what belongs at the level and what is anachronistic.
export const TECH_LEVELS = Object.freeze([
    ['tl0', 'TL0 - Stone Age', 'fire, the lever, language'],
    ['tl1', 'TL1 - Bronze Age', 'the wheel, writing, agriculture'],
    ['tl2', 'TL2 - Iron Age', 'iron tools, the keystone arch'],
    ['tl3', 'TL3 - Medieval', 'steel weapons, mathematics with zero'],
    ['tl4', 'TL4 - Renaissance / Colonial', 'gunpowder, printing, ocean-going ships'],
    ['tl5', 'TL5 - Industrial Revolution', 'mass production, steam power, the telegraph'],
    ['tl6', 'TL6 - World Wars', 'cars, airplanes, radio'],
    ['tl7', 'TL7 - Nuclear / Computer Age', 'nuclear energy, computers, lasers, rockets'],
    ['tl8', 'TL8 - Information Age', 'the internet, artificial intelligence, drones'],
    ['tl9', 'TL9 - Spacefaring', 'slower-than-light space travel, artificial general intelligence, fusion power, implants'],
    ['tl10', 'TL10 - Starfaring', 'faster-than-light star travel, longevity treatments'],
    ['tl11', 'TL11 - Antimatter', 'antimatter power, artificial gravity, slow FTL radio'],
    ['tl12', 'TL12 - Force', 'force screens, tractor beams, fast FTL radio'],
    ['tl13', 'TL13 - Gravitic', 'contragravity, gravity compensators, personal force screens'],
    ['tl14', 'TL14 - Worldbuilding', 'full terraforming of planets'],
    ['tl15', 'TL15 - Ultra', 'science can make wishes come true'],
]);

// Levels from before the TL scale, as TLs.
const OLD_TECH_LEVELS = Object.freeze({
    stone: 'tl0', bronze: 'tl1', classical: 'tl2', medieval: 'tl3', renaissance: 'tl4', gunpowder: 'tl4', industrial: 'tl5',
    electric: 'tl6', modern: 'tl7', information: 'tl8', near_future: 'tl9', spacefaring: 'tl9', interstellar: 'tl10', transcendent: 'tl15',
});

export const TECH_FLAVORS = Object.freeze([
    'steampunk', 'clockwork', 'dieselpunk', 'atompunk / retro-future', 'cyberpunk', 'biotech', 'solarpunk',
    'magitech', 'salvaged / scavenged', 'alien-derived', 'ancient precursor tech', 'gaslight',
]);

// Suggestions for "does not exist" (any text is allowed).
export const TECH_ABSENT_SUGGESTIONS = Object.freeze([
    'gunpowder', 'firearms', 'printing press', 'steam power', 'electricity', 'radio', 'computers', 'flight', 'spaceflight', 'artificial intelligence', 'faster-than-light travel',
]);

export const TECH_SPREAD = Object.freeze([
    ['native', 'Home-grown and understood'],
    ['uneven', 'Uneven - cities far ahead of the countryside'],
    ['elite', 'Held by an elite or a guild'],
    ['imported', 'Adopted from outside - used, not understood'],
    ['relic', 'Relics of a lost age - nobody can make more'],
    ['forbidden', 'Feared or forbidden'],
]);

// The technology an era suggests (a suggestion: the user can choose any).
export const ERA_TECH = Object.freeze({
    'age of myth': 'tl1', 'ancient empires': 'tl2', 'early medieval': 'tl3', 'high medieval': 'tl3', 'late medieval': 'tl3',
    renaissance: 'tl4', 'age of sail': 'tl4', 'gunpowder and sorcery': 'tl4', 'industrial magic': 'tl5', 'twilight of an age': 'tl3',
    'near future': 'tl9', 'first colonies': 'tl9', 'interstellar age': 'tl10', 'galactic empire': 'tl11', 'post-singularity': 'tl12',
    'generation ship': 'tl9', 'far future decline': 'tl10',
    'present day': 'tl8', '1920s': 'tl6', '1950s': 'tl7', '1970s': 'tl7', '1980s': 'tl7', '1990s': 'tl7', 'early 2000s': 'tl8',
    'bronze age': 'tl1', 'classical antiquity': 'tl2', 'viking age': 'tl3', 'feudal japan': 'tl3', crusades: 'tl3',
    'age of exploration': 'tl4', victorian: 'tl5', 'wild west': 'tl5', 'world war era': 'tl6',
    'days after the fall': 'tl8', 'a generation after': 'tl5', 'centuries after': 'tl3', rebuilding: 'tl5',
    'a hidden age': 'tl8', gaslight: 'tl5', timeless: '',
});

export function emptyMagic() {
    return { presence: '', power: '', kinds: [], absent: [], restrictions: [], notes: '' };
}

export function emptyTech() {
    return { level: '', levelFromEra: false, flavors: [], spread: '', absent: [], notes: '' };
}

const str = (v) => (typeof v === 'string' ? v : '');
const strList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))] : []);
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeMagic(value, legacyLevel = '') {
    const m = isObject(value) ? value : {};
    const out = { presence: str(m.presence), power: str(m.power), kinds: strList(m.kinds), absent: strList(m.absent), restrictions: strList(m.restrictions), notes: str(m.notes) };
    // The old single "magic/technology level" (before magic and technology
    // were described separately) becomes a rough presence and power.
    if (!isObject(value) && legacyLevel) {
        const map = { none: ['none', ''], low: ['rare', 'modest'], medium: ['uncommon', 'formidable'], high: ['common', 'mighty'], cosmic: ['common', 'worldbreaking'] };
        [out.presence, out.power] = map[legacyLevel] ?? ['', ''];
    }
    return out;
}

export function normalizeTech(value) {
    const t = isObject(value) ? value : {};
    const level = OLD_TECH_LEVELS[str(t.level)] ?? str(t.level);
    return { level, levelFromEra: t.levelFromEra === true, flavors: strList(t.flavors), spread: str(t.spread), absent: strList(t.absent), notes: str(t.notes) };
}

export const splitList = (text) => String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export const joinList = (list) => [...new Set(list.map((s) => String(s).trim()).filter(Boolean))].join(', ');

const labelIn = (list, id) => list.find(([k]) => k === id)?.[1] ?? id;
const short = (label) => String(label).split(' - ')[0];

// The era groups in the order to show them: the world type's first.
export function eraGroups(worldType) {
    const keys = Object.keys(ERAS);
    const first = keys.includes(worldType) ? [worldType] : [];
    return [...first, ...keys.filter((k) => k !== worldType)].map((k) => ({
        key: k,
        label: WORLD_TYPES.find(([id]) => id === k)?.[1] ?? k,
        eras: ERAS[k],
    }));
}

// The technology level an era suggests, or ''.
export function techForEra(era) {
    return ERA_TECH[String(era ?? '').trim().toLowerCase()] ?? '';
}

// A setting's magic as prose for the model. -> { lines: [string], limits: [string] }
// `limits` are hard rules: what must never appear.
export function describeMagic(magic) {
    const m = normalizeMagic(magic);
    const lines = [];
    const limits = [];
    if (m.presence === 'none') {
        limits.push('There is NO magic of any kind in this world. Never introduce, imply or describe magic or the supernatural as real.');
    } else {
        const bits = [];
        if (m.kinds.length) bits.push(`kinds that exist: ${m.kinds.join(', ')}`);
        if (m.presence) bits.push(`how widespread: ${short(labelIn(MAGIC_PRESENCE, m.presence)).toLowerCase()}`);
        if (m.power) bits.push(`how strong it gets: ${short(labelIn(MAGIC_POWER, m.power)).toLowerCase()}`);
        if (bits.length) lines.push(`Magic - ${bits.join('; ')}.`);
        if (m.kinds.length) limits.push(`The only magic that exists is: ${m.kinds.join(', ')}. Do not introduce any other kind.`);
        if (m.restrictions.length) {
            const rules = m.restrictions.map((r) => {
                const known = MAGIC_RESTRICTIONS.find(([label]) => label.toLowerCase() === r.toLowerCase());
                return known ? `${known[0].toLowerCase()} (${known[1]})` : r;
            });
            limits.push(`Magic obeys these rules - never show it ignoring them: ${rules.join('; ')}.`);
        }
    }
    if (m.absent.length) limits.push(`These kinds of magic do NOT exist in this world: ${m.absent.join(', ')}. Never mention, imply or introduce them - not even as rumour or legend.`);
    if (m.notes.trim()) lines.push(`How magic works: ${m.notes.trim()}`);
    return { lines, limits };
}

// A setting's technology as prose for the model. -> { lines, limits }
export function describeTech(tech) {
    const t = normalizeTech(tech);
    const lines = [];
    const limits = [];
    const bits = [];
    const tl = TECH_LEVELS.find(([id]) => id === t.level);
    if (t.level) bits.push(`level: ${tl ? `${tl[1].replace(' - ', ' ')} (${tl[2]})` : t.level}`);
    if (t.flavors.length) bits.push(`flavour: ${t.flavors.join(', ')}`);
    if (t.spread) bits.push(`spread: ${labelIn(TECH_SPREAD, t.spread).toLowerCase()}`);
    if (bits.length) lines.push(`Technology - ${bits.join('; ')}.`);
    if (t.level) limits.push(`Technology stays at ${tl ? tl[1].replace(' - ', ' ') : t.level}: nothing from a later tech level${t.spread === 'imported' || t.spread === 'relic' ? ' beyond the imported or relic technology described' : ''}.`);
    if (t.absent.length) limits.push(`These technologies do NOT exist in this world: ${t.absent.join(', ')}. Never mention or introduce them.`);
    if (t.notes.trim()) lines.push(`How technology works: ${t.notes.trim()}`);
    return { lines, limits };
}

// A random pick for the dice buttons, constrained by what is already set.
// Fields: worldType, era, tone, themes, magic.presence, magic.power,
// magic.kinds, tech.level, tech.flavors, tech.spread. `random` is
// injectable for tests.
export function randomFor(field, overview = {}, random = Math.random) {
    const pick = (list) => list[Math.floor(random() * list.length)];
    const pickSome = (list, n) => {
        const pool = [...list];
        const out = [];
        while (out.length < n && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
        return out;
    };
    const world = overview.worldType;
    const mundane = world === 'historical' || world === 'modern';
    switch (field) {
        case 'worldType': return pick(WORLD_TYPES)[0];
        case 'tone': return joinList(pickSome(TONES, 2));
        case 'themes': return joinList(pickSome(THEMES, 2));
        case 'era': return pick(ERAS[world] ?? Object.values(ERAS).flat());
        case 'magic.presence': return pick(mundane ? ['none', 'lost'] : world === 'science_fiction' ? ['none', 'lost', 'rare'] : MAGIC_PRESENCE.map(([id]) => id).filter((id) => id !== 'none'));
        case 'magic.power': return pick(MAGIC_POWER.map(([id]) => id));
        case 'magic.restrictions': return pickSome(MAGIC_RESTRICTIONS.map(([label]) => label), 1 + Math.floor(random() * 2));
        case 'magic.kinds': {
            const absent = new Set(overview.magic?.absent ?? []);
            return pickSome(MAGIC_KINDS.filter((k) => !absent.has(k)), 1 + Math.floor(random() * 2));
        }
        case 'tech.level': return techForEra(overview.era) || pick(TECH_LEVELS)[0];
        case 'tech.flavors': return random() < 0.5 ? [] : pickSome(TECH_FLAVORS, 1);
        case 'tech.spread': return pick(TECH_SPREAD)[0];
        default: return '';
    }
}
