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
        // A split: the group went separate ways in the same world, and those
        // here carry on here. Not a detour to come back from.
        split: s.split === true,
        // A detour out of the world (a vision, a dream) - the story may come
        // back by itself. null: an older entry, read from its own words.
        otherworld: s.otherworld === true ? true : s.otherworld === false ? false : null,
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
export function suspend(list, canonical, { hanging = '', turn = 0, at = '', split = false, otherworld = null } = {}) {
    const now = normalizeSuspended(list);
    const c = canonical ?? {};
    if (!c.locationId && !ids(c.castIds).length) return now;
    // A split where a split already waits: those left there now.
    if (split) {
        const kept = now.filter((s) => !(s.split && s.locationId === (c.locationId ?? '')));
        if (!ids(c.castIds).length) return kept;
        return normalizeSuspended([...kept, {
            locationId: c.locationId ?? '', castIds: c.castIds, creatureIds: [], creatureCounts: {}, indoor: c.indoor,
            sceneTitle: c.sceneTitle, sceneSummary: c.sceneSummary, hanging, split: true, otherworld: false, turn, at,
        }]);
    }
    if (now.length && now[now.length - 1].locationId === (c.locationId ?? '')) return now;
    return normalizeSuspended([...now, {
        locationId: c.locationId ?? '', castIds: c.castIds, creatureIds: c.creatureIds, creatureCounts: c.creatureCounts, indoor: c.indoor,
        sceneTitle: c.sceneTitle, sceneSummary: c.sceneSummary, hanging, otherworld, turn, at,
    }]);
}

// An AWAY line that says nothing is left hanging is no AWAY: "Nothing left
// hanging" put the museum corridors on hold when Cyril went to the storage
// rooms.
export const saysNothingHangs = (text) => /^(?:nothing|none|no one|nobody|n\/a)\b(?:\s+(?:is|was|left|hanging|remains|waits|pending)\b.*)?[.!]?$/i.test(clean(text));

// Words for the group going separate ways, in the latest messages: "split
// up to cover more ground", "you take the east wing", "wait here".
const SPLIT_WORDS = /\b(?:split(?:s|ting)?\s+up|split(?:s|ting)?\s+(?:into|the (?:group|team|party))|splitting|separate(?:ly| ways)|go (?:our|their|your) (?:own|separate) ways|divide (?:and|up)|cover more ground|fan(?:s|ned|ning)? out|(?:you|I'll|i will|we'll) take the|stay (?:here|behind|put)|wait (?:here|for (?:me|us))|hold (?:here|this position)|keep watch (?:here|on)|go on ahead|meet (?:back )?up|regroup (?:at|in|later))\b/i;
export const splitsUp = (text) => SPLIT_WORDS.test(String(text ?? '').replace(/’/g, "'"));

// Whether the detour is out of the world (a vision, a dream, a realm) - the
// story comes back from it by itself.
export const outOfWorld = (entry) => entry?.otherworld ?? AWAY_WORDS.test([entry?.hanging, entry?.sceneSummary, entry?.sceneTitle].join(' '));

// The waiting scene the story goes back to this reply, or null: on BACK,
// or a MOVE to where it waits. matchesPlace(name, locationId) -> bool.
// Splits are not gone back to this way: the scene moves there as to any
// place, and those there are met again (src/director/run.js).
// goesBack(entry) -> bool: whether the player's message goes back there -
// the only way back from a step away in the same world. The museum: the
// game master wrote BACK while Cyril kept searching the storage rooms, and
// he was put back beside Inji and Zane.
export function returnTo(list, { back = '', movePlace = '', matchesPlace = () => false, goesBack = () => true } = {}) {
    const now = normalizeSuspended(list).filter((s) => !s.split);
    const top = now[now.length - 1];
    if (!top) return null;
    const allowed = outOfWorld(top) || goesBack(top);
    if (clean(back) && allowed) return top;
    if (clean(movePlace) && top.locationId && matchesPlace(movePlace, top.locationId) && allowed) return top;
    return null;
}

