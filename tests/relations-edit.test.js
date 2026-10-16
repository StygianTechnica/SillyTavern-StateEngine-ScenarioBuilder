import { relationsFor, pairCovered, authoredLine } from '../src/library/relations-edit.js';

const relations = [
    { id: 'r1', from: 'mira', to: 'tobin', kind: 'owes', note: 'a lot', mutual: false },
    { id: 'r2', from: 'ethloe', to: 'mira', kind: 'mentor of', note: '', mutual: false },
    { id: 'r3', from: 'mira', to: 'ysolde', kind: 'friend', note: '', mutual: true },
];

describe('authored relationships', () => {
    it('reads each relationship from the entry\'s own side', () => {
        expect(relationsFor('mira', relations).map((r) => [r.otherId, r.kind, r.direction])).toEqual([
            ['tobin', 'owes', 'out'], ['ethloe', 'student of', 'in'], ['ysolde', 'friend', 'out'],
        ]);
        expect(relationsFor('tobin', relations)[0].kind).toBe('owes (them)');
        expect(relationsFor('ysolde', relations)[0].kind).toBe('friend');
    });

    it('supersedes the story for a pair in either direction', () => {
        expect(pairCovered('tobin', 'mira', relations)).toBe(true);
        expect(pairCovered('tobin', 'ysolde', relations)).toBe(false);
    });

    it('writes a prompt line', () => {
        expect(authoredLine('Mira', 'Tobin', relationsFor('mira', relations)[0])).toBe('Mira → Tobin: owes - a lot');
    });
});
