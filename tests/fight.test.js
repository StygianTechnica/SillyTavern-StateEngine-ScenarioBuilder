import { nextFight, readCondition, readSide, readFighterName, normalizeFight, fightFacts, fightGuidance, fightValues, woundsOf, FIGHT_QUIET } from '../src/director/fight.js';
import { parseDirectorNote } from '../src/director/prompt.js';
import { buildGuidance } from '../src/guidance/build.js';

const champion = (condition, side = 'foe') => ({ name: 'The Eternal Champion', condition, side });
const varyn = (condition) => ({ name: 'Varyn', condition, side: 'ally' });
const of = (fight, name) => fight.fighters.find((f) => f.name === name);

describe('reading the FIGHT lines', () => {
    it('reads one line per fighter, and keeps them out of the prose', () => {
        const parsed = parseDirectorNote('FIGHT | The Eternal Champion | badly wounded | foe\nFIGHT | Varyn | hurt | ally\nFIGHT | none | - \n\nSteel rings in the crypt.');
        expect(parsed.fights).toEqual([champion('badly wounded'), varyn('hurt')]);
        expect(parsed.note).toBe('Steel rings in the crypt.');
    });

    it('understands the words a small model uses', () => {
        expect(readCondition('Badly hurt')).toBe('badly wounded');
        expect(readCondition('slain')).toBe('down');
        expect(readCondition('retreats into the dark')).toBe('fled');
        expect(readCondition('bleeding')).toBe('wounded');
        expect(readCondition('ready')).toBe('');
        expect(readSide('enemy')).toBe('foe');
        expect(readSide('companion')).toBe('ally');
    });

    it('takes a condition or side off the end of a name, and merges one fighter named twice', () => {
        expect(readFighterName('Inji Miyama, unhurt')).toEqual({ name: 'Inji Miyama', condition: 'unhurt', side: '' });
        expect(readFighterName('Inji Miyama (ally)')).toEqual({ name: 'Inji Miyama', condition: '', side: 'ally' });
        expect(readFighterName('Skeleton - badly wounded')).toEqual({ name: 'Skeleton', condition: 'badly wounded', side: '' });
        expect(readFighterName('Varyn, the Bold').name).toBe('Varyn, the Bold');
        expect(readFighterName('Jean-Luc').name).toBe('Jean-Luc');
        const parsed = parseDirectorNote('FIGHT | Adam Miller | hurt | foe\nFIGHT | Inji Miyama, unhurt | unhurt\nFIGHT | Inji Miyama (ally) | unhurt\n\nThey trade blows.');
        const fight = nextFight(null, parsed.fights);
        expect(fight.fighters.map((f) => [f.name, f.side, f.condition])).toEqual([['Adam Miller', 'foe', 'hurt'], ['Inji Miyama', 'ally', 'unhurt']]);
        expect(fightGuidance(fight)).toContain('Inji Miyama is unhurt.');
    });

    it('cleans up a fight stored with such names', () => {
        const stored = { fighters: [
            { name: 'Adam Miller', side: 'foe', condition: 'hurt', steady: 0 },
            { name: 'Inji Miyama, unhurt', side: 'foe', condition: 'unhurt', steady: 1 },
            { name: 'Inji Miyama (ally)', side: 'foe', condition: 'unhurt', steady: 0 },
        ], round: 3, ended: false, limit: 5 };
        expect(normalizeFight(stored).fighters.map((f) => [f.name, f.side, f.condition, f.steady])).toEqual([['Adam Miller', 'foe', 'hurt', 0], ['Inji Miyama', 'ally', 'unhurt', 0]]);
    });
});

