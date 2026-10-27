import { routesFrom, routeBetween, routeForMove } from '../src/library/routes.js';
import { buildGuidance } from '../src/guidance/build.js';
import { pathOf } from '../src/library/hierarchy.js';
import { timesLine } from '../src/library/travel.js';

const routes = [
    { id: 'r1', from: 'townA', to: 'townB', travel: 'half a day', note: 'the coast road' },
    { id: 'r2', from: 'inn', to: 'docks', travel: '20 minutes', note: '' },
];
const parents = { inn: 'townA', docks: 'townA', tavern: 'townB', market: 'townA' };
const up = (id) => [...pathOf(parents, id)].reverse();

describe('routes', () => {
    it('are seen from both ends', () => {
        expect(routesFrom('townB', routes)).toEqual([{ route: routes[0], otherId: 'townA' }]);
        expect(routeBetween('docks', 'inn', routes)).toBe(routes[1]);
        expect(routeBetween('inn', 'townB', routes)).toBeNull();
    });

    it('cover a move directly, or between the places the ends are in', () => {
        expect(routeForMove('inn', 'docks', routes, up)).toBe(routes[1]);
        expect(routeForMove('inn', 'tavern', routes, up)).toBe(routes[0]);
        expect(routeForMove('inn', 'market', routes, up)).toBeNull();
        expect(routeForMove('inn', 'inn', routes, up)).toBeNull();
    });

    it('appear in the guidance with their travel time', () => {
        const { text } = buildGuidance({ location: { path: ['Town A'], routes: [{ name: 'Town B', travel: 'half a day', note: 'the coast road' }] }, budget: 4000 });
        expect(text).toContain('From here one can go to Town B (half a day, the coast road).');
    });

    it('appear with each way\'s time, the party\'s way first and named', () => {
        const travel = timesLine({ travel: '1 hour', basis: 'walk' }, 8, { first: 'transit' });
        const { text } = buildGuidance({ location: { path: ['Arcadia Plaza'], routes: [{ name: 'The Docks', travel, note: 'the canal road' }], travelMode: 'by transit' }, budget: 4000 });
        expect(text).toContain('From here one can go to The Docks (25 minutes by transit, 1 hour on foot, 15 minutes by car, the canal road).');
        expect(text).toContain('The party gets about by transit.');
    });
});
