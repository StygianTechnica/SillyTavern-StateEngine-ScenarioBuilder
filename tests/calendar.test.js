import { daylight, dayPartAt, skyAt, moonPhase, needsAt, holidaysAround, holidayText, seasonName, dayOfYearOf } from '../src/calendar/sky.js';
import { fallbackAdvance, defaultStart, timeOfDayFraction, storyTimeCue, cueTarget } from '../src/calendar/moment.js';
import { weatherAt, forecast, bandOf, weatherText, CLIMATES } from '../src/calendar/weather.js';

const months = Array.from({ length: 12 }, (_, i) => ({ name: `M${i + 1}`, days: 30 }));
const parts = (hour, minute = 0, hoursPerDay = 24) => ({ hour, minute, calendar: { hoursPerDay, minutesPerHour: 60 } });
const sky = { latitude: 'temperate', suns: [{ name: 'the sun', offset: 0 }], moons: [{ name: 'the moon', cycle: 29.5, offset: 0 }] };
const midsummer = 170;
const midwinter = 350;

describe('daylight and the parts of the day', () => {
    it('makes summer days long and winter days short', () => {
        expect(daylight(midsummer, 360).length).toBeGreaterThan(0.6);
        expect(daylight(midwinter, 360).length).toBeLessThan(0.4);
        expect(Math.abs(daylight(midsummer, 360, 'equatorial').length - 0.5)).toBeLessThan(0.05);
        expect(seasonName(midsummer, 360)).toBe('summer');
        expect(seasonName(midwinter, 360)).toBe('winter');
    });

    it('names the part of the day around sunrise and sunset', () => {
        const d = { sunrise: 0.25, sunset: 0.75, length: 0.5 };
        expect(dayPartAt(0.1, d)).toBe('late night');
        expect(dayPartAt(0.25, d)).toBe('dawn');
        expect(dayPartAt(0.35, d)).toBe('morning');
        expect(dayPartAt(0.5, d)).toBe('midday');
        expect(dayPartAt(0.6, d)).toBe('afternoon');
        expect(dayPartAt(0.76, d)).toBe('evening');
        expect(dayPartAt(0.9, d)).toBe('night');
    });

    it('works for a calendar with a 30-hour day', () => {
        expect(skyAt({ parts: parts(15, 0, 30), dayIndex: 0, dayOfYear: 90, yearLength: 360, sky }).dayPart).toBe('midday');
    });
});

describe('the sky', () => {
    it('puts the sun overhead at noon and shows the moon at night', () => {
        const noon = skyAt({ parts: parts(12), dayIndex: 14, dayOfYear: 90, yearLength: 360, sky });
        expect(noon.light).toBe('daylight');
        expect(noon.text).toContain('the sun is high overhead'.replace(/^t/, 'T'));
        const night = skyAt({ parts: parts(23), dayIndex: 14, dayOfYear: 90, yearLength: 360, sky });
        expect(night.light).toBe('dark');
        expect(night.moons[0].phase).toBe('full');
        expect(night.text).toContain('the moon is up, full');
    });

    it('says when no sky can be seen, and speaks of outside when indoors', () => {
        expect(skyAt({ parts: parts(12), dayIndex: 0, dayOfYear: 90, yearLength: 360, sky, where: { open: false } }).text).toBe('No sky can be seen from here.');
        expect(skyAt({ parts: parts(12), dayIndex: 0, dayOfYear: 90, yearLength: 360, sky, where: { indoor: true } }).text).toMatch(/^Outside, the sun/);
    });

    it('handles two suns and none', () => {
        const two = skyAt({ parts: parts(7), dayIndex: 0, dayOfYear: 90, yearLength: 360, sky: { ...sky, suns: [{ name: 'Sol' }, { name: 'Ember', offset: 3 }] } });
        expect(two.suns.map((s) => s.up)).toEqual([true, false]);
        expect(skyAt({ parts: parts(12), dayIndex: 0, dayOfYear: 90, yearLength: 360, sky: { suns: [], moons: [] } }).light).toBe('dark');
    });

    it('cycles moon phases', () => {
        expect(moonPhase(0, { cycle: 28 }).name).toBe('new');
        expect(moonPhase(7, { cycle: 28 }).name).toBe('first quarter');
        expect(moonPhase(14, { cycle: 28 }).name).toBe('full');
        expect(moonPhase(0, { cycle: 28, offset: 14 }).name).toBe('full');
    });

    it('mentions meals and tiredness at the right hours', () => {
        expect(needsAt(0.3)).toContain('breakfast');
        expect(needsAt(0.75)).toContain('supper');
        expect(needsAt(0.95)).toContain('tired');
        expect(needsAt(0.4)).toBe('');
    });
});

