import {
    tournamentFromSetup, crawlFromSetup, programmeFromSetup, readProgrammeLines, startEvent, beginReply, afterFight, afterMove, markStage,
    currentStage, stageLabel, eventFacts, eventGuidance, eventValues, normalizeEvent, bracketText, roundsFor, waitToSet, setWaitUntil,
    roomToWatch, setRoomTrigger, scheduleOn, normalizeEventsComing,
} from '../src/events/model.js';
import { roomOf, waysFrom } from '../src/events/run.js';

const down = (name) => ({ fighters: [{ name, side: 'foe', condition: 'down' }], ended: true });
const beaten = (name) => ({ fighters: [{ name, side: 'foe', condition: 'won' }], ended: true });

describe('a tournament', () => {
    const setup = {
        name: 'The Midsummer Lists', playerName: 'Remus', seed: 7,
        entrants: [{ name: 'Graxx', strength: 'strong' }, { name: 'Sela', strength: 'deadly' }, { name: 'Orrin', strength: 'minor' }],
    };

    it('is the opening, a bout and results per round, the final and the close', () => {
        const e = tournamentFromSetup(setup);
        expect(roundsFor(4)).toBe(2);
        expect(e.stages.map((s) => `${s.kind}${s.round ?? ''}`)).toEqual(['moment', 'bout1', 'moment1', 'bout2', 'moment']);
        expect(e.stages[3].title).toBe('The grand final');
        expect(tournamentFromSetup({ name: 'Alone', entrants: [] })).toBeNull();
    });

    it('draws the player\'s match when the round comes and decides the rest off screen', () => {
        let e = startEvent(tournamentFromSetup(setup), 0);
        e = beginReply(e, 0);
        expect(currentStage(e).title).toBe('The opening');
        e = beginReply(e, 1);
        expect(stageLabel(e)).toBe('Round 1: against Graxx');
        expect(eventFacts(e)).toContain('match against Graxx');
        e = afterFight(e, down('Graxx'), 1);
        e = beginReply(e, 2);
        // The other match decided, reported in a moment.
        expect(currentStage(e).title).toBe('Round 1: the other matches');
        expect(currentStage(e).note).toMatch(/Elsewhere in Round 1: (Sela beats Orrin|Orrin beats Sela)/);
        expect(bracketText(e)).toContain('Remus beat Graxx');
        const finalist = e.bracket.rounds[0][1].winner === 2 ? 'Sela' : 'Orrin';
        e = beginReply(e, 3);
        expect(stageLabel(e)).toBe(`The grand final: against ${finalist}`);
        expect(eventValues(e).event_progress).toBe('Round 2 of 2');
        e = afterFight(e, down(finalist), 3);
        e = beginReply(e, 4);
        expect(currentStage(e).title).toBe('The close');
        e = beginReply(e, 5);
        expect(e.status).toBe('won');
    });

    it('rolls the same way for the same seed', () => {
        const run = () => {
            let e = beginReply(beginReply(startEvent(tournamentFromSetup(setup), 0), 0), 1);
            e = beginReply(afterFight(e, down('Graxx'), 1), 2);
            return e.bracket.rounds[0][1].winner;
        };
        expect(run()).toBe(run());
    });

    it('is lost with the player\'s match', () => {
        let e = beginReply(beginReply(startEvent(tournamentFromSetup(setup), 0), 0), 1);
        e = afterFight(e, beaten('Graxx'), 1);
        e = beginReply(e, 2);
        expect(e.status).toBe('lost');
        expect(eventFacts(e, { turn: 2 })).toContain('lost a bout');
    });

    it('gives the odd one out a bye', () => {
        const e = beginReply(beginReply(startEvent(tournamentFromSetup({ ...setup, entrants: setup.entrants.slice(0, 2) }), 0), 0), 1);
        expect(e.bracket.rounds[0][1]).toEqual({ a: 2, b: null, winner: 2 });
        expect(bracketText(e)).toContain('Sela (a bye)');
    });

    it('waits between rounds until the clock reaches the time', () => {
        let e = startEvent(tournamentFromSetup({ ...setup, between: 'the next morning' }), 0);
        e = beginReply(beginReply(e, 0), 1);
        e = beginReply(afterFight(e, down('Graxx'), 1), 2);
        e = beginReply(e, 3, { now: 1000 });
        expect(currentStage(e).kind).toBe('wait');
        expect(waitToSet(e)).toBeTruthy();
        e = setWaitUntil(e, 5000);
        expect(waitToSet(e)).toBeNull();
        expect(eventFacts(e)).toContain('begins at the next morning');
        e = beginReply(e, 4, { now: 3000 });
        expect(currentStage(e).kind).toBe('wait');
        e = beginReply(e, 5, { now: 5000 });
        expect(currentStage(e).title).toBe('The grand final');
    });

    it('survives being stored and read back', () => {
        const e = beginReply(beginReply(startEvent(tournamentFromSetup(setup), 0), 0), 1);
        expect(normalizeEvent(JSON.parse(JSON.stringify(e)))).toEqual(e);
    });
});

