// Mutation: a culture's own sound changes, applied to every name it makes,
// so its names drift from the real languages the same way, like a real
// language's (docs/DESIGN - NAMING.md, section 3.1, step 3).
//
// Levels: 0 - the blend only; 1 - two or three sound shifts; 2 - more
// shifts, and endings swapped for the culture's own; 3 - all of that, and
// names recombined from two outputs.

import { pick, chance } from './random.js';
import { isVowel } from './text.js';

const V = 'aeiouy';
// The catalogue of sound changes a culture may roll. Each is a plain
// regex rewrite over the lower-case name.
export const SHIFTS = Object.freeze([
    { id: 'th-d', from: 'th', to: 'd' },
    { id: 'th-t', from: 'th', to: 't' },
    { id: 'ph-f', from: 'ph', to: 'f' },
    { id: 'c-k', from: `c(?=[aou])`, to: 'k' },
    { id: 'k-c', from: `k(?=[aou])`, to: 'c' },
    { id: 'k-kh', from: `k(?=[${V}])`, to: 'kh' },
    { id: 'g-gh', from: `^g`, to: 'gh' },
    { id: 'v-w', from: 'v', to: 'w' },
    { id: 'w-v', from: 'w', to: 'v' },
    { id: 'j-y', from: 'j', to: 'y' },
    { id: 'y-j', from: `^y(?=[${V}])`, to: 'j' },
    { id: 'sh-s', from: 'sh', to: 's' },
    { id: 's-sh', from: `s(?=[ie])`, to: 'sh' },
    { id: 'ch-kh', from: 'ch', to: 'kh' },
    { id: 'ae-e', from: 'ae', to: 'e' },
    { id: 'ei-ai', from: 'ei', to: 'ai' },
    { id: 'ai-ei', from: 'ai', to: 'ei' },
    { id: 'ou-u', from: 'ou', to: 'u' },
    { id: 'oo-u', from: 'oo', to: 'u' },
    { id: 'ck-k', from: 'ck', to: 'k' },
    { id: 'qu-kw', from: 'qu', to: 'kw' },
    { id: 'x-ks', from: 'x', to: 'ks' },
    { id: 'z-s', from: 'z', to: 's' },
    { id: 's-z', from: `(?<=[${V}])s(?=[${V}])`, to: 'z' },
    { id: 'p-b', from: `(?<=[${V}])p(?=[${V}])`, to: 'b' },
    { id: 'b-v', from: `(?<=[${V}])b(?=[${V}])`, to: 'v' },
    { id: 't-d', from: `(?<=[${V}])t(?=[${V}])`, to: 'd' },
    { id: 'd-dh', from: `d$`, to: 'dh' },
    { id: 'l-ll', from: `(?<=[${V}])l(?=[${V}])`, to: 'll' },
    { id: 'r-rr', from: `(?<=[${V}])r(?=[${V}])`, to: 'rr' },
    { id: 'n-nn', from: `(?<=[${V}])n(?=[${V}])`, to: 'nn' },
    { id: 'i-y', from: `(?<=[^${V}])i(?=[^${V}])`, to: 'y' },
    { id: 'u-o', from: `(?<=[^${V}])u(?=[^${V}]+[${V}])`, to: 'o' },
    { id: 'o-u', from: `o$`, to: 'u' },
    { id: 'a-ah', from: `a$`, to: 'ah' },
    { id: 'a-e', from: `a$`, to: 'e' },
    { id: 'e-a', from: `e$`, to: 'a' },
    { id: 'us-or', from: `us$`, to: 'or' },
    { id: 'us-os', from: `us$`, to: 'os' },
    { id: 'en-ain', from: `en$`, to: 'ain' },
    { id: 'an-en', from: `an$`, to: 'en' },
    { id: 'er-ar', from: `er$`, to: 'ar' },
    { id: 'on-un', from: `on$`, to: 'un' },
    { id: 'ia-ya', from: `ia$`, to: 'ya' },
    { id: 'h-drop', from: `^h(?=[${V}])`, to: '' },
    { id: 'add-h', from: `^(?=[${V}])`, to: 'h' },
    { id: 'apos', from: `(?<=^[^${V}]?[${V}])(?=[^${V}][${V}])`, to: "'" },
]);

const BY_ID = new Map(SHIFTS.map((s) => [s.id, { ...s, re: new RegExp(s.from, 'g') }]));
// Pairs that undo each other: never rolled together.
const CLASH = [['th-d', 'th-t'], ['c-k', 'k-c'], ['v-w', 'w-v'], ['j-y', 'y-j'], ['ei-ai', 'ai-ei'], ['a-ah', 'a-e'], ['us-or', 'us-os'], ['h-drop', 'add-h'], ['k-c', 'k-kh'], ['s-z', 'z-s'], ['sh-s', 's-sh']];
const clashes = (a, b) => CLASH.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const SHIFT_COUNT = [0, 2, 4, 6];

// A culture's shifts for its mutation level, rolled once from its seed.
export function rollShifts(rand, level) {
    const want = SHIFT_COUNT[Math.max(0, Math.min(3, level | 0))];
    const out = [];
    for (let tries = 0; out.length < want && tries < 200; tries++) {
        const s = pick(rand, SHIFTS);
        // The apostrophe is rare: only at the highest level, and seldom.
        if (s.id === 'apos' && (level < 3 || !chance(rand, 0.3))) continue;
        if (!out.includes(s.id) && !out.some((o) => clashes(o, s.id))) out.push(s.id);
    }
    return out;
}

export function applyShifts(name, shiftIds = []) {
    let out = String(name).toLowerCase();
    for (const id of shiftIds) {
        const s = BY_ID.get(id);
        if (s) out = out.replace(s.re, s.to);
    }
    return out;
}

// The last syllable: the last vowels and what follows ("-mund", "-ia").
const lastSyllable = (name) => name.match(new RegExp(`[${V}]+[^${V}]*$`, 'i'))?.[0] ?? '';
const firstSyllable = (name) => name.match(new RegExp(`^[^${V}]*[${V}]+[^${V}]?`, 'i'))?.[0] ?? name;

// The culture's signature endings: a few common endings of its seed names,
// shifted, so its names end its own way.
export function rollEndings(rand, names, shiftIds, count = 5) {
    const tally = new Map();
    for (const n of names) {
        const e = lastSyllable(n.toLowerCase());
        if (e.length >= 2 && e.length <= 4) tally.set(e, (tally.get(e) ?? 0) + 1);
    }
    const common = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([e]) => e);
    const out = [];
    for (let tries = 0; out.length < count && common.length && tries < 60; tries++) {
        const e = applyShifts(pick(rand, common), shiftIds);
        if (!out.includes(e)) out.push(e);
    }
    return out;
}

// A name with the culture's mutation applied. `other` is a second output
// to recombine with at level 3.
export function mutate(name, { level = 0, shifts = [], endings = [], rand, other = '' }) {
    if (!name || level <= 0) return name;
    let out = applyShifts(name, shifts);
    if (level >= 3 && other && chance(rand, 0.4)) {
        const head = firstSyllable(out);
        const tail = applyShifts(other, shifts).slice(firstSyllable(other).length);
        if (head && tail) out = head + tail;
    }
    if (level >= 2 && endings.length && chance(rand, 0.35)) {
        const last = lastSyllable(out);
        if (last && out.length - last.length >= 2) out = out.slice(0, out.length - last.length) + pick(rand, endings);
    }
    // No vowel left, or three of a kind: give back the unmutated name.
    if (![...out].some(isVowel) || /(.)\1\1/.test(out)) return name;
    return out;
}
