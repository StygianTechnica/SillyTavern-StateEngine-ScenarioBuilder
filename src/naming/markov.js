// A letter-level Markov chain over weighted sets of names: the blend of a
// culture's seed languages (docs/DESIGN - NAMING.md, section 3.1).

import { weighted } from './random.js';

const START = '^';
const END = '$';

// sets: [{ names: [string], weight }]. Each set counts by its weight, not
// by its size, so a short list is not drowned by a long one.
export function trainMarkov(sets, order = 3) {
    const tables = Array.from({ length: order + 1 }, () => new Map());
    const lengths = [];
    const known = new Set();
    for (const { names, weight = 1 } of sets) {
        const list = names.filter(Boolean);
        if (!list.length || weight <= 0) continue;
        const each = weight / list.length;
        for (const raw of list) {
            const name = raw.toLowerCase();
            known.add(name);
            const chars = [...name];
            lengths.push(chars.length);
            const padded = [...START.repeat(order), ...chars, END];
            for (let i = order; i < padded.length; i++) {
                for (let k = 1; k <= order; k++) {
                    const ctx = padded.slice(i - k, i).join('');
                    const next = padded[i];
                    let row = tables[k].get(ctx);
                    if (!row) tables[k].set(ctx, (row = new Map()));
                    row.set(next, (row.get(next) ?? 0) + each);
                }
            }
        }
    }
    lengths.sort((a, b) => a - b);
    const at = (p) => lengths[Math.min(lengths.length - 1, Math.floor(p * lengths.length))] ?? 6;
    return { order, tables, known, minLen: Math.max(2, at(0.05)), maxLen: Math.max(4, at(0.95)), empty: !lengths.length };
}

// One new name, or '' if none came out right in `tries` attempts.
// Falls back to shorter contexts where the long one was never seen.
export function generateMarkov(model, rand, { minLen = model.minLen, maxLen = model.maxLen, tries = 40, allowKnown = false } = {}) {
    if (model.empty) return '';
    for (let t = 0; t < tries; t++) {
        const out = [];
        let ctxChars = [...START.repeat(model.order)];
        for (let step = 0; step < maxLen + 2; step++) {
            let row = null;
            for (let k = model.order; k >= 1 && !row; k--) row = model.tables[k].get(ctxChars.slice(-k).join('')) ?? null;
            if (!row) break;
            const entries = [...row.entries()];
            // Not ending before the shortest length when there is another way on.
            const usable = out.length < minLen && entries.some(([c]) => c !== END) ? entries.filter(([c]) => c !== END) : entries;
            const [next] = weighted(rand, usable, ([, w]) => w) ?? [END];
            if (next === END) break;
            out.push(next);
            ctxChars.push(next);
        }
        const name = out.join('').replace(/^[\s\-']+|[\s\-']+$/g, '');
        const len = [...name].length;
        if (len < minLen || len > maxLen) continue;
        if (/(.)\1\1/.test(name) || /[\-'\s]{2}/.test(name)) continue;
        if (!allowKnown && model.known.has(name)) continue;
        return name;
    }
    return '';
}