describe('a dungeon crawl', () => {
    const setup = {
        name: 'The Sunken Crypt', placeId: 'loc_crypt',
        rooms: [
            { placeId: 'loc_gate', name: 'The Gate' },
            { placeId: 'loc_hall', name: 'Hall of Bones', threats: [{ name: '3 ghouls' }], loot: 'a silver reliquary' },
            { placeId: 'loc_seal', name: 'The Sealed Door', clearWhen: 'the party opens the sealed door' },
            { placeId: 'loc_tomb', name: 'The Tomb', threats: [{ name: 'the Barrow King' }], final: true },
        ],
    };

    it('follows the scene from room to room', () => {
        let e = startEvent(crawlFromSetup(setup), 0);
        e = beginReply(e, 0, { roomId: '' });
        expect(currentStage(e)).toBeNull();
        expect(eventFacts(e)).toContain('The way in is The Gate');
        expect(eventGuidance(e)).toBe('');
        e = beginReply(e, 1, { roomId: 'loc_gate' });
        expect(stageLabel(e)).toBe('The Gate');
        // An empty room is cleared once it has been seen for a reply.
        e = beginReply(e, 2, { roomId: 'loc_gate' });
        expect(stageLabel(e)).toBe('The Gate (cleared)');
        e = beginReply(e, 3, { roomId: 'loc_hall' });
        expect(eventFacts(e, { ways: ['loc_gate', 'loc_seal'] })).toContain('What waits here: 3 ghouls');
        expect(eventFacts(e, { ways: ['loc_gate', 'loc_seal'] })).toContain('The Sealed Door (not yet entered)');
        expect(eventFacts(e)).not.toContain('Barrow King');
        expect(eventGuidance(e)).toContain('Waiting here: 3 ghouls');
        e = afterFight(e, down('3 ghouls'), 3);
        expect(currentStage(e).status).toBe('won');
        expect(eventValues(e).event_progress).toBe('2 / 4');
    });

    it('keeps what still lurks in a room left uncleared, and the treasure once taken', () => {
        let e = startEvent(crawlFromSetup(setup), 0);
        e = beginReply(e, 0, { roomId: 'loc_hall' });
        e = afterMove(e, 0, 'loc_gate');
        const hall = e.stages[1];
        expect(hall.status).toBe('pending');
        expect(hall.visited).toBe(true);
        expect(eventFacts(beginReply(e, 1, { roomId: 'loc_gate' }), { ways: ['loc_hall'] })).toContain('Hall of Bones (left with something still in it)');
        e = beginReply(e, 2, { roomId: 'loc_hall' });
        e = afterFight(e, down('3 ghouls'), 2);
        expect(eventFacts(e)).toContain('To be found here: a silver reliquary');
        e = beginReply(e, 3, { roomId: 'loc_gate' });
        expect(e.stages[1].looted).toBe(true);
    });

    it('clears a puzzle room by its story flag, and ends with the final room', () => {
        let e = startEvent(crawlFromSetup(setup), 0);
        e = beginReply(e, 0, { roomId: 'loc_seal' });
        expect(roomToWatch(e).title).toBe('The Sealed Door');
        e = setRoomTrigger(e, 'trg_1');
        expect(roomToWatch(e)).toBeNull();
        e = beginReply(e, 1, { roomId: 'loc_seal' });
        expect(currentStage(e).status).toBe('current');
        e = beginReply(e, 2, { roomId: 'loc_seal', fired: ['trg_1'] });
        expect(currentStage(e).status).toBe('done');
        e = beginReply(e, 3, { roomId: 'loc_tomb' });
        e = afterFight(e, down('the Barrow King'), 3);
        e = beginReply(e, 4, { roomId: 'loc_tomb' });
        expect(e.status).toBe('won');
    });

    it('is lost when the party is beaten', () => {
        let e = startEvent(crawlFromSetup(setup), 0);
        e = beginReply(e, 0, { roomId: 'loc_hall' });
        e = afterFight(e, beaten('3 ghouls'), 0);
        e = beginReply(e, 1, { roomId: 'loc_hall' });
        expect(e.status).toBe('lost');
    });

    it('lets the user clear a room', () => {
        let e = startEvent(crawlFromSetup(setup), 0);
        e = beginReply(e, 0, { roomId: 'loc_seal' });
        e = markStage(e, 'won', 1);
        expect(currentStage(e).status).toBe('done');
    });

    it('finds the room from the scene, and the ways on', () => {
        const e = crawlFromSetup(setup);
        expect(roomOf(e, 'loc_niche', { loc_niche: 'loc_hall', loc_hall: 'loc_crypt' })).toBe('loc_hall');
        expect(roomOf(e, 'loc_town', {})).toBe('');
        expect(waysFrom(e, 'loc_hall', [])).toEqual(['loc_gate', 'loc_seal']);
        expect(waysFrom(e, 'loc_hall', [{ from: 'loc_hall', to: 'loc_tomb' }])).toEqual(['loc_tomb']);
    });
});

