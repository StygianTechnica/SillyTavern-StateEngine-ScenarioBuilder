// Merging two library entries (SB-113, SB-128, SB-140) - the pure half.
// State Engine merges the objects themselves (mergeObjects: the kept one
// gains the duplicate's name and aliases as aliases, fills its empty fields
// from it, and every variable and reference moves over). These functions
// carry over what Scenario Builder keeps by object id: the setting
// document's entry metadata, places inside, groups, the user's relations,
// routes, secrets and oaths, graph and map positions, the player character;
// and each chat document's scene, cast, links and history. No SillyTavern
// imports.

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const swap = (id, from, to) => (id === from ? to : id);
const swapList = (list, from, to) => [...new Set((Array.isArray(list) ? list : []).map((id) => swap(id, from, to)).filter(Boolean))];

// The places `id` is in, nearest first (cycle-safe).
function ancestors(entries, id) {
    const out = [];
    let at = entries[id]?.parentId ?? null;
    while (at && !out.includes(at) && out.length < 100) { out.push(at); at = entries[at]?.parentId ?? null; }
    return out;
}

// Entry metadata: the kept entry's own wins; what it lacks comes from the
// duplicate.
function mergeMeta(keep, dup) {
    const k = isObject(keep) ? keep : {};
    const d = isObject(dup) ? dup : {};
    const out = { ...d, ...k };
    const notes = [str(k.gmNotes).trim(), str(d.gmNotes).trim()].filter(Boolean);
    out.gmNotes = [...new Set(notes)].join('\n\n');
    out.tags = [...new Set([...(k.tags ?? []), ...(d.tags ?? [])])];
    out.pinned = k.pinned === true || d.pinned === true;
    out.canonLocked = k.canonLocked === true || d.canonLocked === true;
    // Named once either of them was named.
    out.provisional = k.provisional === true && d.provisional === true;
    out.origin = str(k.origin) || str(d.origin);
    out.source = str(k.source) || str(d.source);
    for (const key of ['climate', 'sky']) out[key] = str(k[key]) || str(d[key]);
    if (isObject(k.environment) || isObject(d.environment)) {
        const ke = isObject(k.environment) ? k.environment : {};
        const de = isObject(d.environment) ? d.environment : {};
        out.environment = { climate: str(ke.climate) || str(de.climate), lighting: str(ke.lighting) || str(de.lighting), rules: str(ke.rules) || str(de.rules) };
    }
    if (isObject(k.realm) || isObject(d.realm)) {
        const kr = isObject(k.realm) ? k.realm : {};
        const dr = isObject(d.realm) ? d.realm : {};
        out.realm = Object.fromEntries(['worldType', 'magic', 'tech', 'notes'].map((f) => [f, str(kr[f]) || str(dr[f])]));
    }
    if (isObject(k.quest) || isObject(d.quest)) {
        const kq = isObject(k.quest) ? k.quest : {};
        const dq = isObject(d.quest) ? d.quest : {};
        out.quest = { ...dq, ...kq, objectives: (kq.objectives ?? []).length ? kq.objectives : (dq.objectives ?? []) };
        for (const f of ['type', 'priority', 'status', 'completion', 'abandon', 'threadId']) if (!kq[f] && dq[f]) out.quest[f] = dq[f];
    }
    return out;
}

// Rewrites the setting document (mutates `doc`): `dupId` is merged into
// `keepId`. Returns a short list of what moved, for the user.
export function mergeSettingDoc(doc, dupId, keepId) {
    if (!doc || dupId === keepId) return [];
    const moved = [];
    const entries = doc.entries ?? (doc.entries = {});
    const dup = entries[dupId];
    if (dup || entries[keepId]) {
        const meta = mergeMeta(entries[keepId], dup);
        // The kept place stays where it is; one with no parent takes the
        // duplicate's, unless that would put it inside itself.
        const dupParent = dup?.parentId ?? null;
        meta.parentId = entries[keepId]?.parentId ?? null;
        if (!meta.parentId && dupParent && dupParent !== keepId && !ancestors(entries, dupParent).includes(keepId)) meta.parentId = dupParent;
        entries[keepId] = meta;
    }
    // Places inside the duplicate move into the kept one - except the kept
    // one itself, or a place it is inside of (no cycles): those go up to
    // where the duplicate was.
    const keepAncestors = ancestors(entries, keepId);
    for (const [id, meta] of Object.entries(entries)) {
        if (id === dupId || meta?.parentId !== dupId) continue;
        if (id === keepId) { meta.parentId = entries[keepId].parentId === dupId ? (dup?.parentId ?? null) : entries[keepId].parentId; continue; }
        meta.parentId = keepAncestors.includes(id) ? (dup?.parentId ?? null) : keepId;
        moved.push('places inside');
    }
    if (entries[keepId]?.parentId === dupId) entries[keepId].parentId = dup?.parentId ?? null;
    delete entries[dupId];

    for (const group of doc.groups ?? []) group.entryIds = swapList(group.entryIds, dupId, keepId);
    doc.tracked = (doc.tracked ?? []).filter((id) => id !== dupId);
    if (!doc.tracked.includes(keepId) && dup) doc.tracked.push(keepId);

    // Relations: to and from the kept entry; none with itself, no repeats.
    const relations = [];
    for (const r of doc.relations ?? []) {
        const next = { ...r, from: swap(r.from, dupId, keepId), to: swap(r.to, dupId, keepId) };
        if (next.from === next.to) continue;
        if (next.from !== r.from || next.to !== r.to) moved.push('relationships');
        if (relations.some((x) => x.kind === next.kind && ((x.from === next.from && x.to === next.to) || (next.mutual && x.from === next.to && x.to === next.from)))) continue;
        relations.push(next);
    }
    doc.relations = relations;

    // Routes: the same, one route per pair of places.
    const routes = [];
    for (const r of doc.routes ?? []) {
        const next = { ...r, from: swap(r.from, dupId, keepId), to: swap(r.to, dupId, keepId) };
        if (next.from === next.to) continue;
        if (next.from !== r.from || next.to !== r.to) moved.push('routes');
        if (routes.some((x) => (x.from === next.from && x.to === next.to) || (x.from === next.to && x.to === next.from))) continue;
        routes.push(next);
    }
    doc.routes = routes;

    // Secrets and oaths: who knows, who swore, to whom.
    for (const k of doc.knowledge ?? []) {
        for (const field of ['knownBy', 'madeBy', 'madeTo']) {
            const next = swapList(k[field], dupId, keepId);
            if (next.join() !== (k[field] ?? []).join()) moved.push('secrets and oaths');
            k[field] = next;
        }
    }

    // Where the user placed it on the graph and the map.
    for (const key of ['positions', 'map']) {
        const at = doc.graph?.[key];
        if (!at) continue;
        if (!at[keepId] && at[dupId]) at[keepId] = at[dupId];
        delete at[dupId];
    }
    if (doc.playerId === dupId) doc.playerId = keepId;
    return [...new Set(moved)];
}

