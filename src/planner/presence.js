// Who has been in the scene, and when: { [name, lowercased]: the latest
// chat index they were present at }. Being named is not being there -
// Assassins Inc: Adam said "Zane will provide supporting firepower from a
// distance", and the day plan took "Zane arrives with intel" as played out,
// and the beat that waited on Zane stopped waiting. Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const key = (name) => clean(name).toLowerCase();
const MAX = 300;

export function normalizePresent(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const kept = Object.entries(v).filter(([k, n]) => k && Number.isInteger(n) && n >= 0);
    return Object.fromEntries(kept.sort((a, b) => b[1] - a[1]).slice(0, MAX));
}

// Whether noting `names` at `at` changes anything.
export function needsPresence(present, names, at) {
    return names.map(key).filter(Boolean).some((n) => !((present ?? {})[n] >= at));
}

export function notePresent(present, names, at) {
    const next = { ...normalizePresent(present) };
    for (const n of names.map(key).filter(Boolean)) if (!(next[n] >= at)) next[n] = at;
    return normalizePresent(next);
}

// Presence from the company samples (src/director/company.js): who was
// with the player at each reply, from before `present` was kept.
export function presenceFrom(samples, present = {}) {
    let out = { ...normalizePresent(present) };
    for (const s of samples ?? []) {
        const at = Number(String(s?.key ?? '').match(/#(\d+)@/)?.[1]);
        if (!Number.isInteger(at)) continue;
        out = notePresent(out, (s.present ?? []).map((p) => p?.name).filter(Boolean), at);
    }
    return out;
}

// The latest index a tie ("Zane", "Adam", "Inji Miyama") was present at:
// its whole name, or a name present whose words hold all of the tie's -
// or the tie's first word when it is the first word of one present.
export function presentAt(present, tie) {
    const t = key(tie);
    if (!t) return -1;
    const words = t.split(' ');
    let best = -1;
    for (const [n, at] of Object.entries(present ?? {})) {
        const has = n.split(' ');
        if (n === t || words.every((w) => has.includes(w)) || has.every((w) => words.includes(w)) || (words[0].length >= 3 && has[0] === words[0])) best = Math.max(best, at);
    }
    return best;
}

// The people a moment or beat has taking part: ties the text names as a
// person, not only as an owner ("stop Enrique's operation" needs no
// Enrique; "Miller briefs Zane and Vex" needs Zane). isPerson(tie) -> bool.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function takingPart(text, ties, { isPerson = () => true, player = '' } = {}) {
    const t = String(text ?? '').replace(/’/g, "'");
    const own = key(player);
    return (ties ?? []).filter((tie) => {
        if (!clean(tie) || key(tie) === own || !isPerson(tie)) return false;
        const forms = [clean(tie), ...clean(tie).split(' ').filter((w) => w.length >= 3)];
        return forms.some((f) => {
            const re = new RegExp(`(^|[^\\p{L}])${esc(f)}(?!\\p{L})('s\\b)?`, 'giu');
            let m;
            while ((m = re.exec(t))) if (!m[2]) return true;
            return false;
        });
    });
}

// Those of `people` not present at `since` or later.
export function absentSince(people, present, since) {
    return (people ?? []).filter((p) => presentAt(present, p) < since);
}

// The library's people by name (not factions, places or threads), as the
// guidance last read them. Not pure: set each time the guidance is built.
let PEOPLE = new Set();
export function rememberPeople(names) { PEOPLE = new Set((names ?? []).map(key).filter(Boolean)); }
export function isKnownPerson(tie) {
    if (!PEOPLE.size) return true;
    const t = key(tie);
    if (PEOPLE.has(t)) return true;
    const words = t.split(' ');
    return [...PEOPLE].some((n) => { const has = n.split(' '); return words.every((w) => has.includes(w)); });
}

// Of `people` (each a list of their names), those `text` names - any of
// their names, or a word of one that is not a title, as a whole word. Pure.
const TITLES = /^(?:the|of|and|dr\.?|mr\.?|mrs\.?|ms\.?|lt\.?|sgt\.?|captain|chief|lord|lady|ser|sir|king|queen|doctor|officer|agent|old|young|big|little)$/i;
export function shownOf(people, text) {
    const t = String(text ?? '').replace(/’/g, "'");
    return (people ?? []).filter((names) => (names ?? []).some((n) => {
        const forms = [clean(n), ...clean(n).split(' ').filter((w) => !TITLES.test(w))].filter((f) => f.length >= 3);
        return forms.some((f) => new RegExp(`(^|[^\\p{L}])${esc(f)}(?!\\p{L})`, 'iu').test(t));
    }));
}
