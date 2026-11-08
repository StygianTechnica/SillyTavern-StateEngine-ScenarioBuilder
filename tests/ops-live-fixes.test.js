// From the live museum plan: no CREW lines, the job crammed into one STEP,
// and the crew "held" by Zane's surveillance though they did not know he
// was there.
import { readOpPlan, shapePlan, stepActors, splitSteps } from '../src/ops/generate.js';
import { startOp, afterBriefing } from '../src/ops/model.js';

const WROTE = `ORDERED BY: Enrique Medina | at his high-rise penthouse with an alibi
LEADER: Delvin "Ice" Timmers | in the abandoned warehouse near Museum storage entrance
AIM: Acquire and escape with St. Aora's most valuable ancient artifacts
VEHICLE: None - they came on foot
ENTRY: Through an unsecured ventilation shaft in the roof | done
STEP: Delvin and Raquelo begin searching storerooms for target artifacts while Tadam cracks display case locks. Denisia creates diversion in another part of the museum
WITHDRAW: If police respond quickly and heavily
BREAK: 1`;

const people = [
    { name: 'Enrique Medina', objectId: 'enr', tied: true },
    { name: 'Serlos Medina', objectId: 'ser', head: true },
    { name: 'Delvin "Ice" Timmers', objectId: 'dt', aliases: ['Ice'] },
];

describe('the live museum plan', () => {
    const shaped = shapePlan(readOpPlan(WROTE, 'Medina Syndicate'), { people, against: ['Cyril', 'White Cerberus'] });
    it('puts the hands its step names on the crew - not the leader again', () => {
        expect(shaped.crew.map((c) => c.name)).toEqual(['Raquelo', 'Tadam', 'Denisia']);
    });
    it('splits the crammed step and still ends in the getaway', () => {
        expect(shaped.steps.map((s) => s.text)).toEqual([
            'Delvin and Raquelo begin searching storerooms for target artifacts while Tadam cracks display case locks',
            'Denisia creates diversion in another part of the museum',
            'Get away with it the way they came',
        ]);
    });
    it('breaks at half the crew', () => {
        expect(shaped.breakAt).toBe(2);
    });
});

describe('who a step has doing something', () => {
    it('finds subjects, not places or the police', () => {
        expect(stepActors('Tiago remotely opens the vault. Police arrives. The van waits at Gate Four. Mira, Jun and Oskar load the crates')).toEqual(['Tiago', 'Mira', 'Jun', 'Oskar']);
    });
    it('cyberpunk and sci-fi names too', () => {
        expect(stepActors('Kestrel jacks into the ICE while Vex holds the lift')).toEqual(['Kestrel', 'Vex']);
    });
    it('leaves three or more steps alone', () => {
        const s = [{ text: 'A. B c d e f g h', status: 'current' }, { text: 'two two two', status: 'pending' }, { text: 'three three', status: 'pending' }];
        expect(splitSteps(s)).toBe(s);
    });
});

describe('held, while they do not know anyone is there', () => {
    const op = startOp({ side: 'Medina Syndicate', aim: 'the relics', steps: [{ text: 'Search' }, { text: 'Leave' }], crew: [{ name: 'Tadam' }], aware: false }, 10);
    it('is not held by being watched', () => {
        expect(afterBriefing(op, { report: { status: 'held', how: "Zane's careful surveillance" } }, 10).held).toBe(0);
    });
    it('is held by a guard watching the hall', () => {
        expect(afterBriefing(op, { report: { status: 'held', how: 'a guard watching the hall' } }, 10).held).toBe(1);
    });
    it('is held by being watched once they know', () => {
        expect(afterBriefing({ ...op, aware: true }, { report: { status: 'held', how: 'Zane watching them' } }, 10).held).toBe(1);
    });
});
