// A scene left hanging while the story steps away from it - a vision, a
// dream, a trial in another realm, a memory - and comes back. The God War
// chat lost one: Maziel had Varyn's body and the others bound in the
// graveyard, Remus prayed to Elyon for Varyn's life, and a trial in an
// ethereal chamber ran longer than the director's eight recent messages.
// By its end nothing remembered the graveyard; the people left there were
// pulled into the chamber by name, and there was no way back.
//
// The scene the story stepped away from is kept here (doc.suspended, the
// newest last): its place, who was there, its title and what was going on,
// and what was left hanging. The director sees it every reply until the
// story returns (BACK, or a MOVE to that place), and the scene is put back
// as it was. Those waiting there stay out of the detour. Pure.

// How many scenes may wait at once (a dream inside a vision is the most).
export const SUSPEND_LIMIT = 3;
// A detour the story never came back from is let go after this many replies.
export const SUSPEND_TURNS = 60;

// Words for stepping out of the world the scene is in - read in the latest
// messages when the director moved the scene without an AWAY line.
const AWAY_WORDS = /\b(?:visions?|dreams?|dreamscape|dreaming|trance|nightmare|(?:through|beyond|past|behind) (?:a|the) veil|veil (?:that )?(?:separat|between)\w*|another world|other world|otherworld\w*|spirit (?:world|realm|plane)|astral|ethereal|transported|pulled (?:through|into|from)|memor(?:y|ies) of)\b/i;

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const lower = (text) => clean(text).toLowerCase();

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

// A stored entry, made safe.
export function normalizeSuspended(list) {
    return (Array.isArray(list) ? list : []).filter(isObject).map((s) => ({
        locationId: typeof s.locationId === 'string' ? s.locationId : '',
        castIds: ids(s.castIds),
        creatureIds: ids(s.creatureIds),
        creatureCounts: isObject(s.creatureCounts) ? Object.fromEntries(Object.entries(s.creatureCounts).filter(([k, v]) => k && Number.isInteger(v) && v > 0)) : {},
        indoor: s.indoor === true ? true : s.indoor === false ? false : null,
        sceneTitle: clean(s.sceneTitle).slice(0, 120),
        sceneSummary: clean(s.sceneSummary).slice(0, 400),
        hanging: clean(s.hanging).slice(0, 400),
        turn: Number.isInteger(s.turn) ? s.turn : 0,
        at: typeof s.at === 'string' ? s.at : '',
    })).slice(-SUSPEND_LIMIT);
}

// The entries still waiting: those the story has not left too long.
export function stillWaiting(list, turn) {
    return normalizeSuspended(list).filter((s) => !Number.isInteger(turn) || turn - s.turn <= SUSPEND_TURNS);
}

// Whether the story has stepped away this reply: the director said so
// (AWAY), or it moved the scene to a place the story has never been
// (newPlace) and the latest messages step out of the world (a vision, a
// veil between worlds). Coming back from a vision to a place already in
// play is not stepping away.
export function steppedAway({ away = '', moved = false, newPlace = false, latestText = '' } = {}) {
    if (clean(away)) return true;
    return !!moved && !!newPlace && AWAY_WORDS.test(String(latestText ?? ''));
}

// The list with the scene `canonical` added - unless the newest one already
// waits at that place (a message sent again after a revert).
export function suspend(list, canonical, { hanging = '', turn = 0, at = '' } = {}) {
    const now = normalizeSuspended(list);
    const c = canonical ?? {};
    if (!c.locationId && !ids(c.castIds).length) return now;
    if (now.length && now[now.length - 1].locationId === (c.locationId ?? '')) return now;
    return normalizeSuspended([...now, {
        locationId: c.locationId ?? '', castIds: c.castIds, creatureIds: c.creatureIds, creatureCounts: c.creatureCounts, indoor: c.indoor,
        sceneTitle: c.sceneTitle, sceneSummary: c.sceneSummary, hanging, turn, at,
    }]);
}

// The waiting scene the story goes back to this reply, or null: on BACK,
// or a MOVE to where it waits. matchesPlace(name, locationId) -> bool.
export function returnTo(list, { back = '', movePlace = '', matchesPlace = () => false } = {}) {
    const now = normalizeSuspended(list);
    const top = now[now.length - 1];
    if (!top) return null;
    if (clean(back)) return top;
    if (clean(movePlace) && top.locationId && matchesPlace(movePlace, top.locationId)) return top;
    return null;
}

// The scene put back as it was. The player character comes back with the
// story; the dead do not. -> a canonical patch.
export function restorePatch(entry, { playerId = '', dead = [] } = {}) {
    const gone = new Set(dead);
    const castIds = [...new Set([...(playerId ? [playerId] : []), ...entry.castIds])].filter((id) => !gone.has(id));
    const patch = { locationId: entry.locationId, castIds, creatureIds: entry.creatureIds.filter((id) => !gone.has(id)), creatureCounts: entry.creatureCounts };
    if (entry.indoor !== null) patch.indoor = entry.indoor;
    return patch;
}

// Those waiting in the newest scene who are not in the detour: they stay
// where the story left them. -> Set of ids.
export function waitingIds(list, castIds = []) {
    const top = normalizeSuspended(list).at(-1);
    if (!top) return new Set();
    const here = new Set(castIds);
    return new Set([...top.castIds, ...top.creatureIds].filter((id) => !here.has(id)));
}

// `names` without those who are waiting elsewhere. people: [{ id, name, aliases }].
export function withoutWaiting(names, people, waiting) {
    if (!waiting?.size) return [...(names ?? [])];
    const idOf = (name) => (people ?? []).find((p) => [p.name, ...(p.aliases ?? p.base?.aliases ?? [])].some((n) => lower(n) === lower(name)))?.id ?? null;
    return (names ?? []).filter((n) => !waiting.has(idOf(n)));
}

// The waiting scenes for the director, newest first. nameOf(id) -> name.
export function suspendedText(list, nameOf = () => '') {
    const now = normalizeSuspended(list);
    if (!now.length) return '';
    return [...now].reverse().map((s, i) => {
        const where = clean(nameOf(s.locationId));
        const who = [...s.castIds, ...s.creatureIds].map((id) => clean(nameOf(id))).filter(Boolean);
        return [
            `${i === 0 ? '- The story stepped away from' : '- Before that, from'} ${s.sceneTitle ? `"${s.sceneTitle}"` : 'a scene'}${where ? ` at ${where}` : ''}.`,
            who.length ? `There: ${who.join(', ')}.` : '',
            s.sceneSummary ? `What was going on: ${s.sceneSummary}` : '',
            s.hanging ? `Left hanging: ${s.hanging}` : '',
        ].filter(Boolean).join(' ');
    }).join('\n');
}
