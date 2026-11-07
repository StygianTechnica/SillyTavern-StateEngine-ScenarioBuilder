// Zane and Inji, rivals in the library, read as "ally, close (+2)" in
// Archivist's notes - and played as best friends.
import { relationSlips, relationText } from '../src/guidance/canon.js';

const notes = `Relationships in this scene:
- Inji Miyama -> Zane: ally, close (+2), high intensity, stable. Inji expects Zane to provide support.
- Cyril -> Inji Miyama: teammate, friendly (+1), high intensity, stable.`;

describe('a rivalry the notes call friendship', () => {
    it('is put right in the user\'s words', () => {
        const slips = relationSlips([{ a: 'Zane', b: 'Inji Miyama', kind: 'rival', note: 'compete lewdly over sexual conquests' }], notes);
        expect(slips).toHaveLength(1);
        expect(relationText(slips)).toBe('Correction: between Zane and Inji Miyama it is rival - compete lewdly over sexual conquests; they are not close friends, and notes that said so were wrong. The rivalry is needling and keeping score, never a fight: they never turn a weapon on each other, and against an enemy they fight side by side.');
    });
    it('a rivalry never reads as a fight between them; real enmity keeps them apart', () => {
        const rival = relationText([{ a: 'Zane', b: 'Inji Miyama', kind: 'rival' }]);
        expect(rival).not.toMatch(/whatever the job|not allies/);
        expect(rival).toMatch(/side by side/);
        const enemy = relationText([{ a: 'Ser Brannoc', b: 'Maelis', kind: 'enemy' }]);
        expect(enemy).toMatch(/not allies or friends/);
        expect(enemy).not.toMatch(/side by side/);
    });
    it('not a friendship the user wrote, nor notes that agree', () => {
        expect(relationSlips([{ a: 'Cyril', b: 'Inji Miyama', kind: 'lover' }], notes)).toEqual([]);
        expect(relationSlips([{ a: 'Zane', b: 'Inji Miyama', kind: 'rival' }], '- Zane -> Inji Miyama: rival, antagonistic (-1)')).toEqual([]);
        expect(relationSlips([{ a: 'Ser Brannoc', b: 'Maelis', kind: 'enemy' }], '- Maelis -> Ser Brannoc: friend, close (+2)')).toHaveLength(1);
    });
});
