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
