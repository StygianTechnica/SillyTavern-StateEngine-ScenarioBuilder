import { inheritedClimate, placeSurroundings, buildImagePrompt } from '../src/images/prompt.js';

// The user's own city (Arcadia City's climate, as written on its sheet).
const CITY_CLIMATE = 'Polluted Coastal Megacity: Thick ocean fog mixed with industrial smog. Elevated sea levels have flooded old districts. Expensive neighborhoods sit atop seawalls and floating platforms. Lower classes inhabit half-submerged streets.';
const CITY = { name: 'Arcadia City', description: 'A sprawling coastal megacity of glass towers and drowned slums.', climate: CITY_CLIMATE };
const NEON = { name: 'Lodestar Neon Mile', description: 'A nightlife and entertainment district of clubs, bars, holo-theatres and casinos under endless neon.', climate: '' };
const DOCKS = { name: 'Saltmarket Docks', description: 'The old docks, where container ships unload under floodlights.', climate: '' };

describe('a climate as it comes down to a place inside', () => {
    it('keeps the air and the weather, not the city\'s water and layout', () => {
        const got = inheritedClimate(CITY_CLIMATE);
        expect(got.text).toBe('Polluted Megacity, thick fog mixed with industrial smog');
        expect(got.dropped).toBe(true);
    });

    it('keeps the water for a place that is by it', () => {
        expect(inheritedClimate(CITY_CLIMATE, { waterOk: true }).text).toBe('Polluted Coastal Megacity, thick ocean fog mixed with industrial smog');
    });

    it('leaves a plain climate alone', () => {
        expect(inheritedClimate('Cold and wet, with sleet most of the winter.')).toEqual({ text: 'Cold and wet, with sleet most of the winter', dropped: false });
    });
});

describe('where a place stands', () => {
    it('a club on the Neon Mile: the district\'s character, the city\'s smog, no ships', () => {
        const s = placeSurroundings({ own: { description: 'A cramped karaoke bar with private booths.' }, path: [NEON, CITY] });
        expect(s.within).toBe('set in a nightlife and entertainment district of clubs, bars, holo-theatres and casinos under endless neon');
        expect(s.climate).toBe('Polluted Megacity, thick fog mixed with industrial smog');
        expect(s.exclude).toContain('ships');
    });

    it('a warehouse at the docks keeps the sea', () => {
        const s = placeSurroundings({ own: { description: 'A rusting warehouse.' }, path: [DOCKS, CITY] });
        expect(s.climate).toMatch(/Coastal/);
        expect(s.exclude).toEqual([]);
    });

    it('a building straight in the city loses the coast from its setting too', () => {
        const s = placeSurroundings({ own: { description: 'A corporate tower of black glass.' }, path: [CITY] });
        expect(s.within).toBe('set in a sprawling megacity of glass towers and drowned slums');
        expect(s.climate).not.toMatch(/ocean|coastal|flood/i);
    });

    it('its own climate wins, as written', () => {
        const s = placeSurroundings({ own: { description: 'A greenhouse dome.', climate: 'Warm, humid, misted' }, path: [NEON, CITY] });
        expect(s.climate).toBe('Warm, humid, misted');
        expect(s.exclude).toEqual([]);
    });

    it('a fantasy port\'s hill temple, and a real-world canal café', () => {
        const port = { name: 'Redhaven', description: 'A walled harbour town of tarred roofs.', climate: 'Salt winds off the sea; grey rain most days; fishing boats crowd the harbour.' };
        const hill = { name: 'Temple Hill', description: 'A steep hill of old shrines above the town.', climate: '' };
        const temple = placeSurroundings({ own: { description: 'A small shrine of white stone.' }, path: [hill, port] });
        expect(temple.climate).toBe('Grey rain most days');
        expect(temple.within).toBe('set in a steep hill of old shrines above the town');
        const canal = { name: 'Cannaregio', description: 'A quiet district of canals and footbridges.', climate: '' };
        const venice = { name: 'Venice', description: 'A city built on a lagoon.', climate: 'Damp, foggy winters; acqua alta floods the squares.' };
        expect(placeSurroundings({ own: { description: 'A café by the water.' }, path: [canal, venice] }).climate).toMatch(/floods/);
    });

    it('goes into the prompt: the district after the place, the water kept out', () => {
        const entry = { type: 'location', name: 'Redline Karaoke', description: 'A cramped karaoke bar with private booths and flickering screens.' };
        const s = placeSurroundings({ own: entry, path: [NEON, CITY], others: ['Lodestar Neon Mile', 'Arcadia City'] });
        const mj = buildImagePrompt({ entry, environment: { climate: s.climate }, surroundings: s, overview: { worldType: 'science_fiction' }, options: { provider: 'midjourney' } });
        expect(mj.prompt).toContain('set in a nightlife and entertainment district');
        expect(mj.prompt).not.toMatch(/submerged|seawall|ocean fog/);
        expect(mj.prompt).toMatch(/--no [^-]*coastline, ocean, ships, boats/);
        const sd = buildImagePrompt({ entry, environment: { climate: s.climate }, surroundings: s, options: { provider: 'stable_diffusion' } });
        expect(sd.negative).toContain('flooded streets');
    });
});
