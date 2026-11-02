// No herding: everyone judges for themselves, someone who walks in on a
// fight hears both sides first, and someone meeting the player character
// for the first time claims no shared past.
import { firstMeetings } from '../src/director/whereabouts.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';

const chat = [
    ...Array.from({ length: 30 }, (_, i) => (i % 2 ? 'Galice and Doc hovered over Cyril again.' : 'Cyril sighed.')),
    'Adam Miller strode into the common room.',
    'Cyril glared at Adam.',
];

describe('first meetings', () => {
    const cast = [{ id: 'adam', names: ['Adam Miller'] }, { id: 'galice', names: ['Galice Buckar', 'Galice'] }, { id: 'riven', names: ['Riven'] }];

    it('someone the chat names only just now, with no tie to the player', () => {
        const met = firstMeetings({ cast, chat, playerId: 'cyril' });
        expect(met.has('adam')).toBe(true);
        expect(met.has('galice')).toBe(false);
    });

    it('a tie in the setting means they knew each other before', () => {
        const met = firstMeetings({ cast, chat, playerId: 'cyril', relations: [{ from: 'riven', to: 'cyril', kind: 'former rival' }] });
        expect(met.has('riven')).toBe(false);
        expect(met.has('adam')).toBe(true);
    });

    it('never the player character', () => {
        expect(firstMeetings({ cast: [{ id: 'cyril', names: ['Cyril'] }], chat: [], playerId: 'cyril' }).size).toBe(0);
    });
});

describe('the game master is told', () => {
    const input = {
        userName: 'Cyril',
        messages: [{ name: 'Cyril', text: 'Leave me alone!', isUser: true }],
        cast: [{ name: 'Cyril', player: true }, { name: 'Adam Miller', firstMeeting: true }, { name: 'Doc' }],
        location: { path: ['Common Room'] },
    };

    it('to let everyone judge for themselves and hear both sides', () => {
        const { system, prompt } = buildDirectorPrompt(input);
        const text = `${system}\n${prompt}`;
        expect(text).toContain('people who work together do not back one another by default');
        expect(text).toContain('Someone who walks in on a quarrel or a fight has not seen how it began');
        expect(text).toContain('Never line everyone up against Cyril');
    });

    it('who is meeting the player for the first time', () => {
        const { system, prompt } = buildDirectorPrompt(input);
        const text = `${system}\n${prompt}`;
        expect(text).toMatch(/- Adam Miller: meeting Cyril for the first time - no shared past/);
        expect(text).not.toMatch(/- Doc: meeting Cyril/);
    });
});