describe('the fight from reply to reply', () => {
    it('starts with everyone the briefing names, and never lets the player character in', () => {
        const fight = nextFight(null, [champion('hurt'), varyn('unhurt'), { name: 'Remus Watt', condition: 'hurt', side: 'ally' }], { playerNames: ['Remus Watt'] });
        expect(fight.round).toBe(1);
        expect(fight.fighters.map((f) => f.name)).toEqual(['The Eternal Champion', 'Varyn']);
        expect(fight.ended).toBe(false);
    });

    it('never lets a condition get better, and wears a foe down when nothing lands', () => {
        let fight = nextFight(null, [champion('wounded'), varyn('hurt')]);
        fight = nextFight(fight, [champion('unhurt'), varyn('unhurt')]);
        expect(of(fight, 'The Eternal Champion').condition).toBe('wounded');
        expect(of(fight, 'Varyn').condition).toBe('hurt');
        fight = nextFight(fight, [champion('wounded'), varyn('hurt')]);
        expect(of(fight, 'The Eternal Champion').condition).toBe('badly wounded');
        expect(of(fight, 'Varyn').condition).toBe('hurt');
    });

    it('is paused when the director reports no fighting, while the fighters are still here', () => {
        const start = nextFight(null, [champion('hurt')]);
        expect(nextFight(start, [], { present: () => true })).toEqual({ ...start, quiet: 1 });
        expect(nextFight(start, [], { present: () => false })).toBe(null);
    });

    it('is broken off when it stays quiet, and tells the narrator nothing while paused', () => {
        let fight = nextFight(null, [champion('wounded'), varyn('hurt')]);
        fight = nextFight(fight, [], { present: () => true });
        expect(fightGuidance(fight)).toBe('');
        expect(fightValues(fight).fight_active).toBe(false);
        expect(fightFacts(fight)).toMatch(/^A fight paused after 1 reply, with no fighting for 1:.*only if the latest chat takes the fighting up again/);
        expect(buildGuidance({ location: { path: ['Crypt'] }, fight, budget: 2000 }).sections.find((s) => s.key === 'fight')?.text ?? '').toBe('');
        // Taken up again: it goes on, and counts.
        const resumed = nextFight(fight, [champion('wounded'), varyn('hurt')]);
        expect(resumed.quiet).toBeUndefined();
        expect(resumed.round).toBe(2);
        expect(fightGuidance(resumed)).toMatch(/^The fight goes on \(reply 2\)/);
        // Quiet FIGHT_QUIET replies in a row: over.
        for (let i = 1; i < FIGHT_QUIET; i += 1) fight = nextFight(fight, [], { present: () => true });
        expect(fight).toBe(null);
    });

    it('takes in someone who joins, and ends when every foe is out', () => {
        let fight = nextFight(null, [champion('wounded'), varyn('hurt')]);
        fight = nextFight(fight, [champion('failing'), varyn('hurt'), { name: 'Arin', condition: 'unhurt', side: 'ally' }, { name: 'Skeleton', condition: 'unhurt', side: 'foe' }]);
        expect(fight.fighters.map((f) => f.name)).toEqual(['The Eternal Champion', 'Varyn', 'Arin', 'Skeleton']);
        fight = nextFight(fight, [champion('down'), { name: 'Skeleton', condition: 'fled', side: 'foe' }]);
        expect(fight.ended).toBe(true);
        expect(nextFight(fight, [])).toBe(null);
    });

    it('ends by the reply limit: down if it has gone against the foe, otherwise it breaks off', () => {
        // A ghoul that joins late, barely touched, breaks off at the limit.
        let fight = nextFight(null, [champion('wounded')]);
        for (let i = 0; i < 3; i += 1) fight = nextFight(fight, [champion('wounded')], { limit: 5 });
        expect(fight.ended).toBe(false);
        fight = nextFight(fight, [champion('wounded'), { name: 'Ghoul', condition: 'hurt', side: 'foe' }], { limit: 5 });
        expect(fight.round).toBe(5);
        expect(fight.ended).toBe(true);
        expect(of(fight, 'The Eternal Champion').condition).toBe('down');
        expect(of(fight, 'Ghoul').condition).toBe('fled');
    });

    it('survives being stored', () => {
        const fight = nextFight(null, [champion('hurt'), varyn('unhurt')]);
        expect(normalizeFight(JSON.parse(JSON.stringify(fight)))).toEqual(fight);
        expect(normalizeFight(null)).toBe(null);
    });
});

describe('the fight told to the director and the narrator', () => {
    it('gives the director every condition and how long is left', () => {
        const fight = nextFight(nextFight(null, [champion('hurt'), varyn('unhurt')]), [champion('wounded'), varyn('hurt')]);
        expect(fightFacts(fight, 5)).toBe('After 2 replies: The Eternal Champion (foe): wounded; Varyn (ally): hurt. A fight ends within 5 replies - at most 3 more. A condition only gets worse unless the story heals it.');
    });

    it('tells the narrator in plain words, in the direction part of the guidance', () => {
        const fight = nextFight(null, [champion('badly wounded'), varyn('hurt')]);
        const text = fightGuidance(fight);
        expect(text).toContain('The Eternal Champion is badly wounded - a limb failing');
        expect(text).toContain('Varyn is hurt');
        expect(text).toContain('above all to The Eternal Champion');
        const built = buildGuidance({ location: { path: ['Crypt'] }, fight, budget: 2000 });
        expect(built.sections.find((s) => s.key === 'fight').mode).toBe('full');
        const over = nextFight(fight, [champion('slain'), varyn('hurt')]);
        expect(fightGuidance(over)).toMatch(/^The fight ends in this reply\. The Eternal Champion goes down in this reply/);
    });
});

describe('a fight broken off and taken up again', () => {
    it('neither counts nor wears anyone down while nobody fights', () => {
        let fight = nextFight(null, [champion('wounded'), varyn('hurt')]);
        for (let i = 1; i < FIGHT_QUIET; i += 1) fight = nextFight(fight, [], { present: () => true, limit: 5 });
        expect(fight.round).toBe(1);
        expect(fight.ended).toBe(false);
        expect(of(fight, 'The Eternal Champion').condition).toBe('wounded');
    });

    it('goes on from the wounds everyone left with', () => {
        const fight = nextFight(null, [champion('badly wounded'), varyn('hurt'), { name: 'Arin', condition: 'unhurt', side: 'ally' }]);
        const wounds = woundsOf(fight);
        expect(wounds).toEqual({ 'the eternal champion': 'badly wounded', varyn: 'hurt' });
        const again = nextFight(null, [champion('unhurt'), varyn('unhurt')], { remembered: wounds });
        expect(of(again, 'The Eternal Champion').condition).toBe('badly wounded');
        expect(of(again, 'Varyn').condition).toBe('hurt');
        expect(again.round).toBe(1);
    });

    it('never brings back one that went down', () => {
        const again = nextFight(null, [champion('unhurt')], { remembered: { 'the eternal champion': 'down' } });
        expect(of(again, 'The Eternal Champion').condition).toBe('unhurt');
    });
});
