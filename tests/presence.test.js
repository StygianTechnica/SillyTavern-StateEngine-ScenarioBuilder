// Assassins Inc: Adam said "Zane will provide supporting firepower from a
// distance"; the day plan took "Zane arrives with intel on Enrique's heist
// plans" as played out, and the beat "with Zane as a partner" stopped
// waiting on him. Named is not there.
import { notePresent, presenceFrom, presentAt, takingPart, absentSince, needsPresence, rememberPeople, isKnownPerson } from '../src/planner/presence.js';
import { applyBeats, applyCheck } from '../src/planner/model.js';

describe('who has been in the scene', () => {
    const samples = [
        { key: 'Chat#634@x', present: [{ name: 'Adam Miller' }, { name: 'Inji Miyama' }] },
        { key: 'Chat#646@y', present: [{ name: 'Technician Zara' }] },
    ];
    const present = presenceFrom(samples, notePresent({}, ['Technician Zara'], 650));
    it('is kept by name, from the record and the company samples', () => {
        expect(presentAt(present, 'Inji')).toBe(634);
        expect(presentAt(present, 'Adam')).toBe(634);
        expect(presentAt(present, 'Zara')).toBe(650);
        expect(presentAt(present, 'Zane')).toBe(-1);
        expect(needsPresence(present, ['Technician Zara'], 650)).toBe(false);
        expect(needsPresence(present, ['Technician Zara'], 652)).toBe(true);
    });
    it('asks only for those a moment has taking part - not owners or groups', () => {
        rememberPeople(['Zane', 'Inji Miyama', 'Adam Miller', 'Enrique Medina', 'Vex']);
        expect(isKnownPerson('White Cerberus')).toBe(false);
        const beat = 'Adam assigns Cyril and Inji to stop Enrique\'s operation, with Zane as a partner.';
        expect(takingPart(beat, ['Inji Miyama', 'Zane', 'Enrique Medina', 'White Cerberus'], { isPerson: isKnownPerson, player: 'Cyril' })).toEqual(['Inji Miyama', 'Zane']);
        expect(absentSince(['Inji Miyama', 'Zane'], present, 633)).toEqual(['Zane']);
        rememberPeople([]);
    });
});

describe('a moment with someone who never came is not done', () => {
    const gm = () => ({ agenda: [], queue: [], outline: null, day: { day: 1, madeIndex: 640, moments: [
        { id: 'm1', text: 'Zane arrives with intel on Enrique\'s heist plans', ties: ['Zane', 'Enrique Medina'], status: 'pending', note: '' },
        { id: 'm2', text: 'Zara shows Cyril the pistols', ties: ['Zara'], status: 'pending', note: '' },
    ] }, chronicle: [], volume: { chronicle: [] } });
    const absent = (m) => (m.id === 'm1' ? ['Zane'] : []);
    it('from the director\'s BEAT lines', () => {
        const g = gm();
        applyBeats(g, [{ id: 'm1', status: 'done', note: 'Infiltration plan agreed upon' }, { id: 'm2', status: 'done', note: '' }], { seen: ['Zane will give support. Zara hands over the pistols.'], player: 'Cyril', absent });
        expect(g.day.moments.map((m) => m.status)).toEqual(['pending', 'done']);
    });
    it('from a CHECK pass', () => {
        const g = gm();
        applyCheck(g, { done: ['m1', 'm2'], skipped: [], add: [], requests: [] }, { seen: ['Zane will give support. Zara hands over the pistols.'], player: 'Cyril', absent });
        expect(g.day.moments.map((m) => m.status)).toEqual(['pending', 'done']);
    });
    it('a skip is still taken', () => {
        const g = gm();
        applyBeats(g, [{ id: 'm1', status: 'skipped', note: 'no need' }], { absent });
        expect(g.day.moments[0].status).toBe('skipped');
    });
});

import { shownOf } from '../src/planner/presence.js';
describe('in the cast is not in the story', () => {
    // Assassins Inc: Zane, left in the cast by a swipe since replaced, was
    // taken as present at the reply that cut away to HQ without him.
    const reply = 'Hours later, back at White Cerberus headquarters, Doc looked up from her terminal as Miller strode into the room.';
    it('only those the message names', () => {
        expect(shownOf([['Zane', 'Viper-7'], ['Doc', 'Dr. Kaida'], ['Adam Miller', 'Chief'], ['Galice Buckar']], reply)).toEqual([['Doc', 'Dr. Kaida'], ['Adam Miller', 'Chief']]);
        expect(shownOf([['Adam Miller']], 'Adam strode in.')).toEqual([['Adam Miller']]);
        expect(shownOf([['Ser Brannoc']], 'The knight bowed.')).toEqual([]);
        expect(shownOf([['Captain Hale']], 'Captain Hale stepped onto the bridge.')).toEqual([['Captain Hale']]);
    });
});
