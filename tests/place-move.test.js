// A place the scene moves into that the library lacks: placed by name and
// size, not just beside where the scene was. Saint Aora's Museum Corridors
// went under Arcadia City, next to the museum.
import { chooseParent, placeSize } from '../src/generate/place-parent.js';

const locations = [
    { id: 'city', name: 'Arcadia City', description: 'A sprawling cyberpunk city.' },
    { id: 'firebrand', name: 'Firebrand Square', description: 'A plaza district of Arcadia City.' },
    { id: 'museum', name: "Saint Aora's Museum", description: 'A museum of relics.' },
    { id: 'west', name: 'West Wing Gallery', description: 'A gallery in the museum.' },
];
const parents = { firebrand: 'city', museum: 'firebrand', west: 'museum' };
const moved = (name, sceneId) => chooseParent({ brief: name, locations, parents, sceneId, where: (placeSize({ name }) ?? 1) >= 1 ? 'nearby' : 'inside' })?.id;

describe('a place the scene moves into', () => {
    it('one that names a place goes in it, curly apostrophe or not', () => {
        expect(moved("Saint Aora's Museum Corridors", 'museum')).toBe('museum');
        expect(moved('Saint Aora’s Museum Corridors', 'west')).toBe('museum');
    });
    it('a part of the building goes in the building, from one of its rooms too', () => {
        expect(placeSize({ name: 'Service Corridors' })).toBe(0);
        expect(moved('Service Corridors', 'museum')).toBe('museum');
        expect(moved('Restoration Vaults', 'west')).toBe('museum');
    });
    it('a building goes beside it, not inside', () => {
        expect(moved('Neon Lotus Bar', 'museum')).toBe('firebrand');
    });
});
