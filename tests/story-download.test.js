import { emptyGm, addChronicle, storyMarkdown, hasStory } from '../src/planner/model.js';

describe('the story so far, to save', () => {
    it('has nothing to save before the story has a chronicle', () => {
        expect(hasStory(emptyGm())).toBe(false);
    });

    it('includes the volume under way when asked, marked unfinished', () => {
        const gm = emptyGm();
        addChronicle(gm, 'Rhys took the Dawnblade.', { day: 2 });
        expect(hasStory(gm)).toBe(true);
        const text = storyMarkdown(gm, 'Eldermark', { inProgress: true });
        expect(text).toContain('## Volume 1 (under way)');
        expect(text).toContain('- Day 2: Rhys took the Dawnblade.');
        expect(storyMarkdown(gm, 'Eldermark')).not.toContain('under way');
    });
});
