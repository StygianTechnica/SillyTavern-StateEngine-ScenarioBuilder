// Names in live play (docs/DESIGN - NAMING.md, section 4.2, phase 4): the
// director, the planner, events and missions are handed a short pool of
// rolled names for the culture where the story is, and a new person or
// place the model names with a made-up word of its own - an Elara, a
// Skarnhold - that is not from the pool, the chat or the notes, and not
// built from a name the world has, is given the next pool name instead.
// Plain-English names ("The Eyepatched Man", "The Rusty Anchor", "Ashfall")
// and names the story already uses are the model's and stay. Factions,
// lore, events and quests are never swapped. Pure; the runner is run.js.

import { fold, nameTokens, tooClose } from './text.js';
import { POOLS, HEAD_KINDS, headsFor, wordOf } from './kits.js';
import { KIND_WORDS, genderFrom } from './classify.js';
import { CLICHE_NAMES } from './registry.js';

const CLICHES = new Set(CLICHE_NAMES.map(fold));

// How many of each a pool keeps on hand.
export const POOL_SIZE = Object.freeze({ men: 2, women: 2, places: 2 });

export const emptyPool = () => ({ men: [], women: [], places: [] });

export function normalizePool(value) {
    const p = value && typeof value === 'object' ? value : {};
    const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 6) : []);
    return { men: list(p.men), women: list(p.women), places: list(p.places) };
}

// Plain words that turn up in names - with the kit words and the kinds
// classify.js knows, enough to tell "Ashfall" (English) from "Skarnhold".
const PLAIN = `a an the of and on in at by to under over upon by-the old new great little big high low upper lower north south east
west northern southern eastern western far near first last one two three four five six seven nine ten hundred thousand
saint st holy mount mt port fort lake cape point bay end gate gates hill hills wood woods field fields stone stones rock water
waters well wells bridge brook ford ash ashes fall falls rest watch hold haven home stead ton ham wick thorpe burg bury borough
dale vale glen moor heath marsh fen shore coast sea sky star stars sun moon dawn dusk night day light dark shadow shade storm
wind rain snow frost ice fire flame ember smoke iron steel gold golden silver copper bronze brass glass salt sand dust bone blood
red black white grey gray green blue amber crimson scarlet raven crow wolf bear stag fox hawk eagle owl lion dragon serpent rose
thorn oak pine elm willow yew birch hollow deep long broad tall twin lone lost quiet silent whispering broken burning frozen sunken
crown king queen lord lady prince knight man men woman women boy girl son daughter father mother brother sister widow priest
mister miss mrs mr dr doctor captain sergeant officer agent detective professor chief boss
market street road lane way square row alley yard yards mill mills forge works house hall tower keep castle temple church chapel
inn tavern bar club cafe diner hotel motel arcade casino shop store lab clinic station terminal tower block plaza mall
neon chrome circuit grid data net code byte wire pulse static signal zero null void prime nova core hub node sector zone
district quarter ward heights flats docks commons strip mile line loop ring spire spires stack stacks undercity`.split(/\s+/);

