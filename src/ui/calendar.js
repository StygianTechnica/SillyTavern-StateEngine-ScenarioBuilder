// The Calendar tab: the canonical moment (date, hour, sky, weather,
// holidays) with buttons to let time pass or set the date; a month grid
// with the simulated weather, moons and holidays; and the setting's
// calendar - which State Engine calendar (fantasy ones too), the suns and
// moons, the day length, the climate and the holidays.

import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { listCalendarDefinitions, generateRandomCalendarDefinition, createCalendarDefinition } from '../api/calendar.js';
import { calendarFor, momentAt, ensureClock, advanceBy, jumpTo, setTime, monthAt, placeFor, chooseCalendar } from '../calendar/clock.js';
import { forecast, CLIMATES } from '../calendar/weather.js';
import { LATITUDES, moonPhase, holidaysAround } from '../calendar/sky.js';
import { secondsPerDay, dayOfYear, yearLength } from '../calendar/moment.js';
import { syncNow } from '../guidance/sync.js';
import { pushCanonicalToObserved } from '../validate/reconcile.js';
import { isVeiled } from '../planner/model.js';
import { ws, rerender } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

const WEATHER_ICONS = [
    ['Thunderstorm', 'fa-cloud-bolt'], ['Stormy', 'fa-cloud-bolt'], ['Hailing', 'fa-cloud-meatball'], ['Snowy', 'fa-snowflake'],
    ['Rainy', 'fa-cloud-showers-heavy'], ['Drizzle', 'fa-cloud-rain'], ['Foggy', 'fa-smog'], ['Overcast', 'fa-cloud'],
    ['Partly Cloudy', 'fa-cloud-sun'], ['Hazy', 'fa-smog'], ['Sunny', 'fa-sun'], ['Clear', 'fa-sun'],
];
const weatherIcon = (list) => WEATHER_ICONS.find(([w]) => list?.includes(w))?.[1] ?? 'fa-cloud-sun';

async function after(change) {
    const { chatId, chatKey, settingId } = ws.ctx;
    await change();
    // The calendar, day length or climate may have changed what this moment
    // means: the part of day, sky and weather are worked out again.
    const t = getChatDoc(chatKey).canonical.time;
    if (Number.isFinite(t)) await setTime(chatId, chatKey, settingId, t, { source: 'user', note: 'Calendar changed' });
    await pushCanonicalToObserved(chatId, chatKey);
    await syncNow();
    rerender();
}

function setCalendar(patch) {
    updateSettingDoc(ws.ctx.settingId, (doc) => { Object.assign(doc.calendar, typeof patch === 'function' ? patch(doc.calendar) : patch); });
}

// ---- the moment

