// Assassins Inc: Cyril "left Adam Miller's office to head to the armory",
// then "arrived at the Armory alone" - the scene stayed in the office, and
// when it moved the whole office came along. And the heist set for tonight
// came over the armory intercom in the morning.
import { goesAlone, goesTogether, namedGoing } from '../src/director/going-along.js';
import { headingAlong } from '../src/library/routes.js';
import { timedHappenings, notYet, notYetLine, notYetWords } from '../src/planner/timed.js';
import { buildNow } from '../src/guidance/build.js';

const left = 'Cyril gave a wave, then left Adam Miller\'s office to head to the armory.  He hoped they had a sizable weapon for him, something with some kick.';
const arrived = 'Cyril arrived at the Armory alone.  One of the lights in there was buzzing annoyingly apparently needing replacement.  He saw that one of Adam\'s techs was already there waiting for him.';
const people = [
    { id: 'adam', names: ['Adam Miller', 'Adam'] },
    { id: 'doc', names: ['Doc'] },
    { id: 'inji', names: ['Inji Miyama', 'Inji'] },
];

describe('going alone', () => {
    it('reads alone, outside speech and for the player only', () => {
        expect(goesAlone(arrived, ['Cyril'])).toBe(true);
        expect(goesAlone('He slipped out of the tavern by himself.', ['Aria'])).toBe(true);
        expect(goesAlone(left, ['Cyril'])).toBe(false);
        expect(goesAlone('Cyril walked in. He was not alone.', ['Cyril'])).toBe(false);
        expect(goesAlone('"Leave me alone," Cyril said, and walked out.', ['Cyril'])).toBe(false);
        expect(goesAlone('Doc went alone to the lab.', ['Cyril'])).toBe(false);
    });

    it('names those going - never the owner of a place or someone left', () => {
        expect(namedGoing(left, people)).toEqual([]);
        expect(namedGoing('Cyril and Inji headed down to the range.', people)).toEqual(['inji']);
        expect(namedGoing('Cyril left Doc with Galice and went to the roof.', people)).toEqual([]);
        expect(goesTogether('The party rushed down the stairs into the crypt.')).toBe(true);
        expect(goesTogether(arrived)).toBe(false);
    });

    it('sets out for a room beside this one, though no route joins them', () => {
        const ways = [{ id: 'arm', names: ['The Armory'] }, { id: 'range', names: ['Target Range'] }];
        expect(headingAlong(left, ways)).toEqual({ id: 'arm', name: 'The Armory', together: false });
    });
});

describe('a time the story set', () => {
    it('catches a happening and its time, said in speech too', () => {
        expect(timedHappenings('"It seems they\'re planning a major heist tonight at the Arcadia Museum," she said.')).toEqual([{ what: 'they\'re planning a major heist tonight at the Arcadia Museum, she said.', when: 'tonight' }]);
        expect(timedHappenings('The duel is set for dawn tomorrow. The council meets at midday.').map((x) => x.when)).toEqual(['tomorrow', 'at midday']);
        expect(timedHappenings('The trade negotiations resume tomorrow morning in the station ring.')[0].when).toBe('tomorrow morning');
        expect(timedHappenings('If the raid happens tonight we are done for.')).toEqual([]);
        expect(timedHappenings('The heist was called off tonight.')).toEqual([]);
        expect(timedHappenings('Is the meeting tonight?')).toEqual([]);
        expect(timedHappenings('We have until this evening to prepare.')).toEqual([]);
    });

    it('holds a happening set for tonight until the evening', () => {
        const heist = { id: 'ag1', text: 'Enrique\'s crew pull the art heist at the Arcadia Museum', day: 9, when: 'night' };
        expect(notYet([heist], { today: 9, nowPart: 'morning' })).toEqual([heist]);
        expect(notYet([heist], { today: 9, nowPart: 'evening' })).toEqual([]);
        expect(notYet([heist], { today: 8, nowPart: 'morning' })).toEqual([]);
        expect(notYetWords(heist, 'morning')).toContain('not before tonight');
        expect(notYetWords(heist, 'night')).toBe('');
        const line = notYetLine([heist], 'Doc says the heist plan still needs work.');
        expect(line).toContain('Not yet: Enrique\'s crew pull the art heist at the Arcadia Museum (set for tonight).');
        expect(notYetLine([heist], 'They talk about lunch.')).toBe('');
        expect(buildNow({ notYet: line, cast: [{ name: 'Cyril', player: true }] })).toContain('does not start early');
    });
});
