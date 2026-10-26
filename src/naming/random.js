// Seeded randomness for the name generator: the same world seed and
// counter always roll the same names (a reroll is the next counter).

// FNV-1a: a string to a 32-bit number.
export function hashString(text) {
    let h = 0x811c9dc5;
    for (const ch of String(text)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

// A stream of rolls in 0..1 (mulberry32), seeded from any keys.
export function makeRng(...keys) {
    let t = hashString(keys.join('|'));
    return () => {
        t = (t + 0x6D2B79F5) >>> 0;
        let r = Math.imul(t ^ (t >>> 15), t | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// One of `items`, by weight (weightOf(item) >= 0); null when all are 0.
export function weighted(rand, items, weightOf = (x) => x.weight ?? 1) {
    let total = 0;
    for (const item of items) total += Math.max(0, weightOf(item));
    if (total <= 0) return null;
    let roll = rand() * total;
    for (const item of items) {
        roll -= Math.max(0, weightOf(item));
        if (roll < 0) return item;
    }
    return items[items.length - 1];
}

// A weight for the nth most common name: common names come up often, rare
// ones still turn up (a Zipf curve, flattened).
export const rankWeight = (index) => 1 / (index + 6);

export const chance = (rand, p) => rand() < p;
