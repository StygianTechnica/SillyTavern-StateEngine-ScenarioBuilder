// How long the player's post says its own action took - "Cyril spent
// several hours at the gun range" - as a span the clock reads ("3 hours").
// The director's TIME line said "A few minutes" for it, and the clock took
// that. The post's span is the least the turn covers. Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const COUNT = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, few: 3, 'a few': 3, several: 3, 'a couple of': 2, 'a couple': 2, couple: 2, many: 4 };
const NUM = '(\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|a few|several|a couple(?: of)?|many)';
// A span the action itself takes: "spent several hours", "for an hour",
// "after a few hours", "over the next two hours", "hours later".
const SPAN = new RegExp(`\\b(?:spen[dt]s?|spending|for|after|over the (?:next|following)|took|takes|taking|passed|whiled away|worked|practi[cs]ed|trained)\\s+(?:about |nearly |almost |some |the (?:next|better part of) |a good )?${NUM}\\s+(minutes?|hours?|days?)\\b|\\b${NUM}\\s+(minutes?|hours?|days?)\\s+(?:later|passed|went by|slipped by)\\b`, 'i');
const LONG = /\b(?:for hours|hours (?:passed|went by|later)|for (?:the rest of|the better part of|most of) the (morning|afternoon|day|evening|night)|(?:all|the whole|the entire) (morning|afternoon|day|evening|night)(?: long)?)\b/i;
// Not the action now: planned, wished, remembered, or a span in speech.
const NOT_NOW = /\b(?:will|would|could|might|should|going to|plan(?:s|ned)? to|if|used to|years ago|once)\b|'ll\b/i;
const PART_HOURS = { morning: 4, afternoon: 4, evening: 3, night: 6, day: 8 };

// -> '' or a span the clock reads ("3 hours", "45 minutes").
export function postSpan(post) {
    const plain = String(post ?? '').replace(/[“”]/g, '"').replace(/"[^"]*"/g, ' ');
    const sentences = clean(plain).match(/[^.!?…]+[.!?…]*/g) ?? [];
    let best = 0;
    let text = '';
    for (const s of sentences) {
        if (NOT_NOW.test(s)) continue;
        const m = s.match(SPAN);
        if (m) {
            const n = m[1] ?? m[3];
            const unit = (m[2] ?? m[4]).toLowerCase().replace(/s$/, '');
            const count = /^\d+$/.test(n) ? Number(n) : COUNT[n.toLowerCase()] ?? 1;
            const minutes = count * (unit === 'minute' ? 1 : unit === 'hour' ? 60 : 1440);
            if (minutes > best) { best = minutes; text = `${count} ${unit}${count === 1 ? '' : 's'}`; }
            continue;
        }
        const l = s.match(LONG);
        if (l) {
            const hours = PART_HOURS[(l[1] ?? l[2] ?? '').toLowerCase()] ?? 3;
            if (hours * 60 > best) { best = hours * 60; text = `${hours} hours`; }
        }
    }
    return text;
}
