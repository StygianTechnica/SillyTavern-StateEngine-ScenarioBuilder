import { routeTimes, timeFor, timesLine, usualMode, readTravelMode, readBasis, asWalkRoute, normalizeRouteTimes, computedMinutes, walkEffort, techOf, routeShort, autoModes } from '../src/library/travel.js';
import { normalizeSettingDoc, normalizeChatDoc } from '../src/store/schema.js';

const walk = (travel, extra = {}) => ({ travel, basis: 'walk', ...extra });
const by = (route, tech) => Object.fromEntries(routeTimes(route, tech).map((t) => [t.mode, t.text]));

describe('ways of travel worked out from the walking time', () => {
    it('in a medieval world: riding and carts, no engines', () => {
        expect(by(walk('1 hour'), 3)).toEqual({ walk: '1 hour', ride: '35 minutes', cart: '50 minutes' });
        // A long road is told in travel days: riders stop for the night too.
        expect(by(walk('2 weeks'), 3)).toEqual({ walk: '2 weeks', ride: '7 days', cart: '2 weeks' });
        expect(usualMode(routeTimes(walk('2 weeks'), 3), 3)).toBe('walk');
    });

    it('in a modern city: a taxi or the metro across town, no flights', () => {
        expect(by(walk('1 hour'), 8)).toEqual({ walk: '1 hour', transit: '25 minutes', car: '15 minutes' });
        // A short walk has nothing faster worth taking.
        expect(by(walk('10 minutes'), 8)).toEqual({ walk: '10 minutes' });
        expect(usualMode(routeTimes(walk('10 minutes'), 8), 8)).toBe('walk');
        expect(usualMode(routeTimes(walk('1 hour'), 8), 8)).toBe('car');
    });

    it('between countries: flying, when it is far enough', () => {
        const t = by(walk('2 weeks'), 8);
        expect(t.flight).toBe('3 hours');
        expect(t.car).toBe('9 hours');
        expect(autoModes(walkEffort('2 days'), 8)).not.toContain('flight');
        expect(usualMode(routeTimes(walk('2 weeks'), 8), 8)).toBe('flight');
    });

    it('a taxi crawls in town and flies on the open road', () => {
        // 5 minutes to hail it, then five times walking pace in town...
        expect(computedMinutes(60, 'car')).toBeCloseTo(17, 0);
        // ...and twelve times on a day's walk or more.
        expect(computedMinutes(480, 'car')).toBeCloseTo(45, 0);
    });

    it('reads the tech level of the place, or the age of the world', () => {
        expect(techOf({ techLevel: 'tl10' })).toBe(10);
        expect(techOf({ laterAge: true })).toBe(7);
        expect(techOf({})).toBe(3);
    });
});

describe('a route\'s own ways', () => {
    it('in a cyberpunk city: the maglev beats a taxi, and no cars on the skybridge', () => {
        const r = walk('1 hour', { times: { transit: '5 minutes', car: 'none' } });
        expect(routeTimes(r, 9).map((t) => [t.mode, t.text, t.own])).toEqual([['walk', '1 hour', true], ['transit', '5 minutes', true]]);
        expect(timeFor(r, 9, 'car')).toMatchObject({ mode: 'transit', text: '5 minutes', fellBack: true });
    });

    it('an island goes only by ferry', () => {
        const r = walk('', { times: { boat: '2 hours' } });
        expect(by(r, 3)).toEqual({ boat: '2 hours' });
        expect(timeFor(r, 3, 'ride')).toMatchObject({ mode: 'boat', text: '2 hours', fellBack: true });
        expect(routeShort(r)).toBe('2 hours by boat');
    });

    it('a portal takes a minute whatever the distance', () => {
        const r = walk('3 months', { times: { portal: '1 minute' } });
        expect(timeFor(r, 3, 'portal')).toMatchObject({ mode: 'portal', text: '1 minute', fellBack: false });
        expect(timeFor(r, 3).mode).toBe('walk');
    });

    it('lists the party\'s way first for a prompt', () => {
        expect(timesLine(walk('1 hour'), 8)).toBe('15 minutes by car, 1 hour on foot, 25 minutes by transit');
        expect(timesLine(walk('1 hour'), 8, { first: 'transit' })).toBe('25 minutes by transit, 1 hour on foot, 15 minutes by car');
        expect(timesLine(walk('1 hour'), 3, { first: 'ride' })).toBe('35 minutes riding, 1 hour on foot, 50 minutes by cart');
    });
});

