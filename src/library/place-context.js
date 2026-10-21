// Places in context (docs/ROADMAP.md, the user's priorities): "the ruins"
// is the Roadside Ruins when that is where the story is, not the temple
// ruins the party is heading for - aliases alone cannot tell them apart.
// And a new place's likely parent, offered on its sheet. Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const STOP = new Set('the and for with from into onto that this their them they his her its him she are was were has have had will would can could must about over under after before while then than when where which who whom what how also just only very more most some any all each other another again place room part inside outside near'.split(' '));

// The distinctive words of a name: lower-cased, at least four letters, a
// plural's "s" off ("ruins" and "ruin" are one word).
export function placeWords(text) {
    return new Set((clean(text).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
        .map((w) => w.replace(/'s$/, '').replace(/^'+|'+$/g, ''))
        .filter((w) => w.length >= 4 && !STOP.has(w))
        .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)));
}

const namesOf = (p) => [p?.name, ...(p?.aliases ?? p?.base?.aliases ?? [])].filter(Boolean);
const wordsOf = (p) => new Set(namesOf(p).flatMap((n) => [...placeWords(n)]));

// The places around one, without travelling: itself, the places it is
// inside, the places inside it, and the places beside it (the same parent).
// A place a route leads to is not one of them - that is a journey, and the
// story has to say it arrived. -> [id] nearest first.
export function nearPlaces(currentId, { places = [], parents = {} } = {}) {
    if (!currentId) return [];
    const out = [currentId];
    for (let p = parents[currentId], guard = 0; p && guard < 20; p = parents[p], guard += 1) out.push(p);
    for (const pl of places) if (parents[pl.id] === currentId) out.push(pl.id);
    const parent = parents[currentId];
    if (parent) for (const pl of places) if (parents[pl.id] === parent) out.push(pl.id);
    return [...new Set(out)];
}

// The story's reading has the scene jump to `observedId`, a place not near
// the current one. When a near place shares the word the story used ("the
// ruins") and the story said nothing that only the far place has ("temple"),
// the near place is meant. -> { id, why } or null (the reading stands).
// recentText: the latest turn - the player's message and the reply.
export function contextualPlace({ observedId, currentId, places = [], parents = {}, recentText = '' } = {}) {
    if (!observedId || !currentId || observedId === currentId) return null;
    const near = nearPlaces(currentId, { places, parents });
    if (near.includes(observedId)) return null;
    const far = places.find((p) => p.id === observedId);
    if (!far) return null;
    const farWords = wordsOf(far);
    const said = placeWords(recentText);
    let best = null;
    for (const [rank, id] of near.entries()) {
        const p = places.find((x) => x.id === id);
        if (!p) continue;
        const mine = wordsOf(p);
        const shared = [...farWords].filter((w) => mine.has(w) && said.has(w));
        if (!shared.length) continue;
        // The story named something only the far place has: it is meant.
        const farOnly = [...farWords].filter((w) => !mine.has(w));
        if (farOnly.some((w) => said.has(w))) return null;
        if (!best || shared.length > best.shared.length || (shared.length === best.shared.length && rank < best.rank)) best = { id, rank, shared, name: p.name };
    }
    return best ? { id: best.id, why: `"${best.shared.join(' ')}" here is ${best.name}, not ${far.name}` } : null;
}

// Likely parents for a place that has none, best first: a known place its
// name or description names ("the gate of Niamh's Fortress"), the place the
// scene was in when it first appeared, and that place's own parent.
// place: { id, name, description }; history: the chat's canonical history.
// -> [{ id, why }] at most three.
export function suggestParents(place, { places = [], parents = {}, history = [] } = {}) {
    if (!place?.id) return [];
    const out = [];
    const add = (id, why) => {
        if (!id || id === place.id || out.some((o) => o.id === id)) return;
        // Never a place inside this one (no loops).
        for (let p = parents[id], guard = 0; p && guard < 20; p = parents[p], guard += 1) if (p === place.id) return;
        if (places.some((p) => p.id === id)) out.push({ id, why });
    };
    const text = `${clean(place.name)} ${clean(place.description)}`.toLowerCase();
    const named = places
        .filter((p) => p.id !== place.id)
        .map((p) => ({ p, len: Math.max(0, ...namesOf(p).map((n) => clean(n).toLowerCase()).filter((n) => n.length >= 4 && new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'u').test(text)).map((n) => n.length)) }))
        .filter((x) => x.len > 0)
        .sort((a, b) => b.len - a.len);
    for (const { p } of named) add(p.id, `its ${clean(place.description).toLowerCase().includes(clean(p.name).toLowerCase()) ? 'description' : 'name'} names ${p.name}`);
    // Where the scene was when it first came into the scene.
    const arrived = (history ?? []).find((h) => h?.after?.locationId === place.id && h?.before?.locationId);
    if (arrived) {
        const from = arrived.before.locationId;
        add(from, `the scene came here from ${places.find((p) => p.id === from)?.name ?? 'there'}`);
        add(parents[from], `beside ${places.find((p) => p.id === from)?.name ?? 'the place before'}`);
    }
    return out.slice(0, 3);
}
