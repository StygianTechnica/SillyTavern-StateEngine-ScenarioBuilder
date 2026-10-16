import { ancestors, pathOf, wouldCreateCycle, childrenOf, descendantsOf, parentsAfterDelete, buildTree, relation, isWithin, inheritedEnvironment } from '../src/library/hierarchy.js';

// world > city > (market > stall), (docks)
const parents = { city: 'world', market: 'city', stall: 'market', docks: 'city', moon: null };
const ids = ['world', 'city', 'market', 'stall', 'docks', 'moon'];

describe('location hierarchy', () => {
    it('walks ancestors and paths', () => {
        expect(ancestors(parents, 'stall')).toEqual(['market', 'city', 'world']);
        expect(pathOf(parents, 'stall')).toEqual(['world', 'city', 'market', 'stall']);
        expect(pathOf(parents, 'world')).toEqual(['world']);
        expect(pathOf(parents, '')).toEqual([]);
    });

    it('survives a cycle in malformed data', () => {
        expect(ancestors({ a: 'b', b: 'a' }, 'a')).toEqual(['b']);
    });

    it('prevents cycles (SB-140)', () => {
        expect(wouldCreateCycle(parents, 'city', 'stall')).toBe(true);
        expect(wouldCreateCycle(parents, 'city', 'city')).toBe(true);
        expect(wouldCreateCycle(parents, 'stall', 'docks')).toBe(false);
        expect(wouldCreateCycle(parents, 'stall', null)).toBe(false);
    });

    it('finds children and descendants', () => {
        expect(childrenOf(parents, ids, 'city').sort()).toEqual(['docks', 'market']);
        expect(descendantsOf(parents, ids, 'city').sort()).toEqual(['docks', 'market', 'stall']);
    });

    it('moves children up on delete instead of orphaning them', () => {
        const next = parentsAfterDelete(parents, 'market');
        expect(next.stall).toBe('city');
        expect('market' in next).toBe(false);
        expect(parents.stall).toBe('market');
    });

    it('builds a sorted forest, with unknown parents as roots', () => {
        const nodes = [
            { id: 'market', name: 'Market' }, { id: 'docks', name: 'Docks' },
            { id: 'city', name: 'City' }, { id: 'stall', name: 'Stall' }, { id: 'moon', name: 'Moon' },
        ];
        const tree = buildTree(nodes, parents);
        expect(tree.map((n) => n.id)).toEqual(['city', 'moon']);
        expect(tree[0].children.map((n) => n.id)).toEqual(['docks', 'market']);
        expect(tree[0].children[1].children.map((n) => n.id)).toEqual(['stall']);
    });

    it('classifies relations', () => {
        expect(relation(parents, 'stall', 'stall')).toBe('same');
        expect(relation(parents, 'stall', 'city')).toBe('ancestor');
        expect(relation(parents, 'city', 'stall')).toBe('descendant');
        expect(relation(parents, 'market', 'docks')).toBe('sibling');
        expect(relation(parents, 'stall', 'docks')).toBe('related');
        expect(relation(parents, 'stall', 'moon')).toBe('unrelated');
        expect(isWithin(parents, 'stall', 'city')).toBe(true);
        expect(isWithin(parents, 'city', 'stall')).toBe(false);
    });

    it('inherits environment down the tree unless overridden (SB-142)', () => {
        const env = { world: { climate: 'temperate', lighting: '', rules: 'magic is rare' }, city: { climate: 'humid' }, stall: { lighting: 'lantern-lit' } };
        expect(inheritedEnvironment(parents, env, 'stall')).toEqual({
            lighting: { value: 'lantern-lit', from: 'stall' },
            climate: { value: 'humid', from: 'city' },
            rules: { value: 'magic is rare', from: 'world' },
        });
    });
});
