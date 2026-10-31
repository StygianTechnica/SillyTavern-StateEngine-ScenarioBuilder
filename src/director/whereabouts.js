// Where people are, for the director's "who could turn up". Someone left far
// behind (Graxx in Redhaven, days away) must not wander into a crypt in
// Belatorre because they were in the story once or are tied to someone
// here. Their last place is read from the chat's canonical history; only
// those last seen near here, and not long ago, can turn up - everyone else
// is ELSEWHERE: thought of, talked about, sending word, but not here. Pure.

import { memberKindOf } from '../library/faction-sync.js';

// Where each person was last in the scene: replays the history (oldest
// first). -> Map id -> { locationId, index } (index: the entry's place in
// the history; higher is more recent).
export function lastSeen(history = [], current = null) {
    const seen = new Map();
    let loc = null;
    let cast = null;
    const mark = (index) => { for (const id of cast ?? []) seen.set(id, { locationId: loc ?? '', index }); };
    (history ?? []).forEach((h, index) => {
        if (!h || h.undone) return;
        const before = h.before ?? {};
        const after = h.after ?? {};
        if (loc === null && typeof before.locationId === 'string') loc = before.locationId;
        if (cast === null && Array.isArray(before.castIds)) cast = before.castIds;
        mark(index);
        if (typeof after.locationId === 'string') loc = after.locationId;
        if (Array.isArray(after.castIds)) cast = after.castIds;
        mark(index);
    });
    // Those here now are seen here now.
    if (current) for (const id of current.castIds ?? []) seen.set(id, { locationId: current.locationId ?? '', index: (history ?? []).length });
    return seen;
}

// Who has shared a scene with whom: replays the history as lastSeen does.
// -> Map id -> Set of ids they were in the scene with.
export function sharedScenes(history = [], current = null) {
    const met = new Map();
    const meet = (cast) => {
        for (const a of cast ?? []) for (const b of cast ?? []) {
            if (a === b) continue;
            if (!met.has(a)) met.set(a, new Set());
            met.get(a).add(b);
        }
    };
    let cast = null;
    for (const h of history ?? []) {
        if (!h || h.undone) continue;
        if (cast === null && Array.isArray(h.before?.castIds)) cast = h.before.castIds;
        meet(cast);
        if (Array.isArray(h.after?.castIds)) cast = h.after.castIds;
        meet(cast);
    }
    if (current) meet(current.castIds);
    return met;
}

const chainOf = (parents, id) => {
    const out = [];
    for (let p = id, guard = 0; p && guard < 30; p = parents[p], guard += 1) out.push(p);
    return out;
};

// Whether two places are near: the same place, or both inside a place that
// is itself inside something (the same building, site or town) - not only
// the same world or continent at the top of the tree.
export function placesNear(a, b, parents = {}) {
    if (!a || !b) return false;
    if (a === b) return true;
    const up = new Set(chainOf(parents, a));
    const shared = chainOf(parents, b).find((p) => up.has(p));
    return !!shared && !!parents[shared];
}

// Ties that set someone against a place or put them out of it.
const AGAINST = /\b(rival|enem|oppos|hunt|against|hate|target|former|ex-|once\b|fled|flee|exile|banish|sabotag|spy|spies|infiltrat|raid|attack|thorn)/i;

