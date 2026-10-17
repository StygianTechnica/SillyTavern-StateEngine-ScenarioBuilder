import { relevantLore, namedIn, planLore, loreUpdate, involvedIds } from '../src/library/lore.js';

// As stored in the God War chat's library: a long name, aliases joined
// with commas.
const elyon = { id: 'lor_e', name: 'Elyon, the Sovereign of Dawn', aliases: ['Elyon, Sovereign of Dawn, Lord of Radiant Retribution', "God of Light, Warriors' Champion"], related_entity_ids: [] };
const pact = { id: 'lor_p', name: 'The Old Pact', related_entity_ids: ['chr_remus'] };
const fall = { id: 'lor_f', name: 'The Fall of Varn', related_entity_ids: ['chr_maren'] };

describe('lore relevance', () => {
    it('finds a lore entry by the first part of a long name', () => {
        const out = relevantLore([elyon, pact], { recentText: 'Remus knelt. "Elyon has not forgotten you," the priest said.' });
        expect(out.map((x) => x.entry.id)).toEqual(['lor_e']);
        expect(out[0].why).toContain('"Elyon" was just mentioned');
    });

    it('matches whole words only, possessives included', () => {
        expect(namedIn("Elyon's light fades.", 'Elyon')).toBe(true);
        expect(namedIn('Elyonna waved.', 'Elyon')).toBe(false);
    });

    it('catches a proper-noun word of the name', () => {
        expect(relevantLore([fall], { recentText: 'They spoke of Varn in whispers.' })[0].entry.id).toBe('lor_f');
        expect(relevantLore([fall], { recentText: 'the fall was long' })).toEqual([]);
    });

    it('finds lore tied to someone the chat names, and to the scene', () => {
        const out = relevantLore([pact, fall], { recentText: 'Maren frowned.', sceneIds: ['chr_remus'], mentioned: [{ id: 'chr_maren', names: ['Maren'] }] });
        expect(out.map((x) => x.entry.id)).toEqual(['lor_f', 'lor_p']);
        expect(out[0].why).toContain('tied to Maren, just mentioned');
    });

    it('puts what was named ahead of what is merely tied to the scene, within the cap', () => {
        const tied = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, name: `Tied ${i}`, related_entity_ids: ['loc_here'] }));
        const out = relevantLore([...tied, elyon], { recentText: 'Elyon.', sceneIds: ['loc_here'] }, 8);
        expect(out).toHaveLength(8);
        expect(out[0].entry.id).toBe('lor_e');
    });
});

describe('lore from Archivist', () => {
    const world = { id: 'w5', kind: 'lore', name: 'The Old Pact', text: 'An oath sworn at the gate.', entity: null, involved: [{ id: 'chr_remus', type: 'character' }] };

    it('creates a new entry with the people involved', () => {
        expect(planLore(world, { lore: [] })).toEqual({ action: 'create', data: { name: 'The Old Pact', description: 'An oath sworn at the gate.', related_entity_ids: ['chr_remus'] } });
    });

    it('links by name, by link, or by the entity Archivist names', () => {
        expect(planLore(world, { lore: [pact] })).toEqual({ action: 'link', id: 'lor_p' });
        expect(planLore({ ...world, name: 'Elyon' }, { lore: [elyon] })).toEqual({ action: 'link', id: 'lor_e' });
        expect(planLore({ ...world, name: 'Other' }, { lore: [pact], links: { w5: 'lor_p' } })).toEqual({ action: 'link', id: 'lor_p' });
        expect(planLore({ ...world, name: 'Other', entity: { id: 'lor_e', type: 'lore' } }, { lore: [elyon] })).toEqual({ action: 'link', id: 'lor_e' });
    });

    it('does not make again what was deleted, dismissed or rejected', () => {
        expect(planLore(world, { lore: [], links: { w5: 'gone' } })).toEqual({ action: 'dismiss' });
        expect(planLore(world, { lore: [], dismissed: new Set(['w5']) })).toEqual({ action: 'skip' });
        expect(planLore(world, { lore: [], rejected: (n) => n === 'The Old Pact' })).toEqual({ action: 'skip' });
    });

    it('follows Archivist\'s text only while nobody has edited the description', () => {
        const entry = { id: 'lor_p', description: 'An oath.', related_entity_ids: [] };
        expect(loreUpdate(entry, world, 'An oath.')).toEqual({ patch: { description: 'An oath sworn at the gate.', related_entity_ids: ['chr_remus'] }, synced: 'An oath sworn at the gate.' });
        expect(loreUpdate({ ...entry, description: 'My own words.' }, world, 'An oath.').patch.description).toBeUndefined();
    });

    it('never links lore to itself as involved', () => {
        expect(involvedIds({ entity: { id: 'lor_x', type: 'lore' }, involved: [{ id: 'chr_a', type: 'character' }] })).toEqual(['chr_a']);
    });
});
