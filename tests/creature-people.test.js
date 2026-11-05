// The scene's creature reading kept naming the cast of Assassins Inc (Doc,
// Galice, Inji) as creatures: a person in the library is a character.
import { personNamed } from '../src/library/creature-form.js';
import { OBSERVED_VARIABLES } from '../src/preset/blueprint.js';

const instructions = (name) => OBSERVED_VARIABLES.find(([n]) => n === name)[1].prompted.instructions;

const cast = [{ name: 'Doc' }, { name: 'Galice Buckar' }, { name: 'Inji Miyama', aliases: ['the Fox'] }, { name: 'Al' }];

describe('a creature that is one of the people', () => {
    it('is found by name, alias or first name', () => {
        expect(personNamed('Doc', cast)?.name).toBe('Doc');
        expect(personNamed('doc', cast)?.name).toBe('Doc');
        expect(personNamed('Galice', cast)?.name).toBe('Galice Buckar');
        expect(personNamed('Inji Miyama', cast)?.name).toBe('Inji Miyama');
        expect(personNamed('The Fox', cast)?.name).toBe('Inji Miyama');
    });

    it('is not a beast that only shares a word', () => {
        expect(personNamed('a pack of wolves', cast)).toBe(null);
        expect(personNamed('Doc Hound', cast)).toBe(null);
        expect(personNamed('Al', [{ name: 'Al Capone' }])).toBe(null); // too short a first name to trust
        expect(personNamed('', cast)).toBe(null);
    });
});

describe('the creature reading', () => {
    it('never lists the people of the story', () => {
        expect(instructions('scene_creatures')).toMatch(/Never one of the people of the story .* they are characters, not creatures/);
    });
});
