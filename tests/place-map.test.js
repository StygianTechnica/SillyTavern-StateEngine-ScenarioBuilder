// Moving about the map from a place's sheet: up to the city, down into its
// districts, across to the places beside it, and who is here.
import { placeMap } from '../src/ui/catalog-model.js';

const entries = [
    { id: 'city', type: 'location', name: 'Arcadia City' },
    { id: 'neon', type: 'location', name: 'The Neon Mile' },
    { id: 'docks', type: 'location', name: 'Bearville Docks' },
    { id: 'sig', type: 'location', name: 'The Signal Box' },
    { id: 'back', type: 'location', name: 'Back Room' },
    { id: 'cafe', type: 'location', name: 'Aurora Cafe' },
    { id: 'adam', type: 'character', name: 'Adam Miller', base: { location: 'sig' } },
    { id: 'gun', type: 'item', name: 'Old Revolver', location: 'sig' },
    { id: 'zane', type: 'character', name: 'Zane', base: { location: 'docks' } },
];
const parents = { neon: 'city', docks: 'city', sig: 'neon', cafe: 'neon', back: 'sig' };

describe('a place on the map', () => {
    it('has the places above it, top first', () => {
        expect(placeMap('back', { parents, entries }).above).toEqual(['city', 'neon', 'sig']);
        expect(placeMap('city', { parents, entries }).above).toEqual([]);
    });

    it('has the places inside it, by name, with how many are inside each', () => {
        expect(placeMap('city', { parents, entries }).inside).toEqual([{ id: 'docks', count: 0 }, { id: 'neon', count: 2 }]);
        expect(placeMap('neon', { parents, entries }).inside).toEqual([{ id: 'cafe', count: 0 }, { id: 'sig', count: 1 }]);
    });

    it('has the places beside it, and who and what is here', () => {
        expect(placeMap('sig', { parents, entries }).beside).toEqual(['cafe']);
        expect(placeMap('sig', { parents, entries }).here).toEqual(['adam', 'gun']);
        expect(placeMap('docks', { parents, entries }).here).toEqual(['zane']);
    });

    it('treats a parent no longer in the library as the top', () => {
        expect(placeMap('neon', { parents: { ...parents, city: 'gone' }, entries }).above).toEqual(['city']);
        expect(placeMap('city', { parents: { ...parents, city: 'gone' }, entries }).beside).toEqual([]);
    });
});
