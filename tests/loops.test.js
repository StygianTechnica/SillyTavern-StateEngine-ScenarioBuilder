import { circling, asksToFinish } from '../src/director/loops.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';

const reply = (n) => `The keeper bowed. "Well done, Champion. You have freed ${n} souls, but there are many more who await your aid." With those words, another orb drifted towards Remus, holding a face twisted in despair.`;
const m = (text, isUser = false) => ({ text, isUser });

describe('going in circles', () => {
    it('hears the player asking whether it is over', () => {
        for (const t of ['"Is this the last?" He asked the keeper.', 'Will this complete the trial?', 'Are we done here?', 'How many more?']) expect(asksToFinish(t)).toBe(true);
        expect(asksToFinish('He reached for the next orb.')).toBe(false);
    });

    it('sees replies repeating the same beat', () => {
        const r = circling([m(reply(1)), m('Remus touched the orb.', true), m(reply(2)), m('He freed her too.', true), m(reply(3))]);
        expect(r.circling).toBe(true);
        expect(r.line).toContain('going in circles');
    });

    it('sees the player repeating themselves', () => {
        const same = 'One after another Remus continued the task, absorbing the miseries of every soul. "Is this the last?"';
        const r = circling([m(same, true), m('No, Champion.'), m(same, true)]);
        expect(r.circling).toBe(true);
        expect(r.asks).toBe(true);
        expect(r.line).toMatch(/^The player character asks whether this is over/);
    });

    it('says nothing when the story moves on', () => {
        expect(circling([m('They rode north.'), m('Remus checked the map.', true), m('The bridge was out; they turned east.')]).line).toBe('');
    });

    it('is put before the director, and tasks have an end in its rules', () => {
        const { system, prompt } = buildDirectorPrompt({ cast: [{ name: 'Remus', player: true }], loopLine: 'The story is going in circles.' });
        expect(prompt).toContain('GOING IN CIRCLES - mind this above all: The story is going in circles.');
        expect(system).toContain('a task, trial, test or puzzle: it has an end');
    });
});
