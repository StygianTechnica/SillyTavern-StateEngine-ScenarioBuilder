// Any prompt fitted to the model's context (src/generate/fit-text.js): on
// an 8k model a full prompt left the answer a hundred tokens.
import { fitMessages, fitText, promptRoom, estimateTokens } from '../src/generate/fit-text.js';

const long = (word, n) => Array.from({ length: n }, (_, i) => `${word} ${i} walks the neon streets with a plan and a grudge.`).join(' ');
const prompt = [
    `THE SETTING\n${long('setting', 80)}`,
    `WHO IS HERE\n${long('person', 160)}`,
    `THE LATEST CHAT (all of this has already happened)\n${long('chat', 200)}`,
    `WHAT THE USER WANTS FROM THIS PLAN (follow it)\n- Zane joins the heist team.`,
    `PLAN THE DAY\nTwo to five moments. Answer in this JSON shape:\n{"moments":[{"text":"<moment>"}]}`,
].join('\n\n');

describe('fitting a prompt to an 8k model', () => {
    it('leaves small prompts alone', () => {
        const out = fitMessages([{ role: 'system', content: 'You plan.' }, { role: 'user', content: 'PLAN THE DAY\nAnswer in this JSON shape: {}' }], 8192, 1200);
        expect(out.cut).toBe(0);
        expect(out.messages[1].content).toBe('PLAN THE DAY\nAnswer in this JSON shape: {}');
    });

    it('cuts the longest sections until it fits, keeping titles, wishes and the answer shape', () => {
        const system = 'You are the game master.';
        expect(estimateTokens(prompt)).toBeGreaterThan(promptRoom(8192, 1200));
        const out = fitMessages([{ role: 'system', content: system }, { role: 'user', content: prompt }], 8192, 1200);
        expect(out.fits).toBe(true);
        expect(out.cut).toBeGreaterThan(0);
        const text = out.messages[1].content;
        expect(out.messages[0].content).toBe(system);
        expect(text).toContain('THE SETTING\n');
        expect(text).toContain('WHO IS HERE\n');
        expect(text).toContain('THE LATEST CHAT (all of this has already happened)\n');
        expect(text).toContain('- Zane joins the heist team.');
        expect(text).toContain('Answer in this JSON shape:\n{"moments":[{"text":"<moment>"}]}');
        // On a big model nothing is cut.
        expect(fitMessages([{ role: 'user', content: prompt }], 128000, 1200).cut).toBe(0);
    });

    it('stops when only what must stay is left', () => {
        const out = fitText(`WRITE THE OUTLINE\n${long('rule', 400)}`, 500);
        expect(out.cut).toBe(0);
    });
});
