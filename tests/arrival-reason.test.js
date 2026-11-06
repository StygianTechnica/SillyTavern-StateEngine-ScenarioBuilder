// Assassins Inc: Zane, brought in on a swipe for the beat that had waited
// on him, was written "awaiting him in Miller's office" with intel on a man
// no one had heard of; the swipes after it forgot him, and the director's
// "RENAMES | None" reached the narrator.
import { arrivalReasons } from '../src/planner/model.js';
import { buildNow, buildGuidance } from '../src/guidance/build.js';
import { parseDirectorNote } from '../src/director/prompt.js';
import { normalizeChatDoc } from '../src/store/schema.js';

const gm = {
    day: {
        moments: [
            { id: 'm1', text: 'Zane arrives at the gun range, seeking Cyril for a task.', ties: ['Zane', 'Cyril'], status: 'pending' },
            { id: 'm2', text: 'The techs finalize the plans for tonight.', ties: ['White Cerberus'], status: 'skipped' },
        ],
    },
    outline: { acts: [{ id: 'a1', beats: [{ id: 'b3', text: 'Adam assigns Cyril and Inji to stop Enrique\'s operation, with Zane as a partner.', ties: ['Inji Miyama', 'Zane'], status: 'active' }] }] },
};

describe('why someone the game master brings in comes', () => {
    it('is the open moment with them, else the beat now', () => {
        expect(arrivalReasons(gm, ['Zane'])).toEqual({ Zane: 'Zane arrives at the gun range, seeking Cyril for a task.' });
        expect(arrivalReasons(gm, ['Inji Miyama'])).toEqual({ 'Inji Miyama': 'Adam assigns Cyril and Inji to stop Enrique\'s operation, with Zane as a partner.' });
        expect(arrivalReasons(gm, ['Vex'])).toEqual({});
        // Across genres: a ship's officer, a knight.
        const ship = { day: { moments: [{ text: 'Lt. Okafor brings the captain the decoded signal.', ties: ['Okafor'], status: 'pending' }] } };
        expect(arrivalReasons(ship, ['Lieutenant Okafor'])).toEqual({ 'Lieutenant Okafor': 'Lt. Okafor brings the captain the decoded signal.' });
        expect(arrivalReasons({ day: { moments: [] } }, ['Ser Brannoc'])).toEqual({});
    });
});

describe('the narrator hears where and why they arrive', () => {
    const cast = [{ name: 'Cyril', player: true }, { name: 'Zane' }];
    const input = { arriving: ['Zane'], arrivingFor: { Zane: 'Zane arrives at the gun range, seeking Cyril for a task.' }, location: { path: ['White Cerberus Combat and Tactical Training Center'] }, cast };
    it('in the note for this reply', () => {
        const note = buildNow({ ...input, nextThing: 'Cyril\'s post closes out what they were doing: time moves on toward the heist tonight.' });
        expect(note).toContain('They come to Cyril where Cyril is - White Cerberus Combat and Tactical Training Center');
        expect(note).toContain('no one is already waiting somewhere else');
        expect(note).toContain('Zane comes for this: Zane arrives at the gun range, seeking Cyril for a task.');
        // Someone arriving is the next thing: no skip toward tonight.
        expect(note).not.toContain('closes out');
    });
    it('in the guidance', () => {
        const built = buildGuidance({ ...input, budget: 3000 });
        expect(JSON.stringify(built)).toContain('Zane comes for this');
    });
    it('without a reason, still where the player is', () => {
        expect(buildNow({ arriving: ['Zane'], cast })).toContain('They come to Cyril where Cyril is;');
    });
});

describe('who came in with a reply is kept for its swipes', () => {
    it('survives the store', () => {
        const d = normalizeChatDoc({ director: { note: 'x', arrivingFor: { Zane: 'seeks Cyril' }, turnIn: { turn: 650, names: ['Zane'] } } });
        expect(d.director.turnIn).toEqual({ turn: 650, names: ['Zane'] });
        expect(d.director.arrivingFor).toEqual({ Zane: 'seeks Cyril' });
        expect(normalizeChatDoc({}).director.turnIn).toBeNull();
    });
});

describe('"RENAMES | None" never reaches the narrator', () => {
    it('is dropped', () => {
        const note = parseDirectorNote('With a satisfied grin, he heads back.\n\nRENAMES | None\n\nThe armory rings with clinking metal.');
        expect(note.note).not.toContain('RENAMES');
        expect(note.note).toContain('clinking metal');
    });
});
