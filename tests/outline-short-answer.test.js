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

describe('a rewrite that is not a whole outline', () => {
    // Assassins Inc: a rewrite came back with one chapter of beats already
    // done; taken in, chapters 2-4 were gone and the volume read as complete.
    it('is told apart: beats still to come, and every chapter of the shape', async () => {
        const { wholeOutline, outlineToCome } = await import('../src/planner/prompts.js');
        const shape = { acts: [{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd' }] };
        const doneOnly = { acts: [{ title: 'The Call', beats: [{ text: 'x', status: 'done' }, { text: 'y', status: 'done' }] }] };
        expect(outlineToCome(doneOnly)).toBe(false);
        expect(wholeOutline(doneOnly, shape)).toBe(false);
        expect(wholeOutline({ acts: [{ beats: [{ status: 'pending' }] }] }, shape)).toBe(false);
        expect(wholeOutline(written, shape)).toBe(true);
        const full = { acts: shape.acts.map((a) => ({ title: a.title, beats: [{ text: a.title, status: 'pending' }] })) };
        expect(wholeOutline(full, shape)).toBe(true);
        expect(wholeOutline(null, shape)).toBe(false);
    });
});

describe('a locked beat the story has played out', () => {
    // Assassins Inc: the night at Vex's hideout (a locked beat) played out
    // under the beat before it, and reviews left it pending.
    it('is told its status follows the story, and is marked done out of order', async () => {
        const { buildOutlinePrompt } = await import('../src/planner/prompts.js');
        const gm = planned();
        const later = beatsOf(gm.outline).find((b) => b.text === 'Galice is offered a payday to sell Cyril out');
        later.locked = true;
        const shape = { acts: written.acts.map((a) => ({ title: a.title, share: 0.25, band: [0, 5], pattern: 'steady' })) };
        const { prompt } = buildOutlinePrompt({ shape, outline: gm.outline, messages: [] });
        expect(prompt).toContain('[locked] beats are the user\'s - keep their words, but their status follows the story');
        const vex = beatsOf(gm.outline).find((b) => b.text === 'Vex recruits Cyril');
        setOutline(gm, { acts: [{ title: 'The players', beats: [{ id: vex.id, text: vex.text, status: 'active' }] }, { title: 'Schemes', beats: [{ id: later.id, text: 'something else', status: 'done' }] }] }, { turn: 20, review: true });
        const now = beatsOf(gm.outline).find((b) => b.id === later.id);
        expect(now.status).toBe('done');
        expect(now.text).toBe('Galice is offered a payday to sell Cyril out');
        expect(beatsOf(gm.outline).find((b) => b.text === 'Vex recruits Cyril').status).toBe('active');
    });
});
