// The name registry (docs/DESIGN - NAMING.md, section 3.4): what the
// generator has handed out, so no name comes twice and the pieces of names
// are spread instead of circling the likeliest ones.
//
// registry entry: { n: name, k: kind, c: culture id, s: state, i: counter }
//   s: 'o' offered (shown, not taken), 'u' used, 'd' turned down.

import { fold, nameTokens, tooClose } from './text.js';

export const REGISTRY_MAX = 2000;
// An offered name comes back into play after this many more rolls.
export const OFFER_RETURNS_AFTER = 200;
const PIECE_WINDOW = 400;

// The names models fall back on in every world. Refused for invented
// cultures (a real culture may well have an Aria).
export const CLICHE_NAMES = Object.freeze([
    'Elara', 'Kael', 'Kaelen', 'Kaelan', 'Lyra', 'Thorne', 'Seraphina', 'Seraphine', 'Vex', 'Zephyr', 'Aria', 'Sable', 'Ashford',
    'Eldoria', 'Aldric', 'Elowen', 'Lysandra', 'Caelum', 'Liora', 'Sylas', 'Nyx', 'Aelar', 'Thalor', 'Valen', 'Kaida', 'Eryndor',
    'Faelan', 'Elysia', 'Lirael', 'Mirelle', 'Draven', 'Corvin', 'Malakar', 'Zarek', 'Riven', 'Aeliana', 'Vesper', 'Elandra',
    'Thalia', 'Isolde', 'Lucian', 'Kieran', 'Evander', 'Calloway', 'Blackwood', 'Ravenwood', 'Eldrin', 'Galen', 'Orin', 'Rhys',
    'Aelin', 'Lorien', 'Sylvan', 'Zara', 'Kira', 'Talon', 'Grimshaw', 'Varian', 'Aurelia', 'Celeste', 'Mira', 'Nova', 'Ember',
    'Rowan', 'Elric', 'Theron', 'Cassius', 'Silas', 'Jareth', 'Eamon', 'Brannoc', 'Aeris', 'Mordecai', 'Vaelin', 'Selene',
    'Lysander', 'Ophelia', 'Elysium', 'Aetheria', 'Sylvaria', 'Valoria', 'Drakmor', 'Shadowfen', 'Stormhold', 'Ironhold',
    'Oakhaven', 'Willowbrook', 'Ravenhold', 'Silverwood', 'Brightwater', 'Duskwood', 'Mistvale', 'Thornwick', 'Emberfall',
]);
// The handful a prompt tells the model never to use.
export const PROMPT_CLICHES = Object.freeze(['Elara', 'Kael', 'Lyra', 'Thorne', 'Seraphina', 'Vex', 'Zephyr', 'Aria', 'Sable', 'Eldoria', 'Aldric', 'Elowen', 'Lysandra', 'Caelum', 'Sylas', 'Nyx', 'Draven', 'Kaelen', 'Ashford', 'Oakhaven', 'Thalia', 'Isolde', 'Lucian', 'Kieran', 'Mira', 'Ember', 'Rowan', 'Vesper']);
const CLICHE_FOLDS = new Set(CLICHE_NAMES.map(fold));

// The pieces of a name that the registry counts: each word, its first
// three letters, its last three.
export function piecesOf(name) {
    const tokens = nameTokens(name);
    return [...tokens.map((t) => `w:${t}`), ...tokens.filter((t) => t.length >= 4).flatMap((t) => [`a:${t.slice(0, 3)}`, `z:${t.slice(-3)}`])];
}

// Everything a new name is checked against.
// names: every name and alias in the setting; registry: the world's;
// shared: folded names from the user's other worlds; counter: rolls so far.
export function buildIndex({ names = [], registry = [], shared = [], counter = 0, real = false, cliches = true, banned = [] }) {
    const exact = new Set();
    const close = [];
    const pieces = new Map();
    const count = (name) => { for (const p of piecesOf(name)) pieces.set(p, (pieces.get(p) ?? 0) + 1); };
    for (const n of names) {
        const f = fold(n);
        if (!f) continue;
        exact.add(f);
        close.push(n);
        count(n);
    }
    registry.forEach((r, i) => {
        const f = fold(r.n);
        if (!f) return;
        const live = r.s !== 'o' || counter - (r.i ?? 0) < OFFER_RETURNS_AFTER;
        if (live) { exact.add(f); if (r.s !== 'd') close.push(r.n); }
        if (registry.length - i <= PIECE_WINDOW && r.s !== 'd') count(r.n);
    });
    if (!real) for (const f of shared) exact.add(f);
    const refuse = new Set([...(cliches && !real ? CLICHE_FOLDS : []), ...banned.map(fold)]);
    return { exact, close, pieces, refuse, real };
}

// Whether a name may be handed out. A kit name ("The Rowan Woods") is
// plain English: only the whole of it is checked against the clichés.
export function acceptable(name, index, { kit = false } = {}) {
    const f = fold(name);
    if (!f || f.length < 2 || index.exact.has(f)) return false;
    // A banned or overused word anywhere in it: "Elara Voss" is out.
    if (index.refuse.has(f) || (!kit && nameTokens(name).some((t) => index.refuse.has(t)))) return false;
    // Real towns have two Jóns; an invented one should not have Kael and Kaelen.
    if (!index.real && !kit) {
        const words = nameTokens(name);
        for (const other of index.close) {
            if (tooClose(name, other)) return false;
            // A one-word name too close to any word of another name.
            if (words.length === 1 && nameTokens(other).some((w) => w.length >= 4 && tooClose(words[0], w))) return false;
        }
    }
    return true;
}

// Lower is better: how often the name's pieces have been used already.
export function spreadScore(name, index) {
    let score = 0;
    for (const p of piecesOf(name)) score += (index.pieces.get(p) ?? 0) * (p.startsWith('w:') ? 3 : 1);
    return score;
}

// The registry with one more entry (or an entry's state changed), trimmed:
// offered names go first, then the oldest.
export function recordName(registry, { name, kind = '', culture = '', state = 'o', counter = 0 }) {
    const f = fold(name);
    const list = registry.filter((r) => fold(r.n) !== f);
    const before = registry.find((r) => fold(r.n) === f);
    // Used and turned-down names keep their state over a later "offered".
    const s = before && state === 'o' && before.s !== 'o' ? before.s : state;
    list.push({ n: name, k: kind || before?.k || '', c: culture || before?.c || '', s, i: counter });
    while (list.length > REGISTRY_MAX) {
        const drop = list.findIndex((r) => r.s === 'o');
        list.splice(drop >= 0 ? drop : 0, 1);
    }
    return list;
}
