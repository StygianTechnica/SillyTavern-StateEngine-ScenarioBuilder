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

// Whether the player's own message names the place: its name or an alias
// whole, or all but one of the words that make a long name ("White Cerberus
// common room" for "Common Room in White Cerberus Headquarters"). A move
// the player's message asked for is theirs, not the reply's: undoing the
// reply (a regenerate, an edit) leaves the scene where they put it - twice
// a regenerate sent Cyril back to Zane's Shack from the common room he had
// walked into, and the story stayed in the wrong building. names: the
// place's name and aliases.
const LITTLE = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'on', 'to', 'and']);
const wordsOf = (t) => (String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((w) => !LITTLE.has(w));
export function namesPlace(text, names) {
    const said = new Set(wordsOf(text));
    const flat = ` ${wordsOf(text).join(' ')} `;
    return (names ?? []).some((name) => {
        const words = wordsOf(name);
        if (!words.length) return false;
        if (flat.includes(` ${words.join(' ')} `)) return true;
        const hits = words.filter((w) => said.has(w)).length;
        return words.length >= 3 && hits >= Math.max(3, words.length - 1);
    });
}
