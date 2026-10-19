// Story time: the span the story reports moves the clock by that span, and
// a morning the story narrates (even through "until well after daybreak")
// is reached - from the night, on the next day.
import { storyDelta, storyTimeCue, cueTarget } from '../src/calendar/moment.js';

describe('storyDelta', () => {
    it('reads a span as a span, never as the moment it describes', () => {
        expect(storyDelta('minutes into the night')).toBe('a few minutes');
        expect(storyDelta('into the night')).toBe('');
        expect(storyDelta('late evening')).toBe('');
        expect(storyDelta('two hours')).toBe('two hours');
        expect(storyDelta('20 minutes later.')).toBe('20 minutes');
    });

    it('keeps a jump the story asks for', () => {
        expect(storyDelta('the next morning')).toBe('the next morning');
        expect(storyDelta('until dawn')).toBe('until dawn');
        expect(storyDelta('overnight')).toBe('overnight');
    });
});

describe('narrated morning', () => {
    it('reads "it was morning at last" as morning', () => {
        expect(storyTimeCue("It was morning at last and the sun's glowing rays bathed the battlefield in golden hues.")?.phrase).toBe('morning');
    });

    it('reads a past span that ran until after daybreak as reached', () => {
        expect(storyTimeCue('Remus was unconscious for the rest of the battle until well after daybreak.')?.phrase).toBe('morning');
    });

    it('still skips a morning that is only planned', () => {
        expect(storyTimeCue('We will rest until well after daybreak.')).toBeNull();
    });

    it('reaches morning on the next day from the night', () => {
        const cue = storyTimeCue('It was morning at last.');
        expect(cueTarget(cue, 0.88)).toMatchObject({ nextDay: true });
    });
});
