// Generation stays true to the setting: a place follows the place it is
// in, and references (a faction's members) must be tied to the entry.
import { buildGenerationPrompt, groundRefs } from '../src/generate/prompt.js';
import { placeContext } from '../src/generate/run.js';

const all = {
    location: [
        { id: 'loc_world', type: 'location', name: 'Alvarand' },
        { id: 'loc_fort', type: 'location', name: "Niamh's Fortress", description: 'A walled refuge whose defenders hold out against the death god\'s hordes.', startValues: { factions: ['fac_def'] } },
        { id: 'loc_wall', type: 'location', name: "Niamh's Wall" },
    ],
    faction: [
        { id: 'fac_def', type: 'faction', name: 'Fortress defenders', description: 'They fight the undead.' },
        { id: 'fac_choir', type: 'faction', name: 'Pale Choir', description: 'Priests of the death god.' },
        { id: 'fac_raid', type: 'faction', name: 'Ravagers', base: { territory: 'loc_fort' } },
    ],
    character: [{ id: 'chr_niamh', type: 'character', name: 'Niamh' }, { id: 'chr_graxx', type: 'character', name: 'Graxx' }, { id: 'chr_varyn', type: 'character', name: 'Varyn Vance' }],
};
const parents = { loc_fort: 'loc_world', loc_wall: 'loc_fort' };

describe('the place an entry belongs to', () => {
    it('lists the places it is inside, nearest first, and the factions tied to them', () => {
        const ctx = placeContext('loc_fort', all, parents, [{ from: 'fac_choir', to: 'loc_world', kind: 'rival' }]);
        expect(ctx.path.map((p) => p.name)).toEqual(["Niamh's Fortress", 'Alvarand']);
        expect(ctx.factions.map((f) => f.name).sort()).toEqual(['Fortress defenders', 'Pale Choir', 'Ravagers']);
        expect(placeContext(null, all, parents)).toBeNull();
    });

    it('puts the place first in the prompt and tells the model to stay true to it', () => {
        const place = placeContext('loc_fort', all, parents);
        const { user } = buildGenerationPrompt({ task: 'fill', type: { id: 'location', noun: 'location' }, fields: [], entry: { name: "Niamh's Wall", values: {} }, place, overview: { premise: 'The death god\'s hordes rule the land.' } });
        expect(user).toContain('# Where it is (it belongs to this place');
        expect(user).toContain("- Inside: Niamh's Fortress - A walled refuge whose defenders hold out against the death god's hordes.");
        expect(user).toContain('- Which is inside: Alvarand');
        expect(user).toContain('- Tied to it: Fortress defenders (faction) - They fight the undead.');
        expect(user).toContain("It is part of Niamh's Fortress: keep it true to that place");
        expect(user).toContain('Never make it serve a side the place it is in stands against.');
        const plain = buildGenerationPrompt({ task: 'field', targetField: 'description', type: { id: 'location', noun: 'location' }, fields: [], entry: { name: "Niamh's Wall", values: {} }, place });
        expect(plain.user).toContain("It is part of Niamh's Fortress");
        expect(buildGenerationPrompt({ task: 'fill', type: { id: 'location', noun: 'location' }, fields: [], entry: { name: 'X', values: {} } }).user).not.toContain('# Where it is');
    });
});

describe('references must be tied to the entry', () => {
    const fields = [{ name: 'members', label: 'Members', kind: 'refs', refType: 'character' }, { name: 'leader', label: 'Leader', kind: 'ref', refType: 'character' }];
    const nameOf = (id) => all.character.find((c) => c.id === id)?.name ?? '';

    it('keeps members already there, related ones and ones its text names; drops the rest', () => {
        const out = groundRefs({ members: ['chr_niamh', 'chr_graxx', 'chr_varyn'], leader: 'chr_graxx' }, fields, {
            existing: { members: ['chr_varyn'] },
            relatedNames: ['Niamh'],
            text: 'A band sworn to the fortress.',
            nameOf,
        });
        expect(out.values.members).toEqual(['chr_niamh', 'chr_varyn']);
        expect(out.values.leader).toBe('');
        expect(out.dropped).toEqual(['Members: Graxx (nothing ties them to it)', 'Leader: Graxx (nothing ties it to it)']);
    });

    it('keeps a member the entry\'s own text names, as a whole word', () => {
        const out = groundRefs({ members: ['chr_graxx'] }, fields, { text: 'Led in all but name by Graxx.', nameOf });
        expect(out.values.members).toEqual(['chr_graxx']);
        expect(groundRefs({ members: ['chr_graxx'] }, fields, { text: 'Graxxian fanatics', nameOf }).values.members).toEqual([]);
    });

    it('asks for references as "only ones tied to it"', () => {
        const { user } = buildGenerationPrompt({ task: 'fill', type: { id: 'faction', noun: 'faction' }, fields, entry: { name: 'Fortress defenders', values: {} }, refNames: { character: ['Niamh', 'Graxx'] } });
        expect(user).toContain('only ones the facts above actually tie to it (an empty list is fine; never pick names just to fill it)');
        expect(user).toContain('only one the facts above actually tie to it; nothing if none is');
    });
});