describe('holidays', () => {
    const holidays = [
        { id: 'h1', name: 'Tidefeast', month: 3, day: 10, days: 3, prepDays: 2, description: 'Lanterns are floated on the harbour.' },
        { id: 'h2', name: 'Year End', month: 12, day: 30, days: 1, prepDays: 3 },
    ];
    it('finds holidays that are on and coming, across the year end', () => {
        expect(holidaysAround(holidays, months, 3, 11).today[0]).toMatchObject({ dayOf: 2, of: 3 });
        expect(holidaysAround(holidays, months, 3, 8).soon[0]).toMatchObject({ inDays: 2 });
        expect(holidaysAround(holidays, months, 3, 7).soon).toEqual([]);
        expect(holidaysAround(holidays, months, 12, 28).soon[0].holiday.name).toBe('Year End');
        expect(dayOfYearOf(months, 3, 10)).toBe(70);
    });
    it('writes them for the narrator', () => {
        expect(holidayText(holidaysAround(holidays, months, 3, 10))).toBe('Today is Tidefeast (day 1 of 3). Lanterns are floated on the harbour. Let it colour the day.');
        expect(holidayText(holidaysAround(holidays, months, 3, 9))).toBe('Tidefeast is tomorrow; preparations may be under way.');
    });
});

describe('weather', () => {
    const at = (climateId, dayIndex, fraction, dayOfYear = 90) => weatherAt({ seed: 'set|veylan', climateId, dayIndex, fraction, dayOfYear, yearLength: 360 });

    it('is the same every time for the same place and moment', () => {
        expect(at('temperate', 400, 0.5)).toEqual(at('temperate', 400, 0.5));
        expect(at('temperate', 400, 0.5)).not.toEqual(weatherAt({ seed: 'other', climateId: 'temperate', dayIndex: 400, fraction: 0.5, dayOfYear: 90, yearLength: 360 }));
    });

    it('follows the climate and the season', () => {
        const mean = (climateId, doy) => {
            let sum = 0;
            for (let d = 0; d < 40; d++) sum += at(climateId, d, 0.6, doy).celsius;
            return sum / 40;
        };
        expect(mean('desert', midsummer)).toBeGreaterThan(30);
        expect(mean('polar', midwinter)).toBeLessThan(-15);
        expect(mean('temperate', midsummer)).toBeGreaterThan(mean('temperate', midwinter) + 10);
        expect(mean('volcanic', midwinter)).toBeGreaterThan(20);
    });

    it('snows rather than rains when it freezes, and has no weather underground', () => {
        let wet = [];
        for (let d = 0; d < 200; d++) wet.push(...at('polar', d, 0.5, midwinter).weather);
        expect(wet).not.toContain('Rainy');
        expect(wet).toContain('Snowy');
        expect(at('underground', 5, 0.5)).toMatchObject({ weather: [], temperature: 'Mild' });
    });

    it('lets fronts last rather than changing every watch', () => {
        let changes = 0;
        let prev = null;
        for (let w = 0; w < 400; w++) {
            const s = at('temperate', Math.floor(w / 4), (w % 4) / 4 + 0.1).sky;
            if (prev && s !== prev) changes += 1;
            prev = s;
        }
        expect(changes).toBeLessThan(250);
    });

    it('plots a forecast and writes a sentence', () => {
        const days = forecast({ seed: 's', climateId: 'oceanic', fromDay: 100, days: 7, dayOfYear: 90, yearLength: 360 });
        expect(days).toHaveLength(7);
        expect(days[0]).toHaveProperty('high');
        expect(bandOf(-10)).toBe('Freezing');
        expect(bandOf(40)).toBe('Scorching');
        expect(weatherText({ weather: ['Thunderstorm', 'Windy'], temperature: 'Cool' })).toBe('A thunderstorm is raging, the wind is up and it is cool.');
        expect(weatherText({ weather: ['Rainy'], temperature: 'Cool' }, { indoor: true })).toBe('Outside, it is raining and it is cool.');
        expect(CLIMATES.length).toBeGreaterThan(10);
    });
});

