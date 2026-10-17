// The sky and the hour, from a moment on any calendar: daylight, where the
// sun (or suns) stand, the moons and their phases, the part of the day, what
// people are likely to feel at this hour, and the holidays that are on or
// coming. Pure: works on State Engine's date parts (getDateTimeParts) and
// the setting's calendar options (src/store/schema.js, setting doc
// `calendar`), so any calendar works - a 30-hour day included, since
// everything is reckoned as a fraction of the day.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod = (n, m) => ((n % m) + m) % m;

// How much the length of the day swings over the year.
export const LATITUDES = Object.freeze([
    ['equatorial', 'Equatorial - days and nights about equal all year'],
    ['temperate', 'Temperate - long summer days, short winter days'],
    ['polar', 'Polar - midnight sun and long polar nights'],
]);
const SWING = { equatorial: 0.03, temperate: 0.13, polar: 0.42 };

// Where midsummer falls, as a fraction of the year.
const MIDSUMMER = 0.47;

// warmth: +1 at midsummer, -1 at midwinter (also what the weather follows).
export function seasonalWarmth(dayOfYear, yearLength) {
    if (!yearLength) return 0;
    return Math.cos(2 * Math.PI * ((dayOfYear - 1) / yearLength - MIDSUMMER));
}

export function seasonName(dayOfYear, yearLength) {
    if (!yearLength) return '';
    const x = mod((dayOfYear - 1) / yearLength - MIDSUMMER, 1);
    // Summer centred on midsummer, autumn after it, and so on.
    if (x < 0.125 || x >= 0.875) return 'summer';
    if (x < 0.375) return 'autumn';
    if (x < 0.625) return 'winter';
    return 'spring';
}

// Sunrise and sunset as fractions of the day.
export function daylight(dayOfYear, yearLength, latitude = 'temperate') {
    const swing = SWING[latitude] ?? SWING.temperate;
    const length = clamp(0.5 + swing * seasonalWarmth(dayOfYear, yearLength), 0, 1);
    return { sunrise: 0.5 - length / 2, sunset: 0.5 + length / 2, length };
}

// The fraction of the day a moment is at.
export function dayFraction(parts) {
    const hpd = parts?.calendar?.hoursPerDay || 24;
    const mph = parts?.calendar?.minutesPerHour || 60;
    return clamp(((parts?.hour ?? 0) + (parts?.minute ?? 0) / mph) / hpd, 0, 0.99999);
}

// One of DAY_PARTS (src/store/schema.js).
export function dayPartAt(f, { sunrise, sunset, length }) {
    if (length <= 0.001) return f < 0.25 ? 'late night' : f < 0.75 ? (f < 0.5 ? 'morning' : 'afternoon') : 'night';
    if (length >= 0.999) return f < 0.45 ? 'morning' : f < 0.55 ? 'midday' : f < 0.8 ? 'afternoon' : 'evening';
    if (f >= sunrise - 0.03 && f < sunrise + 0.04) return 'dawn';
    if (f < sunrise - 0.03) return 'late night';
    if (f < 0.46) return 'morning';
    if (f < 0.56) return 'midday';
    if (f < sunset - 0.05) return 'afternoon';
    if (f < sunset + 0.08) return 'evening';
    return 'night';
}

const MOON_PHASES = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full', 'waning gibbous', 'last quarter', 'waning crescent'];

export function moonPhase(dayIndex, moon) {
    const cycle = Number(moon?.cycle) > 0 ? Number(moon.cycle) : 29.5;
    const age = mod(dayIndex + (Number(moon?.offset) || 0), cycle) / cycle;
    return { name: MOON_PHASES[Math.round(age * 8) % 8], age };
}

function sunPhrase(p) {
    if (p < 0.12) return 'just above the eastern horizon';
    if (p < 0.38) return 'climbing in the east';
    if (p < 0.62) return 'high overhead';
    if (p < 0.88) return 'lowering in the west';
    return 'low in the west';
}

