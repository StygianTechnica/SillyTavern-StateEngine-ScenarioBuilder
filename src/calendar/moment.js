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

// Reading time in story prose ("the next morning", "the rest of the day
// went by") and turning it into a moment are State Engine's (readTimeShift,
// advanceDateTime), read in one place - see src/api/calendar.js.

// Where the clock should go for a cue, from the time of day now (both as
// fractions of the day): later the same day; the next day for a dawn
// reached from evening or night; null when the clock is already there or
// past it (within a tenth of a day), or the cue is earlier the same day.
// -> { fraction, nextDay } or null.
export function cueTarget(cue, nowFraction) {
    if (!cue || !Number.isFinite(nowFraction)) return null;
    if (cue.fraction > nowFraction + 0.1) return { fraction: cue.fraction, nextDay: false };
    // Dawn or morning reached from the evening or night: the next day.
    if ((cue.phrase === 'dawn' || cue.phrase === 'morning') && nowFraction >= 0.6) return { fraction: cue.fraction, nextDay: true };
    return null;
}
