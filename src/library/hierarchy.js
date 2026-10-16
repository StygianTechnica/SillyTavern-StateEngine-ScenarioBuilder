// The location hierarchy (spec 6.5) as pure functions over a parent map
// `{ [locationId]: parentId | null }`. A forest: one parent at most, never
// a cycle (SB-140). No SillyTavern imports (SB-804).
//
// Until State Engine has a location.parent field (SB-145) the parent map
// comes from Scenario Builder's setting document (entries[id].parentId).

// The parent of `id`, or null.
const parentOf = (parents, id) => (parents && typeof parents[id] === 'string' && parents[id]) || null;

// Ancestors of `id`, nearest first. Stops at a cycle in malformed data.
export function ancestors(parents, id) {
    const out = [];
    const seen = new Set([id]);
    let current = parentOf(parents, id);
    while (current && !seen.has(current)) {
        out.push(current);
        seen.add(current);
        current = parentOf(parents, current);
    }
    return out;
}

// Root first, ending with `id`.
export function pathOf(parents, id) {
    return id ? [...ancestors(parents, id)].reverse().concat(id) : [];
}

// True when making `newParentId` the parent of `id` would form a cycle
// (including a location becoming its own parent).
export function wouldCreateCycle(parents, id, newParentId) {
    if (!newParentId) return false;
    if (newParentId === id) return true;
    return ancestors(parents, newParentId).includes(id);
}

// Direct children of `id` among `ids`.
export function childrenOf(parents, ids, id) {
    return ids.filter((other) => parentOf(parents, other) === id);
}

// Every descendant of `id` among `ids`.
export function descendantsOf(parents, ids, id) {
    const out = [];
    const queue = [id];
    const seen = new Set([id]);
    while (queue.length) {
        const current = queue.shift();
        for (const child of childrenOf(parents, ids, current)) {
            if (seen.has(child)) continue;
            seen.add(child);
            out.push(child);
            queue.push(child);
        }
    }
    return out;
}

// The parent map after deleting `id`: its children move up to its own
// parent, so nothing is orphaned (SB-140). Returns a new map.
export function parentsAfterDelete(parents, id) {
    const next = { ...parents };
    const up = parentOf(parents, id);
    for (const [child, parent] of Object.entries(next)) if (parent === id) next[child] = up;
    delete next[id];
    return next;
}

// A forest for display: nodes `[{ id, name }]` -> roots `[{ id, name,
// children: [...] }]`, siblings sorted by name. A node whose parent is not
// among the nodes (deleted, or another setting's) is shown as a root.
export function buildTree(nodes, parents) {
    const byId = new Map(nodes.map((n) => [n.id, { ...n, children: [] }]));
    const roots = [];
    for (const node of byId.values()) {
        const parent = parentOf(parents, node.id);
        const holder = parent && byId.has(parent) && !wouldCreateCycle(parents, node.id, parent) ? byId.get(parent).children : roots;
        holder.push(node);
    }
    const sort = (list) => {
        list.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
        for (const n of list) sort(n.children);
        return list;
    };
    return sort(roots);
}

// How `b` stands to `a` in the tree: 'same', 'ancestor' (b contains a),
// 'descendant' (b is inside a), 'sibling' (same parent), 'related' (same
// root), or 'unrelated'.
export function relation(parents, a, b) {
    if (!a || !b) return 'unrelated';
    if (a === b) return 'same';
    const upA = ancestors(parents, a);
    if (upA.includes(b)) return 'ancestor';
    const upB = ancestors(parents, b);
    if (upB.includes(a)) return 'descendant';
    if (parentOf(parents, a) && parentOf(parents, a) === parentOf(parents, b)) return 'sibling';
    const rootA = upA.length ? upA[upA.length - 1] : a;
    const rootB = upB.length ? upB[upB.length - 1] : b;
    return rootA === rootB ? 'related' : 'unrelated';
}

// "in" relation for presence (SB-143): a character in a room is also in its
// building and city. True when `place` is `inside` or one of its ancestors.
export function isWithin(parents, inside, place) {
    return inside === place || ancestors(parents, inside).includes(place);
}

const ENV_KEYS = Object.freeze(['climate', 'lighting', 'rules']);

// The environment `id` has, each value inherited down the tree unless a
// nearer location overrides it (SB-142). `envById: { [id]: { climate,
// lighting, rules } }`. -> { [key]: { value, from } } for the set keys
// (`from` = the location the value comes from).
export function inheritedEnvironment(parents, envById, id) {
    const out = {};
    for (const place of pathOf(parents, id).reverse()) {
        const env = envById?.[place];
        if (!env) continue;
        for (const key of ENV_KEYS) {
            const value = typeof env[key] === 'string' ? env[key].trim() : '';
            if (value && !out[key]) out[key] = { value, from: place };
        }
    }
    return out;
}
