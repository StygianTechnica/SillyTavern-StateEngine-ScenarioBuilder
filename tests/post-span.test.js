// Assassins Inc: "Cyril spent several hours at the gun range" - the TIME
// line said "A few minutes", and the clock took that.
import { postSpan } from '../src/calendar/post-span.js';

describe('how long the player\'s post says it took', () => {
    it('reads the span of the action, across genres', () => {
        expect(postSpan('Cyril spent several hours at the gun range making absolutely sure he was good.  It felt good to flex his finesse with a handgun.')).toBe('3 hours');
        expect(postSpan('Aria worked the forge for two hours, then for an hour more.')).toBe('2 hours');
        expect(postSpan('Rook watched the reactor readouts for the rest of the night.')).toBe('6 hours');
        expect(postSpan('After forty minutes the shuttle docked.')).toBe('');
        expect(postSpan('After 40 minutes the shuttle docked.')).toBe('40 minutes');
        expect(postSpan('She trained all afternoon long.')).toBe('4 hours');
        expect(postSpan('Three days later, the caravan reached the pass.')).toBe('3 days');
    });
    it('not a span planned, remembered or spoken', () => {
        expect(postSpan('He would spend a few hours at the range later.')).toBe('');
        expect(postSpan('"Give me two hours," Cyril said, and picked up the pistol.')).toBe('');
        expect(postSpan('Years ago he spent days in that cell.')).toBe('');
        expect(postSpan('Cyril picked up the pistol and checked the sights.')).toBe('');
    });
});
