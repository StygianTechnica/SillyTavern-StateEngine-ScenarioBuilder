// The canonical clock: Scenario Builder keeps the time, and the weather,
// part of day and day count follow it. Time moves on
//   - before each reply: by what the director decides the reply covers
//     (src/director/), else by the per-turn default (settings.time.perTurn);
//   - after a reply: when the story says more time passed than was planned
//     (sb__scene_deltatime, "three days later"), the clock catches up;
//   - by hand, from the Scene tab and the calendar.
// Dates live on the setting's State Engine calendar (src/api/calendar.js);
// the sky and weather are src/calendar/sky.js and weather.js.

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { getSettingDoc } from '../store/setting-store.js';
import { emptyCalendar } from '../store/schema.js';
import { setCanonical } from '../state/canonical.js';
import { getDateTimeParts, formatDateTime, formatDateTimePartial, advanceDateTime, getCalendarDefinition } from '../api/calendar.js';
import { secondsPerDay, dayIndexOf, dayOfYear, yearLength, defaultStart, fallbackAdvance } from './moment.js';
import { skyAt, needsAt, holidaysAround, holidayText, seasonName } from './sky.js';
import { weatherAt } from './weather.js';

const FALLBACK_CALENDAR = Object.freeze({
    id: 'gregorian', label: 'Gregorian', unit: 'seconds', secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24, leapYearRule: 'gregorian',
    months: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((days, i) => ({ name: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i], days })),
    weekdayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
});

// The setting's calendar: { calendarId, def, options }.
export async function calendarFor(settingId) {
    const options = settingId ? getSettingDoc(settingId).calendar : emptyCalendar();
    const calendarId = options.calendarId || 'gregorian';
    let def = null;
    try {
        def = await getCalendarDefinition(calendarId);
    } catch (err) {
        console.debug(LOG_PREFIX, 'no calendar definition', err);
    }
    if (!def) def = calendarId === 'gregorian' ? FALLBACK_CALENDAR : await getCalendarDefinition('gregorian').catch(() => null) ?? FALLBACK_CALENDAR;
    return { calendarId: def.id ?? calendarId, def, options };
}

// The place whose settings apply: the nearest of the location and the places
// it is in that sets a climate (else the setting's), and whether the sky can
// be seen there.
export function placeFor(settingId, locationId) {
    const doc = settingId ? getSettingDoc(settingId) : null;
    let climate = '';
    let regionId = '';
    let sky = '';
    let id = locationId;
    const seen = new Set();
    while (doc && id && !seen.has(id)) {
        seen.add(id);
        const meta = doc.entries[id];
        if (!meta) break;
        if (!climate && meta.climate) { climate = meta.climate; regionId = id; }
        if (!sky && meta.sky) sky = meta.sky;
        id = meta.parentId;
    }
    return { climateId: climate || doc?.calendar.climate || 'temperate', regionId: regionId || 'setting', open: sky !== 'none' && climate !== 'underground' };
}

async function partsOf(calendarId, def, scalar) {
    try {
        return await getDateTimeParts(calendarId, scalar);
    } catch {
        // Older State Engine: a plain reading for the hour.
        const perDay = secondsPerDay(def);
        const secs = ((scalar % perDay) + perDay) % perDay;
        const perHour = (def.secondsPerMinute || 60) * (def.minutesPerHour || 60);
        return { year: 1, month: 1, day: 1, hour: Math.floor(secs / perHour), minute: Math.floor((secs % perHour) / (def.secondsPerMinute || 60)), calendar: { hoursPerDay: def.hoursPerDay, minutesPerHour: def.minutesPerHour } };
    }
}