// Rewrites one chat document (mutates `d`): the scene, cast, links and
// lists that hold `dupId` now hold `keepId`.
export function mergeChatDoc(d, dupId, keepId) {
    if (!d || dupId === keepId) return;
    const c = d.canonical ?? {};
    if (c.locationId === dupId) c.locationId = keepId;
    c.castIds = swapList(c.castIds, dupId, keepId);
    c.creatureIds = swapList(c.creatureIds, dupId, keepId);
    d.inPlay = swapList(d.inPlay, dupId, keepId);
    if (Array.isArray(d.questsSeen)) d.questsSeen = swapList(d.questsSeen, dupId, keepId);
    // The story's current description: the kept entry's own wins.
    if (d.narrative?.[dupId]) {
        if (!d.narrative[keepId]) d.narrative[keepId] = d.narrative[dupId];
        delete d.narrative[dupId];
    }
    for (const key of ['questLinks', 'loreLinks']) {
        for (const [thread, id] of Object.entries(d[key] ?? {})) if (id === dupId) d[key][thread] = keepId;
    }
    // A merged duplicate is no longer "new from the story".
    d.adopted = (d.adopted ?? []).filter((a) => a.objectId !== dupId);
    d.candidates = (d.candidates ?? []).filter((x) => x.objectId !== dupId);
    for (const h of d.held ?? []) if (h.objectId === dupId) h.objectId = keepId;
    if (d.director?.created) d.director.created = d.director.created.filter((x) => x.id !== dupId);
    if (d.factionsWritten) {
        const fw = {};
        for (const [who, ids] of Object.entries(d.factionsWritten)) {
            const key = swap(who, dupId, keepId);
            fw[key] = swapList([...(fw[key] ?? []), ...swapList(ids, dupId, keepId)], dupId, keepId);
        }
        d.factionsWritten = fw;
    }
}

// Names to give the kept entry when the two are of different types (State
// Engine merges only within a type): the duplicate's name and aliases,
// leaving out what the kept one already answers to.
export function aliasesToAdd(keep, dup) {
    const have = new Set([keep?.name, ...(keep?.aliases ?? keep?.base?.aliases ?? [])].map((n) => str(n).trim().toLowerCase()).filter(Boolean));
    const out = [];
    for (const n of [dup?.name, ...(dup?.aliases ?? dup?.base?.aliases ?? [])]) {
        const name = str(n).trim();
        if (name && !have.has(name.toLowerCase())) { have.add(name.toLowerCase()); out.push(name); }
    }
    return out;
}

// How likely `other` is a duplicate of `entry`, for the merge picker: 3 the
// same name (or an alias), 2 one name inside the other, 1 a distinctive
// word in common, 0 none. Case, a leading article and punctuation aside.
const nameKey = (n) => str(n).toLowerCase().replace(/['’]/g, '').replace(/^(the|a|an)\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const namesOf = (o) => [o?.name, ...(o?.aliases ?? o?.base?.aliases ?? [])].map(nameKey).filter(Boolean);
const COMMON = new Set(['the', 'and', 'of', 'house', 'lord', 'lady', 'great', 'old', 'new', 'hall', 'room', 'city', 'town']);

export function duplicateScore(entry, other) {
    const a = namesOf(entry);
    const b = namesOf(other);
    if (!a.length || !b.length) return 0;
    if (a.some((x) => b.includes(x))) return 3;
    if (a.some((x) => b.some((y) => (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y))))) return 2;
    const words = (list) => new Set(list.flatMap((n) => n.split(' ')).filter((w) => w.length >= 4 && !COMMON.has(w)));
    const wb = words(b);
    return [...words(a)].some((w) => wb.has(w)) ? 1 : 0;
}
