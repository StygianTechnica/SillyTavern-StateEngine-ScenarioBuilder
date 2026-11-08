// Wings: factions inside a faction - the Moriarty family inside the Medina
// Syndicate, a chapter of a knightly order, a cell of a resistance, a
// division of a corporation. Any number of them, and a wing may have wings
// of its own. A wing is an ordinary faction with an authored relationship
// "part of" to the faction it sits in (one parent each). Its people are of
// the wing and, through it, of the whole.
//
// What it is for: a job one of them orders is crewed from their own wing -
// a Moriarty man is not on Enrique's museum job (src/ops/run.js). Pure.

export const WING_KIND = 'part of';

const isWingTie = (r) => String(r?.kind ?? '').trim().toLowerCase() === WING_KIND;

// The faction `id` sits in, or ''. relations: the setting's; factionIds:
// a Set of faction ids, so only a faction-to-faction tie counts.
export function parentOf(id, relations = [], factionIds = null) {
    const r = (relations ?? []).find((x) => x.from === id && isWingTie(x) && (!factionIds || factionIds.has(x.to)));
    return r?.to ?? '';
}

// The wings directly inside faction `id`.
export function wingsOf(id, relations = [], factionIds = null) {
    return (relations ?? []).filter((x) => x.to === id && isWingTie(x) && (!factionIds || factionIds.has(x.from))).map((x) => x.from);
}

// Every wing inside `id`, at any depth (a loop in the ties is cut).
export function allWingsOf(id, relations = [], factionIds = null) {
    const out = [];
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
        for (const w of wingsOf(queue.shift(), relations, factionIds)) {
            if (seen.has(w)) continue;
            seen.add(w);
            out.push(w);
            queue.push(w);
        }
    }
    return out;
}

// The factions above `id`, nearest first.
export function ancestorsOf(id, relations = [], factionIds = null) {
    const out = [];
    const seen = new Set([id]);
    for (let at = parentOf(id, relations, factionIds); at && !seen.has(at); at = parentOf(at, relations, factionIds)) {
        seen.add(at);
        out.push(at);
    }
    return out;
}

// Which wing of `rootId` a person stands in: the deepest wing under it
// they belong to, or '' (the core - of the whole, in no wing).
// memberships: Map personId -> [factionId] (src/library/faction-sync.js).
export function wingOfPerson(personId, rootId, memberships, relations = [], factionIds = null) {
    const theirs = new Set(memberships?.get(personId) ?? []);
    const under = allWingsOf(rootId, relations, factionIds).filter((w) => theirs.has(w));
    if (!under.length) return '';
    // The deepest: one with no other of theirs inside it.
    return under.find((w) => !allWingsOf(w, relations, factionIds).some((x) => theirs.has(x))) ?? under[0];
}

// A job's people, wing by wing. Whose job it is (the first of `people`
// marked tied who is not the head of it all) decides the wing that crews
// it; anyone of another wing - another department, chapter, family - is
// marked otherWing (its name, or "the core of <side>"): the combat
// department does not bring the research department on a raid, unless the
// job needs one of their specialists (src/ops/generate.js shapePlan). The
// story tying someone to the job puts them on it whatever their wing.
// people: [{ wing, wingName, tied, head }]. -> { people, ownerWing }.
export function markOtherWings(people = [], { relations = [], factionIds = null, sideName = '' } = {}) {
    // Anyone of a wing owns a job they are tied to through it - its head
    // (Enrique heading his crew), or a boss of the whole who belongs to one
    // (Randrés, second in command, of the Moriarty family Tiago runs). The
    // head of the whole in no wing does not, just by being named (Serlos).
    const owner = people.find((p) => p.tied && (!p.head || p.wing)) ?? null;
    if (!owner) return { people: people.map((p) => ({ ...p })), ownerWing: '' };
    const ownerWing = owner.wing || '';
    return {
        ownerWing,
        people: people.map((p) => (p.tied || sameWing(p.wing || '', ownerWing, relations, factionIds)
            ? { ...p }
            : { ...p, otherWing: p.wingName || `the core of ${sideName || 'the faction'}` })),
    };
}

// Whether someone of wing `theirs` can work a job ordered from wing
// `owners` (both '' for the core): the same wing, or one inside it.
export function sameWing(theirs, owners, relations = [], factionIds = null) {
    if ((theirs || '') === (owners || '')) return true;
    if (!owners) return false;
    return !!theirs && ancestorsOf(theirs, relations, factionIds).includes(owners);
}
