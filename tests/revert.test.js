// A swipe or edit takes back what the message changed - never a change the
// user made after it (setting the date by hand).
import { revertPatch } from '../src/state/revert.js';

const APR19 = 1776632000;
const APR20 = 1776719232;
const APR2 = 1775116800;

describe('reverting a message', () => {
    it("leaves the user's hand-set date alone", () => {
        const history = [
            { id: 'h1', source: 'story', before: { time: APR19, day: 19 }, after: { time: APR20, day: 20 } },
            { id: 'h2', source: 'user', before: { time: APR20, day: 20 }, after: { time: APR2, day: 2, dayPart: 'morning' } },
        ];
        expect(revertPatch(history, ['h1'], { time: APR2, day: 2, dayPart: 'morning', locationId: 'loc_a' })).toEqual({});
    });

    it('still takes back what the message changed and nothing changed since', () => {
        const history = [
            { id: 'h1', source: 'story', before: { time: APR19, locationId: 'loc_a' }, after: { time: APR20, locationId: 'loc_b' } },
            { id: 'h2', source: 'user', before: { time: APR20 }, after: { time: APR2 } },
        ];
        expect(revertPatch(history, ['h1'], { time: APR2, locationId: 'loc_b' })).toEqual({ locationId: 'loc_a' });
    });

    it('goes back to before the first of several undone changes', () => {
        const history = [
            { id: 'h1', source: 'story', before: { time: 100 }, after: { time: 200 } },
            { id: 'h2', source: 'story', before: { time: 200 }, after: { time: 300 } },
        ];
        expect(revertPatch(history, ['h1', 'h2'], { time: 300 })).toEqual({ time: 100 });
    });

    it('ignores later changes that were themselves undone', () => {
        const history = [
            { id: 'h1', source: 'story', before: { time: 100 }, after: { time: 200 } },
            { id: 'h2', source: 'user', before: { time: 200 }, after: { time: 50 }, undone: true },
        ];
        expect(revertPatch(history, ['h1'], { time: 200 })).toEqual({ time: 100 });
    });
});
