// Assassins Inc: Inji, "he" for 700 messages, came back "she" with
// "Inji Miyama is he / him" in the note right before the reply.
import { repairReply } from '../src/guidance/canon.js';

const inji = { name: 'Inji Miyama', aliases: ['Inji'], gender: 'm' };
const cyril = { name: 'Cyril', gender: 'm', player: true };
const delvin = { name: 'Delvin', gender: 'm' };
const vex = { name: 'Vex', gender: 'f' };
const people = [inji, cyril, delvin, vex];
const reply = "Suddenly a chime signals Inji's confirmation of her position near Delvin. Inji nodded, her jaw tight.";

describe('a new reply put right', () => {
    it('the real slip', () => {
        const r = repairReply(reply, people, []);
        expect(r.text).toBe("Suddenly a chime signals Inji's confirmation of his position near Delvin. Inji nodded, his jaw tight.");
        expect(r.fixed).toEqual([{ name: 'Inji Miyama', count: 2 }]);
    });
    it('leaves a clean reply and what is said aloud', () => {
        const clean = 'Inji nodded, his jaw tight. "Her? She left," Inji said.';
        expect(repairReply(clean, people, [])).toEqual({ text: clean, fixed: [] });
    });
    it('leaves long speech whole, and reads the sentence after it', () => {
        const t = '"Freeze! She went that way. Her too." Inji commands in a low voice, her eyes narrowed.';
        expect(repairReply(t, people, []).text).toBe('"Freeze! She went that way. Her too." Inji commands in a low voice, his eyes narrowed.');
        const curly = 'Inji sighed, his jaw tight. “Her? She left.” He turned.';
        expect(repairReply(curly, people, [])).toEqual({ text: curly, fixed: [] });
    });
    it('not the player character', () => {
        const t = 'Cyril nodded, her jaw tight.';
        expect(repairReply(t, people, []).fixed).toEqual([]);
    });
    it('not someone with no clear he or she, or not named', () => {
        expect(repairReply('Sol nodded, her jaw tight.', [{ name: 'Sol', gender: '' }], []).fixed).toEqual([]);
        expect(repairReply('Inji nodded, her jaw tight.', [vex], []).fixed).toEqual([]);
    });
    it('goes by a chat that mostly agrees with the sheet', () => {
        const earlier = ['Inji grinned, his eyes bright.', 'Inji sat, his rifle across his knees.', 'Inji nodded, her jaw tight.', 'Inji left.'];
        expect(repairReply(reply, people, earlier).fixed).toHaveLength(1);
    });
    it('keeps the chat when the sheet must be wrong', () => {
        const earlier = ['Inji grinned, her eyes bright.', 'Inji sat, her rifle across her knees.', 'Inji laughed, her head back.', 'Inji left.'];
        expect(repairReply(reply, people, earlier)).toEqual({ text: reply, fixed: [] });
    });
    it('across genres, and the other way', () => {
        const maelis = { name: 'Maelis', gender: 'f' };
        expect(repairReply('Maelis raised the lantern, his hands steady.', [maelis], []).text).toBe('Maelis raised the lantern, her hands steady.');
        const reyes = { name: 'Reyes', gender: 'f' };
        expect(repairReply('The alarm woke Reyes as he reached engineering.', [reyes], []).text).toBe('The alarm woke Reyes as she reached engineering.');
        const dana = { name: 'Dana', gender: 'm' };
        expect(repairReply('Dana locked the diner, her keys in hand.', [dana], []).text).toBe('Dana locked the diner, his keys in hand.');
    });
});
