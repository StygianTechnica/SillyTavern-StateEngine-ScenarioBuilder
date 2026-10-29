// Where people are, for the director's "who could turn up". Someone left far
// behind (Graxx in Redhaven, days away) must not wander into a crypt in
// Belatorre because they were in the story once or are tied to someone
// here. Their last place is read from the chat's canonical history; only
// those last seen near here, and not long ago, can turn up - everyone else
// is ELSEWHERE: thought of, talked about, sending word, but not here. Pure.

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

// The people not here, split: `near` - seen here or close by not long ago
// (within the history kept), who could turn up; `elsewhere` - left far away,
// not seen in a long while, or only tied to someone here, who cannot.
// characters: [{ id, name, role }]; relations: [{ otherId, kind }] per id
// (relationsFor); recent: how many history entries back still counts as
// "not long ago"; arrived: those the world meanwhile has brought near
// (src/world/model.js arrivals - someone who came looking), who can turn up
// wherever they were last seen.
export function whoCouldTurnUp({ characters = [], castIds = [], locationId = '', parents = {}, history = [], current = null, inPlay = [], tiesOf = () => [], recent = 120, arrived = [] } = {}) {
    const present = new Set(castIds);
    const seen = lastSeen(history, current);
    const total = (history ?? []).length;
    const named = new Map(characters.map((c) => [c.id, c]));
    const near = [];
    const elsewhere = [];
    const placed = new Set();
    const came = new Set(arrived);
    const put = (id, why) => {
        if (present.has(id) || placed.has(id) || !named.has(id)) return;
        placed.add(id);
        const c = named.get(id);
        if (came.has(id)) { near.push({ id, name: c.name, role: c.base?.role ?? c.role ?? '', why: 'came looking, off scene' }); return; }
        const s = seen.get(id);
        const fresh = s && total - s.index <= recent;
        // Not knowing where the scene is, nothing can be ruled out.
        if (!locationId || (fresh && placesNear(s.locationId, locationId, parents))) near.push({ id, name: c.name, role: c.base?.role ?? c.role ?? '', why });
        else elsewhere.push({ id, name: c.name, role: c.base?.role ?? c.role ?? '', lastAt: s?.locationId ?? '', why: s ? (fresh ? 'left behind elsewhere' : 'not seen in a long while') : why });
    };
    for (const id of arrived) put(id, 'came looking, off scene');
    for (const id of inPlay ?? []) put(id, 'seen earlier in this story');
    for (const id of castIds) for (const r of tiesOf(id)) put(r.otherId, `tied to someone here (${r.kind})`);
    return { near, elsewhere };
}