// Everything about a moment, for a place: date parts and text, the sky,
// the weather the simulation gives, holidays and what people feel.
export async function momentAt(settingId, scalar, { locationId = '', indoor = null } = {}) {
    const { calendarId, def, options } = await calendarFor(settingId);
    const parts = await partsOf(calendarId, def, scalar);
    const dayIndex = dayIndexOf(def, scalar);
    const doy = dayOfYear(def, parts);
    const yl = yearLength(def);
    const place = placeFor(settingId, locationId);
    const sky = skyAt({ parts, dayIndex, dayOfYear: doy, yearLength: yl, sky: options, where: { open: place.open, indoor: indoor === true } });
    const weather = weatherAt({ seed: `${settingId ?? ''}|${place.regionId}`, climateId: place.climateId, dayIndex, fraction: sky.fraction, dayOfYear: doy, yearLength: yl });
    const holidays = holidaysAround(options.holidays, def.months ?? [], parts.month, parts.day);
    let dateText = '';
    let timeText = '';
    try {
        dateText = await formatDateTime(calendarId, scalar, { style: 'date' });
        timeText = await formatDateTime(calendarId, scalar, { style: 'time' });
    } catch {
        // Formatting unavailable.
    }
    const monthName = def.months?.[parts.month - 1]?.name ?? '';
    // The calendar's own season names when it has seasons.
    let season = '';
    try {
        season = (await formatDateTimePartial(calendarId, scalar, ['season']))?.season ?? '';
    } catch {
        season = '';
    }
    return {
        calendarId, def, options, parts, dayIndex, dayOfYear: doy, yearLength: yl, place, sky, weather, holidays,
        season: season || seasonName(doy, yl),
        holidayText: holidayText(holidays),
        needs: needsAt(sky.fraction),
        dateText, timeText: timeText.replace(/:\d\d$/, ''),
        // "Thursday, the 4th of Stormfall" style words for the narrator.
        dateWords: def.leapYearRule === 'gregorian'
            ? [parts.weekdayName, `${parts.day} ${monthName} ${parts.year}`].filter(Boolean).join(', ')
            : [parts.weekdayName, monthName ? `day ${parts.day} of ${monthName}` : '', parts.year ? `year ${parts.year}` : ''].filter(Boolean).join(', '),
    };
}

// Sets the canonical time, and with it the part of day, the day count and
// the weather and temperature (the simulation's, unless the story set a
// weather that still holds). `info` goes to setCanonical (source, note, ...).
export async function setTime(chatId, chatKey, settingId, scalar, info = {}) {
    const doc = getChatDoc(chatKey);
    const c = doc.canonical;
    const m = await momentAt(settingId, scalar, { locationId: c.locationId, indoor: c.indoor });
    const patch = { time: Math.round(scalar), dayPart: m.sky.dayPart };
    if (Number.isFinite(c.time)) {
        const before = dayIndexOf(m.def, c.time);
        patch.day = Math.max(1, (c.day || 1) + (m.dayIndex - before));
    }
    const override = doc.clock.override;
    if (override && override.until > scalar) {
        if (override.weather.length) patch.weather = override.weather;
        if (override.temperature) patch.temperature = override.temperature;
    } else {
        patch.weather = m.weather.weather;
        patch.temperature = m.weather.temperature;
        if (override) updateChatDoc(chatKey, (d) => { d.clock.override = null; });
    }
    return setCanonical(chatKey, patch, { chatId, source: 'clock', ...info });
}

// Starts the clock for a chat that has none: the setting's start, else the
// calendar's first morning (keeping an older chat's part of day).
export async function ensureClock(chatId, chatKey, settingId) {
    const c = getChatDoc(chatKey).canonical;
    if (Number.isFinite(c.time)) return c.time;
    const { def, options } = await calendarFor(settingId);
    let start = Number.isFinite(options.start) ? options.start : defaultStart(def);
    const shift = { dawn: 0.25, morning: 0.33, midday: 0.5, afternoon: 0.6, evening: 0.76, night: 0.88, 'late night': 0.1 }[c.dayPart];
    if (shift !== undefined) start = dayIndexOf(def, start) * secondsPerDay(def) + Math.round(shift * secondsPerDay(def));
    await setTime(chatId, chatKey, settingId, start, { note: 'The clock started' });
    return start;
}

// The moment `text`'s worth of time after `from`, or null when the text
// does not read as time passing (or reads as more than a year).
export async function advanceFrom(settingId, from, text) {
    const { calendarId, def } = await calendarFor(settingId);
    let to = null;
    try {
        to = await advanceDateTime(calendarId, from, text);
    } catch {
        to = undefined;
    }
    if (to === undefined || to === null) to = fallbackAdvance(def, from, text);
    if (!Number.isFinite(to) || to <= from || to - from > yearLength(def) * secondsPerDay(def)) return null;
    return to;
}

