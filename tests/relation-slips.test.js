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
        expect(relationText(slips)).toBe('Correction: between Zane and Inji Miyama it is rival - compete lewdly over sexual conquests; they are not allies or close friends, and notes that said so were wrong. They needle, compete and keep score with each other, whatever the job.');
    });
    it('not a friendship the user wrote, nor notes that agree', () => {
        expect(relationSlips([{ a: 'Cyril', b: 'Inji Miyama', kind: 'lover' }], notes)).toEqual([]);
        expect(relationSlips([{ a: 'Zane', b: 'Inji Miyama', kind: 'rival' }], '- Zane -> Inji Miyama: rival, antagonistic (-1)')).toEqual([]);
        expect(relationSlips([{ a: 'Ser Brannoc', b: 'Maelis', kind: 'enemy' }], '- Maelis -> Ser Brannoc: friend, close (+2)')).toHaveLength(1);
    });
});
