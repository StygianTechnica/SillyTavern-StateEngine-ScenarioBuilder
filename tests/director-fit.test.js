import { fitDirectorPrompt, promptBudget, estimateDirectorTokens } from '../src/director/fit.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';

const words = (n, w = 'word') => `${w} `.repeat(n).trim();
const busy = {
    cast: [{ name: 'Remus', player: true }, ...['Varyn', 'Niamh', 'Arin', 'Kael', 'The Eternal Champion'].map((name) => ({ name, description: words(80), personality: words(50), voice: words(40), goals: words(50) }))],
    location: { path: ['Alvarand', 'Belatorre Graveyard', 'Concrete Structure'], description: words(150), creatures: [{ name: 'Skeleton Warriors', description: words(40), active: true }] },
    messages: Array.from({ length: 8 }, (_, i) => ({ name: i % 2 ? 'Remus' : 'Narrator', text: words(170, `m${i}`), isUser: i % 2 === 1 })),
    previousNote: words(240),
    memories: Array.from({ length: 12 }, (_, i) => words(45, `mem${i}`)),
    lore: Array.from({ length: 8 }, (_, i) => ({ name: `Lore ${i}`, description: words(45) })),
    relevant: Array.from({ length: 6 }, (_, i) => ({ name: `Thing ${i}`, type: 'item', description: words(40) })),
    gmPlan: 'TRIGGERED (private - what the story has set off; it happens now):\n- Now, because they breach the structure: two corrupted paladins ambush them',
    allowCreate: true,
    timeKeeping: true,
};
const size = (b) => estimateDirectorTokens(b.system) + estimateDirectorTokens(b.prompt);

describe("the director's prompt, fitted to its model's context", () => {
    it('leaves room for the reply and a margin', () => {
        expect(promptBudget(8192, 700)).toBe(Math.floor((8192 - 700) * 0.9));
        expect(promptBudget(undefined, undefined)).toBe(promptBudget(8192, 700));
    });

    it('is untouched when it fits', () => {
        const fitted = fitDirectorPrompt(busy, 100000);
        expect(fitted.trimmed).toEqual([]);
        expect(fitted.prompt).toBe(buildDirectorPrompt(busy).prompt);
    });

    it('trims the least important parts first, and keeps the scene, the people and the triggers', () => {
        const full = size(buildDirectorPrompt(busy));
        const budget = full - 400;
        const fitted = fitDirectorPrompt(busy, budget);
        expect(fitted.fits).toBe(true);
        expect(fitted.tokens).toBeLessThanOrEqual(budget);
        expect(fitted.trimmed[0]).toBe('earlier scenes');
        expect(fitted.trimmed).not.toContain('recent messages to 4');
        expect(fitted.prompt).toContain('mem0');
    });

    it('goes as far as it must for a small model, and never drops what matters now', () => {
        const fitted = fitDirectorPrompt(busy, 3500);
        expect(fitted.trimmed).toContain('people compacted');
        for (const name of ['Varyn', 'Niamh', 'Arin', 'Kael', 'The Eternal Champion', 'Skeleton Warriors', 'Concrete Structure']) expect(fitted.prompt).toContain(name);
        expect(fitted.prompt).toContain('two corrupted paladins ambush them');
        expect(fitted.prompt).toContain('m7');
        expect(fitted.prompt).not.toContain('m0 ');
        expect(fitted.system).toBe(buildDirectorPrompt(busy).system);
    });
});
