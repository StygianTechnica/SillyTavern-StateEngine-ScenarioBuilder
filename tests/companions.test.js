// Named pets, mounts and beast companions are creatures; a companion that
// talks and thinks like a person is a character - the same rule for the
// game master, State Engine's scene readings and the named-people check.
import { buildDirectorPrompt } from '../src/director/prompt.js';
import { OBSERVED_VARIABLES } from '../src/preset/blueprint.js';
import { buildPeoplePrompt } from '../src/director/people.js';

const instructions = (name) => OBSERVED_VARIABLES.find(([n]) => n === name)[1].prompted.instructions;

describe('companions', () => {
    it('the game master is told which is which', () => {
        const { prompt } = buildDirectorPrompt({ allowCreate: true, cast: [{ name: 'Remus', player: true }] });
        expect(prompt).toMatch(/A named animal - a pet, a mount, a hound, a beast companion - is a creature/);
        expect(prompt).toMatch(/Only one that talks and thinks like a person \(a sentient familiar, a dragon, a bound spirit\) is a character/);
    });

    it("State Engine's readings follow the same rule", () => {
        expect(instructions('scene_creatures')).toMatch(/named ones too \(a pet, a mount/);
        expect(instructions('scene_creatures')).toMatch(/talks and thinks like a person .* is a character/);
        expect(instructions('scene_characters')).toMatch(/sentient familiar, a dragon, a bound spirit\) is a character; an animal is not/);
    });

    it('the named-people check lists a talking companion, never an animal', () => {
        const { user } = buildPeoplePrompt({ text: 'Remus patted Ember, his mare.' });
        expect(user).toMatch(/A companion that talks and thinks like a person .* counts as a person/);
        expect(user).toMatch(/not animals, even named ones \(a pet, a mount, a hound - those are creatures\)/);
    });
});
