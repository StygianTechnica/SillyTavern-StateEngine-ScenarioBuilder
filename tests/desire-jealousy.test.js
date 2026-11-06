// Assassins Inc: Zane, jealous by nature, and Inji had each been with Cyril
// - but the ties were all desire, not love, so no one was ever "in love"
// with him and no jealousy ever fired in the car.
import { bondsOf, heartsSection, isRomantic } from '../src/director/jealousy.js';

describe('desire counts', () => {
    it('as a bond, worded as wanting', () => {
        const bonds = bondsOf({ authored: [
            { from: 'zane', to: 'cyril', kind: 'attracted to', note: 'kissed and fooled around before' },
            { from: 'inji', to: 'cyril', kind: 'lover', note: 'slept together in the car' },
        ] });
        expect(bonds.map((b) => [b.who, b.to, b.romantic])).toEqual([['zane', 'cyril', true], ['inji', 'cyril', true]]);
        const names = { zane: 'Zane', inji: 'Inji Miyama', cyril: 'Cyril' };
        const text = JSON.stringify(heartsSection({ present: [{ id: 'zane', name: 'Zane' }, { id: 'inji', name: 'Inji Miyama' }, { id: 'cyril', name: 'Cyril', player: true }], bonds, modeOf: (id) => (id === 'zane' ? 'jealous' : ''), userName: 'Cyril', nameOf: (id) => names[id] ?? '' }));
        expect(text).toContain('Zane wants Cyril (attracted to)');
        expect(text).toContain('Zane is jealous by nature');
        expect(text).toContain('Inji Miyama is in love with Cyril');
    });
    it('not family, mentors or plain work', () => {
        expect(isRomantic('mentor - they kissed her brow')).toBe(false);
        expect(isRomantic('teammate')).toBe(false);
        expect(isRomantic('rival - compete lewdly over sexual conquests')).toBe(true);
        expect(isRomantic('Ser Brannoc and the queen: a long flirtation')).toBe(true);
    });
});