// Moves the clock on by `text` ("20 minutes", "the next morning").
// planned: this is the advance for the reply about to be written - kept
// to compare with what the story then says passed. -> { from, to } or null.
export async function advanceBy(chatId, chatKey, settingId, text, { planned = false, note = '', source = 'clock' } = {}) {
    const from = await ensureClock(chatId, chatKey, settingId);
    const to = await advanceFrom(settingId, from, text);
    if (to === null) return null;
    await setTime(chatId, chatKey, settingId, to, { source, note: note || `Time passed: ${text}` });
    if (planned) updateChatDoc(chatKey, (d) => { d.clock.planned = { from, to, text }; });
    return { from, to };
}

// After a reply: how much time the story says passed (sb__scene_deltatime,
// counted from before the player's message). When that is clearly more than
// the clock moved, it catches up. -> the history entry, or null.
export async function catchUpWithStory(chatId, chatKey, settingId, deltaText, sourceMessage = '') {
    const doc = getChatDoc(chatKey);
    const planned = doc.clock.planned;
    updateChatDoc(chatKey, (d) => { d.clock.planned = null; });
    const now = doc.canonical.time;
    if (!Number.isFinite(now) || !String(deltaText ?? '').trim()) return null;
    const from = planned?.from ?? now;
    const target = await advanceFrom(settingId, from, String(deltaText));
    if (target === null) return null;
    const { def } = await calendarFor(settingId);
    const tolerance = Math.max(15 * (def.secondsPerMinute || 60), 0.25 * ((planned?.to ?? now) - from));
    if (target <= now + tolerance) return null;
    return setTime(chatId, chatKey, settingId, target, { source: 'story', note: `The story moved time on: ${deltaText}`, sourceMessage });
}

// The default advance for a reply nobody planned.
export function perTurnDefault() {
    return getSettings().time?.perTurn || '5 minutes';
}

// The story changed the weather and the policy let it (story leads): it
// holds for the rest of this watch and the next, then the simulation takes
// over again.
export async function holdStoryWeather(chatKey, settingId, weather, temperature) {
    const c = getChatDoc(chatKey).canonical;
    if (!Number.isFinite(c.time)) return;
    const { def } = await calendarFor(settingId);
    const watch = secondsPerDay(def) / 4;
    const until = (Math.floor(c.time / watch) + 2) * watch;
    updateChatDoc(chatKey, (d) => { d.clock.override = { until, weather: weather ?? d.canonical.weather, temperature: temperature ?? d.canonical.temperature }; });
}

// Sets the clock to a date and time written out ("1203-04-12 08:00",
// "Stormfall 17", "set time to ..."), backward too. -> the new time or null.
export async function jumpTo(chatId, chatKey, settingId, text) {
    const now = await ensureClock(chatId, chatKey, settingId);
    const { calendarId } = await calendarFor(settingId);
    let to = null;
    try {
        to = await advanceDateTime(calendarId, now, String(text ?? ''));
    } catch {
        to = null;
    }
    if (!Number.isFinite(to)) return null;
    await setTime(chatId, chatKey, settingId, to, { source: 'user', note: `Set the date: ${text}` });
    updateChatDoc(chatKey, (d) => { d.clock.planned = null; });
    return to;
}

// The first day of the month `offset` months from the one `scalar` is in:
// { dayIndex, parts, days } - for the calendar grid.
export async function monthAt(settingId, scalar, offset = 0) {
    const { calendarId, def } = await calendarFor(settingId);
    const perDay = secondsPerDay(def);
    const parts = await partsOf(calendarId, def, scalar);
    let year = parts.year;
    let month = parts.month + offset;
    const count = def.months?.length || 12;
    while (month < 1) { month += count; year -= 1; }
    while (month > count) { month -= count; year += 1; }
    const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysIn = (y, m) => (def.leapYearRule === 'gregorian' && m === 2 && isLeap(y) ? 29 : def.months?.[m - 1]?.days ?? 30);
    // Walk from this month's first day to the target month's.
    let dayIndex = dayIndexOf(def, scalar) - (parts.day - 1);
    let y = parts.year;
    let m = parts.month;
    while (y < year || (y === year && m < month)) { dayIndex += daysIn(y, m); m += 1; if (m > count) { m = 1; y += 1; } }
    while (y > year || (y === year && m > month)) { m -= 1; if (m < 1) { m = count; y -= 1; } dayIndex -= daysIn(y, m); }
    const first = await partsOf(calendarId, def, dayIndex * perDay + perDay / 2);
    return { dayIndex, parts: first, days: daysIn(year, month), year, month, monthName: def.months?.[month - 1]?.name ?? `Month ${month}`, weekdays: def.weekdayShortNames ?? def.weekdayNames ?? null };
}
