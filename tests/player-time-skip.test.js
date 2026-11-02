// The player moves time on: a post that opens a sentence with a time skip
// ("Early the next morning, ...") takes the clock there - and a TIME line
// that only gives the instruction back is no TIME line.
import { playerTimeSkip, fallbackAdvance } from '../src/calendar/moment.js';
import { parseDirectorNote } from '../src/director/prompt.js';

describe('playerTimeSkip', () => {
    it('reads the skip a post opens with', () => {
        expect(playerTimeSkip('Early the next morning, Zane drove Cyril back to the Signal box on his motorcycle.')).toEqual({ advance: 'the next morning', sameDay: false });
        expect(playerTimeSkip('The next day, Cyril went to the range.')).toEqual({ advance: 'the next morning', sameDay: false });
        expect(playerTimeSkip('The following evening they met again.')).toEqual({ advance: 'the next evening', sameDay: false });
        expect(playerTimeSkip('The morning after, he woke sore.')).toEqual({ advance: 'the next morning', sameDay: false });
        expect(playerTimeSkip('Next morning he was gone.')).toEqual({ advance: 'the next morning', sameDay: false });
        expect(playerTimeSkip('*Overnight, the rain stopped.*')).toEqual({ advance: 'the next morning', sameDay: false });
    });

    it('reads spans, counted or not', () => {
        expect(playerTimeSkip('Two days later, the call came.')).toEqual({ advance: 'two days', sameDay: false });
        expect(playerTimeSkip('Hours later, Cyril woke.')).toEqual({ advance: 'a few hours', sameDay: false });
        expect(playerTimeSkip('An hour later he was back.')).toEqual({ advance: 'one hour', sameDay: false });
    });

    it('keeps "later that evening" to today', () => {
        expect(playerTimeSkip('Later that evening, Cyril found the gym.')).toEqual({ advance: 'until evening', sameDay: true });
        expect(playerTimeSkip('By nightfall the city was quiet.')).toEqual({ advance: 'until evening', sameDay: true });
        expect(playerTimeSkip('At dawn, they set out.')).toEqual({ advance: 'until dawn', sameDay: false });
    });

    it('takes a skip from any sentence that starts with it', () => {
        expect(playerTimeSkip('Cyril slept like the dead. The next morning he felt better.')).toEqual({ advance: 'the next morning', sameDay: false });
    });

    it('never speech, a mention mid-sentence, or what will be', () => {
        expect(playerTimeSkip('"The next morning we ride," Cyril said.')).toBeNull();
        expect(playerTimeSkip('Cyril decided to leave the next morning.')).toBeNull();
        expect(playerTimeSkip('The next morning would bring trouble, he knew.')).toBeNull();
        expect(playerTimeSkip('Tomorrow he\'ll go back.')).toBeNull();
        expect(playerTimeSkip('Cyril nodded and went to find the gym.')).toBeNull();
    });

    it('gives advances the clock understands', () => {
        const def = { secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24 };
        const evening = 0.75 * 86400;
        expect(fallbackAdvance(def, evening, playerTimeSkip('Early the next morning, he left.').advance)).toBe(86400 + Math.round(0.33 * 86400));
        expect(fallbackAdvance(def, evening, playerTimeSkip('Two days later he left.').advance)).toBe(evening + 2 * 86400);
    });
});

describe('a TIME line that echoes the instruction', () => {
    it('is no TIME line', () => {
        const parsed = parseDirectorNote('TIME | A few minutes for talk; longer when people travel, wait, work or sleep, or when the scene moves on (e.g. "the next morning", a time of day)\n\nThe common room hums with talk.');
        expect(parsed.time).toBeNull();
    });

    it('a plain one still counts', () => {
        expect(parseDirectorNote('TIME | 10 minutes | breakfast\n\nThe common room hums with talk.').time).toEqual({ text: '10 minutes', why: 'breakfast' });
    });
});
