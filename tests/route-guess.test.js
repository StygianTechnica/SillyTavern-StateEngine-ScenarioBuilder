import { scaleOf, guessTravel, routePairFor, guessRoute } from '../src/library/routes.js';
import { pathOf } from '../src/library/hierarchy.js';

// The God War map, roughly: rooms in a fortress, the fortress and Redhaven
// in the wastes.
const parents = { hall: 'fortress', wall: 'fortress', fortress: 'wastes', redhaven: 'wastes', square: 'redhaven' };
const up = (id) => [...pathOf(parents, id)].reverse();
const places = new Map([
    ['hall', { name: "Niamh's Great Hall" }],
    ['wall', { name: 'The Outer Wall' }],
    ['fortress', { name: "Niamh's Fortress" }],
    ['redhaven', { name: 'Redhaven', description: 'A walled town of survivors.' }],
    ['square', { name: 'Market Square' }],
    ['wastes', { name: 'The Ashen Wastes' }],
]);

describe('guessed routes', () => {
    it('read a place\'s scale from its name, then its description', () => {
        expect(scaleOf({ name: "Niamh's Great Hall" })).toBe('room');
        expect(scaleOf({ name: "Niamh's Fortress" })).toBe('building');
        expect(scaleOf({ name: 'Redhaven', description: 'A walled town of survivors.' })).toBe('settlement');
        expect(scaleOf({ name: 'Elsewhere' })).toBe('');
    });

    it('take longer before engines than with them', () => {
        expect(guessTravel('settlement', 'tl3')).toBe('half a day');
        expect(guessTravel('settlement', 'tl8')).toBe('1 hour');
        expect(guessTravel('room')).toBe('1 minute');
    });

    it('join the places side by side under the nearest shared place', () => {
        expect(routePairFor('hall', 'wall', up)).toEqual(['hall', 'wall']);
        expect(routePairFor('hall', 'square', up)).toEqual(['fortress', 'redhaven']);
        // Moving within a place takes no route.
        expect(routePairFor('hall', 'fortress', up)).toBeNull();
    });

    it('guess the time from the larger place, marked as a guess', () => {
        expect(guessRoute('hall', 'square', { up, places, techLevel: 'tl3' })).toEqual({ from: 'fortress', to: 'redhaven', travel: 'half a day', note: 'guessed - edit if wrong', guessed: true });
        expect(guessRoute('hall', 'wall', { up, places }).travel).toBe('1 minute');
    });
});