// The sky at this moment.
// parts: State Engine date parts; dayIndex: whole days since the epoch;
// dayOfYear, yearLength; sky: { latitude, suns: [{ name, offset }],
// moons: [{ name, cycle, offset }] }; where: { open: sky visible?, indoor }
// -> { fraction, dayPart, light: 'daylight'|'twilight'|'dark', sunrise,
//      sunset, suns: [{ name, up, text }], moons: [{ name, phase, up, text }],
//      text }
export function skyAt({ parts, dayIndex, dayOfYear, yearLength, sky = {}, where = {} }) {
    const f = dayFraction(parts);
    const day = daylight(dayOfYear, yearLength, sky.latitude);
    const hpd = parts?.calendar?.hoursPerDay || 24;
    const suns = (sky.suns ?? []).map((s) => {
        const shift = (Number(s.offset) || 0) / hpd;
        const p = (mod(f - shift, 1) - day.sunrise) / (day.sunset - day.sunrise || 1);
        const up = p >= 0 && p <= 1;
        return { name: s.name || 'the sun', up, text: up ? `${s.name || 'the sun'} is ${sunPhrase(p)}` : '' };
    });
    const anySun = suns.some((s) => s.up);
    const twilight = !anySun && suns.length > 0 && (Math.abs(f - day.sunrise) < 0.04 || Math.abs(f - day.sunset) < 0.05);
    const light = suns.length === 0 ? 'dark' : anySun ? 'daylight' : twilight ? 'twilight' : 'dark';
    const dayPart = suns.length ? dayPartAt(f, day) : dayPartAt(f, { sunrise: 0.25, sunset: 0.75, length: 0.5 });

    // Moons are up roughly opposite the sun, earlier or later with phase;
    // a new moon is never seen.
    const moons = (sky.moons ?? []).map((m) => {
        const phase = moonPhase(dayIndex, m);
        const rise = mod(day.sunrise + phase.age, 1);
        const up = phase.name !== 'new' && mod(f - rise, 1) < 0.5;
        return { name: m.name || 'the moon', phase: phase.name, up, text: up ? `${m.name || 'the moon'} is up, ${phase.name === 'full' ? 'full' : `a ${phase.name}`}` : '' };
    });

    let text;
    if (where.open === false) {
        text = 'No sky can be seen from here.';
    } else {
        const seen = [...suns.filter((s) => s.up).map((s) => s.text), ...(light === 'daylight' ? [] : moons.filter((m) => m.up).map((m) => m.text))];
        const lead = light === 'daylight' ? '' : light === 'twilight' ? (f < 0.5 ? 'The sky is paling toward dawn' : 'Dusk is falling') : 'It is dark out';
        const parts2 = [lead, ...seen].filter(Boolean);
        text = parts2.length ? `${parts2.join('; ')}.` : '';
        if (where.indoor && text) text = `Outside, ${text[0].toLowerCase()}${text.slice(1)}`;
        text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    return { fraction: f, dayPart, light, sunrise: day.sunrise, sunset: day.sunset, suns, moons, text };
}

// What people tend to feel at this hour - meals and tiredness - for the
// narrator to let show in passing.
export function needsAt(f) {
    if (f >= 0.26 && f < 0.34) return 'It is around breakfast time; people may be hungry or looking for food.';
    if (f >= 0.48 && f < 0.56) return 'It is around the midday meal; hunger may show.';
    if (f >= 0.72 && f < 0.8) return 'It is around supper time; people think of food and rest.';
    if (f >= 0.9 || f < 0.06) return 'It is late; people are tired and thinking of sleep.';
    if (f >= 0.06 && f < 0.2) return 'It is the dead of night; anyone awake is weary, and most folk are asleep.';
    return '';
}

// ---------------------------------------------------------------- holidays

// 1-based day of the year from a month and day.
export function dayOfYearOf(months, month, day) {
    let n = 0;
    for (let i = 0; i < month - 1 && i < months.length; i++) n += months[i].days;
    return n + day;
}

export function yearLengthOf(months) {
    return (months ?? []).reduce((n, m) => n + (m.days || 0), 0);
}

// Holidays on today and those coming within their preparation time.
// holidays: [{ id, name, month, day, days, prepDays, description }]
// -> { today: [{ holiday, dayOf, of }], soon: [{ holiday, inDays }] }
export function holidaysAround(holidays, months, month, day) {
    const yl = yearLengthOf(months);
    const today = [];
    const soon = [];
    if (!yl) return { today, soon };
    const now = dayOfYearOf(months, month, day);
    for (const h of holidays ?? []) {
        if (!h?.name || !h.month || !h.day) continue;
        const start = dayOfYearOf(months, h.month, h.day);
        const length = Math.max(1, Number(h.days) || 1);
        const since = mod(now - start, yl);
        if (since < length) {
            today.push({ holiday: h, dayOf: since + 1, of: length });
            continue;
        }
        const inDays = mod(start - now, yl);
        const prep = Math.max(0, Number(h.prepDays ?? 2));
        if (inDays > 0 && inDays <= prep) soon.push({ holiday: h, inDays });
    }
    soon.sort((a, b) => a.inDays - b.inDays);
    return { today, soon };
}

export function holidayText({ today, soon }) {
    const lines = [];
    for (const t of today) {
        const which = t.of > 1 ? ` (day ${t.dayOf} of ${t.of})` : '';
        lines.push(`Today is ${t.holiday.name}${which}.${t.holiday.description ? ` ${String(t.holiday.description).trim()}` : ''} Let it colour the day.`);
    }
    for (const s of soon) {
        lines.push(`${s.holiday.name} is ${s.inDays === 1 ? 'tomorrow' : `in ${s.inDays} days`}; preparations may be under way.`);
    }
    return lines.join(' ');
}
