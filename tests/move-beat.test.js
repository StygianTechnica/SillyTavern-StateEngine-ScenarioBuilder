// The user's outline had "Enrique, enraged by White Cerberus's interference"
// ahead of the infiltration it was angry about, and no way to move it.
import { moveBeat, stepBeat } from '../src/planner/model.js';

const outline = () => ({ gm: { outline: { premise: '', themes: [], seeds: [], acts: [
    { id: 'a1', title: 'The Job', beats: [
        { id: 'b1', text: 'Cyril apologizes to Adam.', status: 'done', ties: [] },
        { id: 'b2', text: 'Adam assigns Cyril and Inji.', status: 'active', ties: [] },
    ] },
    { id: 'a2', title: 'The Heist', beats: [
        { id: 'b3', text: 'Enrique, enraged, sets a trap.', status: 'pending', ties: [] },
        { id: 'b4', text: 'The team infiltrates the gallery.', status: 'pending', ties: [] },
        { id: 'b5', text: 'They stop the heist.', status: 'pending', ties: [] },
    ] },
] } } });
const order = (gm) => gm.outline.acts.map((a) => a.beats.map((b) => b.id).join(' ')).join(' | ');

describe('moving a beat', () => {
    it('drops it where the user put it, and keeps it', () => {
        const { gm } = outline();
        expect(moveBeat(gm, 'b3', 'a2', 1)).toBe(true);
        expect(order(gm)).toBe('b1 b2 | b4 b3 b5');
        expect(gm.outline.acts[1].beats[1].locked).toBe(true);
    });
    it('moves across acts, never before what has played out, never a played-out beat', () => {
        const { gm } = outline();
        expect(moveBeat(gm, 'b5', 'a1', 0)).toBe(true);
        expect(order(gm)).toBe('b1 b5 b2 | b3 b4');
        expect(gm.outline.acts[0].beats.find((b) => b.id === 'b2').status).toBe('active');
        expect(moveBeat(gm, 'b1', 'a2', 0)).toBe(false);
        expect(moveBeat(gm, 'b3', 'a2', 0)).toBe(false);
    });
    it('steps up and down through the outline, across acts', () => {
        const { gm } = outline();
        expect(stepBeat(gm, 'b3', 1)).toBe(true);
        expect(order(gm)).toBe('b1 b2 | b4 b3 b5');
        expect(stepBeat(gm, 'b4', -1)).toBe(true);
        expect(order(gm)).toBe('b1 b2 b4 | b3 b5');
        expect(stepBeat(gm, 'b2', -1)).toBe(false);
        expect(stepBeat(gm, 'b5', 1)).toBe(false);
    });
});
