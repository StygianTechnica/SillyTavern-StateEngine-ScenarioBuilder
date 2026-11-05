// The outline prompt fitted to an 8k model (src/planner/fit.js): on
// Stheno, Assassins Inc's prompt took ~8,000 of 8,192 tokens and every
// answer was cut off in its first act.
import { fitOutlinePrompt, promptBudget } from '../src/planner/fit.js';
import { buildOutlinePrompt } from '../src/planner/prompts.js';
import { estimateDirectorTokens } from '../src/director/fit.js';

const para = (word, n) => Array.from({ length: n }, (_, i) => `${word} ${i} lives in the neon-drenched city and wants something of everyone around them.`).join(' ');
const dossier = [
    `THE SETTING\n${para('setting', 20)}`,
    `THE SCENE NOW\nWhere: Adam Miller's Office. ${para('scene', 15)}`,
    `WHO IS HERE\n${para('person', 60)}`,
    `SECRETS AND OATHS\n${para('secret', 30)}`,
    `OTHERS WHO COULD TURN UP (not here now)\n${para('other', 40)}`,
    `ENEMY GROUND\n${para('enemy', 20)}`,
].join('\n\n');
const shape = { label: 'Adventure serial', acts: ['The call', 'Episodes', 'The great danger', 'Homecoming'].map((title) => ({ title, share: 0.25, band: [1, 4], pattern: 'rise' })) };
const input = {
    dossier,
    userName: 'Cyril',
    messages: Array.from({ length: 12 }, (_, i) => ({ name: i % 2 ? 'Narrator' : 'Cyril', text: para(`message${i}`, 8), isUser: i % 2 === 0 })),
    shape,
    outline: { acts: [{ title: 'The Call', beats: [{ id: 'b1', text: 'Cyril recovers with Inji\'s help', status: 'done' }] }] },
    rewrite: true,
    wish: 'Zane is among the agents assigned to stop the art heist.',
    steer: 'Cyril starts in a vulnerable place.',
    storySoFar: para('volume', 40),
    untouched: [],
};

describe('the outline prompt on an 8k model', () => {
    const budget = promptBudget(8192, 2400);

    it('was too big as it was, and fits once trimmed, keeping what must stay', () => {
        const whole = buildOutlinePrompt(input);
        expect(estimateDirectorTokens(whole.system) + estimateDirectorTokens(whole.prompt)).toBeGreaterThan(budget);
        const fitted = fitOutlinePrompt(input, budget);
        expect(fitted.fits).toBe(true);
        expect(fitted.tokens).toBeLessThanOrEqual(budget);
        expect(fitted.trimmed[0]).toBe('factions not yet in play');
        expect(fitted.prompt).toContain('Zane is among the agents assigned to stop the art heist.');
        expect(fitted.prompt).toContain('Cyril starts in a vulnerable place.');
        expect(fitted.prompt).toContain('[b1] Cyril recovers');
        expect(fitted.prompt).toContain('WHO IS HERE');
        expect(fitted.prompt).not.toContain('OTHERS WHO COULD TURN UP');
    });

    it('leaves a prompt that fits alone', () => {
        const fitted = fitOutlinePrompt({ ...input, dossier: 'THE SCENE NOW\nA bar.', messages: [], storySoFar: '' }, budget);
        expect(fitted.trimmed).toEqual([]);
        expect(fitted.fits).toBe(true);
    });
});