async function momentCard() {
    const { chatId, chatKey, settingId } = ws.ctx;
    const c = getChatDoc(chatKey).canonical;
    if (!Number.isFinite(c.time)) {
        return h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, 'Now'),
            h('p', { class: 'sb-muted' }, 'The clock has not started in this chat. It starts on the next reply, or now:'),
            button('Start the clock', () => void after(() => ensureClock(chatId, chatKey, settingId)), { iconName: 'fa-play', cls: 'sb-primary' }));
    }
    const m = await momentAt(settingId, c.time, { locationId: c.locationId, indoor: c.indoor });
    const pass = (text) => () => void after(async () => {
        if (!await advanceBy(chatId, chatKey, settingId, text, { source: 'user', note: `Let time pass: ${text}` })) toast('warning', `"${text}" does not read as time passing.`);
    });
    let custom = '';
    let goto = '';
    const lines = [
        ['Date', m.dateWords || m.dateText],
        ['Time', [c.dayPart, m.timeText].filter(Boolean).join(', ')],
        ['Season', m.season],
        ['Weather', [...c.weather, c.temperature].filter(Boolean).join(', ') || '—'],
        ['Sky', m.sky.text || '—'],
        ['Day', `day ${c.day} of the story`],
    ];
    if (m.holidayText) lines.push(['Calendar', m.holidayText]);
    if (m.needs) lines.push(['At this hour', m.needs]);
    const override = getChatDoc(chatKey).clock.override;
    return h('div', { class: 'sb-card sb-moment' },
        h('div', { class: 'sb-card-title' }, icon(m.sky.light === 'daylight' ? 'fa-sun' : m.sky.light === 'twilight' ? 'fa-cloud-sun' : 'fa-moon'), ' Now'),
        h('dl', { class: 'sb-glance' }, lines.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
        override ? h('small', { class: 'sb-hint' }, icon('fa-feather'), ' The story set this weather; the simulation takes over again later. ',
            h('a', { href: '#', onclick: (e) => { e.preventDefault(); void after(async () => { updateChatDoc(chatKey, (d) => { d.clock.override = null; }); await setTime(chatId, chatKey, settingId, c.time, { source: 'user', note: 'Weather back to the simulation' }); }); } }, 'Use the simulated weather now')) : null,
        h('div', { class: 'sb-actions sb-wrap' },
            button('+10 min', pass('10 minutes'), { iconName: 'fa-forward-step' }),
            button('+1 hour', pass('1 hour'), { iconName: 'fa-forward' }),
            button('+6 hours', pass('6 hours'), { iconName: 'fa-forward' }),
            button('Next morning', pass('the next morning'), { iconName: 'fa-sun' }),
            button('Nightfall', pass('evening'), { iconName: 'fa-moon' }),
            button('+1 day', pass('1 day'), { iconName: 'fa-forward-fast' })),
        h('div', { class: 'sb-row' },
            h('input', { class: 'text_pole', placeholder: 'Let time pass… "3 days", "until dawn"', oninput: (e) => { custom = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter' && custom.trim()) pass(custom.trim())(); } }),
            button('Pass', () => custom.trim() && pass(custom.trim())(), { iconName: 'fa-hourglass-half' })),
        h('div', { class: 'sb-row' },
            h('input', { class: 'text_pole', placeholder: 'Set the date… e.g. "1203-04-12 08:00" or a month and day', oninput: (e) => { goto = e.target.value; } }),
            button('Set', () => goto.trim() && void after(async () => { if (await jumpTo(chatId, chatKey, settingId, goto.trim()) === null) toast('warning', `"${goto}" is not a date this calendar understands.`); }), { iconName: 'fa-calendar-check' })));
}

// ---- the month grid

async function monthGrid() {
    const { chatKey, settingId } = ws.ctx;
    const c = getChatDoc(chatKey).canonical;
    if (!Number.isFinite(c.time)) return null;
    const { def, options } = await calendarFor(settingId);
    const offset = ws.calendarMonth ?? 0;
    const month = await monthAt(settingId, c.time, offset);
    const perDay = secondsPerDay(def);
    const todayIndex = Math.floor(c.time / perDay);
    const place = placeFor(settingId, c.locationId);
    const firstDoy = dayOfYear(def, month.parts);
    const days = forecast({ seed: `${settingId}|${place.regionId}`, climateId: place.climateId, fromDay: month.dayIndex, days: month.days, dayOfYear: firstDoy, yearLength: yearLength(def) });
    const week = month.weekdays?.length || def.daysPerWeek || 7;
    const lead = Number.isInteger(month.parts.weekdayIndex) ? month.parts.weekdayIndex : 0;
    // The GM planner's agenda (src/planner/): happenings by calendar day -
    // the story's day count lined up with today - veiled like the GM Plan
    // tab unless spoilers are shown (the user's own always show).
    const gm = getChatDoc(chatKey).gm;
    const showSpoilers = getSettings().planner?.showSpoilers === true;
    const agendaOn = new Map();
    for (const x of gm.agenda.filter((a) => a.status === 'coming' || a.status === 'planned' || a.status === 'done')) {
        const at = todayIndex + (x.day - c.day);
        agendaOn.set(at, [...(agendaOn.get(at) ?? []), x]);
    }
    const agendaLabel = (x) => (x.source === 'user' || !isVeiled(gm, x.id, showSpoilers) ? x.text : 'Something is planned');
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'sb-cal-cell sb-cal-blank' }));
    for (let d = 1; d <= month.days; d++) {
        const f = days[d - 1];
        const idx = month.dayIndex + d - 1;
        const { today } = holidaysAround(options.holidays, def.months ?? [], month.month, d);
        // Marked on the day a moon turns full or new.
        const moons = (options.moons ?? []).map((mo) => ({ name: mo.name, phase: moonPhase(idx, mo).name, before: moonPhase(idx - 1, mo).name }))
            .filter((x) => (x.phase === 'full' || x.phase === 'new') && x.phase !== x.before);
        const planned = agendaOn.get(idx) ?? [];
        const tip = [`${f.weather.join(', ')}; ${f.low} to ${f.high}`, ...today.map((t) => t.holiday.name), ...moons.map((x) => `${x.name}: ${x.phase}`), ...planned.map(agendaLabel)].join('\n');
        cells.push(h('div', { class: `sb-cal-cell${idx === todayIndex ? ' sb-cal-today' : ''}${idx < todayIndex ? ' sb-cal-past' : ''}${today.length ? ' sb-cal-holiday' : ''}`, title: tip },
            h('div', { class: 'sb-cal-day' }, String(d), moons.map((x) => h('i', { class: `fa-solid ${x.phase === 'full' ? 'fa-circle' : 'fa-circle-notch'} sb-cal-moon`, title: `${x.name}: ${x.phase}` }))),
            h('div', { class: 'sb-cal-wx' }, icon(weatherIcon(f.weather)), h('small', {}, f.high)),
            today.map((t) => h('div', { class: 'sb-cal-hol' }, t.holiday.name)),
            planned.map((x) => h('div', { class: `sb-cal-hol sb-cal-agenda${x.status === 'done' ? ' sb-cal-past' : ''}` }, icon(x.source === 'user' || !isVeiled(gm, x.id, showSpoilers) ? 'fa-calendar-day' : 'fa-mask'), ` ${agendaLabel(x)}`))));
    }
    const names = month.weekdays && month.weekdays.length === week ? month.weekdays : Array.from({ length: week }, (_, i) => String(i + 1));
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title sb-cal-head' },
            h('span', { class: 'sb-iconbtn', title: 'Previous month', onclick: () => { ws.calendarMonth = offset - 1; rerender(); } }, icon('fa-chevron-left')),
            h('span', {}, `${month.monthName} ${def.leapYearRule === 'gregorian' ? month.year : `- year ${month.year}`}`),
            h('span', { class: 'sb-iconbtn', title: 'Next month', onclick: () => { ws.calendarMonth = offset + 1; rerender(); } }, icon('fa-chevron-right')),
            offset ? h('span', { class: 'sb-iconbtn', title: 'Back to now', onclick: () => { ws.calendarMonth = 0; rerender(); } }, icon('fa-crosshairs')) : null),
        h('small', { class: 'sb-hint' }, `Weather for ${place.regionId === 'setting' ? 'the setting' : 'this region'} (${CLIMATES.find(([id]) => id === place.climateId)?.[1] ?? place.climateId}), plotted ahead. Hover a day for details.`),
        h('div', { class: 'sb-cal-grid', style: `grid-template-columns: repeat(${week}, minmax(0, 1fr))` },
            names.map((n) => h('div', { class: 'sb-cal-wd' }, n)),
            cells));
}

