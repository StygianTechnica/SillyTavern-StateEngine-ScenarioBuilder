// Assassins Inc: "Adam said this was our mission. Why are they coming
// along?" - and Inji, Zane and Doc answered as one, defending Doc and
// Galice, though Adam's plan named only Cyril, Inji and Zane.
import { pushBack } from '../src/guidance/pushback.js';
import { buildNow } from '../src/guidance/build.js';

const cast = [{ name: 'Cyril', player: true }, { name: 'Inji Miyama', aliases: ['Inji'] }, { name: 'Zane' }, { name: 'Doc' }, { name: 'Galice Buckar', aliases: ['Galice'] }];
const beat = { text: 'Adam assigns Cyril and Inji to stop Enrique\'s operation, with Zane as a partner.', people: ['Inji Miyama', 'Zane', 'Cyril'] };
const post = 'Cyril set a hand on Inji\'s shoulder. "Hang on, Adam said this was our mission. Why are they coming along?" He jerked a thumb in Galice and Doc\'s direction.';

describe('when the player questions it', () => {
    it('no one closes ranks, and the job is as the plan gave it', () => {
        const p = pushBack({ post, player: 'Cyril', cast, beat });
        expect(p.fair).toMatch(/each here answers for themselves.*do not close ranks/);
        expect(p.team).toBe("The job as it was given: Adam assigns Cyril and Inji to stop Enrique's operation, with Zane as a partner. Doc and Galice Buckar were given no part in it - no one here can say they were sent, and they answer for coming themselves.");
        const note = buildNow({ pushFair: p.fair, pushTeam: p.team, cast });
        expect(note).toContain('were given no part in it');
        expect(note).toContain('do not close ranks');
    });
    it('across genres, and not when nothing is questioned', () => {
        const knights = [{ name: 'Aldric', player: true }, { name: 'Ser Brannoc', aliases: ['Brannoc'] }, { name: 'Maelis' }];
        expect(pushBack({ post: 'Aldric frowned. "Since when does Maelis ride with us?"', player: 'Aldric', cast: knights, beat: { text: 'Aldric and Ser Brannoc ride to the pass.', people: ['Ser Brannoc', 'Aldric'] } }).team).toMatch(/Maelis was given no part in it/);
        expect(pushBack({ post: 'Cyril checked his gear and nodded.', player: 'Cyril', cast, beat })).toEqual({ fair: '', team: '' });
        // One other here: no ranks to close.
        expect(pushBack({ post, player: 'Cyril', cast: cast.slice(0, 2), beat }).fair).toBe('');
    });
});
