// Calendar arithmetic Scenario Builder needs on top of State Engine's
// calendar engine, from a calendar definition (months, hoursPerDay, ...).
// Pure.

import { dayOfYearOf, yearLengthOf } from './sky.js';

export function secondsPerDay(def) {
    return (def?.secondsPerMinute || 60) * (def?.minutesPerHour || 60) * (def?.hoursPerDay || 24);
}

// Whole days since the calendar's epoch.
export function dayIndexOf(def, scalar) {
    return Math.floor(scalar / secondsPerDay(def));
}

export function dayOfYear(def, parts) {
    return dayOfYearOf(def?.months ?? [], parts.month, parts.day);
}

export function yearLength(def) {
    return yearLengthOf(def?.months ?? []) || 365;
}

// Where a new chat's clock starts when the setting does not say: the
// calendar's first day (for the built-in gregorian, a day in the given
// year), a little after sunrise.
export function defaultStart(def, { year = 2026 } = {}) {
    const hour = Math.round((def?.hoursPerDay || 24) / 3);
    const perHour = (def?.secondsPerMinute || 60) * (def?.minutesPerHour || 60);
    if (def?.leapYearRule === 'gregorian') return Date.UTC(year, 3, 1) / 1000 + hour * perHour;
    return hour * perHour;
}

// A time of day as written in a story - "evening", "late night", "noon",
// "21:30", "9 pm", "half past six in the morning" - as a fraction of the day,
// or null. Clock times are in the calendar's own hours.
const DAY_PART_FRACTIONS = [
    ['late night', 0.1], ['small hours', 0.1], ['midnight', 0], ['before dawn', 0.21], ['dawn', 0.25], ['sunrise', 0.26],
    ['early morning', 0.29], ['morning', 0.36], ['late morning', 0.44], ['midday', 0.5], ['noon', 0.5],
    ['early afternoon', 0.56], ['afternoon', 0.62], ['late afternoon', 0.68], ['dusk', 0.77], ['sunset', 0.76], ['twilight', 0.79],
    ['early evening', 0.74], ['evening', 0.78], ['late evening', 0.86], ['night', 0.9],
];
export function timeOfDayFraction(text, def = null) {
    const t = String(text ?? '').toLowerCase().trim();
    if (!t || /^(unknown|unclear|none|-)$/.test(t)) return null;
    const hpd = def?.hoursPerDay || 24;
    const mph = def?.minutesPerHour || 60;
    const clock = t.match(/\b(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=\b|$)/);
    if (clock && (clock[2] !== undefined || clock[3])) {
        let hour = Number(clock[1]);
        const minute = Number(clock[2] ?? 0);
        if (clock[3]?.startsWith('p') && hour < 12) hour += 12;
        if (clock[3]?.startsWith('a') && hour === 12) hour = 0;
        if (hour < hpd && minute < mph) return (hour + minute / mph) / hpd;
    }
    // Longer phrases first ("late afternoon" before "afternoon").
    const hit = [...DAY_PART_FRACTIONS].sort((a, b) => b[0].length - a[0].length).find(([phrase]) => new RegExp(`\\b${phrase}\\b`).test(t));
    return hit ? hit[1] : null;
}

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, few: 3, several: 4, half: 0.5 };
const TIMES_OF_DAY = { dawn: 0.25, sunrise: 0.25, morning: 0.33, noon: 0.5, midday: 0.5, afternoon: 0.6, evening: 0.75, dusk: 0.77, sunset: 0.77, night: 0.88, midnight: 0 };

