import { buildGuidance, buildStateBlock, truncate } from '../src/guidance/build.js';
import { fitToBudget, estimateTokens } from '../src/guidance/budget.js';
import { REFERENCE_HEADER } from '../src/constants.js';

const input = {
    overview: { premise: 'A port city where the old gods are waking.', tone: 'gritty', themes: 'debt, faith', era: '', rules: 'Magic costs memories.' },
    location: { path: ['Veylan', 'Old Quarter', 'Brass Market'], description: 'Stalls under copper awnings.', environment: { climate: { value: 'humid', from: 'Veylan' } }, indoor: false },
    time: { day: 3, dayPart: 'evening' },
    weather: ['Rainy', 'Windy'],
    temperature: 'Cool',
    scene: { title: 'The debt collector', premise: 'Mira must pay by midnight.' },
    cast: [{ name: 'Mira', role: 'innkeeper', description: 'Sharp-eyed and tired.', mood: 'Suspicious', intent: 'stall for time', why: 'present' }],
    corrections: ['The scene is still at Brass Market, not the docks.'],
    budget: 600,
};

describe('guidance', () => {
    it('starts with the reference line and holds every section', () => {
        const { text, sections } = buildGuidance(input);
        expect(text.startsWith(`${REFERENCE_HEADER}\n`)).toBe(true);
        expect(text).toContain('Location: Veylan > Old Quarter > Brass Market, outdoors.');
        expect(text).toContain('Time: day 3, evening.');
        expect(text).toContain('Weather: rainy, windy. Temperature: cool.');
        expect(text).toContain('Climate: humid (Veylan).');
        expect(text).toContain('- Mira (innkeeper): Sharp-eyed and tired. Mood: suspicious. Intends: stall for time.');
        expect(text).toContain('- The scene is still at Brass Market, not the docks.');
        expect(sections.every((s) => s.mode === 'full')).toBe(true);
    });

    it('never names the extension', () => {
        expect(buildGuidance(input).text.toLowerCase()).not.toContain('scenario builder');
    });

    it('is deterministic (SB-015)', () => {
        expect(buildGuidance(structuredClone(input)).text).toBe(buildGuidance(structuredClone(input)).text);
    });

    it('is empty when there is nothing to say (SB-304)', () => {
        expect(buildGuidance({ budget: 600 }).text).toBe('');
        expect(buildGuidance({ ...input, sections: { overview: false, location: false, scene: false, cast: false, corrections: false } }).text).toBe('');
    });

    it('marks sections switched off', () => {
        const { text, sections } = buildGuidance({ ...input, sections: { cast: false } });
        expect(text).not.toContain('Mira (innkeeper)');
        expect(sections.find((s) => s.key === 'cast').mode).toBe('off');
    });

    it('compacts, then drops, low-priority sections first and keeps location and corrections', () => {
        const { sections, tokens } = buildGuidance({ ...input, budget: 60 });
        const mode = Object.fromEntries(sections.map((s) => [s.key, s.mode]));
        expect(mode.overview).toBe('dropped');
        expect(['full', 'compact']).toContain(mode.location);
        expect(mode.corrections).toBe('full');
        expect(tokens).toBeGreaterThan(0);
    });
});

describe('budget', () => {
    it('estimates tokens as chars / 4', () => {
        expect(estimateTokens('abcd')).toBe(1);
        expect(estimateTokens('abcde')).toBe(2);
        expect(estimateTokens('')).toBe(0);
    });

    it('never drops kept sections', () => {
        const result = fitToBudget([{ key: 'a', priority: 1, keep: true, full: 'x'.repeat(400) }], 10);
        expect(result.sections[0].mode).toBe('full');
    });

    it('truncates at a word boundary', () => {
        expect(truncate('one two three four five', 14)).toBe('one two three…');
    });
});

describe('state block', () => {
    it('renders canonical values, a line each', () => {
        expect(buildStateBlock({ locationPath: ['Veylan', 'Brass Market'], indoor: false, time: { day: 3, dayPart: 'evening' }, weather: ['Rainy'], temperature: 'Cool', sceneTitle: 'Debts', castNames: ['Mira'] }))
            .toBe(`${REFERENCE_HEADER}\nLocation: Veylan > Brass Market\nIndoors: no\nTime: day 3, evening\nWeather: Rainy\nTemperature: Cool\nScene: Debts\nPresent: Mira`);
    });

    it('is empty with nothing set', () => {
        expect(buildStateBlock({})).toBe('');
    });
});
