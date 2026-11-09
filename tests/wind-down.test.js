// Assassins Inc's debrief: Cyril answered every charge and asked to leave, and
// Inji, Zane and Adam kept on, Inji making up a plan to accuse him of breaking.
import { windDown } from '../src/guidance/pushback.js';
import { buildNow } from '../src/guidance/build.js';

const posts = [
    '"It wasn\'t impulsiveness. I wasn\'t getting much guidance at all. Zane, back me up here."',
    '"Fine." He said in a dark tone. "Is that all you want from me? I think I\'m done for tonight."',
    '"Done. Can I leave now?" Cyril asked, feeling as if he was being put on the spot.',
    '"And I was *not* trigger happy at all. I fired on Tadam and that asshole has more metal in his body than anyone should."',
    '"What was the plan? Please tell me how what I did deviated from your so very detailed plan!"',
    '"What the fuck are you talking about? We had to stop the Medina Syndicate from bypassing the security measures!"',
];
const replies = ['"Your inexperience showed," Inji says.', '"Maybe try not being so trigger-happy, rookie."', '"Your methods diverged from our strategy."'];
const quiet = ['The rain fell.', 'Zane poured a drink.', 'The car hummed along.'];

describe('an argument that has gone on long enough', () => {
    it('the real debrief', () => {
        const order = windDown({ posts, replies, player: 'Cyril' });
        expect(order).toContain('This argument ends in this reply');
        expect(order).toContain('has asked to go');
        expect(order).toContain('grants something specific Cyril said');
        expect(order).toContain('no one claims a plan, order or agreement the story never showed');
    });
    it('comes first in the note nearest the reply', () => {
        const note = buildNow({ cast: [{ name: 'Cyril', player: true }], windDown: 'This argument ends in this reply.', corrections: 'Correction.' });
        expect(note.indexOf('This argument ends')).toBeLessThan(note.indexOf('Write only the others'));
        expect(note.startsWith("[Game master's note for this reply, not part of the story: This argument ends")).toBe(true);
    });
    it('not on one objection', () => {
        expect(windDown({ posts: ['He sat down.', 'He nodded.', '"I didn\'t do that."'], replies, player: 'Cyril' })).toBe('');
    });
    it('not when no one is criticising: questions are just questions', () => {
        expect(windDown({ posts: ['"Where to?"', '"Why is it raining?"', '"Is that a bar?"', '"Why not?"'], replies: quiet, player: 'Cyril' })).toBe('');
    });
    it('it stops once the player moves on', () => {
        expect(windDown({ posts: [...posts, 'He poured himself a drink and looked out at the rain.'], replies, player: 'Cyril' })).toBe('');
    });
    it('across genres', () => {
        const fantasy = ['"I did not break the oath!"', '"Why would I betray the order?"', '"If I hadn\'t held the bridge you would all be dead."'];
        expect(windDown({ posts: fantasy, replies: ['"Your conduct shames us."', '"You disobeyed the Abbot."', '"Reckless child."'], player: 'Kiri' })).toContain('Kiri has answered it');
        const scifi = ['"Am I free to go?"', '"I followed the protocol."'];
        expect(windDown({ posts: scifi, replies: ['"Your actions cost us."', '"You should have waited."'], player: 'Vance' })).toContain('has asked to go');
    });
});