const VOCAB = (() => {
    const out = new Set(PLAIN);
    const add = (w) => { for (const t of String(w).toLowerCase().split(/[\s'-]+/)) if (t) { out.add(t); out.add(t.replace(/s$/, '')); } };
    for (const list of Object.values(POOLS)) for (const raw of list) add(wordOf(raw));
    for (const kind of HEAD_KINDS) for (const raw of headsFor(kind)) add(wordOf(raw));
    for (const w of KIND_WORDS) add(w);
    return out;
})();

// Titles kept in front of a swapped name ("Captain Kael" is Captain Vodri).
const TITLES = new Set(['sir', 'dame', 'lord', 'lady', 'king', 'queen', 'prince', 'princess', 'captain', 'father', 'mother', 'brother',
    'sister', 'master', 'mistress', 'elder', 'doctor', 'dr', 'professor', 'agent', 'detective', 'officer', 'sergeant', 'commander',
    'general', 'admiral', 'high', 'seer', 'priest', 'priestess', 'old', 'young', 'mr', 'mrs', 'ms', 'miss', 'mister', 'madam', 'baron',
    'baroness', 'count', 'countess', 'duke', 'duchess', 'chief', 'boss', 'saint']);

const strip = (w) => fold(String(w ?? '').replace(/['’]s$/i, ''));

// Whether a word is plain English: in the vocabulary, a plural of one, or
// two of them run together ("Ashfall", "Stonewatch").
export function plainWord(word) {
    const w = strip(word);
    if (!w || w.length < 2 || /\d/.test(w)) return true;
    if (VOCAB.has(w) || VOCAB.has(w.replace(/(?:es|s)$/, ''))) return true;
    for (let i = 3; i <= w.length - 3; i++) if (VOCAB.has(w.slice(0, i)) && (VOCAB.has(w.slice(i)) || VOCAB.has(w.slice(i).replace(/s$/, '')))) return true;
    return false;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordIn = (word, text) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text);

// A new person's or place's name that the model made up: the words that
// would be swapped (titles kept apart), or null when it stays.
// allowedText: the chat and every note the model was shown (a name in it
// is the story's); known: the world's names; pool: names handed out.
export function inventedName(name, kind, { allowedText = '', known = [], pool = emptyPool() } = {}) {
    const n = String(name ?? '').replace(/\s+/g, ' ').trim();
    if (!n || !['character', 'location'].includes(kind)) return null;
    // A descriptive name ("The Eyepatched Man", "the old mill") is plain.
    if (/^(the|a|an)\s/i.test(n) || /\b(of|the|and)\b/i.test(n.split(' ').slice(1).join(' '))) return null;
    const words = n.split(' ');
    let lead = 0;
    if (kind === 'character') while (lead < words.length - 1 && TITLES.has(strip(words[lead]))) lead++;
    const rest = words.slice(lead);
    if (!rest.length || rest.length > (kind === 'character' ? 3 : 2)) return null;
    if (rest.some((w) => !/^\p{Lu}/u.test(w))) return null;
    // A group or a place taken for a person ("the Vaskari Syndicate" as a client).
    if (kind === 'character' && rest.some((w) => KIND_WORDS.has(strip(w)))) return null;
    // A place named in plain words, even in part ("Varyn Keep"), is the model's.
    // An overused name (Elara, Stormhold) goes whatever it is made of.
    const cliche = rest.some((w) => CLICHES.has(strip(w))) || CLICHES.has(fold(rest.join(' ')));
    if (!cliche && (kind === 'location' ? rest.some(plainWord) : rest.every(plainWord))) return null;
    const pooled = [...pool.men, ...pool.women, ...pool.places];
    if (pooled.some((p) => fold(p) === fold(rest.join(' ')) || rest.some((w) => nameTokens(p).includes(strip(w))))) return null;
    // In the story already, whole or in part.
    if (wordIn(rest.join(' '), allowedText) || rest.some((w) => strip(w).length >= 3 && wordIn(w, allowedText))) return null;
    // Built from an existing name (Kaelen from Kael, Vaskar from the Vaskari).
    const knownTokens = known.flatMap((k) => nameTokens(k)).filter((t) => t.length >= 4);
    if (rest.some((w) => knownTokens.some((t) => tooClose(strip(w), t) || strip(w).startsWith(t) || t.startsWith(strip(w))))) return null;
    return { title: words.slice(0, lead).join(' '), words: rest };
}

// The next pool name for a new thing: a woman's for someone the
// description makes a woman, a man's for a man, either otherwise.
function takeFrom(pool, kind, description) {
    if (kind === 'location') return pool.places.shift() ?? '';
    const g = genderFrom(description);
    const first = g === 'f' ? pool.women : pool.men;
    const second = g === 'f' ? pool.men : pool.women;
    if (g) return first.shift() ?? '';
    return (first.length >= second.length ? first : second).shift() ?? second.shift() ?? '';
}

// created: [{ kind, name, description, ... }] (NEW lines, entrants...).
// opts: { allowedText, known, rollPlace: (thing) -> a name for a place,
// rolled for its description, or '' }.
// -> { created (renamed), swaps: [{ from, to, kind }], used: [pool names
// taken, by the model or by a swap], pool (what is left) }.
export function swapInvented(created, pool, opts = {}) {
    const left = normalizePool(pool);
    const swaps = [];
    const used = [];
    const allPooled = [...left.men, ...left.women, ...left.places];
    const out = (created ?? []).map((c) => {
        // The model took a pool name: it is used.
        const taken = allPooled.find((p) => fold(p) === fold(c?.name) || fold(String(c?.name ?? '')).endsWith(` ${fold(p)}`));
        if (taken) {
            used.push(taken);
            for (const k of ['men', 'women', 'places']) left[k] = left[k].filter((x) => x !== taken);
            return c;
        }
        if (c?.unnamed || c?.provisional) return c;
        const inv = inventedName(c?.name, c?.kind, { ...opts, pool: left });
        if (!inv) return c;
        // A place is better named for what it is (a club, a ruin) when the
        // caller can roll one; the pool's towns otherwise.
        const rolled = c.kind === 'location' && opts.rollPlace ? String(opts.rollPlace(c) ?? '') : '';
        const next = rolled || takeFrom(left, c.kind, c.description);
        if (!next) return c;
        const to = [inv.title, next].filter(Boolean).join(' ');
        swaps.push({ from: c.name, to, kind: c.kind, words: inv.words, next });
        if (!rolled) used.push(next);
        return { ...c, name: to, swappedFrom: c.name };
    });
    return { created: out, swaps, used, pool: left };
}

// A text with the swapped names changed to match: the whole name, then
// each made-up word alone ("Kael Varyn ... Kael" -> "Hessa Tarn ... Hessa";
// "Varyn" -> "Tarn" when the new name has as many words).
export function applySwaps(text, swaps) {
    let t = String(text ?? '');
    if (!t || !swaps?.length) return t;
    const replace = (from, to) => {
        if (!from || !to || fold(from) === fold(to)) return;
        t = t.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(from)}(?=$|[^\\p{L}\\p{N}])`, 'gu'), (_m, pre) => `${pre}${to}`);
    };
    for (const s of swaps) replace(s.from, s.to);
    for (const s of swaps) {
        const words = s.words ?? [];
        // "Imanini, son of Ashvattha" and "Mahi the Tall" go by the first word alone.
        const full = String(s.next ?? s.to);
        const next = /,|\s(?:the|of)\s/i.test(full) ? [full.split(/[\s,]+/)[0]] : full.split(' ');
        // A place goes by its whole name ("Zyrex" is "The Kingfisher Club", never "The").
        if (s.kind === 'location' && words.length !== next.length) continue;
        if (words.length > 1) replace(words.join(' '), next.join(' '));
        words.forEach((w, i) => {
            const to = words.length === next.length ? next[i] : i === 0 || next.length === 1 ? next[0] : next.at(-1);
            replace(w, to);
            replace(`${w}'s`, `${to}'s`);
        });
    }
    return t;
}

// The pool for a prompt, with the rule. '' when there is none.
export function poolLine(pool, { rule = true } = {}) {
    const p = normalizePool(pool);
    const people = [...interleave(p.women, p.men)];
    if (!people.length && !p.places.length) return '';
    const parts = [];
    if (people.length) parts.push(`people - ${people.join(', ')}`);
    if (p.places.length) parts.push(`places - ${p.places.join(', ')}`);
    return `Names for anyone or anywhere new that needs a name: ${parts.join('; ')}.${rule ? ' Use these rather than making up a name; a name built from one the world already has, or a plain descriptive one ("The Eyepatched Man", "the Rusty Anchor"), is fine too.' : ''}`;
}

function* interleave(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i]) yield a[i];
        if (b[i]) yield b[i];
    }
}

// The narrator's optional line (off by default): names it may give
// someone new. Whatever it writes is the story's and is kept.
export function narratorPoolLine(pool) {
    const p = normalizePool(pool);
    const people = [...interleave(p.women, p.men)];
    if (!people.length && !p.places.length) return '';
    return `[If someone or somewhere new needs a name, use one of these: ${[...people, ...p.places].join(', ')}.]`;
}

// Which pool names the world has taken since (a name now in it is used
// and leaves the pool). -> { pool, gone }
export function prunePool(pool, names = []) {
    const have = new Set(names.map(fold));
    const p = normalizePool(pool);
    const gone = [];
    for (const k of ['men', 'women', 'places']) p[k] = p[k].filter((n) => (have.has(fold(n)) ? (gone.push(n), false) : true));
    return { pool: p, gone };
}

// Men and women to roll so the pool is full again: { men, women, places }.
export function shortfall(pool, size = POOL_SIZE) {
    const p = normalizePool(pool);
    return { men: Math.max(0, size.men - p.men.length), women: Math.max(0, size.women - p.women.length), places: Math.max(0, size.places - p.places.length) };
}
