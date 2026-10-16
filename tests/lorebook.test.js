import { readEntries, matchEntry, buildClassifyPrompt, parseClassify, buildExtractPrompt, fallbackValues, blanksOnly } from '../src/import/lorebook.js';

const book = {
    entries: {
        0: { uid: 0, comment: 'Brass Market', key: ['market', 'brass market'], keysecondary: [], content: 'Stalls under copper awnings in the Old Quarter of Veylan.', disable: false },
        1: { uid: 1, comment: '', key: ['Mira', 'the widow'], content: 'Mira Vane runs the Drowned Lantern. Her husband vanished at sea.' },
        2: { uid: 2, comment: 'Empty', key: ['x'], content: '   ' },
        3: { uid: 3, comment: 'Old rule', key: [], content: 'Always write in third person.', disable: true },
    },
};

describe('reading a lorebook', () => {
    it('reads entries, skipping empty ones, with a source marker', () => {
        const entries = readEntries('Ashen Coast', book);
        expect(entries.map((e) => e.title)).toEqual(['Brass Market', 'Mira', 'Old rule']);
        expect(entries[0]).toMatchObject({ keys: ['market', 'brass market'], source: 'lorebook:Ashen Coast#0', disabled: false });
        expect(entries[2].disabled).toBe(true);
    });

    it('matches entries to existing objects by title, key, alias or earlier import', () => {
        const [market, mira] = readEntries('Ashen Coast', book);
        const objects = [
            { id: 'loc_1', type: 'location', name: 'The Brass Market', aliases: ['Brass Market'] },
            { id: 'chr_1', type: 'character', name: 'Mira Vane', aliases: ['Mira'] },
            { id: 'chr_2', type: 'character', name: 'Someone', aliases: [], meta: { source: 'lorebook:Other#9' } },
        ];
        expect(matchEntry(market, objects).id).toBe('loc_1');
        expect(matchEntry(mira, objects).id).toBe('chr_1');
        expect(matchEntry({ ...market, title: 'Nowhere', keys: [], source: 'lorebook:Other#9' }, objects).id).toBe('chr_2');
        expect(matchEntry({ ...market, title: 'Docks', keys: ['pier'] }, objects)).toBeNull();
    });
});

describe('classifying and extracting', () => {
    const [market] = readEntries('Ashen Coast', book);

    it('asks for one "kind | name" line and reads it forgivingly', () => {
        expect(buildClassifyPrompt(market).user).toContain('kind | name');
        expect(parseClassify('location | The Brass Market', market)).toEqual({ type: 'location', name: 'The Brass Market' });
        expect(parseClassify('Sure!\n**Location** | Brass Market.', market)).toEqual({ type: 'location', name: 'Brass Market' });
        expect(parseClassify('characters | Mira', market).type).toBe('character');
        expect(parseClassify('skip', market).type).toBe('skip');
        expect(parseClassify('location', market)).toEqual({ type: 'location', name: 'Brass Market' });
        expect(parseClassify('I am not sure', market)).toBeNull();
    });

    it('asks only for blank fields, from the entry alone', () => {
        const fields = [{ name: 'region', label: 'Region', kind: 'text' }];
        const { user, keys } = buildExtractPrompt(market, { typeNoun: 'location', name: 'Brass Market', fields, locations: ['Veylan'], existing: { description: 'Already written.' } });
        expect(keys).toEqual(['aliases', 'region', 'located_in']);
        expect(user).toContain('Use ONLY what the entry says');
        expect(user).toContain('Veylan');
    });

    it('falls back to the entry text and keywords', () => {
        expect(fallbackValues(market, 'Brass Market')).toEqual({ description: market.content, aliases: ['market'] });
    });

    it('fills blanks only and appends new aliases', () => {
        const existing = { name: 'Mira Vane', description: 'Innkeeper.', role: '', aliases: ['Mira'] };
        expect(blanksOnly(existing, { description: 'Other text', role: 'innkeeper', aliases: ['mira', 'The Widow'] }))
            .toEqual({ role: 'innkeeper', aliases: ['Mira', 'The Widow'] });
    });
});
