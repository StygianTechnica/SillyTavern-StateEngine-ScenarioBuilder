// Happenings the story sets for a time - "they're planning a major heist
// tonight at the Arcadia Museum" - and holding them to it. Pure.
//
// Assassins Inc: the heist was said to be tonight, Cyril said "we have until
// this evening to prepare", and no SET line took it in. In the morning, Doc
// came over the armory intercom: Enrique's crew were closing in, move out
// within the hour - while the team was still waiting on Inji's word from
// Alonso.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => { const t = clean(text); return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}...`; };

const EVENT = /\b(?:heist|raid|robbery|break-in|job|operation|mission|meeting|meet|auction|gala|party|ball|feast|festival|ceremony|wedding|funeral|trial|test|exam|duel|fight|match|bout|tournament|race|exchange|hand-?off|drop|deal|ambush|attack|assault|strike|briefing|rendezvous|appointment|dinner|execution|ritual|summit|negotiations?|show|concert|launch|hearing|sentencing|council)\b/i;
const NUM = '(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|a few|several|a couple of)';
const WHEN = new RegExp(`\\b(?:tonight|this (?:morning|afternoon|evening)|(?:the )?day after tomorrow|tomorrow(?: (?:morning|afternoon|evening|night))?|(?:at|by|before|after) (?:dawn|dusk|noon|midday|midnight|nightfall|sundown|sunset|sunrise|first light)|next week|in ${NUM} (?:days?|weeks?))\\b`, 'i');
// Not set: called off, only wished for, asked about, or past.
const NOT_SET = /\b(?:not|never|no longer|cancel(?:s|led|ed)?|called off|call(?:ing)? off|postponed|if|unless|would have|could have|wish|wonder|maybe|perhaps|last night|yesterday)\b|n't\b/i;

// -> [{ what, when }]: each sentence naming a happening and its time.
// max: how many, the latest kept.
export function timedHappenings(text, max = 3) {
    const plain = String(text ?? '').replace(/[“”]/g, '"').replace(/’/g, "'").replace(/\s+/g, ' ');
    const sentences = plain.match(/[^.!?…]+[.!?…]*/g) ?? [];
    const out = [];
    for (const raw of sentences) {
        const s = clean(raw.replace(/"/g, ''));
        if (/\?\s*$/.test(s) || !EVENT.test(s) || NOT_SET.test(s)) continue;
        const when = s.match(WHEN)?.[0];
        if (!when) continue;
        const what = cut(s.replace(/^(?:so|and|but|well|look|okay|ok|now|it seems|it looks like)[,\s]+/i, ''), 220);
        if (!out.some((x) => x.what === what)) out.push({ what, when: when.toLowerCase() });
    }
    return out.slice(-max);
}

const PARTS = ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'];
export const partIndex = (part) => PARTS.indexOf(clean(part).toLowerCase());
// When a happening may begin: "tonight" from the evening on.
const startsAt = (when) => { const i = partIndex(when); return i === PARTS.indexOf('night') ? PARTS.indexOf('evening') : i; };

// Today's happenings set for a later part of the day than now: they have
// not begun. items: agenda items { text, day, when }. -> [item]
export function notYet(items, { today, nowPart }) {
    const now = partIndex(nowPart);
    if (!Number.isInteger(today) || now < 0) return [];
    return (items ?? []).filter((x) => x.day === today && startsAt(x.when) > now);
}

// The narrator's hold, for the game master's note: the happening the latest
// messages speak of, not yet begun. -> '' or one sentence.
export function notYetLine(items, recentText) {
    const words = (t) => new Set(clean(t).toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const recent = words(recentText);
    const touched = (items ?? []).filter((x) => [...words(x.text)].filter((w) => recent.has(w) && EVENT.test(w)).length > 0);
    if (!touched.length) return '';
    const each = touched.slice(0, 2).map((x) => `${clean(x.text).replace(/[.!]+$/, '')} (set for ${x.when === 'night' ? 'tonight' : `the ${x.when}`})`);
    return `Not yet: ${each.join('; ')}. It has not begun and does not start early - no alarm, call or word that it is starting or that anyone must go now; until its time, those it involves prepare and wait.`;
}

// For the director's DUE TODAY list: the words after a happening not yet
// begun. -> ''
export function notYetWords(item, nowPart) {
    return startsAt(item?.when) > partIndex(nowPart) && partIndex(nowPart) >= 0 ? `not before ${item.when === 'night' ? 'tonight' : `the ${item.when}`}: it has not begun, and nothing in this reply starts it early` : '';
}
