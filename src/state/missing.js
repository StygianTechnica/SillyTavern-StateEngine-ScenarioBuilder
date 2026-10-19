// The canonical scene pointing at objects that no longer exist - the pure
// half. An object can be deleted outside Scenario Builder (State Engine's
// own review rejects a detected place by deleting it), leaving the scene
// "at" a place nobody can name. canonical.js healMissing() checks the
// objects and applies what missingPatch() works out. No SillyTavern imports.

// canonical: the chat's canonical state; history: its history entries
// ({ before, after } snapshots of the keys each change touched), oldest
// first; exists(id): whether the object is still there.
// -> { patch, gone: { locationId, castIds: [id], creatureIds: [id] } }
//    patch: {} when nothing needs changing. A missing location falls back
//    to the most recent place in the history that still exists, else ''.
export function missingPatch(canonical, history, exists) {
    const patch = {};
    const gone = { locationId: '', castIds: [], creatureIds: [] };
    const c = canonical ?? {};
    if (c.locationId && !exists(c.locationId)) {
        gone.locationId = c.locationId;
        let fallback = '';
        for (const h of [...(history ?? [])].reverse()) {
            for (const id of [h?.after?.locationId, h?.before?.locationId]) {
                if (typeof id === 'string' && id && id !== c.locationId && exists(id)) { fallback = id; break; }
            }
            if (fallback) break;
        }
        patch.locationId = fallback;
    }
    for (const key of ['castIds', 'creatureIds']) {
        const ids = Array.isArray(c[key]) ? c[key] : [];
        const missing = ids.filter((id) => !exists(id));
        if (!missing.length) continue;
        gone[key] = missing;
        patch[key] = ids.filter((id) => exists(id));
    }
    return { patch, gone };
}

// The ids missingPatch() may ask about: the scene's, and every location
// the history has held.
export function idsToCheck(canonical, history) {
    const out = new Set();
    const c = canonical ?? {};
    if (c.locationId) out.add(c.locationId);
    for (const id of [...(c.castIds ?? []), ...(c.creatureIds ?? [])]) if (id) out.add(id);
    for (const h of history ?? []) for (const id of [h?.after?.locationId, h?.before?.locationId]) if (typeof id === 'string' && id) out.add(id);
    return [...out];
}