// A plain reading of "how much time passed" for when State Engine has no
// advanceDateTime: "20 minutes", "two hours", "3 days", "a week", "the next
// morning", "until dawn". -> the new scalar, or null.
export function fallbackAdvance(def, scalar, text) {
    const t = String(text ?? '').toLowerCase().replace(/[.!]+$/, '').trim();
    if (!t) return null;
    const perMinute = def?.secondsPerMinute || 60;
    const perHour = perMinute * (def?.minutesPerHour || 60);
    const perDay = secondsPerDay(def);
    const m = t.match(/(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|few|several|half)\s*(?:an?\s+)?(minute|min|hour|hr|day|week|month)s?/);
    if (m) {
        const n = Number.isFinite(Number(m[1])) ? Number(m[1]) : WORDS[m[1]];
        const unit = { minute: perMinute, min: perMinute, hour: perHour, hr: perHour, day: perDay, week: perDay * (def?.daysPerWeek || def?.weekdayNames?.length || 7), month: perDay * 30 }[m[2]];
        return Math.round(scalar + n * unit);
    }
    const word = Object.keys(TIMES_OF_DAY).find((k) => new RegExp(`\\b${k}\\b`).test(t));
    if (word) {
        const day = Math.floor(scalar / perDay);
        let target = day * perDay + TIMES_OF_DAY[word] * perDay;
        if (/\b(next|following|tomorrow)\b/.test(t)) target = (day + 1) * perDay + TIMES_OF_DAY[word] * perDay;
        while (target <= scalar) target += perDay;
        return Math.round(target);
    }
    return null;
}

// ---- the time of day the story shows
//
// A reply that shows the day turning - "the sun began to set", "night fell",
// "dawn broke" - moves the clock to that part of the day (the story leads).
// Only plain narration of the scene counts: a sentence about later ("their
// meeting in the morning", "by nightfall", "would", "tomorrow") does not.
const TIME_CUES = [
    ['dawn', 0.25, [/\b(?:dawn|daybreak) (?:broke|breaks|had broken|came|comes|arrived|crept|creeps)\b/, /\bthe sun (?:rose|rises|had risen|came up|comes up|crested|crests|climbed above)\b/, /\bthe first light of (?:dawn|day|morning) (?:crept|spilled|broke|touched)\b/]],
    ['noon', 0.5, [/\bthe (?:noon|midday) sun (?:beat|beats|blazed|blazes|hung|hangs)\b/]],
    ['sunset', 0.77, [/\bthe sun (?:began|begins|started|starts|was beginning|is beginning) to (?:set|sink|go down|dip)\b/, /\bthe sun (?:set|sets|was setting|is setting|sank|sinks|was sinking|is sinking|dipped|dips|went down|goes down|had set)\b/, /\b(?:dusk|twilight) (?:fell|falls|had fallen|settled|settles|gathered|gathers|crept|creeps|descended|descends)\b/, /\bas (?:the )?(?:daylight|the light|the day) (?:faded|fades|waned|wanes|died|dies)\b/]],
    ['night', 0.88, [/\b(?:night|darkness) (?:fell|falls|had fallen|has fallen|settled|settles|descended|descends|closed in|closes in)\b/]],
];
const NOT_NOW = /\b(?:will|would|tomorrow|until|by the time|before|by nightfall|by dawn|in the morning|tonight|later|soon|next)\b/i;

// The latest part of the day a reply shows the scene reaching:
// { phrase, fraction } (fraction of the day: sunset 0.77), or null.
export function storyTimeCue(text) {
    const sentences = String(text ?? '').replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*/g) ?? [];
    let found = null;
    for (const sentence of sentences) {
        const t = sentence.toLowerCase();
        if (NOT_NOW.test(t)) continue;
        for (const [phrase, fraction, patterns] of TIME_CUES) {
            if (patterns.some((re) => re.test(t))) found = { phrase, fraction };
        }
    }
    return found;
}

// Where the clock should go for a cue, from the time of day now (both as
// fractions of the day): later the same day; the next day for a dawn
// reached from evening or night; null when the clock is already there or
// past it (within a tenth of a day), or the cue is earlier the same day.
// -> { fraction, nextDay } or null.
export function cueTarget(cue, nowFraction) {
    if (!cue || !Number.isFinite(nowFraction)) return null;
    if (cue.fraction > nowFraction + 0.1) return { fraction: cue.fraction, nextDay: false };
    if (cue.phrase === 'dawn' && nowFraction >= 0.6) return { fraction: cue.fraction, nextDay: true };
    return null;
}

