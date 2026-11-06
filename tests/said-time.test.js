// The time of day a reply opens on. Assassins Inc: "As dusk settled over
// Arcadia City, Miller's techs called a halt" - and the clock stayed at
// midday.
import { saidTimeOfDay } from '../src/calendar/said-time.js';
import { timeOfDayFraction } from '../src/calendar/moment.js';

describe('the time of day the narration opens on', () => {
    it('reads it, across genres', () => {
        expect(saidTimeOfDay("As dusk settled over Arcadia City, Miller's techs called a halt to their final preparations at headquarters.")).toBe('dusk');
        expect(saidTimeOfDay('By nightfall the caravan had reached the oasis.')).toBe('dusk');
        expect(saidTimeOfDay('The sun had set behind the keep when Ser Brannoc returned.')).toBe('sunset');
        expect(saidTimeOfDay('Evening had fallen over New Chicago. The precinct was quiet.')).toBe('evening');
        expect(saidTimeOfDay('The station cycled lights down. As night fell on Deck Four, Okafor logged off.')).toBe('night');
        for (const p of ['dusk', 'sunset', 'evening', 'night']) expect(timeOfDayFraction(p)).not.toBeNull();
    });
    it('not a plan, speech, or a line deep in the reply', () => {
        expect(saidTimeOfDay('"We move at dusk," Miller said.')).toBeNull();
        expect(saidTimeOfDay('Miller checked his watch. They would leave when night fell.')).toBeNull();
        expect(saidTimeOfDay('Doc paced. Galice read. Vex waited. Hours later, as night fell, they left.')).toBeNull();
        expect(saidTimeOfDay('Cyril picked up the pistol and checked the sights.')).toBeNull();
    });
});
