// What undoing a message's changes puts back (SB-224): each key goes back
// to what it held before the first of those changes - unless something
// that is NOT being undone changed it since (the user setting the date by
// hand, say). That later change stands: a swipe never takes back what the
// user did after the message.
//   history: the chat doc's history, oldest first
//   undoIds: the ids of the entries being undone
//   canonical: the canonical state now
// -> patch of the keys to restore
export function revertPatch(history, undoIds, canonical) {
    const undo = new Set(undoIds);
    const first = history.findIndex((h) => undo.has(h.id));
    if (first === -1) return {};
    const kept = new Set();
    for (const h of history.slice(first)) {
        if (undo.has(h.id) || h.undone) continue;
        for (const key of Object.keys(h.after ?? {})) kept.add(key);
    }
    let restored = { ...canonical };
    for (const h of [...history].reverse()) if (undo.has(h.id)) restored = { ...restored, ...h.before };
    const patch = {};
    for (const key of Object.keys(restored)) {
        if (kept.has(key)) continue;
        if (JSON.stringify(restored[key]) !== JSON.stringify(canonical[key])) patch[key] = restored[key];
    }
    return patch;
}
