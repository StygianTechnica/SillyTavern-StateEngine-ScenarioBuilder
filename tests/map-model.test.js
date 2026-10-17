import { travelMinutes, formatMinutes, levelPlaces, levelRoutes, insideCounts, mapScale, estimates, seedPositions } from '../src/ui/map-model.js';

describe('travel times', () => {
    it('read the ways people write them', () => {
        expect(travelMinutes('2 hours')).toBe(120);
        expect(travelMinutes('half a day by cart')).toBe(720);
        expect(travelMinutes('3 days by ship')).toBe(3 * 24 * 60);
        expect(travelMinutes('an hour')).toBe(60);
        expect(travelMinutes('a few steps')).toBe(1);
        expect(travelMinutes('10 min')).toBe(10);
        expect(travelMinutes('the coast road')).toBeNull();
    });
    it('are written back rounded the way people say them', () => {
        expect(formatMinutes(1)).toBe('1 minute');
        expect(formatMinutes(23)).toBe('25 minutes');
        expect(formatMinutes(70)).toBe('1 hour');
        expect(formatMinutes(200)).toBe('3 hours');
        expect(formatMinutes(720)).toBe('half a day');
        expect(formatMinutes(3 * 24 * 60)).toBe('3 days');
        expect(formatMinutes(21 * 24 * 60)).toBe('3 weeks');
    });
});

describe('map levels', () => {
    const locations = [{ id: 'wastes', name: 'Wastes' }, { id: 'fortress', name: 'Fortress' }, { id: 'hall', name: 'Hall' }, { id: 'redhaven', name: 'Redhaven' }, { id: 'sea', name: 'Sea' }];
    const parents = { fortress: 'wastes', hall: 'fortress', redhaven: 'wastes' };
    it('show the top-level places first, then the places inside one', () => {
        expect(levelPlaces(locations, parents).map((l) => l.id)).toEqual(['wastes', 'sea']);
        expect(levelPlaces(locations, parents, 'wastes').map((l) => l.id)).toEqual(['fortress', 'redhaven']);
    });
    it('count everything inside a place, all the way down', () => {
        expect(insideCounts(locations, parents)).toEqual({ wastes: 3, fortress: 1 });
    });
    it('draw only the routes between places on the level', () => {
        const routes = [{ from: 'fortress', to: 'redhaven' }, { from: 'hall', to: 'redhaven' }];
        expect(levelRoutes(routes, ['fortress', 'redhaven'])).toEqual([routes[0]]);
    });
    it('seed places with no position on a ring, keeping those placed', () => {
        const pos = seedPositions([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], { c: { x: 5, y: 5 } });
        expect(pos.c).toEqual({ x: 5, y: 5 });
        expect(Math.hypot(pos.a.x, pos.a.y)).toBeCloseTo(220, 0);
        expect(pos.a).not.toEqual(pos.b);
    });
});

describe('guessing distances from the map', () => {
    const pos = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 0, y: 300 } };
    const set = { id: 'r1', from: 'a', to: 'b', travel: '1 hour' };
    const guessed = { id: 'r2', from: 'a', to: 'c', travel: '10 minutes', guessed: true };
    it('take the scale from the routes the user set', () => {
        expect(mapScale([set, guessed], pos)).toBeCloseTo(0.6);
        expect(mapScale([guessed], pos)).toBeNull();
    });
    it('estimate each guessed route from how far apart its ends sit', () => {
        expect(estimates([set, guessed], pos, mapScale([set, guessed], pos))).toEqual([{ route: guessed, minutes: 180, travel: '3 hours' }]);
        expect(estimates([set, guessed], pos, null)).toEqual([]);
    });
});

describe('travel times inside longer text', () => {
    it('find the time after other words, and not inside them', () => {
        expect(travelMinutes('by cart, 2 hours')).toBe(120);
        expect(travelMinutes('10min')).toBe(10);
        expect(travelMinutes('the coast road')).toBeNull();
    });
});
