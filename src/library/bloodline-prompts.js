// Bloodlines phase 3 (docs/DESIGN - BLOODLINES.md, section 7) - the pure
// half: the bloodlines part of the premise call (shared with the naming
// cultures, src/naming/premise.js), the two sheet calls ("Rewrite for this
// world", "Describe how they look"), and reading what the lorebook and the
// story say. The answers are plain "KEY: value" lines, read forgivingly.

import { BLOODLINE_KINDS, SHARES, KNOWN, KIND_WORDS, normalizeBloodline, wordsOf, matchBrief, singularOf } from './bloodlines.js';
import { BLOODLINE_PRESETS } from './bloodline-presets.js';
import { describeMagic, describeTech, lookLines } from './world-options.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (clean(s).length > n ? `${clean(s).slice(0, n - 1).trimEnd()}…` : clean(s));
const lower = (s) => clean(s).toLowerCase();
const none = (v) => /^\W*(?:none|n\/a|no|-|nothing|blank)?\W*$/i.test(clean(v));

export const MAX_BLOODLINES = 6;

// "**Look:** x" / "- LOOK - x" -> [key (lower case), value], or null.
function keyLine(line) {
    const m = String(line).replace(/[*_#`]/g, '').match(/^\s*(?:[-•\d.)]+\s*)?([A-Za-z][A-Za-z ]{1,22}?)\s*[:=–—]\s*(.*)$/)
        ?? String(line).replace(/[*_#`]/g, '').match(/^\s*(?:[-•]\s*)?([A-Z][A-Z ]{1,22}?)\s+-\s+(.*)$/);
    return m ? [lower(m[1]), clean(m[2])] : null;
}

// Blocks of keyed lines, a new block at each `startKey`. -> [{ key: value }]
// and the lines with no block (before the first).
function readBlocks(text, startKey) {
    const blocks = [];
    const loose = {};
    let cur = null;
    for (const line of String(text ?? '').split(/\r?\n/)) {
        const kv = keyLine(line);
        if (!kv) continue;
        const [key, value] = kv;
        if (key === startKey) { cur = { [key]: value }; blocks.push(cur); continue; }
        const into = cur ?? loose;
        if (!(key in into)) into[key] = value;
    }
    return { blocks, loose };
}

// ---- the premise call

const presetList = () => BLOODLINE_PRESETS.map((p) => p.name).join(', ');

// The bloodlines part of the premise prompt. existing: names of the world's
// bloodlines already. -> text
export function premiseBloodlinesSection({ existing = [] } = {}) {
    return [
        'THE BLOODLINES',
        `Also propose the bloodlines of this world - the races, species and kinds of being a character can BE (humans, elves, androids, an invented people) - at most ${MAX_BLOODLINES}. Only those the premise has or clearly implies, most common first; a world of plain humans has only Humans. Kinds of monster met in fights are not bloodlines.`,
        `Presets to start from where one fits: ${presetList()}.`,
        existing.length ? `Bloodlines it already has (do not repeat them): ${existing.join(', ')}` : '',
        'After the cultures, for each bloodline write this block (a blank line between blocks):',
        'BLOODLINE: its name, plural ("Elves", "The Vaskari")',
        'ONE: one of them ("elf", "Vaskari")',
        `KIND: ${BLOODLINE_KINDS.map(([id]) => id).join(' | ')}`,
        'PRESET: the closest preset above, or none',
        'LOOK: what anyone would see, one sentence',
        'HERE: how they live in THIS world, one sentence',
        `SHARE: how common they are in the world - ${SHARES.filter(([id]) => !['unique', 'none'].includes(id)).map(([id]) => id).join(' | ')}`,
        'NAMES: the CULTURE above whose names they carry (its exact name), or "local" for the names of wherever they live',
        `KNOWN: how well an image model already knows what they look like - ${KNOWN.map(([id]) => id).join(' | ')}`,
        'BODY, SKIN, FEATURES: one line each, only when KNOWN is partly or not',
        'Last, one line: ONLY THESE: yes (no other peoples exist in this world) or no',
    ].filter(Boolean).join('\n');
}

const SPLIT = /^\W*(?:the\s+)?bloodlines?\s*(?:[:=–—]|$)/im;

// The premise answer cut in two: the cultures part and the bloodlines part.
export function splitPremiseAnswer(raw) {
    const text = String(raw ?? '');
    const at = text.search(SPLIT);
    return at < 0 ? { cultures: text, bloodlines: '' } : { cultures: text.slice(0, at), bloodlines: text.slice(at).replace(/^\s+/, '') };
}

// The preset a proposal names, by its PRESET line, else its own name.
export function presetFor(text, name = '') {
    const t = ` ${lower(text).replace(/[^a-z ]+/g, ' ')} `;
    const n = ` ${lower(name).replace(/^the /, '').replace(/[^a-z ]+/g, ' ')} `;
    const words = (p) => [p.name, p.plural, p.singular, p.id.replace(/_/g, ' ')].map((w) => lower(w).replace(/[^a-z ]+/g, ' ').trim()).filter((w) => w.length > 2);
    const ranked = [...BLOODLINE_PRESETS].sort((a, b) => b.name.length - a.name.length);
    const hit = (s) => ranked.find((p) => words(p).some((w) => s.includes(` ${w} `)));
    if (!none(text)) { const p = hit(t); if (p) return p.id; }
    return hit(n)?.id ?? '';
}

const pick = (list, v) => {
    const w = lower(v);
    return list.find(([id]) => w === id || w.startsWith(id))?.[0] ?? list.find(([id]) => w.includes(id))?.[0] ?? '';
};

// The bloodlines part of a premise answer. existing: names already in the
// world (skipped). -> { proposals: [{ name, one, kind, preset, look, here,
// share, names, known, body, skin, features }], only: true | false | null }
export function readPremiseBloodlines(raw, { existing = [] } = {}) {
    const { bloodlines } = splitPremiseAnswer(raw);
    const { blocks, loose } = readBlocks(bloodlines, 'bloodline');
    const taken = new Set(existing.map(lower));
    const out = [];
    for (const b of blocks) {
        const name = clean(b.bloodline).replace(/^["'“]|["'”.]$/g, '').slice(0, 60);
        if (!name || none(name) || taken.has(lower(name))) continue;
        taken.add(lower(name));
        out.push({
            name,
            one: clean(b.one ?? b.singular ?? '').replace(/^(?:an?|one)\s+/i, '').slice(0, 40),
            kind: pick(BLOODLINE_KINDS, b.kind ?? ''),
            preset: presetFor(b.preset ?? '', name),
            look: none(b.look) ? '' : cut(b.look, 300),
            here: none(b.here) ? '' : cut(b.here, 300),
            share: pick(SHARES, b.share ?? '') || 'some',
            names: none(b.names) ? '' : clean(b.names ?? b.culture ?? '').replace(/^["'“]|["'”.]$/g, ''),
            known: pick(KNOWN, b.known ?? ''),
            body: none(b.body) ? '' : cut(b.body, 120),
            skin: none(b.skin) ? '' : cut(b.skin, 120),
            features: none(b.features) ? '' : cut(b.features, 200),
        });
        if (out.length >= MAX_BLOODLINES) break;
    }
    const onlyText = Object.entries({ ...loose, ...Object.assign({}, ...blocks) }).find(([k]) => /^only( these)?$/.test(k))?.[1];
    return { proposals: out, only: onlyText === undefined ? null : /^\W*(?:yes|true|y)\b/i.test(onlyText) };
}

// A proposal in words, for its card: "ancestry, like the Dwarves preset;
// common; names: Vaskari".
export function describeBloodlineProposal(p) {
    const preset = BLOODLINE_PRESETS.find((x) => x.id === p.preset);
    return [
        p.kind ? BLOODLINE_KINDS.find(([id]) => id === p.kind)?.[1].split(' - ')[0].toLowerCase() : '',
        preset ? `from the ${preset.name} preset` : 'invented',
        SHARES.find(([id]) => id === p.share)?.[1].toLowerCase(),
        p.names ? (lower(p.names) === 'local' ? 'names: where they live' : `names: ${p.names}`) : '',
    ].filter(Boolean).join(' · ');
}

// ---- the sheet: "Rewrite for this world"

function worldLines(overview = {}) {
    const o = overview ?? {};
    return [
        clean(o.premise) && `Premise: ${cut(o.premise, 1200)}`,
        o.worldType && `Kind of world: ${String(o.worldType).replace(/_/g, ' ')}`,
        clean(o.era) && `Era: ${o.era}`,
        clean(o.tone) && `Tone: ${o.tone}`,
        ...describeMagic(o.magic).lines, ...describeTech(o.tech).lines, ...lookLines(o),
    ].filter(Boolean);
}

// entry: the bloodline's Lore entry; overview: the setting's. -> { system,
// user, plain: false }
export function buildRewritePrompt({ entry, overview = {}, brief = '' }) {
    const b = normalizeBloodline(entry?.meta?.bloodline);
    const w = wordsOf(entry);
    const system = 'You adapt a kind of being - a race, species or people - to one particular fictional world, so it belongs there: how they look in that world, how they live in it, what they wear. You keep what makes them themselves. Answer in the plain format asked for, nothing else.';
    const user = [
        'THE WORLD', ...worldLines(overview), '',
        `THE BLOODLINE: ${w.name} (one of them: ${w.singular})`,
        clean(entry?.description) ? `As described so far: ${cut(entry.description, 1200)}` : '',
        b.look ? `How they look (so far): ${b.look}` : '',
        b.here ? `How they live (so far): ${b.here}` : '',
        b.visual.dress ? `What they wear (so far): ${b.visual.dress}` : '',
        brief ? `\nThe user asks: ${cut(brief, 300)}` : '',
        '',
        `Rewrite them for THIS world: its age, its technology, its places and its tone. ${w.plural} in a cyberpunk city are not the ones in a forest tale. Keep every fact that still fits; change what belongs to another kind of world.`,
        'Reply with these lines:',
        'DESCRIPTION: two to four sentences about them in this world',
        'LOOK: what anyone would see, one sentence',
        'HERE: how they live in this world, one sentence',
        'DRESS: what they wear or carry here, a few words',
    ].filter((x) => x !== '').join('\n');
    return { system, user, plain: false };
}

// -> { values: { description, look, here, dress }, error }
export function readRewrite(text) {
    const { loose } = readBlocks(text, '\u0000');
    const values = {
        description: none(loose.description) ? '' : cut(loose.description, 1200),
        look: none(loose.look) ? '' : cut(loose.look, 300),
        here: none(loose.here) ? '' : cut(loose.here, 300),
        dress: none(loose.dress) ? '' : cut(loose.dress, 160),
    };
    return Object.values(values).some(Boolean) ? { values, error: '' } : { values, error: 'no DESCRIPTION, LOOK or HERE lines' };
}

// ---- the sheet: "Describe how they look"

// canon: only what the description says (a canon entry is never added to).
export function buildLookPrompt({ entry, overview = {}, canon = false }) {
    const b = normalizeBloodline(entry?.meta?.bloodline);
    const w = wordsOf(entry);
    const system = 'You turn a description of a kind of being into the notes an image generator needs to draw one of them correctly. Answer in the plain format asked for, nothing else.';
    const user = [
        'THE WORLD', ...worldLines(overview).slice(0, 4), '',
        `THE BLOODLINE: ${w.name} (one of them: ${w.singular})`,
        clean(entry?.description) ? `Description: ${cut(entry.description, 1500)}` : '',
        b.look ? `How they look: ${b.look}` : '',
        b.visual.dress ? `What they wear: ${b.visual.dress}` : '',
        '',
        canon ? 'Use ONLY what the text above says. Leave a line as "none" when the text does not say - never invent.' : 'Where the text is silent, choose what fits it and the world.',
        'Reply with these lines:',
        'KNOWN: how well image models know this kind of being already - well (elf, dwarf, android: the word is enough) | partly (tiefling, Grey: the word and a few features) | not (invented)',
        'BODY: the body plan against a human: humanoid, four-armed, centaur-like, child-sized...',
        'SKIN: skin, hide or surface, and its colouring',
        'FEATURES: the two to four things that make one recognisable, most important first',
        'DRESS: what they wear or carry in this world',
        'TAGS: short comma-separated tags for a tag-based image model',
        'NEVER: what must not appear in a picture of one (e.g. human ears, hair)',
        'VARIETY: how much individuals differ, a few words',
    ].filter((x) => x !== '').join('\n');
    return { system, user, plain: false };
}

// -> { values: visual block fields, error }
export function readLook(text) {
    const { loose } = readBlocks(text, '\u0000');
    const get = (k, n) => (none(loose[k]) ? '' : cut(loose[k], n));
    const values = {
        known: pick(KNOWN, loose.known ?? ''),
        body: get('body', 120), skin: get('skin', 120), features: get('features', 220), dress: get('dress', 160),
        tags: get('tags', 160), negative: get('never', 160), variety: get('variety', 120),
    };
    return [values.body, values.skin, values.features, values.tags].some(Boolean) ? { values, error: '' } : { values, error: 'no BODY, SKIN, FEATURES or TAGS lines' };
}

// ---- the lorebook

const KIND_PLURALS = new Set([...KIND_WORDS, ...BLOODLINE_PRESETS.map((p) => p.singular)].flatMap((w) => [lower(w), lower(`${w}s`), lower(w.replace(/f$/, 'ves'))]));
for (const p of BLOODLINE_PRESETS) { KIND_PLURALS.add(lower(p.plural)); KIND_PLURALS.add(lower(p.name)); }

// Whether a lorebook entry reads like a bloodline: titled for a plural kind
// ("Elves", "The Elves of Arcadia", "Dwarves of the Deep") or opening by
// calling them a race, species or people. Pure words - no model call.
export function looksLikeBloodline({ title = '', content = '' } = {}) {
    const t = lower(title).replace(/^the\s+/, '').replace(/\s+(?:of|from|in)\s+.*$/, '');
    if (KIND_PLURALS.has(t) || KIND_PLURALS.has(t.split(' ').pop())) return true;
    const first = clean(content).split(/(?<=[.!?])\s+/)[0] ?? '';
    return /\b(?:are|is)\s+(?:a|an|the)\s+(?:[\w-]+\s+){0,3}(?:race|species|people|peoples|ancestry|bloodline|lineage|kind of being)\b/i.test(first);
}

// The bloodline block for an imported entry: on, with the words its name
// gives - nothing the book does not say. -> block
export function importedBloodline(name) {
    const plural = clean(name).replace(/^the\s+/i, '').replace(/\s+(?:of|from|in)\s+.*$/i, '');
    return normalizeBloodline({ on: true, plural: /s$/i.test(plural) ? plural.toLowerCase() : plural, singular: /s$/i.test(plural) ? singularOf(plural) : plural });
}

// ---- the story

// A kind of being a character taken in from the story is said to be, that
// the world has no bloodline for: from their role and the first sentence
// of their description ("A troll bouncer at the Neon Mile"). -> 'troll' or ''
export function storyKind({ role = '', description = '' } = {}, bloodlines = [], extraWords = []) {
    const first = clean(description).split(/(?<=[.!?])\s+/)[0] ?? '';
    const m = matchBrief(`${clean(role)}. ${first}`, bloodlines, extraWords);
    return m.ids.length ? '' : m.unknown;
}

// A new bloodline for a kind the story brought in: "troll" -> { name:
// "Trolls", bloodline block }.
export function storyBloodline(word) {
    const one = lower(word);
    const plural = { elf: 'elves', dwarf: 'dwarves', fey: 'fey', fae: 'fae', merfolk: 'merfolk', lizardfolk: 'lizardfolk' }[one] ?? (/(?:s|x|ch|sh)$/.test(one) ? `${one}es` : `${one}s`);
    return { name: plural.charAt(0).toUpperCase() + plural.slice(1), bloodline: normalizeBloodline({ on: true, singular: one, plural, playable: true }) };
}
