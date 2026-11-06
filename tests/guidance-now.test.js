// The note for this reply: only the hard orders, as a short system note
// with nothing in it to continue - empty on an ordinary reply.
import { buildNow } from '../src/guidance/build.js';

const cast = [{ name: 'Cyril', player: true }, { name: 'Doc' }, { name: 'Galice Buckar' }];

describe('the note for this reply', () => {
    it('says who comes in now, and keeps off the player character', () => {
        const note = buildNow({ arriving: ['Adam Miller'], cast });
        expect(note).toBe("[Game master's note for this reply, not part of the story: Adam Miller comes in now - they arrive where everyone can see and speak or act, with their own reason for coming. They come to Cyril where Cyril is; the scene does not move, and no one is already waiting somewhere else. Write only the others; never Cyril.]");
    });

    it('several arrivals, and what the story set off', () => {
        const note = buildNow({ arriving: ['Adam Miller', 'Vex'], triggered: ['- Adam orders Doc and Galice to stand down.'], cast });
        expect(note).toContain('Adam Miller and Vex come in now - each arrives where everyone can see');
        expect(note).toContain('It happens now: Adam orders Doc and Galice to stand down.');
    });

    it('is empty with no order', () => {
        expect(buildNow({ arriving: [], triggered: [], cast })).toBe('');
        expect(buildNow({})).toBe('');
    });

    it('is a bracketed note, never story prose', () => {
        expect(buildNow({ arriving: ['Adam Miller'] })).toMatch(/^\[Game master's note for this reply, not part of the story: .*\]$/);
    });
});
