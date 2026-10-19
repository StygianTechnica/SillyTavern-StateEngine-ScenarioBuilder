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

// God War #446/#447: Niamh wakes Remus for the last watch at 02:45 and the
// reply reaches dawn in its own words; the story's delta was "from late
// night through dawn". Both readings take the clock on to dawn.
describe('a watch that ends at dawn', () => {
    const reply = [
        'As Niamh awakened Remus from his rest, he rose with a quiet efficiency, his eyes already adjusting to the dim light of dawn as he took up his post at the ruin\'s perimeter. His gaze swept methodically across the darkness, drinking in every shadow and subtle detail as he sought any sign of movement or disturbance.',
        'The chill of the pre-dawn air nipped at his skin, but Remus paid it no heed, focused intently on his task.',
        'As the first pale light of sunrise crept over the horizon, Remus\'s vigilance never wavered, his senses heightened and alert for any indication of danger. The Roadside Ruin slumbered on around him, its crumbling stone walls holding secrets and stories of long-forgotten times, while Remus stood watch, a sentinel in the dawn\'s early light, ever ready to face whatever challenges the new day might bring.',
    ].join('\n\n');

    it('reads the reply as reaching dawn', () => {
        expect(storyTimeCue(reply)).toEqual({ phrase: 'dawn', fraction: 0.25 });
    });

    it('moves a late-night clock on to dawn the same day', () => {
        expect(cueTarget(storyTimeCue(reply), 2.75 / 24)).toEqual({ fraction: 0.25, nextDay: false });
    });

    it('reads "from late night through dawn" as on to dawn', () => {
        expect(storyDelta('from late night through dawn')).toBe('until dawn');
        expect(storyDelta('through the night until morning')).toBe('until morning');
    });

    it('also reads the other ways dawn is told', () => {
        expect(storyTimeCue('Remus stood watch in the dawn’s early light.')?.phrase).toBe('dawn');
        expect(storyTimeCue('The first grey light of morning touched the walls.')?.phrase).toBe('dawn');
        expect(storyTimeCue('A pale glow crept over the horizon.')?.phrase).toBe('dawn');
    });

    it('leaves dawn that is only spoken of, awaited or a likeness', () => {
        expect(storyTimeCue('"We ride at first light, when sunrise breaks," Niamh said.')).toBeNull();
        expect(storyTimeCue('“Wake me at the light of dawn,” she murmured, and lay down.')).toBeNull();
        expect(storyTimeCue('He waited for the light of dawn.')).toBeNull();
        expect(storyTimeCue('Her smile was like the light of dawn.')).toBeNull();
        expect(storyTimeCue('It was the dawn of a new age for the clans.')).toBeNull();
        expect(storyTimeCue('Hours remained before the light of dawn.')).toBeNull();
    });

    it('never moves the clock back for a dawn it has passed', () => {
        expect(cueTarget(storyTimeCue(reply), 0.3)).toBeNull();
        expect(cueTarget(storyTimeCue(reply), 0.5)).toBeNull();
    });
});
