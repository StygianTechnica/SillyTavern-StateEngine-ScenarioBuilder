import { buildDirectorPrompt, parseDirectorNote, dossierText, mentionedIn, splitNote, itemMatters, matchPlace, MAX_NEW, peopleNamedIn, callNames } from '../src/director/prompt.js';

const input = {
    overview: { premise: 'A port city where the old gods are waking.', tone: 'gritty' },
    limits: ['There is NO gunpowder.'],
    location: {
        path: ['Veylan', 'Gilded Gull'], description: 'A smoky taproom.', indoor: true,
        items: [{ name: 'Ledger', description: 'The debt book.' }], places: [{ name: 'Cellar', description: '' }], partOf: { name: 'Veylan' },
    },
    cast: [{ name: 'Mira', role: 'innkeeper', goals: 'keep the inn', mood: 'wary', relations: ['toward Tobin: debtor'] }],
    quests: [{ name: 'Recover the ledger', priority: 'high', current: 'find the key' }],
    memories: ['Tobin borrowed forty crowns.'],
    messages: [{ name: 'Ash', text: 'I lean on the bar and ask about the cellar.', isUser: true }],
    userName: 'Ash',
};

describe('director prompt', () => {
    it('gives the director the whole scene and the latest chat', () => {
        const { system, prompt } = buildDirectorPrompt({ ...input, allowCreate: true });
        expect(system).toContain('Never decide or suggest what Ash says, does, thinks, feels or will do next');
        for (const bit of ['Veylan > Gilded Gull (indoors)', 'Here: Ledger (The debt book.)', 'Ways on: Cellar; back out to Veylan', 'wants: keep the inn', 'toward Tobin: debtor',
            'Recover the ledger [high]: now - find the key', 'Tobin borrowed forty crowns.', 'There is NO gunpowder.', 'Ash: I lean on the bar']) {
            expect(prompt).toContain(bit);
        }
        expect(prompt).toContain('natural prose');
        expect(prompt).toContain('NEW location | <name>');
    });

    it('asks for no new things when creation is off or the setting is canon-only', () => {
        expect(buildDirectorPrompt({ ...input, allowCreate: false }).prompt).not.toContain('NEW location');
        expect(buildDirectorPrompt({ ...input, allowCreate: true, canonOnly: true }).prompt).not.toContain('NEW location');
    });

    it('says when the location and people are not known', () => {
        const text = dossierText({});
        expect(text).toContain('Where: not known yet.');
        expect(text).toContain('WHO IS HERE: not known yet.');
    });

    it('briefs on the world when the player character is alone', () => {
        const alone = { cast: [{ name: 'Remus', player: true }] };
        expect(dossierText(alone)).toContain('- No one else is here.');
        const { prompt } = buildDirectorPrompt(alone);
        expect(prompt).toContain('No NPCs are present, so the reply is not empty: the world itself reacts.');
        expect(buildDirectorPrompt({ ...alone, othersTracked: true }).prompt).not.toContain('No NPCs are present');
        expect(prompt).not.toContain('what the people around Remus want');
        expect(buildDirectorPrompt({ cast: [...alone.cast, { name: 'Varyn' }] }).prompt).toContain('what the people around Remus want');
    });
});

describe('director note parsing', () => {
    it('keeps the prose and takes out NEW lines', () => {
        const raw = [
            'Briefing:',
            'In this reply, Mira eyes Ash and decides whether to mention the cellar.',
            '',
            'The cellar door creaks below the bar.',
            'NEW location | Wine cellar | A cramped, damp cellar under the taproom.',
            '- NEW character | Old Bram | A cellarman who knows too much. | nearby',
            'NEW item | Rusty key | Opens the cellar.',
        ].join('\n');
        const { note, created } = parseDirectorNote(raw);
        expect(note).toBe('In this reply, Mira eyes Ash and decides whether to mention the cellar.\n\nThe cellar door creaks below the bar.');
        expect(created).toEqual([
            { kind: 'location', name: 'Wine cellar', description: 'A cramped, damp cellar under the taproom.', here: true, why: '' },
            { kind: 'character', name: 'Old Bram', description: 'A cellarman who knows too much.', here: false, why: '' },
        ]);
    });

    it('caps new things, skips duplicates and unknown kinds', () => {
        const raw = ['Text.', 'NEW room | A | x', 'NEW room | a | y', 'NEW spell | B | z', 'NEW npc | C | w', 'NEW object | D | v', 'NEW place | E | u'].join('\n');
        const { note, created } = parseDirectorNote(raw);
        expect(note).toBe('Text.');
        expect(created.map((c) => c.name)).toEqual(['A', 'C']);
        expect(created).toHaveLength(MAX_NEW);
    });

    it('strips code fences and headings', () => {
        expect(parseDirectorNote('```\n## Notes\nIn this reply...\n```').note).toBe('Notes\nIn this reply...');
    });
});

