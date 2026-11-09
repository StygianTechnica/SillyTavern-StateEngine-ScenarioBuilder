// "Cyril's actions during the mission were unauthorized and compromised the
// operation" went out as settled fact while Cyril was disputing it.
import { unsettledReason, addSettled, keptSettled, emptyGm } from '../src/planner/model.js';

describe('a verdict is not a settled fact', () => {
    it('the real line', () => {
        expect(unsettledReason("Cyril's actions during the mission were unauthorized and compromised the operation")).toContain('judgement');
    });
    it('across genres', () => {
        for (const t of ['Kiri was reckless at the ford.', 'Captain Vance is to blame for the hull breach.', 'Dana was careless with the keys.', 'The squire nearly endangered the whole party.']) {
            expect(unsettledReason(t)).toContain('judgement');
        }
    });
    it('what really happened still settles', () => {
        for (const t of ['Adam assigned Cyril and Inji as lead infiltrators, with Zane as support.', 'The Novakorp run was only a training simulation - nothing real was taken.', "Enrique's men are after a priceless collection of Mirabelle's antique perfume bottles.", 'The treaty with the river lords was signed at dawn.']) {
            expect(unsettledReason(t)).toBe('');
        }
    });
    it('nor is what is only true for now', () => {
        for (const t of ["Enrique's operation remains the priority to stop; his heist plans are still set for tonight.", 'The caravan leaves at dawn tomorrow.', 'The reactor is stable for now.']) {
            expect(unsettledReason(t)).toContain('for now');
        }
        expect(unsettledReason('Adam agreed Cyril will not be sent against Omicron Innovations.')).toBe('');
    });
    it('from the game master it is turned away', () => {
        const gm = emptyGm();
        expect(addSettled(gm, { id: 's1', text: 'Cyril was reckless in the surveillance room.', source: 'director' })).toBeNull();
    });
    it('one already saved stops going out', () => {
        expect(keptSettled([{ id: 'a', text: 'Cyril compromised the operation.', source: 'director' }])).toEqual([]);
    });
    it('the user may still write one', () => {
        const gm = emptyGm();
        expect(addSettled(gm, { id: 's1', text: 'Cyril was reckless in the surveillance room.', source: 'user' })?.source).toBe('user');
        expect(keptSettled(gm.settled)).toHaveLength(1);
    });
});