describe('fallback time reading', () => {
    const def = { secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24, months };
    const t0 = 10 * 86400 + 22 * 3600;
    it('reads durations and times of day', () => {
        expect(fallbackAdvance(def, t0, '20 minutes')).toBe(t0 + 1200);
        expect(fallbackAdvance(def, t0, 'two hours')).toBe(t0 + 7200);
        expect(fallbackAdvance(def, t0, 'a week')).toBe(t0 + 7 * 86400);
        const morning = fallbackAdvance(def, t0, 'the next morning');
        expect(morning).toBeGreaterThan(t0);
        expect((morning % 86400) / 86400).toBeCloseTo(0.33, 2);
        expect(fallbackAdvance(def, t0, 'until dawn')).toBe(11 * 86400 + 0.25 * 86400);
        expect(fallbackAdvance(def, t0, 'mumble')).toBeNull();
        expect(defaultStart(def)).toBe(8 * 3600);
    });
});

describe("reading the story's time of day", () => {
    it('reads parts of the day and clock times', () => {
        expect(timeOfDayFraction('evening')).toBeCloseTo(0.78);
        expect(timeOfDayFraction('late afternoon')).toBeCloseTo(0.68);
        expect(timeOfDayFraction('late evening')).toBeCloseTo(0.86);
        expect(timeOfDayFraction('Late at night')).toBeCloseTo(0.9);
        expect(timeOfDayFraction('late night')).toBeCloseTo(0.1);
        expect(timeOfDayFraction('midnight')).toBe(0);
        expect(timeOfDayFraction('21:30')).toBeCloseTo(21.5 / 24);
        expect(timeOfDayFraction('9 pm')).toBeCloseTo(21 / 24);
        expect(timeOfDayFraction('12 am')).toBe(0);
        expect(timeOfDayFraction('half past six in the morning')).toBeCloseTo(0.36);
        expect(timeOfDayFraction('unknown')).toBeNull();
        expect(timeOfDayFraction('')).toBeNull();
    });
    it("reads clock times in a fantasy calendar's hours", () => {
        expect(timeOfDayFraction('15:00', { hoursPerDay: 30, minutesPerHour: 60 })).toBeCloseTo(0.5);
        expect(timeOfDayFraction('27:00')).toBeNull();
    });
});

describe('the time of day the story shows', () => {
    const reply = 'The sun began to set over the fortress walls as it turned darker and colder. It was time for them to get some rest; he had a feeling their meeting with Graxx would not end so smoothly in the morning.';
    it('reads the day turning in plain narration', () => {
        expect(storyTimeCue(reply)).toEqual({ phrase: 'sunset', fraction: 0.77 });
        expect(storyTimeCue('Night fell over the wastes.')).toEqual({ phrase: 'night', fraction: 0.88 });
        expect(storyTimeCue('Dawn broke grey and cold.')).toEqual({ phrase: 'dawn', fraction: 0.25 });
    });
    it('ignores what is said about later', () => {
        expect(storyTimeCue('They would leave when the sun set.')).toBeNull();
        expect(storyTimeCue('We ride at dawn, before the sun rises.')).toBeNull();
        expect(storyTimeCue('Graxx paced the hall.')).toBeNull();
    });
    it('moves the clock forward only, to the next day for a dawn after dark', () => {
        expect(cueTarget({ phrase: 'sunset', fraction: 0.77 }, 10.5 / 24)).toEqual({ fraction: 0.77, nextDay: false });
        expect(cueTarget({ phrase: 'sunset', fraction: 0.77 }, 0.8)).toBeNull();
        expect(cueTarget({ phrase: 'dawn', fraction: 0.25 }, 0.9)).toEqual({ fraction: 0.25, nextDay: true });
        expect(cueTarget({ phrase: 'dawn', fraction: 0.25 }, 0.3)).toBeNull();
    });
});
