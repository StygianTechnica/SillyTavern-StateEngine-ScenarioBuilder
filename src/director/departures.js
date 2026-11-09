// Who the latest chat shows walking out. The director's ENTERS is also for
// "anyone the latest chat shows in the scene" - and a reply in which
// Riven storms out still shows him there, so he was brought straight back
// (Assassins Inc), and then stayed: a turn that never names someone does
// not take them out. Pure.

const DEPART = /\b(?:left (?:the|through|without|for|as|in)|leaves|leaving|(?:walk|storm|stalk|stride|head|slip|step|stomp|march|hurri)(?:s|ed|es)? (?:out|off|away)|strode (?:out|off|away)|stepped (?:out|off|away)|exit(?:s|ed)?|depart(?:s|ed)?|turn(?:s|ed)? on (?:his|her|their) heels?|vanish(?:es|ed)|disappear(?:s|ed))\b/i;
const ARRIVE = /\b(?:return(?:s|ed)?|c[oa]me(?:s)? back|walk(?:s|ed)? (?:in|back)|enter(?:s|ed)?|arriv(?:es|ed)|step(?:s|ped)? (?:in|back)|reappear(?:s|ed)|rejoin(?:s|ed)?)\b/i;

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// True when the last sentence naming one of `names` that says they come
// or go has them going.
export function shownLeaving(names, text) {
    const list = (names ?? []).map((n) => String(n ?? '').trim()).filter((n) => n.length > 1);
    if (!list.length) return false;
    const named = new RegExp(`\\b(?:${list.map(escape).join('|')})\\b`, 'i');
    const sentences = String(text ?? '').split(/(?<=[.!?…"”])\s+|\n+/);
    let last = '';
    for (const s of sentences) {
        if (!named.test(s)) continue;
        if (ARRIVE.test(s)) last = 'in';
        else if (DEPART.test(s)) last = 'out';
    }
    return last === 'out';
}

// Whether a post shows someone coming into the scene, or being called or
// met there - not only talked about, remembered or doubted. Cyril's "He
// didn't think Enrique would be there in person", and his memories of how
// Enrique mocked him, walked Enrique Medina into Adam's briefing room
// (Assassins Inc).
const COMING = /\b(?:arriv(?:e|es|ed|ing)|enter(?:s|ed|ing)?|c[oa]me(?:s)? (?:in|back|over|up|through|into|along)|coming (?:in|back|over|through|into|along)|(?:walk|stroll|stride|step|burst|storm|slip|march|wander|limp|stumble|hurri)(?:s|ed|es|ing)? (?:in|into|through|over|up|back)|strode (?:in|into|through|over|up)|show(?:s|ed|ing)? up|turn(?:s|ed|ing)? up|appear(?:s|ed|ing)?|join(?:s|ed|ing)?|(?:call|wave|beckon|summon|bring|brought|fetch)(?:s|ed|es|ing)?\b[^.!?\n]{0,30}\b(?:over|in|here|along|up)|turn(?:s|ed)? to (?:face )?|look(?:s|ed)? (?:at|up at|over at)|(?:said|says|asked|asks|told|tells|whispered|snapped|growled) to|(?:greet(?:s|ed)?|fac(?:es|ed|ing)|hug(?:s|ged)?|kiss(?:es|ed)?|punch(?:es|ed)?|shove[sd]?|grab(?:s|bed)?))\b/i;
const DOUBT = /\bkiss(?:es)? (?:my|our|your|his|her|their) (?:ass|arse|butt|feet)\b|\b(?:not|n't|never|no|if|unless|would|might|could|maybe|perhaps|probably|likely|whether|think|thought|doubt(?:ed)?|wonder(?:ed)?|rememb(?:er|ered)|recall(?:ed)?|used to|had (?:been|once|always|often|never))\b|n't\b|'d\b/i;

// Whether a briefing's own prose has someone arrive where the scene is:
// "Zane suddenly appeared on the scene, having arrived to discuss tonight's
// mission plans" - with no ENTERS line, so the narrator, told the player was
// alone, wrote around him. Only plain arrivals, never a sentence set
// elsewhere ("Back at HQ, Doc came in").
const ARRIVES = /\b(?:arriv(?:e|es|ed|ing)|appear(?:s|ed|ing)|show(?:s|ed)? up|turn(?:s|ed)? up|walk(?:s|ed)? in(?:to)?|stride[s]? in|strode in(?:to)?|step(?:s|ped)? in(?:to)?|c[oa]me(?:s)? in(?:to)?|enter(?:s|ed)|join(?:s|ed))\b/i;
const ELSEWHERE = /\b(?:meanwhile|elsewhere|back at|back in|across (?:the )?(?:city|town|base)|at (?:the )?(?:hq|headquarters|office)|outside the|in the distance|off[- ]screen)\b/i;
export function shownArriving(names, text) {
    const list = (names ?? []).map((n) => String(n ?? '').trim()).filter((n) => n.length > 1);
    if (!list.length) return false;
    const named = new RegExp(`\\b(?:${list.map(escape).join('|')})\\b`, 'i');
    return String(text ?? '').split(/(?<=[.!?…"”])\s+|\n+/).some((s) => named.test(s) && ARRIVES.test(s) && !ELSEWHERE.test(s) && !DOUBT.test(s));
}

// A post's own narration, without what people say: only that can bring in
// someone their sheet keeps away. "Enrique can kiss my ass," Cyril snarled -
// and Enrique, kissed, stepped out of the shadows beside a moving car.
export const narrationOf = (text) => String(text ?? '').replace(/"[^"]*"|“[^”]*”/g, ' ');

export function shownComing(names, text) {
    const list = (names ?? []).map((n) => String(n ?? '').trim()).filter((n) => n.length > 1);
    if (!list.length) return false;
    const named = new RegExp(`\\b(?:${list.map(escape).join('|')})\\b`, 'i');
    return String(text ?? '').split(/(?<=[.!?…"”])\s+|\n+/).some((s) => named.test(s) && COMING.test(s) && !DOUBT.test(s));
}
