// Image prompts hold what can be seen - never the story, a role's duties or
// anyone's name.
import { visualDescription, roleArchetype, withoutNames, buildImagePrompt } from '../src/images/prompt.js';

const others = ['Graxx', 'Ravagers', 'Redhaven', 'Ferunox, the Sovereign of the Unbound Ember', 'Death Knight'];

describe('a visual description', () => {
    it('keeps the looks and drops the story clauses', () => {
        const text = 'Graxx is a formidable figure, with an imposing physique that speaks to his survival skills in the harsh world. His thick grey-streaked beard and piercing blue eyes exude a steely resolve, while the scar on his cheek tells a tale of past battles won. He is responsible for maintaining order in Redhaven.';
        const out = visualDescription(text, { own: ['Graxx'], others });
        expect(out).toContain('a formidable figure, with an imposing physique');
        expect(out).toContain('thick grey-streaked beard and piercing blue eyes');
        expect(out).not.toMatch(/survival|tale|battles|responsible|Redhaven|Graxx/);
    });

    it('takes out other names - a god by its short name too - but keeps a kind after "a"', () => {
        expect(withoutNames('a rogue and champion of Ferunox, in leathers', { others })).toBe('a rogue and champion, in leathers');
        expect(withoutNames('armor emblazoned with the symbol of the Ravagers', { others })).toBe('armor emblazoned with the symbol');
        expect(withoutNames('a powerful Death Knight with black wings', { others })).toBe('a powerful Death Knight with black wings');
    });

    it('ends on whole sentences, never mid-phrase', () => {
        const long = Array.from({ length: 10 }, (_, i) => `She wears a ${['red', 'blue', 'green', 'black', 'white'][i % 5]} cloak with silver clasps and long boots number ${i}.`).join(' ');
        const out = visualDescription(long, { max: 30 });
        expect(out.split('. ').every((s) => /^She wears/.test(s))).toBe(true);
        expect(out.split(/\s+/).length).toBeLessThanOrEqual(30);
    });
});

describe('a role as the subject', () => {
    it('is a short archetype, or nothing', () => {
        expect(roleArchetype('Veteran fighter and scout, serving as Graxx\'s trusted lieutenant in the Ravagers', others)).toBe('veteran fighter and scout');
        expect(roleArchetype('Maziel serves as a powerful Death Knight, wielding the dark god\'s might', ['Maziel'])).toBe('powerful death knight');
        expect(roleArchetype('As the leader of the Ravagers and protector of Redhaven, Graxx is responsible for order', others)).toBe('');
        expect(roleArchetype('Rogue Champion of Ferunox', others)).toBe('rogue champion');
    });

    it('makes the portrait prompt', () => {
        const entry = { type: 'character', name: 'Graxx', description: 'Graxx is a formidable figure with a thick grey beard. He leads the Ravagers and keeps order.', role: 'As the leader of the Ravagers, Graxx keeps order.' };
        const { prompt } = buildImagePrompt({ entry, knownNames: others });
        expect(prompt).toMatch(/^character portrait, a formidable figure with a thick grey beard, /);
        expect(prompt).not.toMatch(/Ravagers|leads|keeps order|As the leader/);
    });
});
