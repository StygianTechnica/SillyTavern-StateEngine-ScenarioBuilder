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
        expect(text).toContain('The scene is set in Brass Market, in Old Quarter, Veylan, out of doors.');
        expect(text).toContain('It is evening on day 3;');
        expect(text).toContain('the weather is rainy and windy; the air is cool.');
        expect(text).toContain('The climate is humid.');
        expect(text).toContain('Mira, the innkeeper, is here. Sharp-eyed and tired. Right now Mira feels suspicious and means to stall for time.');
        expect(text).toContain('Hold to these: The scene is still at Brass Market, not the docks.');
        expect(sections.filter((s) => !['quests', 'director', 'lore'].includes(s.key)).every((s) => s.mode === 'full')).toBe(true);
        expect(text).not.toMatch(/^\[/m);
    });

    it('never names the extension', () => {
        expect(buildGuidance(input).text.toLowerCase()).not.toContain('scenario builder');
    });

    it('is deterministic (SB-015)', () => {
        expect(buildGuidance(structuredClone(input)).text).toBe(buildGuidance(structuredClone(input)).text);
    });

    it('is empty when there is nothing to say (SB-304)', () => {
        expect(buildGuidance({ budget: 600 }).text).toBe('');
        expect(buildGuidance({ ...input, sections: { director: false, overview: false, location: false, scene: false, cast: false, corrections: false } }).text).toBe('');
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

describe('relationships in the cast', () => {
    it('adds how present characters feel toward each other', () => {
        const { text } = buildGuidance({ cast: [{ name: 'Mira', role: 'innkeeper', relations: ['toward Tobin: debtor, wary, worsening'] }], budget: 600 });
        expect(text).toContain('Mira, the innkeeper, is here. Toward Tobin: debtor, wary, worsening.');
    });
});

describe('active quests in the guidance', () => {
    it('lists them with what is being worked on now', () => {
        const { text } = buildGuidance({ quests: [{ name: 'Recover the ledger', type: 'side', priority: 'high', current: 'break into the vault', progress: '1 of 2 objectives done', description: 'Tobin wants it back.' }], budget: 600 });
        expect(text).toContain('The story is following these threads');
        expect(text).toContain('Recover the ledger, a high-priority side quest: next, break into the vault. 1 of 2 objectives done. Tobin wants it back.');
    });
});

describe('director note in the guidance', () => {
    it('comes first, as prose, and is never dropped', () => {
        const note = 'In this reply, Mira stalls for time while the collector looms.';
        const { text, sections } = buildGuidance({ ...input, director: note, budget: 60 });
        expect(text.startsWith(`${REFERENCE_HEADER}
${note}`)).toBe(true);
        expect(sections.find((s) => s.key === 'director').mode).toBe('full');
    });
});
