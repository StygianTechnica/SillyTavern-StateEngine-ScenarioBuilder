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

import { storyElapsed } from '../src/calendar/moment.js';

describe('time the story says has passed', () => {
    it('reads a span told as passed', () => {
        expect(storyElapsed('"The stubborn fool has been gone for hours," Graxx grumbled.')).toBe('a few hours');
        expect(storyElapsed('Two hours later they reached the gate.')).toBe('two hours');
        expect(storyElapsed('After several hours of marching, they rested.')).toBe('a few hours');
        expect(storyElapsed('An hour passed in silence.')).toBe('one hour');
        expect(storyElapsed('Three days later, the envoy returned.')).toBe('three days');
    });

    it('leaves what will be, moments, and backstory days alone', () => {
        expect(storyElapsed('We will rest for hours.')).toBe('');
        expect(storyElapsed('She waited for a moment.')).toBe('');
        expect(storyElapsed('It was hours before dawn.')).toBe('');
        expect(storyElapsed('She had been travelling for days before they met.')).toBe('');
    });
});
