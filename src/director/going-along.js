// Who goes along when the player character moves the scene a short way -
// and who does not. Pure.
//
// Assassins Inc: "Cyril gave a wave, then left Adam Miller's office to head
// to the armory" and then "Cyril arrived at the Armory alone" - and the whole
// office came along, because everyone the last four messages named counted
// as going with him on a short hop.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const unquoted = (text) => String(text ?? '').replace(/"[^"]*"|“[^”]*”/g, ' ').replace(/’/g, "'");
const sentencesOf = (text) => clean(unquoted(text)).match(/[^.!?…]+[.!?…]*/g) ?? [];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const MOVING = /\b(?:left|leav(?:e|es|ing)|head(?:s|ed|ing)?|went|go(?:es|ing)?|walk(?:s|ed|ing)?|stepp?(?:s|ed|ing)?|arriv(?:e|es|ed|ing)|enter(?:s|ed|ing)?|(?:made|makes|making) (?:his|her|their|my|our) way|came|comes|set(?:s|ting)? (?:out|off)|slip(?:s|ped|ping)?|(?:took|takes) the (?:stairs|elevator|lift)|exit(?:s|ed|ing)?|return(?:s|ed|ing)?|rush(?:es|ed|ing)?|ran|run(?:s|ning)?|hurr(?:y|ies|ied|ying)|dash(?:es|ed|ing)?|climb(?:s|ed|ing)?|descend(?:s|ed|ing)?|fle(?:e|es|d)|follow(?:s|ed|ing)?|sprint(?:s|ed|ing)?|bolt(?:s|ed|ing)?|jog(?:s|ged|ging)?)\b/i;
const ALONE = /\b(?:alone|by (?:him|her|them|my|your|our)sel(?:f|ves)|on (?:his|her|their|my|our) own|solo|without (?:them|anyone|any of them|the others|company|an escort)|leaving (?:them|the others|everyone)(?: behind)?|left (?:them|the others|everyone) behind)\b/i;
const NOT_ALONE = /\b(?:not|never|no longer|hardly)\s+(?:\w+\s+)?alone\b|n't\s+(?:\w+\s+)?alone\b|\bnot (?:on (?:his|her|their|my|our) own|by (?:him|her|them|my|our)sel(?:f|ves))\b/i;
// Words that take the whole company along: the party rushing down the stairs.
const TOGETHER = /\b(?:they|we|us|the group|the party|the team|everyone|all of (?:us|them)|together|companions|the others (?:follow|went|came|go))\b/i;

// A move between a place and one around or inside it: 'out' (to the place
// around it), 'in' (to a part of it) or ''. parents: id -> parent id.
export function sameGround(parents = {}, from = '', to = '') {
    const inside = (a, b) => {
        const seen = new Set();
        for (let at = parents[a]; at && !seen.has(at); at = parents[at]) {
            if (at === b) return true;
            seen.add(at);
        }
        return false;
    };
    if (!from || !to || from === to) return '';
    return inside(from, to) ? 'out' : inside(to, from) ? 'in' : '';
}

// Whether the player's post really goes somewhere: it leaves, or names where
// the scene is said to be going. "He went to the console" crosses the room:
// the game master's MOVE to the museum around it left Tadam, at gunpoint,
// "behind" - and the one before had left Zane.
const GOES_OFF = /\b(?:left|leav(?:e|es|ing)|exit(?:s|ed|ing)?|(?:walk|step|head|went|go|ran|run|rush|hurr|slip|duck|burst|dash|sprint|bolt|jog|rac(?:e|es|ed|ing)|charg|storm|strode|strid|march|hustl|fle)\w*\s+(?:out|outside|away|off|back|up|down|through|into)|outside|stairs|elevator|lift|climb\w*|descend\w*|set(?:s|ting)?\s+(?:out|off))\b/i;
// Whether the text names one of these places.
export function namesPlace(text, placeNames = []) {
    return sentencesOf(text).some((s) => placeNames.map(clean).filter((n) => n.length >= 3).some((n) => new RegExp(`(^|[^\\p{L}])${escape(n)}(?!\\p{L})`, 'iu').test(s)));
}
export function goesThere(text, placeNames = []) {
    return sentencesOf(text).some((s) => GOES_OFF.test(s)) || namesPlace(text, placeNames);
}

