import { buildDirectorPrompt, parseDirectorNote, dossierText, MAX_NEW } from '../src/director/prompt.js';

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
        expect(system).toContain('Never decide what Ash says, does, thinks or feels');
        for (const bit of ['Veylan > Gilded Gull (indoors)', 'Items here: Ledger (The debt book.)', 'Places off it: Cellar', 'wants: keep the inn', 'toward Tobin: debtor',
            'Recover the ledger [high]: now - find the key', 'Tobin borrowed forty crowns.', 'There is NO gunpowder.', 'Ash: I lean on the bar']) {
            expect(prompt).toContain(bit);
        }
        expect(prompt).toContain('flowing prose');
        expect(prompt).toContain('NEW location | Name');
    });

    it('asks for no new things when creation is off or the setting is canon-only', () => {
        expect(buildDirectorPrompt({ ...input, allowCreate: false }).prompt).not.toContain('NEW location');
        expect(buildDirectorPrompt({ ...input, allowCreate: true, canonOnly: true }).prompt).not.toContain('NEW location');
    });

    it('says when the location and people are not known', () => {
        const text = dossierText({});
        expect(text).toContain('LOCATION: not known yet.');
        expect(text).toContain('PEOPLE PRESENT: not known yet.');
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
            { kind: 'location', name: 'Wine cellar', description: 'A cramped, damp cellar under the taproom.', here: true },
            { kind: 'character', name: 'Old Bram', description: 'A cellarman who knows too much.', here: false },
            { kind: 'item', name: 'Rusty key', description: 'Opens the cellar.', here: true },
        ]);
    });

    it('caps new things, skips duplicates and unknown kinds', () => {
        const raw = ['Text.', 'NEW room | A | x', 'NEW room | a | y', 'NEW spell | B | z', 'NEW npc | C | w', 'NEW object | D | v', 'NEW place | E | u'].join('\n');
        const { note, created } = parseDirectorNote(raw);
        expect(note).toBe('Text.');
        expect(created.map((c) => c.name)).toEqual(['A', 'C', 'D']);
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
        expect(prompt).toContain('TIME | 5 minutes | why');
        expect(prompt).toContain('OTHERS WHO COULD TURN UP');
        expect(prompt).toContain('- Tobin (debt collector) - seen earlier in this story');
        expect(prompt).toContain('TIME: evening (18:40), Thursday, day 4 of Stormfall, in spring');
        expect(buildDirectorPrompt({ ...input, timeKeeping: false }).prompt).not.toContain('TIME | 5 minutes');
    });
});
