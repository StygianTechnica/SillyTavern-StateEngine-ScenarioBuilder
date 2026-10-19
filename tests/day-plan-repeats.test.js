// A day plan that has played out is replaced, never re-adds what it had,
// and does not carry a played-out moment into a new volume.
import { emptyGm, setDayPlan, applyCheck, duePasses, startVolume } from '../src/planner/model.js';

const WALLS = "Graxx orders his defenders to reinforce Redhaven's walls as the undead horde approaches.";

describe('a played-out day plan', () => {
    it('is replaced once every moment is done, a couple of replies on', () => {
        const gm = emptyGm();
        setDayPlan(gm, { moments: [{ text: WALLS }] }, { day: 2, turn: 47 });
        gm.day.moments[0].status = 'done';
        expect(duePasses(gm, { day: 2, turn: 48 })).not.toContain('day');
        expect(duePasses(gm, { day: 2, turn: 49 })).toContain('day');
    });

    it('never has a check add a moment it already has, in other words', () => {
        const gm = emptyGm();
        setDayPlan(gm, { moments: [{ text: WALLS }] }, { day: 2, turn: 47 });
        gm.day.moments[0].status = 'done';
        applyCheck(gm, { add: [{ text: "Graxx orders the defenders to reinforce Redhaven's walls as the horde approaches." }, { text: 'Niamh slips out to scout the ruins.' }, { text: 'Niamh slips out alone to scout the ruins.' }] });
        expect(gm.day.moments.map((m) => m.text)).toEqual([WALLS, 'Niamh slips out to scout the ruins.']);
    });

    it('carries only what is still to come into a new volume', () => {
        const gm = emptyGm();
        setDayPlan(gm, { moments: [{ text: WALLS }, { text: 'Niamh slips out to scout the ruins.' }] }, { day: 2, turn: 47 });
        gm.day.moments[0].status = 'done';
        startVolume(gm, { turn: 66, day: 2 });
        expect(gm.day.moments.map((m) => m.text)).toEqual(['Niamh slips out to scout the ruins.']);
        gm.day.moments[0].status = 'done';
        startVolume(gm, { turn: 70, day: 2 });
        expect(gm.day).toBeNull();
    });

    it('keeps a long steer for the new volume', () => {
        const gm = emptyGm();
        const steer = 'They travel to the ruined temple of Elyon. '.repeat(30).trim();
        startVolume(gm, { direction: steer });
        expect(gm.volume.direction).toBe(steer);
    });
});