// Those who belong where the scene is, though the story may never have
// shown them: tied to the place, or a place it is in, by a relationship
// the user wrote (The Signal Box - leader -> Adam Miller), or of a faction
// based there (The Signal Box - occupant -> White Cerberus), its leaders
// first. Without it the head of the crew whose headquarters this is never
// turned up there, because he had never been in a scene. The top of the
// tree (the world, the city everything is in) ties no one to the scene.
// placeIds: the scene's place and the places it is in; parents: id ->
// parent id; characters: [{ id }]; factions: [{ id, name, base? }];
// relations: [{ from, to, kind }]; memberships: Map characterId ->
// [factionId]; placeName(id) -> name. -> [{ id, why }]
export function belongingHere({ placeIds = [], parents = {}, characters = [], factions = [], relations = [], memberships = new Map(), placeName = () => '' } = {}) {
    const places = new Set((placeIds ?? []).filter((id) => id && parents[id]));
    if (!places.size) return [];
    const people = new Set((characters ?? []).map((c) => c.id));
    const kindOf = (r) => String(r?.kind ?? '').replace(/\s+/g, ' ').trim();
    const where = (id) => placeName(id) || 'here';
    const found = [];
    // Based at a place: a tie either way between the faction and it, or the
    // faction's own record naming it.
    const home = new Map();
    for (const f of factions ?? []) {
        const tie = (relations ?? []).find((r) => !AGAINST.test(kindOf(r)) && ((r.from === f.id && places.has(r.to)) || (r.to === f.id && places.has(r.from))));
        const record = f.base ?? f;
        const held = tie ? (places.has(tie.to) ? tie.to : tie.from)
            : [...places].find((p) => Object.values(record).some((v) => (Array.isArray(v) ? v : [v]).includes(p)));
        if (held) home.set(f.id, held);
    }
    for (const [factionId, placeId] of home) {
        const f = factions.find((x) => x.id === factionId);
        for (const c of characters ?? []) {
            if (!(memberships.get(c.id) ?? []).includes(factionId)) continue;
            const leads = (relations ?? []).some((r) => r.from === c.id && r.to === factionId && memberKindOf(kindOf(r)) === 'leads');
            found.push({ id: c.id, rank: leads ? 0 : 2, why: `${leads ? 'leads' : 'of'} ${f.name}, based at ${where(placeId)}` });
        }
    }
    for (const r of relations ?? []) {
        const kind = kindOf(r);
        if (!kind || AGAINST.test(kind)) continue;
        const [placeId, personId] = places.has(r.from) && people.has(r.to) ? [r.from, r.to] : places.has(r.to) && people.has(r.from) ? [r.to, r.from] : [];
        if (placeId) found.push({ id: personId, rank: 1, why: `tied to ${where(placeId)} (${kind})` });
    }
    const out = [];
    const seen = new Set();
    for (const f of found.sort((a, b) => a.rank - b.rank)) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        out.push({ id: f.id, why: f.why });
    }
    return out;
}

// The people not here, split: `near` - seen here or close by not long ago
// (within the history kept), who could turn up; `elsewhere` - left far away,
// not seen in a long while, or only tied to someone here, who cannot.
// characters: [{ id, name, role }]; relations: [{ otherId, kind }] per id
// (relationsFor); recent: how many history entries back still counts as
// "not long ago"; arrived: those the world meanwhile has brought near
// (src/world/model.js arrivals - someone who came looking), who can turn up
// wherever they were last seen; moved: the world meanwhile's changes to
// people (src/world/situations.js overlays.people - { [id]: { locationId,
// where, state } }): where they went off scene counts as where they were
// last seen, now, and how they are now goes with them. belongs: those who
// belong here (belongingHere - [{ id, why }]): they can turn up unless the
// story left them far away not long ago.
export function whoCouldTurnUp({ characters = [], castIds = [], locationId = '', parents = {}, history = [], current = null, inPlay = [], tiesOf = () => [], recent = 120, arrived = [], moved = {}, belongs = [] } = {}) {
    const present = new Set(castIds);
    const seen = lastSeen(history, current);
    const total = (history ?? []).length;
    for (const [id, m] of Object.entries(moved ?? {})) if (m?.locationId && !present.has(id)) seen.set(id, { locationId: m.locationId, index: total });
    const named = new Map(characters.map((c) => [c.id, c]));
    const near = [];
    const elsewhere = [];
    const placed = new Set();
    const came = new Set(arrived);
    const put = (id, why, home = false) => {
        if (present.has(id) || placed.has(id) || !named.has(id)) return;
        placed.add(id);
        const c = named.get(id);
        const now = moved?.[id]?.state ? `; now ${String(moved[id].state).replace(/[.!?]+$/, '')}` : '';
        if (came.has(id)) { near.push({ id, name: c.name, role: c.base?.role ?? c.role ?? '', why: `came looking, off scene${now}` }); return; }
        const s = seen.get(id);
        const fresh = s && total - s.index <= recent;
        const nearHere = fresh && placesNear(s.locationId, locationId, parents);
        // Not knowing where the scene is, nothing can be ruled out; someone
        // at home here is here unless the story just left them far away.
        if (!locationId || nearHere || (home && !fresh)) near.push({ id, name: c.name, role: c.base?.role ?? c.role ?? '', why: `${why}${now}` });
        else elsewhere.push({ id, name: c.name, role: c.base?.role ?? c.role ?? '', lastAt: s?.locationId ?? '', why: `${s ? (fresh ? 'left behind elsewhere' : 'not seen in a long while') : why}${now}` });
    };
    for (const id of arrived) put(id, 'came looking, off scene');
    for (const b of belongs ?? []) put(b.id, b.why, true);
    for (const id of inPlay ?? []) put(id, 'seen earlier in this story');
    for (const id of castIds) for (const r of tiesOf(id)) put(r.otherId, `tied to someone here (${r.kind})`);
    return { near, elsewhere };
}
