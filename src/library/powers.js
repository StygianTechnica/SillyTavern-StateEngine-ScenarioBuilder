// Powers: gods, spirits and forces with no body (a character entry marked
// "a power"). A power is never in the scene - never in the cast, never one
// who could turn up - but it acts on the world through those tied to it,
// its champions (a character's patron): a voice, a vision or dream, an
// omen, a blessing that turns a fight. A power can also give missions,
// sent in a dream or vision (src/quests/missions.js).
//
// Kept small in the prompt: a power is put before the director only when
// it bears on this reply - named in the latest messages (invoked), a
// champion of it failing in a fight, or its occasional turn come round
// (a champion here and it has been quiet for `every` replies) - at most a
// couple at once, a line each. The director reports an act with a POWER
// line, which starts the quiet again. People's gifts (meta.gifts: what they
// can do beyond their weapons) go with them wherever they are described.
// Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const POWERS_SHOWN = 2;
export const POWER_EVERY = 8;
// How long a power's signs and a person's gifts may be.
export const ACTS_MAX = 600;
export const GIFTS_MAX = 800;

// `text` no longer than `max`, shortened - when it must be - at the end of
// a whole sentence or phrase (". " "; "), else of a word: never mid-word,
// never with a dangling "…".
export function fitText(text, max) {
    const t = clean(text);
    if (t.length <= max) return t;
    const head = t.slice(0, max + 1);
    const phrase = Math.max(...['. ', '; ', '! ', '? '].map((m) => head.lastIndexOf(m)));
    if (phrase > max * 0.5) return t.slice(0, phrase + 1).replace(/;$/, '').trim();
    const comma = head.lastIndexOf(', ');
    if (comma > max * 0.6) return t.slice(0, comma).trim();
    const space = head.lastIndexOf(' ');
    return (space > 0 ? t.slice(0, space) : t.slice(0, max)).replace(/[\s,;:-]+$/, '').trim();
}

// meta.power: { on, acts } - acts: how it makes itself known (dreams,
// storms, a voice in the fire), its own words.
export function normalizePowerMeta(value) {
    const p = isObject(value) ? value : {};
    return { on: p.on === true, acts: fitText(p.acts, ACTS_MAX) };
}

export const isPower = (entry) => entry?.meta?.power?.on === true;
// The powers a character is a champion or devotee of.
export const patronsOf = (entry) => (Array.isArray(entry?.meta?.patrons) ? entry.meta.patrons.filter((x) => typeof x === 'string' && x) : []);

// Whether the text names a power, by any of its names, as a whole word.
function named(entry, text) {
    const t = String(text ?? '');
    return [entry?.name, ...(entry?.aliases ?? entry?.base?.aliases ?? [])].some((raw) => {
        const n = clean(raw);
        if (n.length < 3) return false;
        const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^\\p{L}])${esc}(?=$|[^\\p{L}])`, 'iu').test(t);
    });
}

// The powers that bear on this reply, most pressing first, at most `max`.
// powers: the power entries; cast: the characters here (entries, with
//   meta.patrons); recentText: the latest messages; fight: the fight
//   (src/director/fight.js) or null; turn: the chat's reply count;
//   lastActed: { [powerId]: turn }; every: replies a power stays quiet
//   between unprompted acts (0: only when invoked or a champion is failing).
// -> [{ id, name, domain, acts, champions: [name], why }]
export function powersAtWork({ powers = [], cast = [], recentText = '', fight = null, turn = 0, lastActed = {}, every = POWER_EVERY, max = POWERS_SHOWN } = {}) {
    const out = [];
    for (const p of powers) {
        const champions = cast.filter((c) => patronsOf(c).includes(p.id));
        const failing = champions.filter((c) => (fight?.fighters ?? []).some((f) => f.side !== 'foe' && clean(f.name).toLowerCase() === clean(c.name).toLowerCase() && ['badly wounded', 'failing', 'down'].includes(f.condition)));
        const quietFor = Number.isInteger(lastActed?.[p.id]) ? turn - lastActed[p.id] : Infinity;
        let why = '';
        let rank = 0;
        if (named(p, recentText)) { why = 'called on or named in the latest messages - by anyone, champion or not; it may answer or stay silent, as its nature and the story warrant'; rank = 3; }
        else if (failing.length && quietFor >= 2) { why = `${failing.map((c) => c.name).join(' and ')} - its champion - is failing in the fight: a moment for a blessing`; rank = 2; }
        else if (champions.length && every > 0 && quietFor >= every) { why = `its champion ${champions.map((c) => c.name).join(' and ')} is here, and it has been quiet a while`; rank = 1; }
        if (!why) continue;
        out.push({ id: p.id, name: p.name, domain: clean(p.base?.role ?? p.role ?? '') || clean(p.description).slice(0, 140), acts: clean(p.meta?.power?.acts), champions: champions.map((c) => c.name), why, rank });
    }
    return out.sort((a, b) => b.rank - a.rank).slice(0, max).map(({ rank, ...rest }) => rest);
}

// The director's lines for them - '' when none.
export function powersText(list) {
    if (!(list ?? []).length) return '';
    return list.map((p) => `- ${clean(p.name)}${clean(p.domain) ? ` (${clean(p.domain)})` : ''}${p.champions.length ? `; champion here: ${p.champions.join(', ')}` : ''}${clean(p.acts) ? `; makes itself known by ${clean(p.acts)}` : ''} - ${p.why}.`).join('\n');
}

// A person's gifts and patron, for the people lines - '' when none.
export function giftsText(entry, nameOf = () => '') {
    const gifts = clean(entry?.meta?.gifts ?? entry?.gifts);
    const patrons = patronsOf(entry).map(nameOf).filter(Boolean);
    return [gifts && `gifts: ${fitText(gifts, 400)}`, patrons.length && `champion of ${patrons.join(' and ')}`].filter(Boolean).join('; ');
}
