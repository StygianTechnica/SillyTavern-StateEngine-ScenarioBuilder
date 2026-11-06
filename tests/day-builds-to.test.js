// Assassins Inc: the heist was set for tonight 30-odd messages back; the day
// plan saw the last 8 (gear handed out in the Armory) and planned more gear.
import { buildDayPrompt } from '../src/planner/prompts.js';
import { timedHappenings } from '../src/planner/timed.js';

const base = { userName: 'Cyril', dossier: 'D', messages: [{ name: 'Zara', text: 'These are for you.', isUser: false }], dayPart: 'morning', story: { shape: 'Arc', beat: 'Adam assigns Cyril and Inji to stop Enrique\'s operation.', next: 'Enrique sets a trap.' } };

describe('the day plan builds to what is set', () => {
    it('hears what the chat set a time for, and the beats further on', () => {
        const saidWhen = timedHappenings('Miller said: "They\'re planning a major heist tonight at the Arcadia Museum." Later Zara handed over the gear.', 6);
        const { prompt } = buildDayPrompt({ ...base, saidWhen, coming: ['Enrique sets a trap.', 'The team infiltrates the art gallery during the auction.'] });
        expect(prompt).toContain('WHAT THE CHAT SET A TIME FOR');
        expect(prompt).toContain('a major heist tonight at the Arcadia Museum');
        expect(prompt).toContain('- The team infiltrates the art gallery during the auction.');
        expect(prompt).not.toContain('- Enrique sets a trap.\n- The team');
        expect(prompt).toContain('the last of them is it beginning at its time');
        expect(prompt).toContain('Spread them across the day');
    });
    it('works for a fantasy day with nothing set', () => {
        const { prompt } = buildDayPrompt({ ...base, userName: 'Aria', story: null });
        expect(prompt).not.toContain('WHAT THE CHAT SET A TIME FOR');
        expect(prompt).not.toContain('the last of them is it beginning');
        expect(prompt).toContain('Spread them across the day');
    });
    it('keeps the latest of many', () => {
        const text = ['The duel is at dawn tomorrow.', 'The feast begins tonight.', 'The council meets at noon.', 'The trial is next week.'].join(' ');
        expect(timedHappenings(text, 2).map((x) => x.when)).toEqual(['at noon', 'next week']);
    });
});
