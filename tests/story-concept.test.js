// Assassins Inc: Cyril's post brought in Alonso Vasquez - a chief under
// Enrique for years, a slippery kingpin who cut ties with the Syndicate and
// took his people with him, and whom Enrique wants dead. The director took
// him in as "Former chief under Enrique Medina's control and current
// associate of Inji Miyama", and the background fill - shown neither the
// post nor, for a person, that line outside the looks - made him "Former
// head of security for Omicron Innovations".
import { lorePassages } from '../src/library/lore.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';

const chat = [
    { name: 'Assassins Inc', text: 'Inji grinned at Cyril. "Oh, you know me - always busy making connections."\n\nDoc snorted, rolling her eyes.' },
    { name: 'Cyril', text: 'Cyril thought about it for a moment.  "Don\'t tell me you know Alonso Vasquez."  Alonso had been a chief under Enrique\'s control for years and years.  He was a notorious kingpin but also incredibly slippery.  Enrique could never keep him completely under control and eventually he cut ties with the Syndicate taking his people with him.\n\nCyril didn\'t remember all of it, but he could remember Enrique cussing over it and cursing out Alonso in colorful language.  Enrique wanted him dead.\n\nThen again, maybe Inji knew someone else who was still actively involved with the Syndicate.' },
    { name: 'Assassins Inc', text: 'Inji nodded at Cyril\'s mention of Alonso Vasquez. "Yeah, I\'ve got an in with him," he said.\n\nVex raised an eyebrow.' },
];
const character = { id: 'character', noun: 'character' };
const fields = [{ name: 'role', label: 'Role', kind: 'text' }, { name: 'background', label: 'Background', kind: 'longtext' }];

describe('a person the story brought in is written from it', () => {
    const passages = lorePassages(chat, { name: 'Alonso Vasquez', aliases: [], description: '' });

    it('finds the post that made them, and only the parts about them', () => {
        expect(passages).toContain('cut ties with the Syndicate taking his people with him');
        expect(passages).toContain('Enrique wanted him dead');
        expect(passages).toContain('I\'ve got an in with him');
        expect(passages).not.toContain('Doc snorted');
        expect(passages).not.toContain('Vex raised an eyebrow');
    });

    it('the prompt holds the passages, and every field keeps to them', () => {
        const { user } = buildGenerationPrompt({ task: 'fill', type: character, entry: { name: 'Alonso Vasquez', values: {} }, fields, loreStory: passages, brief: "What the story says of them: Former chief under Enrique Medina's control - their role, background, ties and goals keep to that." });
        expect(user).toContain('# Where the story brings it up');
        expect(user).toContain('cut ties with the Syndicate');
        expect(user).toContain('its role, background, ties and goals start from it, never from a different job or allegiance');
        expect(user).toContain('Former chief under Enrique Medina');
        // Lore keeps its own rule.
        const lore = buildGenerationPrompt({ task: 'fill', type: { id: 'lore', noun: 'lore entry' }, entry: { name: 'x', values: {} }, fields, loreStory: passages }).user;
        expect(lore).toContain('a suspicion stays a suspicion');
        expect(lore).not.toContain('never from a different job');
    });
});