describe('routes made before ways of travel', () => {
    it('a bare time is walking before engines', () => {
        expect(readBasis({ travel: '2 hours' }, 3)).toMatchObject({ walk: 120, unsure: false });
        expect(by({ travel: '2 hours' }, 3).walk).toBe('2 hours');
    });

    it('with engines a bare time could be walking or driving, so it is used as it is until the user says', () => {
        expect(readBasis({ travel: '2 hours' }, 8).unsure).toBe(true);
        expect(routeTimes({ travel: '2 hours' }, 8)).toEqual([{ mode: '', label: '', text: '2 hours', minutes: 120, own: true }]);
        expect(timeFor({ travel: '2 hours' }, 8, 'car')).toMatchObject({ text: '2 hours', fellBack: false });
    });

    it('a time that names its way is that way\'s', () => {
        expect(by({ travel: 'half a day by cart' }, 3)).toEqual({ walk: '7 hours', ride: '4 hours', cart: 'half a day' });
        // A sea crossing says nothing about walking.
        expect(by({ travel: '3 days by ship' }, 4)).toEqual({ boat: '3 days' });
        expect(by({ travel: '2 hours on foot' }, 8)).toMatchObject({ walk: '2 hours' });
    });

    it('a new route is stored as a walking time', () => {
        expect(asWalkRoute({ travel: '20 minutes' })).toMatchObject({ travel: '20 minutes', basis: 'walk', times: {} });
        expect(asWalkRoute({ travel: '3 days by ship' })).toMatchObject({ travel: '', basis: 'walk', times: { boat: '3 days' } });
        expect(asWalkRoute({ travel: 'half a day by cart' })).toMatchObject({ travel: '7 hours', basis: 'walk', times: { cart: 'half a day' } });
    });

    it('keeps only known ways with a time, and the basis', () => {
        expect(normalizeRouteTimes({ basis: 'walk', times: { car: '10 minutes', warp: '1 second', boat: 'soon', ride: 'none' } })).toEqual({ basis: 'walk', times: { car: '10 minutes', ride: 'none' } });
        expect(normalizeRouteTimes({})).toEqual({ basis: '', times: {} });
    });

    it('survives the setting document\'s normalizing, and the chat keeps the party\'s way', () => {
        const doc = normalizeSettingDoc({ routes: [{ id: 'r1', from: 'a', to: 'b', travel: '1 hour', basis: 'walk', times: { transit: '5 minutes' } }] });
        expect(doc.routes[0]).toMatchObject({ travel: '1 hour', basis: 'walk', times: { transit: '5 minutes' } });
        expect(normalizeChatDoc({ canonical: { travelMode: 'ride' } }).canonical.travelMode).toBe('ride');
        expect(normalizeChatDoc({ canonical: { travelMode: 'warp' } }).canonical.travelMode).toBe('');
    });
});

describe('the way a message travels', () => {
    it.each([
        ['We hail a cab to the docks.', 'car', false],
        ['*I swing into my car and drive to the office.*', 'car', true],
        ['We catch the metro uptown.', 'transit', false],
        ['*I mount up and ride for the bridge*', 'ride', true],
        ['The wagon rolls on toward Millbrook.', 'cart', true],
        ['We walk over to the bar.', 'walk', false],
        ['They flew to Lisbon.', 'flight', false],
        ['We take the ferry across to the island.', 'boat', false],
        ['I step through the portal to Ys.', 'portal', false],
    ])('%s', (text, mode, keeps) => {
        expect(readTravelMode(text)).toEqual({ mode, keeps });
    });

    it('reads nothing from a sentence that goes nowhere', () => {
        expect(readTravelMode('The car alarm wails. I run to the alley.')).toBeNull();
        expect(readTravelMode('')).toBeNull();
    });
});