describe('a programme', () => {
    it('reads stage lines', () => {
        const stages = readProgrammeLines('moment: The procession - the bishop leads\nbout: Graxx and Ulf\n- wait: until noon\nThe feast');
        expect(stages.map((s) => s.kind)).toEqual(['moment', 'bout', 'wait', 'moment']);
        expect(stages[0]).toMatchObject({ title: 'The procession', note: 'the bishop leads' });
        expect(stages[1].opponents.map((o) => o.name)).toEqual(['Graxx', 'Ulf']);
        expect(stages[2].waitFor).toBe('noon');
    });

    it('goes on after a lost bout', () => {
        let e = startEvent(programmeFromSetup({ name: 'The Trial', stages: readProgrammeLines('bout: the champion\nmoment: The verdict') }), 0);
        e = beginReply(e, 0);
        e = afterFight(e, beaten('the champion'), 0);
        e = beginReply(e, 1);
        expect(currentStage(e).title).toBe('The verdict');
        expect(e.status).toBe('running');
    });
});

describe('dated events', () => {
    it('keep their day, soonest first', () => {
        const a = scheduleOn(programmeFromSetup({ name: 'B', stages: readProgrammeLines('The feast') }), 9);
        const b = scheduleOn(programmeFromSetup({ name: 'A', stages: readProgrammeLines('The feast') }), 4);
        expect(normalizeEventsComing([a, b]).map((e) => e.name)).toEqual(['A', 'B']);
        expect(startEvent(a, 0).startDay).toBeNull();
    });
});
