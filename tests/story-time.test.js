// Where the clock goes for a time of day the story reached (the reading
// itself is State Engine's readTimeShift, tested there), and the player
// setting out along a way on.
import { cueTarget } from '../src/calendar/moment.js';

const morning = { phrase: 'morning', fraction: 0.33 };
const dawn = { phrase: 'dawn', fraction: 0.25 };

describe('a narrated morning or dawn', () => {
    it('reaches morning on the next day from the night', () => {
        expect(cueTarget(morning, 0.88)).toMatchObject({ nextDay: true });
    });

    // God War #446/#447: the last watch at 02:45 ends at dawn.
    it('moves a late-night clock on to dawn the same day', () => {
        expect(cueTarget(dawn, 2.75 / 24)).toEqual({ fraction: 0.25, nextDay: false });
    });

    it('never moves the clock back for a dawn it has passed', () => {
        expect(cueTarget(dawn, 0.3)).toBeNull();
        expect(cueTarget(dawn, 0.5)).toBeNull();
    });
});

// God War #452: the player packs up "over the next hour" and sets out for
// the Blackened Bridge, one route away; the director wrote no format lines.
import { headingAlong } from '../src/library/routes.js';

describe('the player setting out along a way on', () => {
    const ways = [{ id: 'bridge', names: ['The Blackened Bridge'] }, { id: 'mill', names: ['Old Windmill'] }];

    it('reads #452 as setting out for the bridge, together', () => {
        const text = 'Remus nodded, offering her knowledge due respect. She had been right so far and that was good neough for him. Over the next hour, they gathered and packed their belongings back onto the horses and mounted up for the next leg of their journey... The blackened bridge.';
        expect(headingAlong(text, ways)).toEqual({ id: 'bridge', name: 'The Blackened Bridge', together: true });
    });

    it('leaves a trip that is only planned, spoken of, or elsewhere', () => {
        expect(headingAlong("We'll ride for the Blackened Bridge tomorrow.", ways)).toBeNull();
        expect(headingAlong('"We set out for the Blackened Bridge at dawn," Niamh said. Remus nodded.', ways)).toBeNull();
        expect(headingAlong('Remus looked at the map of the Blackened Bridge.', ways)).toBeNull();
        expect(headingAlong('They set out for the coast.', ways)).toBeNull();
    });

    it('goes alone when the message says nothing of the others', () => {
        expect(headingAlong('Remus mounted up and rode out toward the old windmill.', ways)).toEqual({ id: 'mill', name: 'Old Windmill', together: false });
    });
});
