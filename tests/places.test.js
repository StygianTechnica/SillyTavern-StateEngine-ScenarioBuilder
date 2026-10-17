import { buildRoutesPrompt, readRoutes, matchPlaceName, unconnectedPairs, guessedRoutes, buildEnvironmentPrompt, readEnvironment, randomClimate } from '../src/generate/places.js';

const places = [{ name: 'The Taproom', description: 'Smoky.' }, { name: 'Lantern Cellar', description: 'Damp.' }, { name: 'The Loft' }];
const names = places.map((p) => p.name);

describe('suggesting routes', () => {
    it('asks for routes between the places inside, with the world\'s travel', () => {
        const { user } = buildRoutesPrompt({ parent: { name: 'The Drowned Lantern', description: 'An inn.' }, places, overview: { premise: 'A port city.', tech: { level: 'tl3' } }, existing: [{ from: 'The Taproom', to: 'The Loft' }] });
        expect(user).toContain('These places are all inside The Drowned Lantern (An inn.):');
        expect(user).toContain('- Lantern Cellar: Damp.');
        expect(user).toContain('Medieval');
        expect(user).toContain('do not repeat them): The Taproom - The Loft');
        expect(user).toContain('{"routes": [');
    });

    it('keeps routes between named places only, once per pair, not repeating existing ones', () => {
        const reply = '```json\n{"routes": [{"from": "the taproom", "to": "Lantern Cellar", "travel": "a few steps", "note": "trapdoor"}, {"from": "Lantern Cellar", "to": "The Taproom", "travel": "a few steps"}, {"from": "The Taproom", "to": "The Moon", "travel": "far"}, {"from": "The Taproom", "to": "The Loft", "travel": "1 minute"}, {"from": "The Loft", "to": "Lantern Cellar", "travel": ""}]}\n```';
        const { values, error } = readRoutes(reply, names, [{ from: 'The Taproom', to: 'The Loft' }]);
        expect(error).toBe('');
        expect(values).toEqual([{ from: 'The Taproom', to: 'Lantern Cellar', travel: 'a few steps', note: 'trapdoor' }]);
        expect(readRoutes('no idea', names).error).toBeTruthy();
    });
});

describe('suggesting a climate', () => {
    it('asks for a zone from the list, steered by a brief', () => {
        const { user } = buildEnvironmentPrompt({ place: { name: 'Ember Peak', description: 'An active volcano.', path: ['The Ashen Coast'] }, inherited: { climate: 'humid, salt wind' }, overview: {}, brief: 'scorching and ash-choked' });
        expect(user).toContain('The place: Ember Peak - An active volcano.');
        expect(user).toContain('volcanic (Volcanic)');
        expect(user).toContain('Make it this: scorching and ash-choked');
    });

    it('reads the zone (only a known one) and the environment', () => {
        expect(readEnvironment('{"climate_zone": "Volcanic", "climate": "searing, ash on the wind", "lighting": "red glow", "rules": ""}').values)
            .toEqual({ climateZone: 'volcanic', climate: 'searing, ash on the wind', lighting: 'red glow', rules: '' });
        expect(readEnvironment('{"climate_zone": "lava world", "climate": "hot"}').values.climateZone).toBe('');
        expect(readEnvironment('nothing').error).toBeTruthy();
    });

    it('rolls a different zone, never underground', () => {
        const seen = new Set(Array.from({ length: 200 }, (_, i) => randomClimate('temperate', () => (i % 100) / 100)));
        expect(seen.has('temperate')).toBe(false);
        expect(seen.has('underground')).toBe(false);
        expect(seen.size).toBeGreaterThan(5);
    });
});

describe('route suggestions that come back thin', () => {
    const names = ['Liston Market', 'The Old Mill'];
    it('match the names a model writes loosely', () => {
        expect(matchPlaceName('the market', names)).toBe('Liston Market');
        expect(matchPlaceName('Old Mill', names)).toBe('The Old Mill');
        expect(matchPlaceName('Docks', names)).toBeNull();
        const { values } = readRoutes('{"routes":[{"a":"Market","b":"old mill","time":"15 minutes"}]}', names);
        expect(values).toEqual([{ from: 'Liston Market', to: 'The Old Mill', travel: '15 minutes', note: '' }]);
    });
    it('know which pairs are still unconnected', () => {
        expect(unconnectedPairs(names, [{ from: 'The Old Mill', to: 'Liston Market' }])).toEqual([]);
        expect(unconnectedPairs([...names, 'Chapel'], [{ from: 'The Old Mill', to: 'Liston Market' }])).toEqual([['Liston Market', 'Chapel'], ['The Old Mill', 'Chapel']]);
    });
    it('fall back to guesses for a few places', () => {
        const guesses = guessedRoutes([{ name: 'Liston Market' }, { name: 'The Old Mill' }], [], 'tl3');
        expect(guesses).toEqual([{ from: 'Liston Market', to: 'The Old Mill', travel: '10 minutes', note: 'guessed - edit if wrong', guessed: true }]);
        expect(guessedRoutes(Array.from({ length: 5 }, (_, i) => ({ name: `P${i}` })))).toEqual([]);
    });
});
