// Galice, a woman, was "he" in 9 of the last 40 messages; the model followed
// the chat over every correction.
import { fixPronounsIn } from '../src/guidance/canon.js';

const galice = { name: 'Galice Buckar', aliases: ['Galice'], gender: 'f' };
const others = [{ name: 'Inji Miyama', aliases: ['Inji'], gender: 'm' }, { name: 'Cyril', gender: 'm' }, { name: 'Doc', gender: 'f' }, { name: 'Zane', gender: 'm' }];

describe('putting her pronouns right in a reply', () => {
    it('where she is plainly the one meant', () => {
        const t = 'Galice followed closely behind, his presence commanding. His eyes met Cyril\'s briefly before flicking away.';
        expect(fixPronounsIn(t, galice, others)).toEqual({ text: 'Galice followed closely behind, her presence commanding. Her eyes met Cyril\'s briefly before flicking away.', count: 2 });
        const t2 = 'Galice stepped forward, his voice firm. "We move now."\n\nHe turned to Inji, his eyes piercing.';
        expect(fixPronounsIn(t2, galice, others).text).toBe('Galice stepped forward, her voice firm. "We move now."\n\nShe turned to Inji, his eyes piercing.');
    });
    it('and nowhere else', () => {
        // Someone else named between: "he" may be them.
        expect(fixPronounsIn('Galice nodded. Zane stepped up. He drew his gun.', galice, others).count).toBe(0);
        // Speech is left alone.
        expect(fixPronounsIn('Galice said, "He will come, and his men too."', galice, others).count).toBe(0);
        // "Galice turned to Inji and took his hand" - his is Inji's.
        expect(fixPronounsIn('Galice turned to Inji and took his hand.', galice, others).count).toBe(0);
        // Fantasy, the other way round.
        expect(fixPronounsIn('Ser Brannoc drew her sword.', { name: 'Ser Brannoc', aliases: ['Brannoc'], gender: 'm' }, []).text).toBe('Ser Brannoc drew his sword.');
    });
});