// The player character running out on those here: "He added, turning and
// then sprinting out the door" - Zane stayed, holding Tadam at gunpoint, and
// both went along. Only their own going, in a sentence that opens with them,
// out of where they are ("stepped out of the shadows" leaves nothing).
const QUICK = 'walk|step|head|went|go|ran|run|rush|hurr|slip|duck|burst|dash|sprint|bolt|jog|rac(?:e|es|ed|ing)|charg|storm|strode|strid|march|hustl|fle';
const FLEET = 'walk|ran|run|rush|hurr|dash|sprint|bolt|jog|rac(?:e|es|ed|ing)|storm|march|fle';
const ROOM = 'room|office|building|house|hall|chamber|lab|laboratory|bar|tavern|inn|shop|store|cabin|cell|vault|armory|armoury|bridge|apartment|warehouse|camp|temple|church|library|kitchen|study|den|hideout|base';
const LEAVES = new RegExp(String.raw`\b(?:(?:${QUICK})\w*\s+out\b(?!\s+of\s+(?:(?:the|his|her|their|my)\s+)?(?:shadows?|way|line|cover|sight|reach|range|hiding|time|luck|breath|ammo|options)\b)|(?:${FLEET})\w*\s+(?:off|away)\b|(?:left|leav(?:e|es|ing)|exit(?:ed|ing|s)?)\s+(?:the|this)\s+(?:[\w'-]+\s+)?(?:${ROOM})\b)`, 'i');
const STAYS = /\b(?:stay|wait|hold|guard|keep|watch)\w*\b/i;
const opening = (s) => s.replace(/^[\s"“”*_-]+/, '').replace(/^(?:then|and)\s+/i, '');
function ownLeaving(s, playerNames, people) {
    const m = LEAVES.exec(s);
    if (!m) return false;
    const open = opening(s);
    const theirs = /^(?:he|she|they|i)\b/i.test(open) || playerNames.map(clean).filter(Boolean).some((n) => new RegExp(`^${escape(n)}(?!\\p{L})`, 'iu').test(open));
    const before = s.slice(0, m.index);
    const named = (people ?? []).flatMap((p) => p.names ?? []).map(clean).filter((n) => n.length >= 2).some((n) => new RegExp(`(^|[^\\p{L}])${escape(n)}(?!\\p{L})`, 'iu').test(before));
    // Someone named first means it is their going - but not "Cyril and Zane
    // ran out" or "He told Zane to stay and ran out".
    const stillTheirs = /^[\p{L}'-]+\s+(?:and|with)\s+/iu.test(open) || /\b(?:and|then)\s+$/i.test(before);
    return theirs && (!named || stillTheirs) && !/\b(?:as|while|when|watch\w*|saw|sees?)\b/i.test(before);
}
export function leavesHere(text, { playerNames = [], people = [] } = {}) {
    return !goesTogether(text) && sentencesOf(text).some((s) => ownLeaving(s, playerNames, people));
}

// Those here the player character's leaving leaves behind: all but those
// the post shows going with them. people: [{ id, names }] -> [id]
export function leftBehind(text, { playerNames = [], people = [] } = {}) {
    if (!leavesHere(text, { playerNames, people })) return [];
    const said = sentencesOf(text);
    const nameIn = (s, p) => (p.names ?? []).map(clean).filter((n) => n.length >= 2).some((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}(?!\\p{L})`, 'iu').test(s));
    const told = new Set((people ?? []).filter((p) => said.some((s) => STAYS.test(s) && nameIn(s, p))).map((p) => p.id));
    const going = new Set(namedGoing(text, people).filter((id) => !told.has(id)));
    return (people ?? []).map((p) => p.id).filter((id) => !going.has(id));
}

// Whether the text has the player character moving off on their own
// (outside speech): "arrived at the Armory alone", "left them behind".
// playerNames: the sentence must name them or speak of them as he, she, I...
// ("Doc went alone to the lab" is not the player going alone).
export function goesAlone(text, playerNames = []) {
    const names = playerNames.map(clean).filter(Boolean);
    const theirs = (s) => !names.length || /^\s*(?:then\s+|and\s+)?(?:he|she|they|i|we)\b/i.test(s) || names.some((n) => new RegExp(`(^|[^\\p{L}])${escape(n)}(?!\\p{L})`, 'iu').test(s));
    return sentencesOf(text).some((s) => MOVING.test(s) && ALONE.test(s) && !NOT_ALONE.test(s) && theirs(s));
}

// Whether a sentence that moves names the whole company going.
export function goesTogether(text) {
    return sentencesOf(text).some((s) => MOVING.test(s) && TOGETHER.test(s) && !ALONE.test(s));
}

// The people the text shows going along: named in a sentence that moves,
// as a person - not as the owner of a place ("Adam Miller's office"), and
// not as someone left ("left Adam behind", "left Doc with Galice").
// people: [{ id, names: [..] }] -> [id]
export function namedGoing(text, people) {
    const going = sentencesOf(text).filter((s) => MOVING.test(s));
    const out = [];
    const not = new Set(leftOut(text, people));
    for (const p of people ?? []) {
        if (not.has(p.id)) continue;
        const names = (p.names ?? []).map(clean).filter((n) => n.length >= 2);
        const shown = going.some((s) => names.some((n) => {
            const at = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}(?!\\p{L})('s\\b)?`, 'giu');
            let m;
            while ((m = at.exec(s))) {
                if (m[2]) continue;
                const before = s.slice(0, m.index + m[1].length);
                if (/\b(?:left|leaving|leaves|leave)\s+(?:\w+\s+){0,2}$/i.test(before)) continue;
                return true;
            }
            return false;
        }));
        if (shown) out.push(p.id);
    }
    return out;
}

// Those the text leaves out of the going: "They went all together, without
// Doc and Galice to the art museum" - Doc and Galice were taken along, and
// Inji and Zane, the ones going, were left behind. people: [{ id, names }]
// -> [id]
const LEFT_OUT = /\b(?:without|except(?: for)?|but not|minus|apart from|other than|leaving(?: behind)?|left behind)\s+([^.,;!?]*?)(?=\s+(?:to|into|for|toward|towards|at|behind)\b|[.,;!?]|$)/gi;
export function leftOut(text, people) {
    const clauses = [...unquoted(text).matchAll(LEFT_OUT)].map((m) => m[1]);
    if (!clauses.length) return [];
    return (people ?? []).filter((p) => (p.names ?? []).map(clean).filter((n) => n.length >= 2)
        .some((n) => clauses.some((c) => new RegExp(String.raw`(^|[^\p{L}\p{N}])${escape(n)}(?!\p{L})`, 'iu').test(c)))).map((p) => p.id);
}
