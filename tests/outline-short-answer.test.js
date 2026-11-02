import { describe, it, expect } from 'vitest';
import { emptyGm, normalizeGm, setOutline, beatsOf } from '../src/planner/model.js';

// Assassins Inc: reviews that came back with one chapter (cut short and
// salvaged, or the act under way only) planned chapters 2-4 away, one
// review at a time.
const written = {
    premise: 'Cyril finds his place in White Cerberus.',
    acts: [
        { title: 'The players', beats: [{ text: 'Cyril wakes in the Sumps', status: 'done' }, { text: 'Vex recruits Cyril', status: 'active' }] },
        { title: 'Schemes', beats: [{ text: 'Riven exposes the Moriarty name' }, { text: 'Galice is offered a payday to sell Cyril out' }] },
        { title: 'Masks slip', beats: [{ text: 'Doc learns what Tole did to Cyril' }] },
        { title: 'A new order', beats: [{ text: 'Cyril chooses between Omicron and White Cerberus' }] },
    ],
};

function planned() {
    const gm = emptyGm();
    setOutline(gm, written, { turn: 10 });
    return gm;
}

describe('a review with fewer chapters', () => {
    it('keeps the chapters it left out, beats still to come and all', () => {
        const gm = planned();
        const ids = beatsOf(gm.outline).map((b) => [b.id, b.text]);
        const b2 = ids.find(([, t]) => t === 'Vex recruits Cyril')[0];
        setOutline(gm, { acts: [{ title: 'The players', beats: [{ id: 'b1', text: 'Cyril wakes in the Sumps', status: 'done' }, { id: b2, text: 'Vex recruits Cyril', status: 'done' }] }] }, { turn: 20, review: true });
        expect(gm.outline.acts.map((a) => a.title)).toEqual(['The players', 'Schemes', 'Masks slip', 'A new order']);
        expect(gm.outline.acts[1].beats.map((b) => b.text)).toEqual(['Riven exposes the Moriarty name', 'Galice is offered a payday to sell Cyril out']);
        expect(beatsOf(gm.outline).find((b) => b.text === 'Vex recruits Cyril').status).toBe('done');
        // The next beat to come is now under way.
        expect(beatsOf(gm.outline).find((b) => b.status === 'active')?.text).toBe('Riven exposes the Moriarty name');
    });
    it('does not copy a beat the answer moved into an earlier chapter', () => {
        const gm = planned();
        const riven = beatsOf(gm.outline).find((b) => b.text === 'Riven exposes the Moriarty name');
        setOutline(gm, { acts: [{ title: 'The players', beats: [{ id: riven.id, text: riven.text, status: 'active' }] }] }, { turn: 20, review: true });
        expect(beatsOf(gm.outline).filter((b) => b.text === riven.text)).toHaveLength(1);
    });
    it('a regenerate still starts the chapters over', () => {
        const gm = planned();
        setOutline(gm, { acts: [{ title: 'The players', beats: [{ text: 'Something new' }] }] }, { turn: 20, keepLocked: false });
        expect(gm.outline.acts).toHaveLength(1);
    });
});

describe('the outline guidance', () => {
    it('is kept with the volume', () => {
        expect(normalizeGm({ volume: { number: 1, outlineWish: 'More intrigue.\n\nGalice should be tempted.' } }).volume.outlineWish).toBe('More intrigue.\n\nGalice should be tempted.');
        expect(emptyGm().volume.outlineWish).toBe('');
    });
});
