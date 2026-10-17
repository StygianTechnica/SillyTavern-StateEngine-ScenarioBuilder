import { neighboursOf, runtimeRefs } from '../src/generate/run.js';

// A location whose factions are set in the chat (State Engine's per-chat
// Factions field), among many neighbouring places.
const fortress = { id: 'loc_fortress', type: 'location', name: "Niamh's Fortress", runtime: { values: { factions: ['fac_redhaven'], conditions: '' } }, startValues: { factions: ['fac_wardens'] } };
const siblings = Array.from({ length: 20 }, (_, i) => ({ id: `loc_s${i}`, type: 'location', name: `Place ${i}` }));
const all = {
    location: [{ id: 'loc_wastes', type: 'location', name: 'The Wastes' }, fortress, ...siblings],
    faction: [
        { id: 'fac_redhaven', type: 'faction', name: 'Redhaven defenders', description: 'They hold the walls.' },
        { id: 'fac_wardens', type: 'faction', name: 'Silent Wardens' },
        { id: 'fac_ravagers', type: 'faction', name: 'Ravagers', base: { territory: 'loc_fortress' } },
    ],
};
const parents = Object.fromEntries([['loc_fortress', 'loc_wastes'], ...siblings.map((s) => [s.id, 'loc_wastes'])]);

describe('what generation sees around an entry', () => {
    it('reads the entries its chat state and starting values point at', () => {
        expect(runtimeRefs(fortress)).toEqual([{ field: 'factions', ids: ['fac_redhaven'] }, { field: 'factions', ids: ['fac_wardens'] }]);
    });

    it('puts direct ties - its factions, those that claim it - before the places around it', () => {
        const out = neighboursOf(fortress, all, parents, null);
        expect(out.slice(0, 3).map((n) => `${n.relation}: ${n.name}`)).toEqual(['Factions: Redhaven defenders', 'Factions: Silent Wardens', 'territory of: Ravagers']);
        expect(out[0].description).toBe('They hold the walls.');
        expect(out.findIndex((n) => n.relation === 'Nearby')).toBeGreaterThan(3);
    });
});
