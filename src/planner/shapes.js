// Story shapes and the tension aim (docs/DESIGN - GM PLANNER.md §5). Pure.
//
// A shape is the curve a story's tension should follow: acts, each with a
// share of the story, a target band of overall tension (0-5, Archivist's
// scale) and a pattern within the act; the kind of pressure it leans on
// (threat, uncertainty or emotional); and how long it may stay high before
// it wants a breather. The story's position (0-1) is its progress through
// the outline's beats. Comparing the newest tension reading with the band
// at that position gives the aim: build, hold or ease.

export const PARTS = Object.freeze(['threat', 'uncertainty', 'emotional']);

// pattern: 'rise' (low to high across the act), 'fall' (high to low),
// 'waves' (rise and relief, twice), 'steady' (the middle of the band),
// 'simmer' (low, with a late spike).
// breather: readings in a row at or above the band's top before it eases.
export const SHAPES = Object.freeze([
    {
        id: 'slow-burn', label: 'Slow burn', lean: 'emotional', breather: 4,
        blurb: 'A long, quiet build. Small tensions gather until they can no longer be held, then everything breaks at once.',
        acts: [
            { title: 'Setting the scene', share: 0.3, band: [0.5, 2], pattern: 'steady' },
            { title: 'The pressure grows', share: 0.4, band: [1.5, 3.5], pattern: 'rise' },
            { title: 'The break', share: 0.2, band: [3, 5], pattern: 'rise' },
            { title: 'After', share: 0.1, band: [1, 2.5], pattern: 'fall' },
        ],
    },
    {
        id: 'adventure-serial', label: 'Adventure serial', lean: 'threat', breather: 3,
        blurb: 'Episodes that rise and fall, each ending on a hook, building toward a bigger confrontation.',
        acts: [
            { title: 'The call', share: 0.15, band: [1, 2.5], pattern: 'rise' },
            { title: 'Episodes', share: 0.55, band: [1.5, 4], pattern: 'waves' },
            { title: 'The great danger', share: 0.2, band: [3.5, 5], pattern: 'rise' },
            { title: 'Homecoming', share: 0.1, band: [1, 2.5], pattern: 'fall' },
        ],
    },
    {
        id: 'thriller', label: 'Thriller', lean: 'threat', breather: 5,
        blurb: 'Pressure from the start that rarely lets up: a ticking clock, a pursuer, stakes that keep climbing.',
        acts: [
            { title: 'The hook', share: 0.1, band: [2, 3.5], pattern: 'rise' },
            { title: 'The chase', share: 0.5, band: [2.5, 4.5], pattern: 'waves' },
            { title: 'Cornered', share: 0.3, band: [3.5, 5], pattern: 'rise' },
            { title: 'Aftermath', share: 0.1, band: [1.5, 3], pattern: 'fall' },
        ],
    },
    {
        id: 'mystery', label: 'Mystery', lean: 'uncertainty', breather: 4,
        blurb: 'A question that deepens as clues turn up and suspects lie, until the truth comes out.',
        acts: [
            { title: 'The question', share: 0.15, band: [1.5, 3], pattern: 'rise' },
            { title: 'Clues and lies', share: 0.5, band: [2, 3.5], pattern: 'waves' },
            { title: 'The truth closes in', share: 0.25, band: [3, 4.5], pattern: 'rise' },
            { title: 'Revelation', share: 0.1, band: [1.5, 3], pattern: 'fall' },
        ],
    },
    {
        id: 'intrigue', label: 'Intrigue', lean: 'uncertainty', breather: 5,
        blurb: 'Plots, alliances and betrayals. Tension simmers under polite surfaces and flares when masks slip.',
        acts: [
            { title: 'The players', share: 0.2, band: [1, 2.5], pattern: 'simmer' },
            { title: 'Schemes', share: 0.45, band: [2, 3.5], pattern: 'simmer' },
            { title: 'Masks slip', share: 0.25, band: [3, 4.5], pattern: 'rise' },
            { title: 'A new order', share: 0.1, band: [1.5, 3], pattern: 'fall' },
        ],
    },
    {
        id: 'romance', label: 'Romance', lean: 'emotional', breather: 3,
        blurb: 'Two people drawn together and kept apart: longing, misunderstandings, a crisis of the heart, and resolution.',
        acts: [
            { title: 'Meeting', share: 0.2, band: [1, 2.5], pattern: 'rise' },
            { title: 'Drawn together', share: 0.4, band: [1.5, 3.5], pattern: 'waves' },
            { title: 'Torn apart', share: 0.25, band: [3, 4.5], pattern: 'rise' },
            { title: 'Together', share: 0.15, band: [1, 2.5], pattern: 'fall' },
        ],
    },
    {
        id: 'slice-of-life', label: 'Slice of life', lean: 'emotional', breather: 2,
        blurb: 'Everyday life in the world, in gentle waves: small troubles, small joys, people growing over time.',
        acts: [
            { title: 'Days', share: 1, band: [0.5, 2.5], pattern: 'waves' },
        ],
    },
]);