describe('director scene keeping', () => {
    it('reads how much time passes and who arrives or leaves', () => {
        const raw = 'In this reply they ride north.\nTIME | 3 hours | the ride to the ford\nENTERS | Old Bram\nLEAVES | Tobin\n- LEAVES | Tobin';
        const parsed = parseDirectorNote(raw);
        expect(parsed.note).toBe('In this reply they ride north.');
        expect(parsed.time).toEqual({ text: '3 hours', why: 'the ride to the ford' });
        expect(parsed.enters).toEqual(['Old Bram']);
        expect(parsed.leaves).toEqual(['Tobin']);
        expect(parseDirectorNote('Just prose.').time).toBeNull();
    });

    it('asks for a TIME line and lists who could turn up', () => {
        const { prompt } = buildDirectorPrompt({ ...input, nearby: [{ name: 'Tobin', role: 'debt collector', why: 'seen earlier in this story' }], clock: { dayPart: 'evening', clock: '18:40', words: 'Thursday, day 4 of Stormfall', season: 'spring', sky: 'Dusk is falling.' } });
        expect(prompt).toContain('TIME | <how long, e.g. 5 minutes> | <why>');
        expect(prompt).toContain('OTHERS WHO COULD TURN UP');
        expect(prompt).toContain('- Tobin (debt collector) - seen earlier in this story');
        expect(prompt).toContain('When: evening (18:40), Thursday, day 4 of Stormfall, in spring.');
        expect(buildDirectorPrompt({ ...input, timeKeeping: false }).prompt).not.toContain('TIME | 5 minutes');
    });
});

describe('director perspective and restraint', () => {
    it('briefs on the others and never details the player character', () => {
        const cast = [{ name: 'Mira', role: 'innkeeper', mood: 'wary' }, { name: 'Ash', role: 'sellsword', mood: 'furious', intent: 'stab Tobin', player: true }];
        const { system, prompt } = buildDirectorPrompt({ ...input, cast, userName: 'Someone' });
        expect(system).toContain('Ash is the player character');
        expect(prompt).toContain('- Ash (sellsword): the player character, played by the human - never write for them.');
        expect(prompt).not.toContain('stab Tobin');
        expect(prompt).toContain('what the people around Ash want');
    });

    it('only lets in new things the recent chat brought up', () => {
        const chat = 'I ask Mira what is under the trapdoor. Is it the wine cellar?';
        expect(mentionedIn('Lantern Cellar', chat)).toBe(true);
        expect(mentionedIn('Iron trapdoor ring', chat)).toBe(true);
        expect(mentionedIn('Old Bram', chat)).toBe(false);
        expect(mentionedIn('The Great Hall', chat)).toBe(false);
    });
});

