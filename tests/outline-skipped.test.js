// A skipped beat never happened: a rewritten outline that leaves it out
// drops it, and planning it again makes a fresh beat, not a skipped one.
import { setOutline, beatsOf } from '../src/planner/model.js';

const gm = () => ({ outline: { premise: 'p', themes: [], seeds: [], acts: [
    { id: 'a1', title: 'Departure', beats: [{ id: 'b1', text: 'They buy supplies from Niamh and Graxx.', status: 'done', ties: [] }, { id: 'b2', text: 'They ride out across the wastes.', status: 'active', ties: [] }] },
    { id: 'a2', title: 'Redhaven', beats: [{ id: 'b3', text: 'Maziel the fallen angel appears and engages Remus and Varyn in combat.', status: 'skipped', ties: [] }] },
] } });

describe('a skipped beat in a rewrite', () => {
    it('is dropped when the new outline leaves it out', () => {
        const g = gm();
        setOutline(g, { acts: [{ title: 'Departure', beats: [{ id: 'b2', text: 'They ride out.', status: 'active' }] }, { title: 'The cache', beats: [{ text: 'They reach the cache and its corrupted guardians.', status: 'pending' }] }] });
        const texts = beatsOf(g.outline).map((b) => b.text);
        expect(texts.some((t) => t.includes('Maziel'))).toBe(false);
        expect(texts).toContain('They buy supplies from Niamh and Graxx.');
    });

    it('planned again, is a fresh beat', () => {
        const g = gm();
        setOutline(g, { acts: [{ title: 'Departure', beats: [] }, { title: 'The cache', beats: [{ text: 'Maziel the fallen angel appears and engages Remus and Varyn in combat as they leave.', status: 'pending' }] }] });
        const maziel = beatsOf(g.outline).find((b) => b.text.includes('Maziel'));
        expect(maziel).toBeTruthy();
        expect(maziel.status).not.toBe('skipped');
    });
});
