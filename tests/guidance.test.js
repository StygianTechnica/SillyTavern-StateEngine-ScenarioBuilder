import { buildGuidance, buildStateBlock, buildCast, guidanceParts, truncate, aloneText } from '../src/guidance/build.js';
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
        expect(text).not.toContain('Mira, the innkeeper');
        expect(text).toContain('Hold to these: The scene is still at Brass Market, not the docks.');
        expect(sections.filter((s) => !['quests', 'summary', 'direction', 'lore', 'limits', 'absent', 'alone', 'style', 'secrets', 'intimacy'].includes(s.key)).every((s) => s.mode === 'full')).toBe(true);
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
        expect(buildGuidance({ ...input, sections: { director: false, overview: false, location: false, scene: false, corrections: false } }).text).toBe('');
    });

    it('marks sections switched off', () => {
        const { text, sections } = buildGuidance({ ...input, sections: { overview: false } });
        expect(text).not.toContain('A port city where the old gods are waking.');
        expect(sections.find((s) => s.key === 'overview').mode).toBe('off');
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
        const text = buildCast({ cast: [{ name: 'Mira', role: 'innkeeper', relations: ['toward Tobin: debtor, wary, worsening'] }] });
        expect(text).toContain('- Mira: Innkeeper. Toward Tobin: debtor, wary, worsening.');
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
    it('comes last - summary, then direction - and is never dropped', () => {
        const director = { summary: 'Mira stalls for time while the collector looms.', direction: 'Tobin loses patience.' };
        const { text, sections } = buildGuidance({ ...input, director, budget: 60 });
        expect(text.endsWith(`${director.summary}\n\n${director.direction}`)).toBe(true);
        expect(sections.find((s) => s.key === 'summary').mode).toBe('full');
        expect(sections.find((s) => s.key === 'direction').mode).toBe('full');
    });

    it('goes from the general to the immediate', () => {
        const overview = { premise: 'A port city where the old gods are waking.', magic: { presence: 'none' } };
        const { text } = buildGuidance({ ...input, overview, quests: [{ name: 'Recover the ledger' }], director: { summary: 'SUMMARY.', direction: 'DIRECTION.' }, budget: 4000 });
        const at = (bit) => text.indexOf(bit);
        const order = ['A port city', "Never break the world's limits", 'Recover the ledger', 'The scene is set in', 'SUMMARY.', 'DIRECTION.'].map(at);
        expect(order.every((x) => x >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
});

describe('characters present (sb__cast)', () => {
    const cast = [
        { name: 'Mira', role: 'innkeeper', description: 'Sharp-eyed and tired.', personality: 'Dry humour', goals: 'Keep the inn', mood: 'Suspicious', intent: 'stall for time' },
        { name: 'Ash', role: 'sellsword', description: 'Scarred.', mood: 'Angry', intent: 'draw a blade', thought: 'Kill him.', player: true },
    ];
    it('is one line each, the player character marked and never given wants or moods', () => {
        const text = buildCast({ cast });
        expect(text.startsWith(`${REFERENCE_HEADER}\nAdditional Context-Characters present:\n`)).toBe(true);
        expect(text).toContain('- Mira: Innkeeper. Sharp-eyed and tired. Dry humour. Wants: keep the inn. Now: suspicious, means to stall for time.');
        expect(text).toContain('- Ash (sellsword): the player character, played by the user.');
        expect(text).not.toMatch(/angry|blade|Kill him/i);
        expect(text).toContain("Never write Ash's words, actions, thoughts or feelings.");
    });
    it('is empty with nobody present', () => {
        expect(buildCast({ cast: [] })).toBe('');
    });
});

describe('guidance in parts', () => {
    it('splits the same text into six variables, each with its header', () => {
        const overview = { premise: 'A port city where the old gods are waking.', magic: { presence: 'none' } };
        const built = buildGuidance({ ...input, overview, quests: [{ name: 'Recover the ledger' }], director: { summary: 'SUMMARY.', direction: 'DIRECTION.' }, budget: 4000 });
        const parts = guidanceParts(built);
        expect(Object.keys(parts)).toEqual(['guidance_setting', 'guidance_rules', 'guidance_threads', 'guidance_scene', 'guidance_summary', 'guidance_direction']);
        expect(parts.guidance_setting).toMatch(/^THE SETTING \(reference only - do not continue\)\nA port city/);
        expect(parts.guidance_rules).toContain("Never break the world's limits");
        expect(parts.guidance_threads).toContain('Recover the ledger');
        expect(parts.guidance_scene).toContain('The scene is set in Brass Market');
        expect(parts.guidance_scene).toContain('Hold to these');
        expect(parts.guidance_summary).toBe('WHERE THINGS STAND (reference only - do not continue)\nSUMMARY.');
        expect(parts.guidance_direction).toBe('WHERE THIS REPLY SHOULD GO (reference only - do not continue)\nDIRECTION.');
    });

    it('leaves an empty part empty', () => {
        expect(guidanceParts(buildGuidance({ budget: 600 })).guidance_threads).toBe('');
    });
});

describe('people taken out of the scene by hand', () => {
    it('are named as not here in the cast block, even with nobody left', () => {
        expect(buildCast({ cast: [{ name: 'Remus', player: true }], absent: ['Varyn', 'Niamh'] })).toContain('Not here: Varyn and Niamh. They are elsewhere now; do not write them into this reply.');
        expect(buildCast({ cast: [], absent: ['Varyn'] })).toContain('Not here: Varyn.');
    });
    it('close the guidance, in the direction part', () => {
        const built = buildGuidance({ ...input, director: { summary: 'S.', direction: 'D.' }, absent: ['Varyn', 'Niamh'], budget: 100 });
        expect(built.text.endsWith('Varyn and Niamh are not in this scene: leave them out of this reply entirely - no lines, no actions, no presence.')).toBe(true);
        expect(guidanceParts(built).guidance_direction).toContain('D.\n\nVaryn and Niamh are not in this scene');
    });
});

describe('the player character alone in the scene', () => {
    const solo = { cast: [{ name: 'Remus', player: true }], location: { path: ['Gatehouse'], creatures: [{ name: 'Zombies' }] }, budget: 600 };
    it('tells the reply to let the world answer, naming the creatures here', () => {
        const text = buildCast(solo);
        expect(text).toContain('When no NPCs are present, the reply is not empty. The world itself reacts. Describe ONLY:');
        expect(text).toContain('- creatures acting independently (here: Zombies)');
        // The world's part names nobody: naming the player character invites the model to write for them.
        expect(aloneText(solo)).not.toContain('Remus');
    });
    it('closes the direction part of the guidance', () => {
        const built = buildGuidance(solo);
        expect(built.sections.find((s) => s.key === 'alone').mode).toBe('full');
        expect(guidanceParts(built).guidance_direction).toContain('- divine or supernatural forces');
        expect(guidanceParts(built).guidance_direction).not.toContain('Remus');
    });
    it("says nothing while State Engine's tracker has someone else here", () => {
        expect(aloneText({ ...solo, othersTracked: true })).toBe('');
        expect(buildGuidance({ ...solo, othersTracked: true }).sections.find((s) => s.key === 'alone').mode).toBe('empty');
    });
    it('says nothing when someone else is present', () => {
        const built = buildGuidance({ ...solo, cast: [...solo.cast, { name: 'Varyn' }] });
        expect(built.sections.find((s) => s.key === 'alone').mode).toBe('empty');
        expect(buildCast({ ...solo, cast: [...solo.cast, { name: 'Varyn' }] })).not.toContain('No one else');
    });
});

describe('how the world looks', () => {
    const wasteland = { worldType: 'post_apocalyptic', era: 'early 2000s', tech: { level: 'tl6', flavors: ['salvaged / scavenged'] } };
    it('is in the world rules, which are never dropped', () => {
        const built = buildGuidance({ overview: wasteland, budget: 150 });
        const rules = built.sections.find((s) => s.key === 'limits');
        expect(rules.mode).toBe('full');
        expect(rules.text).toContain('How this world looks: post-apocalyptic wasteland');
        expect(rules.text).toContain('no suits of armour on display');
    });
    it('says nothing of castles in a fantasy world', () => {
        expect(buildGuidance({ overview: { worldType: 'fantasy', tech: { level: 'tl3' } } }).text).not.toContain('suits of armour');
    });
});

describe('people with agendas of their own', () => {
    it('are told to take the initiative, not only react', () => {
        const text = buildCast({ cast: [{ name: 'Remus', player: true }, { name: 'Graxx' }, { name: 'Niamh' }] });
        expect(text).toContain('Each pursues their own aims: in this reply at least one of them takes the initiative');
        expect(buildCast({ cast: [{ name: 'Remus', player: true }, { name: 'Graxx' }] })).toContain('They pursue their own aims: in this reply they take the initiative');
    });
    it('follow the user\'s own instructions for running the story', () => {
        const built = buildGuidance({ overview: { gmStyle: 'NPCs act without waiting for Remus' }, director: { summary: 'S.', direction: 'D.' }, budget: 600 });
        expect(guidanceParts(built).guidance_direction).toContain('How this story is run: NPCs act without waiting for Remus.\n\nD.');
    });
});
