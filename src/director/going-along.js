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

export const MOVING = /\b(?:left|leav(?:e|es|ing)|head(?:s|ed|ing)?|went|go(?:es|ing)?|walk(?:s|ed|ing)?|stepp?(?:s|ed|ing)?|arriv(?:e|es|ed|ing)|enter(?:s|ed|ing)?|(?:made|makes|making) (?:his|her|their|my|our) way|came|comes|set(?:s|ting)? (?:out|off)|slip(?:s|ped|ping)?|(?:took|takes) the (?:stairs|elevator|lift)|exit(?:s|ed|ing)?|return(?:s|ed|ing)?|rush(?:es|ed|ing)?|ran|run(?:s|ning)?|hurr(?:y|ies|ied|ying)|dash(?:es|ed|ing)?|climb(?:s|ed|ing)?|descend(?:s|ed|ing)?|fle(?:e|es|d)|follow(?:s|ed|ing)?)\b/i;
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
const GOES_OFF = /\b(?:left|leav(?:e|es|ing)|exit(?:s|ed|ing)?|(?:walk|step|head|went|go|ran|run|rush|hurr|slip|duck|burst|dash)\w*\s+(?:out|outside|away|off|back|up|down|through|into)|outside|stairs|elevator|lift|climb\w*|descend\w*|set(?:s|ting)?\s+(?:out|off))\b/i;
export function goesThere(text, placeNames = []) {
    const said = sentencesOf(text);
    return said.some((s) => GOES_OFF.test(s) || placeNames.map(clean).filter((n) => n.length >= 3).some((n) => new RegExp(`(^|[^\\p{L}])${escape(n)}(?!\\p{L})`, 'iu').test(s)));
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
