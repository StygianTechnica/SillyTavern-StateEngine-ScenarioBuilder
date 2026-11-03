// No morning sunlight in an underground stronghold: a place its own words
// put underground has no sky, unless a sky is set for it.
import { vi } from 'vitest';

const entries = {
    arcadia: { parentId: null, climate: 'oceanic', sky: 'open' },
    box: { parentId: 'arcadia', climate: '', sky: '' },
    quarters: { parentId: 'box', climate: '', sky: '' },
    roof: { parentId: 'box', climate: '', sky: 'open' },
};
vi.mock('../src/store/setting-store.js', () => ({
    getSettingDoc: () => ({ entries, calendar: { climate: 'temperate' } }),
    updateSettingDoc: () => {},
}));

const { readsUnderground, placeFor } = await import('../src/calendar/clock.js');

describe('a place its words put underground', () => {
    it('reads the name and the first sentences', () => {
        expect(readsUnderground({ name: 'The Signal Box', description: "A converted underground electrical substation in Arcadia's seedy Bearville district." })).toBe(true);
        expect(readsUnderground({ name: 'The Hollow', description: 'A vast cavern lit by glowworms.' })).toBe(true);
        expect(readsUnderground({ name: 'Bunker 9', description: '' })).toBe(true);
    });

    it('never the underground as a scene, or a cave mentioned late', () => {
        expect(readsUnderground({ name: 'The Pit', description: 'An underground fight club in a warehouse.' })).toBe(false);
        expect(readsUnderground({ name: 'Arcadia City', description: 'A neon metropolis. Towers scrape the clouds. Its sewers hide a thousand secrets.' })).toBe(false);
        expect(readsUnderground(undefined)).toBe(false);
    });
});

describe('its sky', () => {
    const underground = (id) => id === 'box';
    it('has none inside it, though the city has an open sky', () => {
        expect(placeFor('s', 'quarters', { underground }).open).toBe(false);
        expect(placeFor('s', 'box', { underground }).open).toBe(false);
    });

    it('a sky set on a place inside wins, and the top place never counts', () => {
        expect(placeFor('s', 'roof', { underground }).open).toBe(true);
        expect(placeFor('s', 'arcadia', { underground: () => true }).open).toBe(true);
        expect(placeFor('s', 'quarters').open).toBe(true);
    });
});