export const shapeOf = (id) => SHAPES.find((s) => s.id === id) ?? null;

const clamp = (v, lo = 0, hi = 5) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

// The act at position `pos` (0-1): { index, act, t } (t: 0-1 within it).
export function actAt(shape, pos) {
    const p = clamp(Number.isFinite(pos) ? pos : 0, 0, 1);
    let start = 0;
    for (let i = 0; i < shape.acts.length; i++) {
        const share = shape.acts[i].share;
        if (p < start + share || i === shape.acts.length - 1) return { index: i, act: shape.acts[i], t: share > 0 ? clamp((p - start) / share, 0, 1) : 0 };
        start += share;
    }
    return { index: 0, act: shape.acts[0], t: 0 };
}

// The target band at position `pos`: { min, max, center, act, index }.
export function targetAt(shape, pos) {
    const { index, act, t } = actAt(shape, pos);
    const [lo, hi] = act.band;
    const span = hi - lo;
    const center = {
        rise: lo + span * t,
        fall: hi - span * t,
        waves: lo + span * (0.5 - 0.5 * Math.cos(Math.PI * 4 * t)),
        simmer: t < 0.8 ? lo + span * 0.3 : lo + span * (0.3 + 0.7 * ((t - 0.8) / 0.2)),
        steady: lo + span / 2,
    }[act.pattern] ?? lo + span / 2;
    const half = Math.max(0.5, span / 4);
    return { min: round1(clamp(center - half)), max: round1(clamp(center + half)), center: round1(center), act, index };
}

// Points along the whole shape for a chart: [{ pos, min, max }].
export function shapeCurve(shape, steps = 40) {
    return Array.from({ length: steps + 1 }, (_, i) => {
        const pos = i / steps;
        const { min, max } = targetAt(shape, pos);
        return { pos, min, max };
    });
}

// The aim. reading: { threat, uncertainty, emotional, overall } (the
// newest), recent: the readings before it, oldest first.
// -> { word: 'build' | 'hold' | 'ease', lean, why, band } or null without
//    a reading.
export function tensionAim(shape, pos, reading, recent = []) {
    if (!shape || !reading || !Number.isFinite(reading.overall)) return null;
    const band = targetAt(shape, pos);
    const parts = PARTS.filter((p) => Number.isFinite(reading[p]));
    const lowest = parts.length ? parts.reduce((a, b) => (reading[b] < reading[a] ? b : a)) : shape.lean;
    const highest = parts.length ? parts.reduce((a, b) => (reading[b] > reading[a] ? b : a)) : shape.lean;
    // Too long at the top: a breather, whatever the band says.
    const run = [...recent, reading].reverse();
    let high = 0;
    for (const r of run) { if (Number.isFinite(r?.overall) && r.overall >= band.max - 0.2) high++; else break; }
    if (high >= shape.breather && reading.overall >= 2.5) {
        return { word: 'ease', lean: highest, why: 'the story has been at full stretch for a while and wants a breather - a quiet moment, a relief or a small win', band };
    }
    if (reading.overall < band.min) {
        // Build along the shape's lean, unless that is already high.
        const lean = parts.includes(shape.lean) && reading[shape.lean] < band.max ? shape.lean : lowest;
        return { word: 'build', lean, why: BUILD_WHY[lean] ?? BUILD_WHY.threat, band };
    }
    if (reading.overall > band.max) return { word: 'ease', lean: highest, why: EASE_WHY[highest] ?? EASE_WHY.threat, band };
    return { word: 'hold', lean: shape.lean, why: 'the tension is where the story wants it - keep it there', band };
}

const BUILD_WHY = Object.freeze({
    threat: 'bring in danger - someone or something that could hurt them, closing in',
    uncertainty: 'raise questions the story can\'t answer yet - someone isn\'t who they claim, a clue that doesn\'t fit',
    emotional: 'raise what is at stake between people - a hurt, a longing, a loyalty tested',
});
const EASE_WHY = Object.freeze({
    threat: 'let the danger pass for now - safety, rest, a small victory',
    uncertainty: 'answer something - a truth comes out, a doubt is settled',
    emotional: 'give the feelings room to settle - comfort, honesty, a moment of warmth',
});
