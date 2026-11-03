// What the user can take out by hand: a moment, an agenda or an off-screen
// line of today's plan, and what reached the story or a line of the
// off-scene log (Assassins Inc: Bartin, Cyril's old lover, sent to hunt him).
import { removeFromDay } from '../src/planner/model.js';
import { removeSurfaced, removeLogLine } from '../src/world/model.js';

const gmWithDay = () => ({
    queue: [{ id: 'req1', status: 'planned', plannedAs: ['m2'] }, { id: 'req2', status: 'planned', plannedAs: ['m2', 'm3'] }],
    day: {
        day: 5,
        moments: [{ id: 'm1', text: 'a' }, { id: 'm2', text: 'b' }, { id: 'm3', text: 'c' }],
        agendas: [{ who: 'Enrique', wants: 'x' }, { who: 'Bartin', wants: 'y' }],
        offscreen: ['Bartin hunts Cyril.', 'Serlos waits.'],
    },
});

describe("taking things out of today's plan", () => {
    it('a moment, and the request it alone answered waits again', () => {
        const gm = gmWithDay();
        expect(removeFromDay(gm, 'moment', 'm2')).toBe(true);
        expect(gm.day.moments.map((m) => m.id)).toEqual(['m1', 'm3']);
        expect(gm.queue[0]).toMatchObject({ status: 'waiting', plannedAs: [] });
        expect(gm.queue[1]).toMatchObject({ status: 'planned', plannedAs: ['m3'] });
        expect(removeFromDay(gm, 'moment', 'm9')).toBe(false);
    });

    it('an agenda or an off-screen line, by its place', () => {
        const gm = gmWithDay();
        expect(removeFromDay(gm, 'agenda', 1)).toBe(true);
        expect(gm.day.agendas.map((a) => a.who)).toEqual(['Enrique']);
        expect(removeFromDay(gm, 'offscreen', 0)).toBe(true);
        expect(gm.day.offscreen).toEqual(['Serlos waits.']);
        expect(removeFromDay(gm, 'offscreen', 5)).toBe(false);
        expect(removeFromDay({ queue: [] }, 'moment', 'm1')).toBe(false);
    });
});

describe('taking things out of the world', () => {
    it('what reached the story', () => {
        const world = { surfaced: [{ id: 'w1', text: 'Bartin asks after Cyril.' }, { id: 'w2', text: 'News.' }] };
        expect(removeSurfaced(world, 'w1')).toBe(true);
        expect(world.surfaced.map((x) => x.id)).toEqual(['w2']);
        expect(removeSurfaced(world, 'w1')).toBe(false);
    });

    it('a log line, only the one shown', () => {
        const world = { log: [{ text: 'Bartin hacked the comms.' }, { text: 'Serlos waited.' }] };
        expect(removeLogLine(world, 1, 'Something else.')).toBe(false);
        expect(removeLogLine(world, 0, 'Bartin hacked the comms.')).toBe(true);
        expect(world.log.map((l) => l.text)).toEqual(['Serlos waited.']);
    });
});
