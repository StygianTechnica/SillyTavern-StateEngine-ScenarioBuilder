// Someone the player character's side has taken and still has with them: a
// prisoner in the scene, not yet handed over (for that, src/state/detained.js).
// Assassins Inc: Cyril said "We snagged Tadam" and "We can hand him to the
// police", and a few replies later Tadam stood beside Zane at the getaway car
// nodding along. Nothing carried it: the cast just listed him with the others.
// Read from the player's own posts each time, so nothing is stored and a later
// post that lets them go ends it. No model call. Pure.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sentencesOf = (text) => clean(text).replace(/[“”]/g, '"').match(/[^.!?…]+[.!?…]*"?/g)?.map(clean) ?? [];
const namesOf = (p) => [clean(p.name), clean(p.name).split(/[\s,]+/)[0], ...(p.aliases ?? []).map(clean)].filter((n) => n.length >= 3);
const nameRe = (p) => namesOf(p).map(escape).join('|');

const TOOK = String.raw`(?:snagged|nabbed|captured|caught|arrested|cuffed|handcuffed|tied up|zip-?tied|restrained|subdued|grabbed)`;
const NOT_REALLY = /\b(?:if|could|should|would|might|almost|nearly|never|not|didn'?t|hadn'?t|wish)\b/i;
const STILL_FREE = /^(?:['’]s|\s+(?:off|by|in|at|on|up|with|looking|red|sight|out)\b)/i;
const LET_GO = String.raw`(?:let|lets|letting|released?|freed?|freeing|cut|untied?)`;
const PLAN = /\b(?:police|cops?|authorit\w+|the law|the watch|magistrate|sheriff|constable|turn(?:ing)?\s+(?:him|her|them|\S+)\s+(?:in|over)|hand(?:ing)?\s+(?:him|her|them|\S+)\s+(?:to|over)|face the music|ransom|interrogat\w*)\b/i;
const OBJECT = /\b(?:him|her|them)\b/i;
const NEARBY_POSTS = 6;

function taken(s, p) {
    const m = new RegExp(String.raw`\b${TOOK}\s+(?:${nameRe(p)})(?!\p{L})`, 'iu').exec(s);
    // "Caught Tadam's eye", "caught Tadam off guard": caught is the loose one.
    if (m && !NOT_REALLY.test(s.slice(0, m.index)) && !(/^(?:caught|grabbed)/i.test(m[0]) && STILL_FREE.test(s.slice(m.index + m[0].length)))) return true;
    return new RegExp(String.raw`(?:^|[^\p{L}])(?:${nameRe(p)})(?:['’]s)?\s+(?:is|was)\s+(?:now\s+)?(?:our|my|a|the)\s+(?:prisoner|captive|hostage)\b|(?:prisoner|captive|hostage)\s+(?:${nameRe(p)})(?!\p{L})`, 'iu').test(s);
}
const letGo = (s, p) => new RegExp(String.raw`\b${LET_GO}\s+(?:${nameRe(p)})(?!\p{L})(?:\s+(?:go|free|loose))?|(?:^|[^\p{L}])(?:${nameRe(p)})\s+(?:escaped|got away|broke free|slipped free|was freed|was released)\b`, 'iu').test(s);
const named = (s, p) => new RegExp(String.raw`(?:^|[^\p{L}])(?:${nameRe(p)})(?!\p{L})`, 'iu').test(s);

// posts: the player's posts, oldest first. people: those to look for, not of
// the player character's side ({ name, aliases }).
// -> [{ name, plan }], plan: what the posts say is to be done with them, or ''.
export function captivesFrom(posts = [], people = []) {
    const out = [];
    const list = (posts ?? []).map(sentencesOf);
    for (const p of people ?? []) {
        if (!namesOf(p).length) continue;
        let at = -1;
        list.forEach((said, i) => {
            if (said.some((s) => letGo(s, p))) at = -1;
            else if (said.some((s) => taken(s, p))) at = i;
        });
        if (at < 0) continue;
        const near = list.map((said, i) => ({ said, i })).filter(({ i }) => Math.abs(i - at) <= NEARBY_POSTS);
        const all = near.flatMap(({ said }) => said).filter((s) => PLAN.test(s));
        const plan = all.filter((s) => named(s, p)).at(-1) ?? all.filter((s) => OBJECT.test(s)).at(-1) ?? '';
        out.push({ name: clean(p.name), plan: clean(plan).replace(/^"|"$/g, '').slice(0, 160) });
    }
    return out;
}

// The words for the note. side: whose prisoner ("Cyril's side").
export function captivesLine(captives = [], { side = '' } = {}) {
    const whose = clean(side) || 'the player character\'s side';
    return (captives ?? []).map((c) => `${c.name} is a prisoner of ${whose}, not one of them${c.plan ? ` (what is planned: ${c.plan.replace(/[.!?]+$/, '')})` : ''}: disarmed and watched, not free to go, no friend or helper to those holding them, and no part of their plans or celebrating - nobody treats ${c.name} as one of the team.`).join(' ');
}
