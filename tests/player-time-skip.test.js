// A TIME line that only gives the instruction back is no TIME line. (A
// time skip the player's post makes is read by State Engine's readTimeShift,
// tested there.)
import { parseDirectorNote } from '../src/director/prompt.js';

describe('a TIME line that echoes the instruction', () => {
    it('is no TIME line', () => {
        const parsed = parseDirectorNote('TIME | A few minutes for talk; longer when people travel, wait, work or sleep, or when the scene moves on (e.g. "the next morning", a time of day)\n\nThe common room hums with talk.');
        expect(parsed.time).toBeNull();
    });

    it('a plain one still counts', () => {
        expect(parseDirectorNote('TIME | 10 minutes | breakfast\n\nThe common room hums with talk.').time).toEqual({ text: '10 minutes', why: 'breakfast' });
    });
});
