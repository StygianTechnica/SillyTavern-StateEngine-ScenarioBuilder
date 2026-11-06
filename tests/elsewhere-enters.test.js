// Assassins Inc: Tiago Moriarty of the Medina Syndicate, listed ELSEWHERE
// ("they cannot turn up in this scene"), was walked into White Cerberus's
// underground training center anyway. An ENTERS for someone elsewhere is
// kept out - unless the player's own post brings them.
import { elsewhereEntering } from '../src/director/whereabouts.js';
import { peopleNamedIn, callNames } from '../src/director/prompt.js';

const characters = [
    { id: 'inji', name: 'Inji Miyama', base: {} },
    { id: 'tiago', name: 'Tiago Moriarty', base: { aliases: ['The Shadow Prince'] } },
    { id: 'adam', name: 'Adam Miller', base: {} },
];
const opts = { characters, elsewhere: [{ id: 'tiago', name: 'Tiago Moriarty' }], castIds: ['adam'], namedIn: peopleNamedIn, namesOf: callNames };

describe('someone elsewhere does not walk in', () => {
    it('kept out, while someone who could turn up comes', () => {
        expect(elsewhereEntering(['Inji Miyama', 'Tiago Moriarty'], { ...opts, userPost: 'Cyril smirked as they took their places.' })).toEqual(['Tiago Moriarty']);
    });

    it("the player's own post can bring them", () => {
        expect(elsewhereEntering(['Tiago Moriarty'], { ...opts, userPost: 'The door slid open and Tiago Moriarty walked in.' })).toEqual([]);
    });

    // Cyril's posts named Enrique Medina again and again - doubting he would
    // come, remembering him - and the director walked him into Adam's room.
    it('named, doubted or remembered is not brought', () => {
        const people = [...characters, { id: 'enrique', name: 'Enrique Medina', base: {} }];
        const far = { ...opts, characters: people, elsewhere: [{ id: 'enrique', name: 'Enrique Medina' }] };
        const posts = [
            "He didn't think Enrique would be there in person.  That wasn't how the Syndicate did things.",
            "Cyril had always been the 'pretty one'.  Enrique had often mocked him to his face.  Cyril had never cared.  Enrique didn't like it.",
            '"What do we know about Enrique Medina\'s crew?" Cyril asked.',
            'Maybe Enrique would show up himself. Cyril doubted it.',
        ];
        for (const userPost of posts) expect(elsewhereEntering(['Enrique Medina'], { ...far, userPost })).toEqual(['Enrique Medina']);
        for (const userPost of ['Enrique Medina strode into the room, grinning.', 'Cyril turned to Enrique and smiled coldly.', 'Cyril called Enrique over to the bar.']) {
            expect(elsewhereEntering(['Enrique Medina'], { ...far, userPost })).toEqual([]);
        }
    });

    it('someone already here, or unknown, is left alone', () => {
        expect(elsewhereEntering(['Tiago Moriarty'], { ...opts, castIds: ['tiago'] })).toEqual([]);
        expect(elsewhereEntering(['A guard'], opts)).toEqual([]);
    });
});

// The director made a character "None new people arrived", places "None
// mentioned" and "none specified", and factions "Novakorp; none new arise
// from this" and "None active in the immediate situation".
import { isPlaceholder } from '../src/director/prompt.js';

describe('a NEW line that says nothing is new', () => {
    it('makes nothing', () => {
        for (const v of ['None new people arrived', 'None mentioned', 'none specified', 'Novakorp; none new arise from this', 'None active in the immediate situation', 'No new characters introduced']) expect(isPlaceholder(v)).toBe(true);
    });

    it('a real name still counts', () => {
        for (const v of ["No Man's Land", 'Nonesuch Tavern', 'Technician Zara', 'Novakorp', 'Noble Quarter']) expect(isPlaceholder(v)).toBe(false);
    });
});
