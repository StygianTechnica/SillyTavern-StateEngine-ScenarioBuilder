// Those the last reply showed elsewhere stay there. Assassins Inc: a
// cutaway had Doc, Galice, Vex and Miller at HQ; the next reply, Zane
// arriving at the gun range, brought all of them - and Inji, named in
// Zane's reason - into the range.
import { elsewhereNow } from '../src/guidance/spoken.js';
import { buildNow } from '../src/guidance/build.js';

const people = [
    { id: 'cy', name: 'Cyril' }, { id: 'za', name: 'Zane' }, { id: 'doc', name: 'Doc' },
    { id: 'ga', name: 'Galice Buckar' }, { id: 'vx', name: 'Vex' }, { id: 'am', name: 'Adam Miller' },
    { id: 'in', name: 'Inji Miyama' }, { id: 'en', name: 'Enrique Medina' },
    { id: 'br', name: 'Ser Brannoc' }, { id: 'ma', name: 'Maelis' },
];
const cutaway = "As Cyril disappeared to the gun range, Miller's techs busied themselves. Doc paced around the room. Galice sat quietly. Vex leaned back in her chair.";

describe('who the last reply left elsewhere', () => {
    it('stays out of the scene', () => {
        const away = elsewhereNow(people, {
            lastReply: cutaway,
            reasons: ["Adam assigns Cyril and Inji to stop Enrique's operation, with Zane as a partner."],
            playerPost: 'Cyril spent several hours at the gun range.',
            here: ['cy', 'za'], skip: ['cy'],
        });
        expect(away).toEqual(expect.arrayContaining(['Doc', 'Galice Buckar', 'Vex', 'Adam Miller', 'Inji Miyama']));
        expect(away).not.toContain('Zane');
        const note = buildNow({ arriving: ['Zane'], elsewhere: away, cast: [{ name: 'Cyril', player: true }, { name: 'Zane' }] });
        expect(note).toMatch(/Not in this scene: .*Vex.* - they are all elsewhere, and do not come in, speak or act in this reply\./);
    });
    it('not those the player goes to, nor those here', () => {
        const away = elsewhereNow(people, {
            lastReply: 'Maelis waited in the chapel while Ser Brannoc rode out.',
            playerPost: 'Cyril heads for the chapel to find Maelis.',
            here: ['cy', 'br'],
        });
        expect(away).toEqual([]);
    });
    it('no note when no one is elsewhere', () => {
        expect(buildNow({ elsewhere: [], cast: [{ name: 'Cyril', player: true }] })).toBe('');
    });
});