describe('director briefing parts', () => {
    it('splits the summary from the Next: paragraph', () => {
        expect(splitNote('Mira is wary.\n\nThe rain drums.\n\nNext: Tobin knocks.')).toEqual({ summary: 'Mira is wary.\n\nThe rain drums.', direction: 'Tobin knocks.' });
        expect(splitNote('One.\n\nTwo.\n\nThree.')).toEqual({ summary: 'One.\n\nTwo.', direction: 'Three.' });
        expect(splitNote('Just one.')).toEqual({ summary: 'Just one.', direction: '' });
        expect(parseDirectorNote('Mira is wary.\n**Next:** Tobin knocks.\nTIME | 5 minutes').direction).toBe('Tobin knocks.');
    });

    it('feeds the director general to immediate', () => {
        const { prompt } = buildDirectorPrompt({ ...input, allowCreate: false });
        const order = ['THE SETTING', 'ITS RULES', 'THREADS BEING FOLLOWED', 'WHAT HAS HAPPENED BEFORE', 'THE SCENE NOW', 'WHO IS HERE', 'THE LATEST CHAT', 'WRITE THE BRIEFING'].map((x) => prompt.indexOf(x));
        expect(order.every((x) => x >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(prompt).not.toMatch(/^1\. /m);
    });
});

describe('director weather', () => {
    it('reads a weather change from the allowed values only', () => {
        const parsed = parseDirectorNote('Prose.\nWEATHER | Thunderstorm, windy, purple rain | the storm the plot needs');
        expect(parsed.weather).toEqual({ values: ['Thunderstorm', 'Windy'], why: 'the storm the plot needs' });
        expect(parsed.note).toBe('Prose.');
        expect(parseDirectorNote('Prose.').weather).toBeNull();
        expect(parseDirectorNote('Prose.\nWEATHER | nonsense').weather).toBeNull();
    });
});

describe('items only when they matter', () => {
    const quests = [{ name: 'Recover the ledger', current: 'find the vault key' }];
    it('keeps items an open thread needs or the player named outright', () => {
        expect(itemMatters({ name: 'Vault key', why: 'opens the vault for Recover the ledger' }, { quests })).toBe(true);
        expect(itemMatters({ name: 'The Ledger', why: '' }, { quests })).toBe(true);
        expect(itemMatters({ name: 'Silver locket', why: '' }, { quests, latestUserText: 'I pick up the silver locket from the floor.' })).toBe(true);
    });
    it('leaves flavour out', () => {
        expect(itemMatters({ name: 'Iron trapdoor ring', why: 'atmosphere' }, { quests, latestUserText: 'What is under the trapdoor?' })).toBe(false);
        expect(itemMatters({ name: 'Chipped mug', why: '' }, { quests: [], latestUserText: 'I sit down.' })).toBe(false);
    });
    it('reads what the item serves and asks for it', () => {
        const parsed = parseDirectorNote('Prose.\nNEW item | Vault key | A heavy brass key. | Recover the ledger');
        expect(parsed.created[0]).toMatchObject({ kind: 'item', name: 'Vault key', why: 'Recover the ledger' });
        expect(buildDirectorPrompt({ ...input, allowCreate: true }).prompt).toContain('Describe ordinary objects in the prose only.');
    });
});

describe('director scene title', () => {
    it('reads a SCENE line and asks to keep the current title', () => {
        const parsed = parseDirectorNote('Prose.\nSCENE | "Siege at the Gate."');
        expect(parsed.scene).toBe('Siege at the Gate');
        expect(parsed.note).toBe('Prose.');
        expect(buildDirectorPrompt({ ...input, scene: { title: 'Rain at the Lantern' } }).prompt).toContain('keep "Rain at the Lantern" unless the scene has moved on');
        expect(buildDirectorPrompt({ ...input }).prompt).toContain('it has none yet');
    });
});

describe('finding the direction when the model words it its own way', () => {
    it('takes reworded markers, at a line or a sentence start', () => {
        expect(splitNote('Mira is wary.\nNext steps: Tobin knocks.').direction).toBe('Tobin knocks.');
        expect(splitNote('Mira is wary. **What happens next:** Tobin knocks.')).toEqual({ summary: 'Mira is wary.', direction: 'Tobin knocks.' });
        expect(splitNote('Mira is wary.\nGoing forward, the collector loses patience.').direction).toBe('The collector loses patience.');
        expect(splitNote('Mira is wary.\nDirection - Tobin knocks.').direction).toBe('Tobin knocks.');
    });
    it('takes the last of two paragraphs', () => {
        expect(splitNote('Mira is wary.\n\nTobin knocks soon.')).toEqual({ summary: 'Mira is wary.', direction: 'Tobin knocks soon.' });
    });
    it('finds a direction sentence in a single paragraph', () => {
        expect(splitNote('Mira is wary of the stranger. Rain drums on the shutters. Then Tobin knocks at the back door.'))
            .toEqual({ summary: 'Mira is wary of the stranger. Rain drums on the shutters.', direction: 'Then Tobin knocks at the back door.' });
        expect(splitNote('Mira is wary. The rain drums.').direction).toBe('');
    });
    it('does not mistake a word in the middle of a sentence for the marker', () => {
        expect(splitNote('She glances at the next table and the rain drums.').direction).toBe('');
    });
});

describe('director moves the scene', () => {
    it('reads where the scene goes, who goes along and indoors or out', () => {
        const parsed = parseDirectorNote('Prose.\nMOVE | The Outer Wall | Varyn and Niamh | outdoors');
        expect(parsed.move).toEqual({ place: 'The Outer Wall', along: ['Varyn', 'Niamh'], indoor: false });
        expect(parsed.note).toBe('Prose.');
        expect(parseDirectorNote('Prose.\nMOVE | Cellar | none | indoors').move).toEqual({ place: 'Cellar', along: [], indoor: true });
        expect(parseDirectorNote('Prose.\nMOVE | Cellar').move).toEqual({ place: 'Cellar', along: [], indoor: null });
        expect(parseDirectorNote('Prose.').move).toBeNull();
    });

    it('asks for a MOVE line', () => {
        expect(buildDirectorPrompt({ ...input }).prompt).toContain('MOVE | <the place the scene is in now> |');
    });

    it('finds the place by name or alias, near places first', () => {
        const places = [
            { id: 'a', name: 'The Outer Wall' },
            { id: 'b', name: 'Wall of the Old Keep' },
            { id: 'c', name: 'Gatehouse', aliases: ['the gate'] },
        ];
        expect(matchPlace('the Outer Wall', places)?.id).toBe('a');
        expect(matchPlace('The Gate', places)?.id).toBe('c');
        expect(matchPlace('the wall', places, ['b'])?.id).toBe('b');
        expect(matchPlace('the wall', places)?.id).toBe('a');
        expect(matchPlace('the docks', places)).toBeNull();
    });
});

describe('director reads the starting time of day', () => {
    it('asks for NOW only while the clock needs it, and reads the line', () => {
        expect(buildDirectorPrompt({ ...input, askNow: true }).prompt).toContain('NOW | <dawn, morning');
        expect(buildDirectorPrompt({ ...input }).prompt).not.toContain('NOW | <dawn');
        const parsed = parseDirectorNote('Prose.\nNOW | late evening\nTIME | 5 minutes');
        expect(parsed.now).toBe('late evening');
        expect(parsed.note).toBe('Prose.');
        expect(parseDirectorNote('Prose.').now).toBe('');
    });
});

describe('director and people taken out by hand', () => {
    it('lists them as not to appear and does not offer them as turning up', () => {
        const { prompt } = buildDirectorPrompt({ ...input, absent: ['Varyn'], nearby: [{ name: 'Varyn', why: 'seen earlier' }, { name: 'Tobin' }] });
        expect(prompt).toContain('TAKEN OUT OF THE SCENE BY THE PLAYER');
        expect(prompt).toContain('- Varyn');
        expect(prompt).not.toContain('- Varyn - seen earlier');
        expect(prompt).toContain('- Tobin');
    });
});

describe('who the situation names', () => {
    const characters = [
        { id: 'n', name: 'Niamh' },
        { id: 'm', name: 'High Seer Maren' },
        { id: 'l', name: 'Lucen, Angel of Loyalty' },
        { id: 'r', name: 'Remus Watt' },
    ];
    it('finds people by name, last name past a title, and the part before a comma', () => {
        const found = peopleNamedIn('Remus holds the wall while Niamh and Maren watch; Lucen hovers above.', characters).map((c) => c.id);
        expect(found).toEqual(['n', 'm', 'l', 'r']);
    });
    it('matches whole words only, and never a title alone', () => {
        expect(peopleNamedIn('The High priest and Niamhs cousin wait.', characters)).toEqual([]);
        expect(callNames({ name: 'High Seer Maren' })).not.toContain('High');
    });
});
