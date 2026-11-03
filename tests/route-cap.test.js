// No days-long trips between rooms: a guessed route is never longer than the
// place both ends sit in allows, a description never makes a place bigger
// than a town, and a bare time of day from the game master is no jump to
// tomorrow.
import { guessRoute, scaleOf, scaleCapFor } from '../src/library/routes.js';
import { onlyTimeOfDay } from '../src/calendar/clock.js';

// Assassins Inc: Arcadia City > Bearville District > The Signal Box > rooms.
const parents = { bay: 'box', office: 'box', quarters: 'box', lower: 'box', box: 'bearville', bearville: 'arcadia', terraces: 'arcadia', shack: 'terraces' };
const up = (id) => { const out = []; for (let at = id; at; at = parents[at]) out.push(at); return out; };
const places = new Map([
    ['arcadia', { name: 'Arcadia City', description: 'A neon metropolis.' }],
    ['bearville', { name: 'Bearville District', description: 'A seedy district.' }],
    ['terraces', { name: 'The Terraces', description: 'Stacked housing blocks.' }],
    ['shack', { name: "Zane's Shack", description: 'A backyard eatery.' }],
    ['box', { name: 'The Signal Box', description: "A converted underground electrical substation in Arcadia's seedy Bearville district." }],
    ['bay', { name: 'Holoprojection Bay', description: 'A vast chamber run by a holographic projection system that can render any star system.' }],
    ['office', { name: "Adam Miller's Office", description: 'Spartan and tidy.' }],
    ['quarters', { name: "Cyril's private quarters", description: 'Industrial-chic.' }],
    ['lower', { name: 'lower levels of the stronghold', description: 'Corridors below.' }],
]);

describe('a description says room, building or town at most', () => {
    it('"a holographic projection system" is no star system', () => {
        expect(scaleOf(places.get('bay'))).toBe('room');
        expect(scaleOf({ name: 'Somewhere', description: 'A distant planet of ice.' })).toBe('');
    });

    it('the name still says a world', () => {
        expect(scaleOf({ name: 'The Ice Planet', description: '' })).toBe('world');
    });
});

describe('a guessed route is capped by the place both ends are in', () => {
    it('two rooms of the Signal Box are a minute apart', () => {
        expect(scaleCapFor('box', { up, places })).toBe('room');
        expect(guessRoute('bay', 'office', { up, places }).travel).toBe('1 minute');
        expect(guessRoute('quarters', 'lower', { up, places }).travel).toBe('1 minute');
    });

    it('two parts of a city are never days apart', () => {
        const route = guessRoute('box', 'shack', { up, places });
        expect(route.from).toBe('bearville');
        expect(route.to).toBe('terraces');
        expect(route.travel).toBe('10 minutes');
    });
});

describe("the game master's bare time of day", () => {
    it('says when it is', () => {
        expect(onlyTimeOfDay('morning (10:30)')).toBe(true);
        expect(onlyTimeOfDay('evening')).toBe(true);
    });

    it('a jump or a span is still a jump or a span', () => {
        expect(onlyTimeOfDay('the next morning')).toBe(false);
        expect(onlyTimeOfDay('morning, after they slept')).toBe(false);
        expect(onlyTimeOfDay('morning (about an hour)')).toBe(false);
        expect(onlyTimeOfDay('2 hours')).toBe(false);
        expect(onlyTimeOfDay('a few minutes')).toBe(false);
    });
});
