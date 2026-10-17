// Lore - the pure half: which lore entries matter in the scene right now
// (for the guidance and sb__canon_lore), and how Archivist's compiled lore
// maps onto library entries (src/library/lore-sync.js). No SillyTavern
// imports.

const lower = (s) => String(s ?? '').trim().toLowerCase();

// Words that say nothing about which lore is meant.
const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'in', 'on', 'to', 'for', 'old', 'new', 'great', 'first', 'last', 'lord', 'lady', 'king', 'queen', 'house', 'order', 'war', 'age', 'fall', 'rise', 'god', 'gods', 'oath', 'pact', 'lore', 'legend', 'tale', 'story', 'history']);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `name` in `text` as whole words (case-insensitive; "Elyon's" counts).
export function namedIn(text, name) {
    const n = lower(name).replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (n.length < 3) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(String(text ?? ''));
}

// `word` in `text` capitalized, as a name is.
function properIn(text, word) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escape(word)})(?=$|[^\\p{L}\\p{N}])`, 'giu');
    for (const m of String(text ?? '').matchAll(re)) if (/^\p{Lu}/u.test(m[2])) return true;
    return false;
}

// The words of a name that identify it: 4+ letters, not common words.
function keyWords(name) {
    return lower(name).replace(/\([^)]*\)/g, ' ').split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/'s$/, '')).filter((w) => w.length >= 4 && !STOP.has(w));
}

// A name and its aliases, each also split at commas and dashes: imported
// entries often read "Elyon, the Sovereign of Dawn", or hold several
// aliases in one string, and the story says just "Elyon".
const namesOf = (o) => {
    const all = [o.name, ...(o.aliases ?? o.base?.aliases ?? [])].filter((n) => typeof n === 'string' && n.trim());
    const parts = all.flatMap((n) => n.split(/\s*(?:,|;|\s[-–—]\s)\s*/)).map((p) => p.replace(/^(?:the|a|an)\s+/i, '').trim()).filter((p) => p.length >= 3);
    return [...new Set([...all.map((n) => n.trim()), ...parts])];
};
const relatedOf = (o) => {
    const ids = o.related_entity_ids ?? o.base?.related_entity_ids ?? [];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : (typeof ids === 'string' && ids ? [ids] : []);
};

// Lore relevant to the scene, most relevant first, at most `max`.
// entries: lore objects; ctx: {
//   recentText,   the last messages' text
//   sceneIds,     the location, the places it is in, the people present
//   mentioned: [{ id, names: [name] }]   other library objects (people,
//                 places...) that the recent text can name
// } -> [{ entry, score, why }]
// A lore entry matters when its name or an alias is in the recent text,
// when every distinctive word of its name is ("Elyon" names "Elyon, the
// Radiant"), when it is tied to someone or something the recent text names,
// or when it is tied to the scene.
export function relevantLore(entries, { recentText = '', sceneIds = [], mentioned = [] } = {}, max = 8) {
    const scene = new Set(sceneIds);
    const text = String(recentText ?? '');
    const lowText = lower(text);
    const namedObjects = new Map();
    for (const m of mentioned ?? []) {
        const hit = (m.names ?? []).find((n) => namedIn(text, n));
        if (hit) namedObjects.set(m.id, hit);
    }
    const out = [];
    for (const entry of entries ?? []) {
        const names = namesOf(entry);
        const why = [];
        let score = 0;
        const full = names.find((n) => namedIn(text, n));
        if (full) { score += 4; why.push(`"${full}" was just mentioned`); }
        else {
            // Every distinctive word of the name, or else one of 5+ letters
            // the text uses as a proper noun ("Elyon" for "The Covenant of
            // Elyon").
            const word = names.map(keyWords).find((ws) => ws.length && ws.every((w) => namedIn(lowText, w)));
            const one = !word && names.flatMap(keyWords).find((w) => w.length >= 5 && properIn(text, w));
            if (word) { score += 3; why.push(`"${word.join(' ')}" was just mentioned`); }
            else if (one) { score += 2; why.push(`"${one}" was just mentioned`); }
        }
        const related = relatedOf(entry);
        const viaNamed = related.filter((id) => namedObjects.has(id) && !scene.has(id));
        if (viaNamed.length) { score += 2; why.push(`tied to ${viaNamed.map((id) => namedObjects.get(id)).join(', ')}, just mentioned`); }
        if (related.some((id) => scene.has(id))) { score += 1; why.push('tied to this place or someone here'); }
        if (score) out.push({ entry, score, why: why.join('; ') });
    }
    // Most relevant first; ties keep the library's order.
    return out.map((x, i) => ({ ...x, i })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, max).map(({ i, ...x }) => x);
}

// ---------------------------------------------------------------- Archivist

// What to do with one of Archivist's compiled lore entries
// ({ id, kind, name, text, entity, involved }). `lore`: the library's lore
// entries; `links`: { [archivistEntryId]: loreId }; `dismissed`: Set of
// Archivist ids; `rejected(name)`. ->
//   { action: 'skip' } | { action: 'dismiss' } (its entry was deleted) |
//   { action: 'link', id } | { action: 'create', data }
export function planLore(world, { lore = [], links = {}, dismissed = new Set(), rejected = () => false } = {}) {
    if (!world?.id || !String(world.name ?? '').trim() || dismissed.has(world.id)) return { action: 'skip' };
    const linked = links[world.id];
    if (linked) return lore.some((l) => l.id === linked) ? { action: 'link', id: linked } : { action: 'dismiss' };
    if (world.entity?.type === 'lore' && lore.some((l) => l.id === world.entity.id)) return { action: 'link', id: world.entity.id };
    const same = lore.find((l) => namesOf(l).some((n) => lower(n) === lower(world.name)));
    if (same) return { action: 'link', id: same.id };
    if (rejected(world.name)) return { action: 'skip' };
    return { action: 'create', data: { name: String(world.name).trim(), description: String(world.text ?? '').trim(), related_entity_ids: involvedIds(world) } };
}

// The objects a world entry names or involves (not lore itself).
export function involvedIds(world) {
    const ids = [world?.entity, ...(world?.involved ?? [])].filter((e) => e?.id && e.type !== 'lore').map((e) => e.id);
    return [...new Set(ids)];
}

// The patch for a linked entry when Archivist's text has moved on: the
// description follows only while nobody has edited it since the last sync
// (`synced`: the text written then); new involved objects are added.
// -> { patch, synced } (patch empty when nothing changes)
export function loreUpdate(entry, world, synced = '') {
    const patch = {};
    const text = String(world?.text ?? '').trim();
    const current = String(entry?.base?.description ?? entry?.description ?? '').trim();
    let nextSynced = synced;
    if (text && text !== synced && (current === synced || !current)) { if (text !== current) patch.description = text; nextSynced = text; }
    const have = relatedOf(entry);
    const add = involvedIds(world).filter((id) => !have.includes(id) && id !== entry?.id);
    if (add.length) patch.related_entity_ids = [...have, ...add];
    return { patch, synced: nextSynced };
}
