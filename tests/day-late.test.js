// The night of the heist, the day plan came back as two quiet moments of
// people taking up positions - and none for the beat now.
import { buildDayPrompt } from '../src/planner/prompts.js';

const story = { shape: 'Thriller', act: 'The Call', beat: 'Zane is a little too obvious about his interest in Cyril, and he and Inji bicker.', next: '', aim: null };

describe('a day plan late in the day', () => {
    it('comes close together, to a turning point, starting with the beat now', () => {
        const p = buildDayPrompt({ dossier: '', dayPart: 'night', story, userName: 'Cyril' }).prompt;
        expect(p).toContain('Three to five moments');
        expect(p).toContain('the day does not end at bedtime while something is under way');
        expect(p).toContain('No moment is only someone taking up a position or getting ready');
        expect(p).toContain('The first moment moves the beat now along - "Zane is a little too obvious about his interest in Cyril, and he and Inji bicker"');
    });
    it('spread across the day in the morning, any genre', () => {
        const p = buildDayPrompt({ dossier: '', dayPart: 'morning', story: { ...story, beat: 'Ser Brannoc is sent to hold the pass.' }, userName: 'Aldric' }).prompt;
        expect(p).toContain('Spread them across the day');
        expect(p).not.toContain('does not end at bedtime');
    });
});
