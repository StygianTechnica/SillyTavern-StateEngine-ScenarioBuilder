// A new character the user names in the catalog is written from the chat
// when the chat speaks of them: Cyril's post named Delvin "Ice" Timmors, one
// of Enrique's men who runs drones, and typing the name was not enough.
import { lorePassages, passagesNaming } from '../src/library/lore.js';

const messages = [
    { name: 'Assassins Inc', text: 'Zane watched as Cyril slipped away into the darkness. The air grew heavier with each step through the museum.' },
    { name: 'Cyril', text: 'That\'s when he spotted it, a single drone, hovering in the air.\n\nCyril found himself remembering one of Enrique\'s men, Delvin "Ice" Timmors. He was good with things like drones. It would have been his style to send something like this into a heist to act as a spotter.' },
    { name: 'Assassins Inc', text: 'Inji trailed behind Zane, his senses on alert in the darkened galleries.' },
];

describe('a new entry named in the catalog, read from the chat', () => {
    it('finds the post that names him, nickname and all', () => {
        const found = passagesNaming('Delvin Timmors', lorePassages(messages, { name: 'Delvin Timmors', aliases: [], description: '' }));
        expect(found).toContain('Delvin "Ice" Timmors');
        expect(found).toContain('good with things like drones');
        expect(found).not.toContain('Inji trailed');
    });

    it('is nothing when the chat never names them - a brief\'s words alone are not enough', () => {
        expect(passagesNaming('Marla Quill', lorePassages(messages, { name: 'Marla Quill', aliases: [], description: 'a drone expert in the museum' }))).toBe('');
        expect(passagesNaming('Delvin Kross', 'Delvin "Ice" Timmors was good with drones.')).toBe('');
        expect(passagesNaming('', 'anything')).toBe('');
        expect(passagesNaming('Delvin Timmors', '')).toBe('');
    });
});
