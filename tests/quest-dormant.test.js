// A thread the story left behind long ago makes no quest, and a quest on
// it is not followed - "negotiate passage with Niamh" after it was settled,
// the Naming Day ceremony from the first chapter.
import { threadDormant, DORMANT_AFTER } from '../src/quests/model.js';

describe('a dormant thread', () => {
    it('is one no message has touched in a long while', () => {
        expect(threadDormant({ message_range: { from: 10, to: 30 } }, 430)).toBe(true);
        expect(threadDormant({ message_range: { from: 10, to: 400 } }, 430)).toBe(false);
        expect(threadDormant({ message_range: { from: 0, to: 100 } }, 100 + DORMANT_AFTER)).toBe(false);
    });

    it('is never guessed without the numbers', () => {
        expect(threadDormant({}, 430)).toBe(false);
        expect(threadDormant({ message_range: null }, 430)).toBe(false);
        expect(threadDormant({ message_range: { to: 30 } }, undefined)).toBe(false);
    });
});
