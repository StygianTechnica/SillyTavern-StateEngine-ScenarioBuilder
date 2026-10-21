// Creatures come in two forms (docs/ROADMAP.md, Combat):
//   individual - one being: a pet, a mount, a familiar, a unique monster
//                ("Ashmaw"). It behaves like a person in the scene: present
//                or not as the story has it, never faded out for going
//                unmentioned, and it can die (src/state/death.js).
//   kind       - a sort that turns up in numbers: zombies, wolves, skeleton
//                warriors. In the scene it has a count - "3 zombies" - that
//                goes down as they fall; at none, they have left. A kind
//                never dies; its numbers here do.
// The form is the user's choice on the sheet (meta.creatureForm), else
// guessed from the name. The scene's counts are canonical.creatureCounts
// ({ id: n }; a kind with no count is there in unknown numbers). Pure.

export const CREATURE_FORMS = Object.freeze(['individual', 'kind']);

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

const GROUP_WORDS = /\b(horde|hordes|pack|packs|swarm|swarms|legion|legions|host|flock|herd|band|troop|nest|colony|army|mob|pride|brood|throng)\b/i;
const PLURALS = /\b(wolves|men|women|people|folk|dead|undead|mice|lice|geese|children|elves|dwarves|thieves|bandits|wraiths)$/i;

// The form a name suggests: a group word or a plural is a kind; anything
// else - a proper name, "the grey wolf" - is one being.
export function guessCreatureForm(name) {
    const n = clean(name).replace(/['’]s\b/g, '');
    if (!n) return 'individual';
    if (GROUP_WORDS.test(n) || PLURALS.test(n)) return 'kind';
    const last = n.split(' ').pop().toLowerCase();
    return last.length > 3 && last.endsWith('s') && !/(ss|us|is|ys|os)$/.test(last) ? 'kind' : 'individual';
}

// The form of an entry: the user's choice, else the guess.
export const creatureFormOf = (entry) => (CREATURE_FORMS.includes(entry?.meta?.creatureForm) ? entry.meta.creatureForm : guessCreatureForm(entry?.name));

const NUMBERS = { a: 1, an: 1, one: 1, single: 1, lone: 1, two: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, few: 3, several: 4, handful: 4 };

// "3 zombies", "two skeletal warriors", "a dozen rats", "a pair of wolves"
// -> { count, name }; count null when no number is given ("zombies",
// "a horde of zombies").
export function readCount(text) {
    let t = clean(text).replace(/^the\s+/i, '');
    // "A horde of ghouls" is a number nobody gave, not one ghoul.
    const group = t.match(/^(?:a|an|the)?\s*(?:horde|pack|swarm|band|flock|host|mob|group|crowd|throng|legion|army)\s+of\s+(.+)$/i);
    if (group) return { count: null, name: group[1] };
    const m =t.match(/^(\d{1,3})\s+(.+)$/) ?? t.match(/^(?:a\s+)?(a|an|one|single|lone|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|pair|couple|dozen|few|several|handful)\s+(?:of\s+)?(.+)$/i);
    if (!m) return { count: null, name: t.replace(/^(?:a|an)\s+(?:horde|pack|swarm|band|flock|host|mob|group|crowd)\s+of\s+/i, '') };
    const count = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBERS[m[1].toLowerCase()];
    t = m[2].replace(/^(?:more|other|more of the)\s+/i, '');
    return { count: count > 0 ? count : null, name: t };
}

// Counts after `n` more come in (null n: some more - a count stays as it was
// when one was known, unknown otherwise).
export function addCount(counts, id, n) {
    const next = { ...(counts ?? {}) };
    if (Number.isInteger(n) && n > 0) next[id] = (Number.isInteger(next[id]) ? next[id] : 0) + n;
    return next;
}

// Counts after `n` fall or leave (null n: one). -> { counts, gone } - gone:
// none are left (an unknown number is gone only when told so with `all`).
export function takeCount(counts, id, n = null, { all = false } = {}) {
    const next = { ...(counts ?? {}) };
    if (all) { delete next[id]; return { counts: next, gone: true }; }
    if (!Number.isInteger(next[id])) return { counts: next, gone: false };
    const left = next[id] - (Number.isInteger(n) && n > 0 ? n : 1);
    if (left > 0) { next[id] = left; return { counts: next, gone: false }; }
    delete next[id];
    return { counts: next, gone: true };
}

// The scene's counts kept to the creatures in it, positive whole numbers.
export function normalizeCounts(counts, creatureIds = []) {
    const ids = new Set(creatureIds);
    return Object.fromEntries(Object.entries(counts && typeof counts === 'object' ? counts : {})
        .filter(([id, n]) => ids.has(id) && Number.isInteger(n) && n > 0 && n < 1000));
}

// How a creature in the scene is named in a prompt: "3 Zombies", "Zombies
// (some)" for a kind; an individual by its name.
export function creatureLabel(name, { form = 'individual', count = null } = {}) {
    const n = clean(name);
    if (form !== 'kind') return n;
    return Number.isInteger(count) ? `${count} ${n}` : `${n} (some)`;
}
