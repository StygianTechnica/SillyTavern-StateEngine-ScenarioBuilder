// Assassins Inc: Enrique, set to work from the shadows until his beat, walked
// out of an alley because the game master wrote an ENTERS line for him.
import { heldBySheet, heldOutNamed } from '../src/guidance/spoken.js';
import { elsewhereEntering } from '../src/director/whereabouts.js';

const enrique = { id: 'e', name: 'Enrique Medina', meta: { inPerson: 'later' } };
const serlos = { id: 's', name: 'Serlos Medina', meta: { inPerson: 'remote' } };
const zane = { id: 'z', name: 'Zane', meta: {} };
const people = [enrique, serlos, zane];
const names = (c) => [c.name, c.name.split(/\s+/)[0]];
const namedIn = (text, list) => list.filter((c) => names(c).some((n) => text.includes(n)));
const entering = (enters, { here = [], beatTies = [], userPost = '' } = {}) => elsewhereEntering(enters, { characters: people, elsewhere: heldBySheet(people, { here, beatTies }), castIds: here, userPost, namedIn, namesOf: names });

describe('kept out by their sheet', () => {
    it('lists those held, not those free or already here', () => {
        expect(heldBySheet(people).map((c) => c.id)).toEqual(['e', 's']);
        expect(heldBySheet(people, { here: ['e'] }).map((c) => c.id)).toEqual(['s']);
    });
    it('a beat that names them frees the one saved for it, not the one who stays home', () => {
        expect(heldBySheet(people, { beatTies: ['Enrique'] }).map((c) => c.id)).toEqual(['s']);
        expect(heldBySheet(people, { beatTies: ['Serlos Medina'] }).map((c) => c.id)).toEqual(['e', 's']);
    });
    it('the game master cannot walk them in', () => {
        expect(entering(['Enrique Medina', 'Zane'])).toEqual(['Enrique Medina']);
    });
    it('being spoken of does not bring them', () => {
        expect(entering(['Enrique Medina'], { userPost: 'He genuinely did not like Enrique.' })).toEqual(['Enrique Medina']);
    });
    it('their beat does', () => {
        expect(entering(['Enrique Medina'], { beatTies: ['Enrique Medina'] })).toEqual([]);
    });
    it('the older list still only names those brought up', () => {
        expect(heldOutNamed(people, ['Enrique has men here.'])).toEqual({ remote: [], later: ['Enrique Medina'] });
        expect(heldOutNamed(people, ['Nobody at all.'])).toEqual({ remote: [], later: [] });
    });
    it('across genres', () => {
        const lich = { id: 'l', name: 'Morvath', meta: { inPerson: 'later' } };
        expect(elsewhereEntering(['Morvath'], { characters: [lich], elsewhere: heldBySheet([lich]), castIds: [], userPost: 'Kiri cursed the name of Morvath.', namedIn, namesOf: (c) => [c.name] })).toEqual(['Morvath']);
    });
});
