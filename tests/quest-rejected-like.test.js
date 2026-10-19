// A quest the user rejected stays rejected when Archivist re-makes its
// thread under a new id and title.
import { rejectedLike } from '../src/quests/model.js';

const rejected = [
    { name: 'Negotiate passage terms with Niamh', threadId: 't26' },
    { name: "Niamh's Fortress and Passage", threadId: 't28' },
    { name: 'Deal with Zombies and Secure Passage', threadId: 't21' },
    { name: 'Secure Aid for Cache Retrieval', threadId: 't23' },
];

describe('a rejected quest reworded', () => {
    it('is still rejected', () => {
        expect(rejectedLike({ title: 'Negotiate Favorable Terms with Niamh', text: 'Assist in dealing with the undead horde to secure favorable passage terms.' }, rejected)).toBe(true);
    });

    it('by its text, when its title is new', () => {
        expect(rejectedLike({ title: 'An Uneasy Bargain', text: 'Remus and Varyn must negotiate passage terms through Redhaven with Niamh.' },
            [{ name: 'Negotiate passage terms with Niamh', text: 'Remus and Varyn need to negotiate passage terms through Redhaven with Niamh.' }])).toBe(true);
    });

    it('leaves other quests about the same people alone', () => {
        for (const title of ['Trading with Niamh and Graxx', 'Finding a hidden cache of enchanted weapons from an old temple', 'Follow Map to Old Temple', "Remus's Departure Consequences"]) {
            expect(rejectedLike({ title, text: '' }, rejected)).toBe(false);
        }
    });
});
