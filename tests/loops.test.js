import { circling, asksToFinish } from '../src/director/loops.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';
import { buildNow } from '../src/guidance/build.js';

const reply = (n) => `The keeper bowed. "Well done, Champion. You have freed ${n} souls, but there are many more who await your aid." With those words, another orb drifted towards Remus, holding a face twisted in despair.`;
const m = (text, isUser = false) => ({ text, isUser });

describe('going in circles', () => {
    it('hears the player asking whether it is over', () => {
        for (const t of ['"Is this the last?" He asked the keeper.', 'Will this complete the trial?', 'Are we done here?', 'How many more?']) expect(asksToFinish(t)).toBe(true);
        expect(asksToFinish('He reached for the next orb.')).toBe(false);
    });

    it('sees replies repeating the same beat', () => {
        const r = circling([m(reply(1)), m('Remus touched the orb.', true), m(reply(2)), m('He freed her too.', true), m(reply(3))]);
        expect(r.circling).toBe(true);
        expect(r.line).toContain('going in circles');
    });

    it('sees the player repeating themselves', () => {
        const same = 'One after another Remus continued the task, absorbing the miseries of every soul. "Is this the last?"';
        const r = circling([m(same, true), m('No, Champion.'), m(same, true)]);
        expect(r.circling).toBe(true);
        expect(r.asks).toBe(true);
        expect(r.line).toMatch(/^The player character asks whether this is over/);
    });

    it('says nothing when the story moves on', () => {
        expect(circling([m('They rode north.'), m('Remus checked the map.', true), m('The bridge was out; they turned east.')]).line).toBe('');
    });

    it('is put before the director, and tasks have an end in its rules', () => {
        const { system, prompt } = buildDirectorPrompt({ cast: [{ name: 'Remus', player: true }], loopLine: 'The story is going in circles.' });
        expect(prompt).toContain('GOING IN CIRCLES - mind this above all: The story is going in circles.');
        expect(system).toContain('a task, trial, test or puzzle: it has an end');
    });
});

// Assassins Inc: Dr. Tole at White Cerberus, asked what he wants reply
// after reply and teasing every time; Vex and Inji asking it again.
describe('someone dodging what they want', () => {
    const names = ['Dr. Adrigo Tole', 'Vex', 'Inji Miyama'];
    const chat = [
        m('"Enough games, Doc," Vex grumbled. "Get on with it and tell us what you want."'),
        m('Cyril stayed quiet.', true),
        m('Vex narrowed her eyes. "We still don\'t know what you\'re really after here."\n\nDr. Adrigo Tole smiled.\n\n"Ah, but that would be telling," he said.'),
        m('"Omicron can keep their plans for me. I am not going back."', true),
        m('Tole drummed his fingers. "Omicron has far greater plans for you," he said, cryptic as ever.\n\n"And just what might these plans entail?" Vex demanded.'),
        m('"Fine, what are your plans? Why are you even here? Spit it out or get out of here."', true),
    ];

    it('sees it, and names the one dodging', () => {
        const r = circling(chat, { names });
        expect(r.dodging).toBe(true);
        expect(r.dodger).toBe('Dr. Adrigo Tole');
        expect(r.order).toMatch(/^Dr\. Adrigo Tole has been asked what they want again and again and keeps dodging\. Now Dr\. Adrigo Tole says it plainly/);
        expect(r.line).toContain('The scene is stuck');
        expect(r.line).not.toContain('going in circles');
    });

    it('lets go once the answer is given', () => {
        const answered = [...chat, m('"I want Cyril back in my lab for a week of tests. In return Omicron stops hunting him. Refuse, and I tell Adam what his implant really does."')];
        expect(circling(answered, { names }).dodging).toBe(false);
    });

    it('a single question, or one tease, is not a stall', () => {
        expect(circling(chat.slice(0, 3), { names }).dodging).toBe(false);
        expect(circling([m('"What do you want?" she asked.'), m('He shrugged.', true), m('"A drink," he said.')], { names }).dodging).toBe(false);
    });

    it('the order goes in the chat, where the narrator follows it', () => {
        const order = circling(chat, { names }).order;
        const note = buildNow({ dodging: order, cast: [{ name: 'Cyril Moriarty', player: true }] });
        expect(note).toContain('Now Dr. Adrigo Tole says it plainly');
        expect(note).toMatch(/^\[Game master's note for this reply/);
    });
});
