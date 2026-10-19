// A quest is written from the side of those who pursue it - never the
// enemy's (an 8B model, given a world ruled by a death god, wrote "retain
// undead troops for the death god's cult" as a hero's objective).
import { buildGenerationPrompt } from '../src/generate/prompt.js';

const quest = { id: 'quest', noun: 'quest', label: 'Quest' };
const fields = [{ name: 'objectives', label: 'Objectives', kind: 'list' }];

describe("a quest's side", () => {
    it('says who pursues it and that its steps are theirs', () => {
        const { user } = buildGenerationPrompt({ task: 'fill', type: quest, fields, entry: { name: 'Deal with Zombies and Secure Passage', values: {} }, questSide: { player: 'Remus Watt', with: ['Niamh'] } });
        expect(user).toContain('# Whose quest it is');
        expect(user).toContain('It is pursued by Remus Watt (the player character), with Niamh.');
        expect(user).toMatch(/never the aims of the enemies, monsters or powers they oppose/);
    });

    it('is only for quests', () => {
        const { user } = buildGenerationPrompt({ task: 'fill', type: { id: 'item', noun: 'item', label: 'Item' }, fields: [], entry: { name: 'Relic', values: {} }, questSide: { player: 'Remus Watt', with: [] } });
        expect(user).not.toContain('# Whose quest it is');
    });
});