// ---- the setting's calendar

async function settingsCard() {
    const { chatKey, settingId } = ws.ctx;
    const cal = getSettingDoc(settingId).calendar;
    let defs = [];
    try {
        defs = await listCalendarDefinitions();
    } catch {
        defs = [];
    }
    const timeSettings = getSettings().time;
    const listEditor = (key, cols, blank, label) => h('div', { class: 'sb-field' },
        h('span', { class: 'sb-field-label' }, label),
        (cal[key] ?? []).map((row, i) => h('div', { class: 'sb-row sb-cal-rowedit' },
            cols.map(([k, ph, type, width]) => h('input', {
                class: 'text_pole', placeholder: ph, type: type ?? 'text', value: row[k] ?? '', style: width ? `max-width: ${width}` : null,
                onchange: (e) => setCalendar((c) => ({ [key]: c[key].map((r, j) => (j === i ? { ...r, [k]: type === 'number' ? Number(e.target.value) : e.target.value } : r)) })),
            })),
            h('span', { class: 'sb-iconbtn', title: 'Remove', onclick: () => { setCalendar((c) => ({ [key]: c[key].filter((_, j) => j !== i) })); rerender(); } }, icon('fa-xmark')))),
        button(`Add ${blank.label}`, () => { setCalendar((c) => ({ [key]: [...(c[key] ?? []), { ...blank.value }] })); rerender(); }, { iconName: 'fa-plus' }));

    // The calendar State Engine keeps on the setting (the one its dates follow).
    const currentId = (await calendarFor(settingId)).calendarId;
    const def = defs.find((d) => d.id === currentId);
    const monthOptions = (def?.months ?? []).map((m, i) => ({ value: i + 1, label: m.name }));
    const holidays = h('div', { class: 'sb-field' },
        h('span', { class: 'sb-field-label' }, 'Holidays and festivals'),
        h('small', { class: 'sb-hint' }, 'Mentioned in the guidance on the day, and a couple of days ahead while people prepare.'),
        cal.holidays.map((hol, i) => {
            const upd = (k, v) => setCalendar((c) => ({ holidays: c.holidays.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
            return h('div', { class: 'sb-cal-holedit' },
                h('div', { class: 'sb-row' },
                    h('input', { class: 'text_pole', placeholder: 'Name', value: hol.name, onchange: (e) => upd('name', e.target.value) }),
                    select(monthOptions, hol.month, { onchange: (e) => upd('month', Number(e.target.value)) }),
                    h('input', { class: 'text_pole', type: 'number', min: 1, title: 'Day of the month', value: hol.day, style: 'max-width: 5em', onchange: (e) => upd('day', Math.max(1, Number(e.target.value) || 1)) }),
                    h('input', { class: 'text_pole', type: 'number', min: 1, title: 'How many days it lasts', value: hol.days, style: 'max-width: 5em', onchange: (e) => upd('days', Math.max(1, Number(e.target.value) || 1)) }),
                    h('input', { class: 'text_pole', type: 'number', min: 0, title: 'Days of preparation mentioned beforehand', value: hol.prepDays, style: 'max-width: 5em', onchange: (e) => upd('prepDays', Math.max(0, Number(e.target.value) || 0)) }),
                    h('span', { class: 'sb-iconbtn', title: 'Remove', onclick: () => { setCalendar((c) => ({ holidays: c.holidays.filter((_, j) => j !== i) })); rerender(); } }, icon('fa-xmark'))),
                h('input', { class: 'text_pole', placeholder: 'What happens - customs, food, who celebrates', value: hol.description, onchange: (e) => upd('description', e.target.value) }));
        }),
        h('small', { class: 'sb-hint' }, 'Columns: name, month, day, length in days, days of preparation.'),
        button('Add a holiday', () => { setCalendar((c) => ({ holidays: [...c.holidays, { id: `h_${Date.now().toString(36)}`, name: 'New holiday', month: 1, day: 1, days: 1, prepDays: 2, description: '' }] })); rerender(); }, { iconName: 'fa-plus' }));

    const generate = async () => {
        try {
            const made = await generateRandomCalendarDefinition({});
            const created = await createCalendarDefinition(made);
            await chooseCalendar(ws.ctx.settingId, created?.id ?? made.id);
            toast('success', `Made the calendar "${made.label}". New chats start on its first morning.`);
            await after(async () => {});
        } catch (err) {
            toast('error', `Could not make a calendar: ${err.message}`);
        }
    };

    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-calendar-days'), ' The setting\'s calendar'),
        h('div', { class: 'sb-row' },
            field('Calendar', select(defs.length ? defs.map((d) => ({ value: d.id, label: d.label || d.id })) : [{ value: 'gregorian', label: 'Gregorian' }], currentId, {
                onchange: (e) => {
                    const chosen = defs.find((d) => d.id === e.target.value);
                    const calendarId = e.target.value === 'gregorian' ? '' : e.target.value;
                    // A calendar's own cycles (its moons) replace the default moon.
                    if (chosen?.cycles?.length) setCalendar({ moons: chosen.cycles.slice(0, 6).map((c) => ({ name: c.name, cycle: c.length, offset: 0 })) });
                    void after(() => chooseCalendar(ws.ctx.settingId, calendarId));
                },
            }), 'Any State Engine calendar - fantasy ones too. Make and edit them in State Engine\'s calendar manager.'),
            button('Generate a fantasy calendar', () => void generate(), { iconName: 'fa-dice', title: 'State Engine makes a random calendar (months, weekdays, seasons) and this setting uses it' })),
        h('div', { class: 'sb-row' },
            field('Day length over the year', select(LATITUDES.map(([id, label]) => ({ value: id, label })), cal.latitude, { onchange: (e) => { setCalendar({ latitude: e.target.value }); void after(async () => {}); } })),
            field('Climate (where no place says)', select(CLIMATES.map(([id, label]) => ({ value: id, label })), cal.climate, { onchange: (e) => { setCalendar({ climate: e.target.value }); void after(async () => {}); } }))),
        listEditor('suns', [['name', 'Name', 'text'], ['offset', 'Hours behind the first', 'number', '9em']], { label: 'a sun', value: { name: 'the second sun', offset: 3 } }, 'Suns (none = a sunless world)'),
        listEditor('moons', [['name', 'Name', 'text'], ['cycle', 'Days per cycle', 'number', '8em'], ['offset', 'Phase shift (days)', 'number', '8em']], { label: 'a moon', value: { name: 'the moon', cycle: 29.5, offset: 0 } }, 'Moons'),
        holidays,
        h('div', { class: 'sb-row' },
            field('New chats start at', h('span', {}, Number.isFinite(cal.start) ? 'a set moment' : 'the calendar\'s first morning')),
            button('Start new chats at the current moment', () => {
                const t = getChatDoc(chatKey).canonical.time;
                if (Number.isFinite(t)) { setCalendar({ start: t }); toast('success', 'New chats in this setting start at this moment.'); rerender(); }
            }, { iconName: 'fa-flag' })),
        h('div', { class: 'sb-card-title' }, icon('fa-hourglass-half'), ' Keeping time'),
        h('label', { class: 'checkbox_label', title: 'Scenario Builder keeps the time, the part of day, the weather and the temperature. Off: they are only what you set by hand or the story says.' },
            h('input', { type: 'checkbox', checked: timeSettings.enabled, onchange: (e) => { timeSettings.enabled = e.target.checked; saveSettings(); void after(async () => {}); } }),
            h('span', {}, 'Keep the clock and simulate the weather')),
        field('A reply covers, unless the game master says', h('input', { class: 'text_pole', value: timeSettings.perTurn, onchange: (e) => { timeSettings.perTurn = e.target.value.trim() || '5 minutes'; saveSettings(); } })));
}

export async function renderCalendar() {
    const { settingId } = ws.ctx;
    if (!settingId) return h('div', { class: 'sb-muted' }, 'This chat has no setting yet.');
    return h('div', { class: 'sb-calendar' },
        h('div', { class: 'sb-scene-cols' }, await momentCard(), await monthGrid()),
        await settingsCard());
}
