import { buildLorebook, toWorldInfo, freeBookName } from '../src/export/lorebook.js';

const world = {
    setting: {
        format: 'state-engine-setting',
        version: 1,
        fields: {
            item: [
                { name: 'owner', label: 'Owner', scope: 'global', type: 'object', objectType: 'character' },
                { name: 'location', label: 'Location', scope: 'global', type: 'object', objectType: 'location' },
                { name: 'condition', label: 'Condition', scope: 'chat', type: 'string' },
            ],
            character: [{ name: 'faction_ties', scope: 'global', type: 'array', itemType: 'object', itemObjectType: 'faction' }],
        },
        objects: {
            character: { chr_r: { id: 'chr_r', name: 'Rhys', aliases: ['Captain'], description: 'A grey-eyed sailor.\n\nHe owes the Guild.', faction_ties: ['fac_g'] } },
            location: {
                loc_city: { id: 'loc_city', name: 'Brassport', aliases: [], description: 'A port.' },
                loc_m: { id: 'loc_m', name: 'Brass Market', aliases: [], description: '' },
            },
            item: { itm_s: { id: 'itm_s', name: 'Dawnblade', aliases: [], description: 'A sword.', owner: 'chr_r', location: 'loc_m', condition: 'worn' } },
            faction: { fac_g: { id: 'fac_g', name: 'Guild', aliases: [], description: 'Merchants.' } },
            lore: { lor_x: { id: 'lor_x', name: 'Hidden', aliases: [], description: 'Not for the book.' } },
        },
    },
    library: {
        overview: { premise: 'A port city on the edge of war.', tone: 'grim', magic: { presence: 'none' } },
        entries: { loc_m: { parentId: 'loc_city' }, chr_r: { gmNotes: 'Secretly the heir.' }, lor_x: { excluded: true } },
        relations: [{ id: 'r', from: 'chr_r', to: 'fac_g', kind: 'serves', note: 'for now', mutual: false }],
    },
};

describe('a standard lorebook from a world', () => {
    const { entries, counts } = buildLorebook(world);
    const find = (name) => entries.find((e) => e.comment.startsWith(name));

    it('puts the overview in one constant entry', () => {
        expect(entries[0]).toMatchObject({ constant: true, comment: 'The world', key: [] });
        expect(entries[0].content).toContain('Premise: A port city on the edge of war.');
        expect(entries[0].content).toMatch(/NO magic/);
    });

    it('writes one entry per object, keyed by name and aliases', () => {
        expect(find('Rhys')).toMatchObject({ key: ['Rhys', 'Captain'], constant: false, objectId: 'chr_r' });
        expect(find('Rhys').content).toContain('Rhys (character), also called Captain.');
        expect(find('Rhys').content).toContain('He owes the Guild.');
        expect(counts).toMatchObject({ character: 1, location: 2, item: 1, faction: 1 });
    });

    it('names what a field points at, and where a place sits', () => {
        expect(find('Dawnblade').content).toContain('Owner: Rhys');
        expect(find('Dawnblade').content).toContain('Location: Brass Market');
        expect(find('Brass Market').content).toContain('Within: Brassport');
        expect(find('Rhys').content).toContain('Ties: serves Guild (for now)');
    });

    it('leaves out runtime fields, bookkeeping, GM notes and excluded entries', () => {
        expect(find('Dawnblade').content).not.toContain('worn');
        expect(find('Rhys').content).not.toContain('faction_ties');
        expect(find('Rhys').content).not.toContain('heir');
        expect(find('Hidden')).toBeUndefined();
    });

    it('includes GM notes when asked, and only the chosen types', () => {
        const out = buildLorebook(world, { gmNotes: true, types: ['character'] });
        expect(out.entries.filter((e) => !e.constant).map((e) => e.objectId)).toEqual(['chr_r']);
        expect(out.entries[1].content).toContain('GM notes: Secretly the heir.');
    });

    it('cuts an entry that runs long', () => {
        const long = structuredClone(world);
        long.setting.objects.character.chr_r.description = 'word '.repeat(1000);
        const out = buildLorebook(long, { maxChars: 300 });
        expect(out.entries.find((e) => e.objectId === 'chr_r').content.length).toBeLessThanOrEqual(300);
    });
});

describe('the book for SillyTavern', () => {
    it('fills the World Info template with numbered entries, marked as Scenario Builder\'s', () => {
        const book = toWorldInfo(buildLorebook(world), { probability: 100, depth: 4 });
        expect(Object.keys(book.entries)[0]).toBe('0');
        expect(book.entries[1]).toMatchObject({ uid: 1, probability: 100, depth: 4, selective: true, position: 0, disable: false, sbObjectId: expect.any(String) });
    });

    it('never takes a name already in use', () => {
        expect(freeBookName('Eldermark', ['eldermark', 'Eldermark (2)'])).toBe('Eldermark (3)');
        expect(freeBookName('New', [])).toBe('New');
    });
});
