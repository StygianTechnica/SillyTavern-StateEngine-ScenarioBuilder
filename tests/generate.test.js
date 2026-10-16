import { buildGenerationPrompt, parseGenerationResponse, extractJson, mergeGenerated } from '../src/generate/prompt.js';
import { randomFor, eraGroups, splitList, joinList } from '../src/library/world-options.js';

const type = { id: 'character', label: 'Character', noun: 'character' };
const fields = [
    { name: 'role', label: 'Role', kind: 'text' },
    { name: 'personality', label: 'Personality', kind: 'longtext' },
    { name: 'mood', label: 'Mood', kind: 'enum', values: ['Calm', 'Angry'] },
    { name: 'faction', label: 'Faction', kind: 'ref', refType: 'faction' },
    { name: 'traits', label: 'Traits', kind: 'list' },
];
const overview = { premise: 'A drowned port city.', tone: 'gritty', era: 'age of sail', worldType: 'fantasy' };

describe('generation prompts', () => {
    it('asks only for the empty fields when filling', () => {
        const { user, keys } = buildGenerationPrompt({ task: 'fill', type, fields, entry: { name: 'Mira', values: { description: 'An innkeeper.', role: 'innkeeper' } }, overview });
        expect(keys).toEqual(['aliases', 'personality', 'mood', 'faction', 'traits']);
        expect(user).toContain('Description (description): An innkeeper.');
        expect(user).toContain('Premise: A drowned port city.');
        expect(user).not.toMatch(/- "role"/);
    });

    it('builds on existing text when enriching one field', () => {
        const { user, keys } = buildGenerationPrompt({ task: 'field', targetField: 'description', type, fields, entry: { name: 'Mira', values: { description: 'An innkeeper.' } } });
        expect(keys).toEqual(['description']);
        expect(user).toContain('keep everything it already says');
    });

    it('creates from nothing, avoiding existing names', () => {
        const { user, keys } = buildGenerationPrompt({ task: 'create', type, fields, similarNames: ['Mira', 'Tobin'], refNames: { faction: ['The Ledger Guild'] }, parentName: 'Veylan' });
        expect(keys[0]).toBe('name');
        expect(user).toContain('Surprise the user');
        expect(user).toContain('do not reuse their names: Mira, Tobin');
        expect(user).toContain('"The Ledger Guild"');
        expect(user).toContain('located inside Veylan');
    });

    it('uses a brief, memories and neighbours', () => {
        const { user } = buildGenerationPrompt({ task: 'create', type, fields, brief: 'a smuggler with a conscience', memories: ['She hid the boy in the cellar.'], neighbours: [{ relation: 'Inside', type: 'location', name: 'Veylan', description: 'A port.' }] });
        expect(user).toContain('a smuggler with a conscience');
        expect(user).toContain('She hid the boy in the cellar.');
        expect(user).toContain('- Inside: Veylan (location) - A port.');
    });
});

describe('parsing answers', () => {
    const lookup = (t, n) => (t === 'faction' && n.toLowerCase() === 'the ledger guild' ? 'fac_1' : null);

    it('finds JSON among chatter and fences', () => {
        expect(extractJson('Sure!\n```json\n{"a": "b {x}", "c": [1,2,],}\n```')).toEqual({ a: 'b {x}', c: [1, 2] });
        expect(extractJson('no json')).toBeNull();
    });

    it('fits values to the fields and drops what does not fit', () => {
        const keys = ['name', 'description', 'mood', 'faction', 'traits', 'role'];
        const { values, dropped, error } = parseGenerationResponse('{"name":"Kess","description":"A smuggler.","mood":"angry","faction":"the ledger guild","traits":"wry, loyal","role":"","made_up":1}', { fields, keys, refLookup: lookup });
        expect(error).toBeNull();
        expect(values).toEqual({ name: 'Kess', description: 'A smuggler.', mood: 'Angry', faction: 'fac_1', traits: ['wry', 'loyal'] });
        expect(dropped).toEqual(['made_up']);
    });

    it('reports unknown references and enum values', () => {
        const { dropped } = parseGenerationResponse('{"mood":"Ecstatic","faction":"Nobody"}', { fields, keys: ['mood', 'faction'], refLookup: lookup });
        expect(dropped).toEqual(['mood: Ecstatic', 'faction: Nobody']);
    });

    it('fails clearly on a non-answer', () => {
        expect(parseGenerationResponse('I cannot do that.', { fields, keys: ['role'] }).error).toMatch(/JSON/);
    });

    it('never overwrites content when filling', () => {
        expect(mergeGenerated({ role: 'innkeeper', personality: '' }, { role: 'pirate', personality: 'wry' }, 'fill')).toEqual({ role: 'innkeeper', personality: 'wry' });
        expect(mergeGenerated({ role: 'innkeeper' }, { role: 'innkeeper of the docks' }, 'field')).toEqual({ role: 'innkeeper of the docks' });
    });
});

describe('world options', () => {
    it('rolls values constrained by what is set', () => {
        const zero = () => 0;
        expect(randomFor('era', { worldType: 'science_fiction' }, zero)).toBe('near future');
        expect(randomFor('magicLevel', { worldType: 'fantasy' }, zero)).toBe('low');
        expect(randomFor('magicLevel', { worldType: 'historical' }, zero)).toBe('none');
        expect(splitList(randomFor('tone', {}, zero))).toHaveLength(2);
    });

    it('orders era groups by world type and joins lists', () => {
        expect(eraGroups('modern')[0].key).toBe('modern');
        expect(joinList(['dark', ' dark', 'heroic'])).toBe('dark, heroic');
    });
});
