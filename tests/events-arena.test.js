import {
    arenaFromSetup, startEvent, beginReply, afterFight, markStage, currentStage, stageLabel, eventFacts, eventGuidance, eventValues, normalizeEvent,
} from '../src/events/model.js';

const setup = { name: 'The Pit', opponents: [{ name: 'Graxx', objectId: 'chr_g' }, { name: 'the Pit-Wolf' }], prize: 'a gold torc' };
const won = { fighters: [{ name: 'Graxx', side: 'foe', condition: 'down' }], ended: true, round: 3 };
const lostFight = { fighters: [{ name: 'Graxx', side: 'foe', condition: 'won' }], ended: true, round: 3 };
const going = { fighters: [{ name: 'Graxx', side: 'foe', condition: 'wounded' }], ended: false, round: 2 };

// Plays briefing after briefing: turn by turn, with an optional fight.
function reply(e, turn, fight = null) {
    const begun = beginReply(e, turn);
    return fight ? afterFight(begun, fight, turn) : begun;
}

describe('an arena', () => {
    it('is the opening, a bout per opponent, and the close', () => {
        const e = arenaFromSetup(setup);
        expect(e.stages.map((s) => s.kind)).toEqual(['moment', 'bout', 'bout', 'moment']);
        expect(e.stages[3].note).toContain('a gold torc');
        expect(arenaFromSetup({ name: 'Empty', opponents: [] })).toBeNull();
    });

    it('runs stage by stage, one reply per moment, a bout until the fight ends it', () => {
        let e = startEvent(arenaFromSetup(setup), 10);
        e = reply(e, 10);
        expect(currentStage(e).title).toBe('The opening');
        e = reply(e, 11);
        expect(stageLabel(e)).toBe('Bout 1 of 2: Graxx');
        e = reply(e, 12, going);
        expect(stageLabel(e)).toBe('Bout 1 of 2: Graxx');
        e = reply(e, 13, won);
        expect(currentStage(e).status).toBe('won');
        // A regenerated briefing of the same reply does not move it on.
        expect(stageLabel(reply(e, 13))).toBe('Bout 1 of 2: Graxx');
        e = reply(e, 14);
        expect(stageLabel(e)).toBe('Bout 2 of 2: the Pit-Wolf');
        e = reply(e, 15, { fighters: [{ name: 'the Pit-Wolf', side: 'foe', condition: 'fled' }], ended: true });
        e = reply(e, 16);
        expect(currentStage(e).title).toBe('The close');
        e = reply(e, 17);
        expect(e.status).toBe('won');
        expect(eventFacts(e, { turn: 17 })).toContain('won it - the prize: a gold torc');
        expect(eventFacts(e, { turn: 18 })).toBe('');
    });

    it('ends when the player loses a bout, the rest skipped', () => {
        let e = startEvent(arenaFromSetup(setup), 0);
        e = reply(e, 0);
        e = reply(e, 1, lostFight);
        expect(currentStage(e).status).toBe('lost');
        e = reply(e, 2);
        expect(e.status).toBe('lost');
        expect(e.stages.slice(2).map((s) => s.status)).toEqual(['skipped', 'skipped']);
        expect(eventFacts(e, { turn: 2 })).toContain('lost a bout');
    });

    it('a fight with foes still standing is not the end of the bout', () => {
        let e = startEvent(arenaFromSetup(setup), 0);
        e = reply(e, 0);
        e = reply(e, 1, { fighters: [{ name: 'Graxx', side: 'foe', condition: 'hurt' }], ended: true });
        expect(currentStage(e).status).toBe('current');
    });

    it('lets the user mark a stage, skip it, or end the event', () => {
        let e = startEvent(arenaFromSetup(setup), 0);
        e = reply(e, 0);
        e = markStage(e, 'skip', 1);
        e = reply(e, 1);
        expect(stageLabel(e)).toBe('Bout 1 of 2: Graxx');
        e = markStage(e, 'won', 2);
        e = reply(e, 2);
        expect(stageLabel(e)).toBe('Bout 2 of 2: the Pit-Wolf');
        e = markStage(e, 'end', 3);
        expect(e.status).toBe('ended');
        expect(eventGuidance(e)).toBe('');
    });
});

describe('what the director, the narrator and panels see', () => {
    let e = startEvent(arenaFromSetup(setup), 0);
    e = reply(reply(e, 0), 1);

    it('the director: this stage only, and the rules', () => {
        const text = eventFacts(e, { placeName: 'the Brass Pit' });
        expect(text).toContain('The Pit at the Brass Pit');
        expect(text).toContain('NOW: Bout 1 of 2: Graxx');
        expect(text).toContain('Do not bring out, name or hint at the next opponent');
        expect(text).not.toContain('Pit-Wolf');
    });

    it('the narrator: the bout, and never who is next', () => {
        expect(eventGuidance(e)).toContain('the fight is with Graxx and no one else');
        expect(eventGuidance(e)).not.toContain('Pit-Wolf');
    });

    it('panels: a flag, the name, the stage and the progress', () => {
        expect(eventValues(e)).toEqual({ event_active: true, event_name: 'The Pit', event_stage: 'Bout 1 of 2: Graxx', event_progress: '1 / 2' });
        expect(eventValues(null).event_active).toBe(false);
    });

    it('survives being stored and read back', () => {
        expect(normalizeEvent(JSON.parse(JSON.stringify(e)))).toEqual(e);
    });
});