// Whether the text has the player character going back to where `entry`
// waits: a sentence that moves, theirs, naming the place, someone waiting
// there, or going back ("returned", "rejoined", "headed back").
// moving: the going-words regex (src/director/going-along.js).
export function wentBack(text, { placeNames = [], waitingNames = [], playerNames = [], moving } = {}) {
    const sentences = clean(String(text ?? '').replace(/"[^"]*"|“[^”]*”/g, ' ').replace(/’/g, "'")).match(/[^.!?…]+[.!?…]*/g) ?? [];
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const has = (s, n) => clean(n).length >= 2 && new RegExp(`(^|[^\\p{L}])${escape(clean(n))}(?!\\p{L})`, 'iu').test(s);
    const theirs = (s) => !playerNames.length || /^\s*(?:then\s+|and\s+)?(?:he|she|they|i|we)\b/i.test(s) || playerNames.some((n) => has(s, n));
    const BACK = /\b(?:(?:went|go(?:es|ing)?|head(?:s|ed|ing)?|came|comes?|walk(?:s|ed|ing)?|ran|runs?|hurr(?:y|ies|ied)|dash(?:es|ed)?|(?:made|makes) (?:his|her|their|my|our) way) back\b|return(?:s|ed|ing)? to|rejoin(?:s|ed|ing)?|regroup(?:s|ed|ing)? with|catch(?:es|ing)? up with|caught up with|meets? up with|met up with|doubl(?:e|es|ed) back)\b/i;
    return sentences.some((s) => theirs(s) && (BACK.test(s)
        || (!!moving?.test(s) && (placeNames.some((n) => has(s, n)) || waitingNames.some((n) => has(s, n))))));
}

// A return to the place the scene is already in: no detour to come back
// from, so nothing is put back. Restoring the cast there dropped whoever
// had come in since - Adam Miller, the newcomer a whole volume waited on,
// gone the reply after he walked in, and Doc and Galice before him.
export const returnsHere = (entry, locationId) => !!entry?.locationId && entry.locationId === locationId;

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
// Those left elsewhere by a split count too, wherever they wait.
export function waitingIds(list, castIds = [], { splits = true } = {}) {
    const now = normalizeSuspended(list);
    const top = now.filter((s) => !s.split).at(-1);
    const here = new Set(castIds);
    const ids = [...(top ? [...top.castIds, ...top.creatureIds] : []), ...(splits ? now.filter((s) => s.split).flatMap((s) => s.castIds) : [])];
    return new Set(ids.filter((id) => !here.has(id)));
}

// The list without these people in its splits (they came to the player
// character, or the scene went to them); a split left empty is let go.
export function rejoined(list, ids) {
    const gone = new Set(ids ?? []);
    return normalizeSuspended(list)
        .map((s) => (s.split ? { ...s, castIds: s.castIds.filter((id) => !gone.has(id)) } : s))
        .filter((s) => !s.split || s.castIds.length);
}

// The split waiting at this place, or null.
export const splitAt = (list, locationId) => (locationId ? normalizeSuspended(list).find((s) => s.split && s.locationId === locationId) ?? null : null);

// `names` without those who are waiting elsewhere. people: [{ id, name, aliases }].
export function withoutWaiting(names, people, waiting) {
    if (!waiting?.size) return [...(names ?? [])];
    const idOf = (name) => (people ?? []).find((p) => [p.name, ...(p.aliases ?? p.base?.aliases ?? [])].some((n) => lower(n) === lower(name)))?.id ?? null;
    return (names ?? []).filter((n) => !waiting.has(idOf(n)));
}

// The waiting scenes for the director, newest first. nameOf(id) -> name.
export function suspendedText(list, nameOf = () => '') {
    const now = normalizeSuspended(list).filter((s) => !s.split);
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

// Those the group left elsewhere when it split, for the director: where
// each waits and what they were about. nameOf(id) -> name.
export function splitText(list, nameOf = () => '') {
    return normalizeSuspended(list).filter((s) => s.split).reverse().map((s) => {
        const where = clean(nameOf(s.locationId));
        const who = s.castIds.map((id) => clean(nameOf(id))).filter(Boolean);
        if (!who.length) return '';
        return `- ${who.join(', ')} ${who.length === 1 ? 'is' : 'are'} at ${where || 'the place the group split'}${s.hanging ? ` (${s.hanging})` : ''}.`;
    }).filter(Boolean).join('\n');
}
