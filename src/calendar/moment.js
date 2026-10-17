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
