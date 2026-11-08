// The plan held to what a small model skips - from the plan it really wrote
// for the Medina Syndicate's museum heist.
import { readOpPlan, shapePlan, opPlanText, buildOpPrompt } from '../src/ops/generate.js';
import { startOp, opFacts } from '../src/ops/model.js';

const WROTE = `LEADER: Enrique Medina | overseeing from van outside with Delvin
AIM: Steal valuable antique art pieces from St. Aora's Museum
VEHICLE: Blacked-out armored Mercedes Sprinter van, parked nearby
ENTRY: Disguised as museum staff on night cleaning shift, gained access through service entrance | done
STEP: Bartin disables alarms and cameras along main gallery while Tiago hacks into system to disable further detection
STEP: Serlos and Bartin create diversion at a exhibit hall, drawing guards away from main art storage area
STEP: Tiago remotely opens the art storage vault for Serlos and Bartin to quickly grab target pieces
WITHDRAW: If heavily engaged by Cyril or museum security within 20 minutes of initial breach
BREAK: 1`;

const people = [
    { name: 'Enrique Medina', objectId: 'enr', tied: true },
    { name: 'Serlos Medina', objectId: 'ser', head: true },
    { name: 'Bartin Okoro', objectId: 'bar' },
    { name: 'Tiago Reyes', objectId: 'tia' },
    { name: 'Delvin Timmers', objectId: 'dt', aliases: ['Ice'] },
];

describe('the museum heist plan, as written', () => {
    const read = readOpPlan(WROTE, 'Medina Syndicate');
    const shaped = shapePlan(read, { people, against: ['Cyril', 'White Cerberus'], aware: false });

    it('keeps the way in without its "| done"', () => {
        expect(read.entry).toBe('Disguised as museum staff on night cleaning shift, gained access through service entrance');
    });
    it('the crew its steps name are crew - not the Patriarch', () => {
        expect(shaped.crew.map((c) => [c.name, c.objectId])).toEqual([['Bartin Okoro', 'bar'], ['Tiago Reyes', 'tia']]);
    });
    it('ends in getting away', () => {
        expect(shaped.steps.at(-1).text).toBe('Get away with it the way they came');
    });
    it('does not name Cyril, whom they do not know is there', () => {
        expect(shaped.withdraw).toEqual(['If heavily engaged by anyone unexpected or museum security within 20 minutes of initial breach']);
    });
    it('breaks at half the crew at least', () => {
        expect(shaped.breakAt).toBe(1);
        const more = shapePlan({ ...read, crew: [1, 2, 3, 4].map((n) => ({ name: `Hand ${n}` })) }, { people: [] });
        expect(more.breakAt).toBe(2);
    });
});

describe('who ordered it, and who runs it', () => {
    it('reads ORDERED BY apart from the leader, and the director is told the boss keeps away', () => {
        const p = readOpPlan(`ORDERED BY: Enrique Medina | at home, at a dinner party for his alibi\nLEADER: Bartin Okoro | in the van\nAIM: the art\nCREW: Tiago Reyes | hacker | the server room\nSTEP: crack the vault\nSTEP: get away in the van`, 'Medina Syndicate');
        expect(p.boss).toEqual({ name: 'Enrique Medina', where: 'at home, at a dinner party for his alibi', objectId: '' });
        expect(p.leader.name).toBe('Bartin Okoro');
        expect(readOpPlan(opPlanText(p), 'Medina Syndicate')).toEqual(p);
        const facts = opFacts(startOp(p, 1, 'o'));
        expect(facts).toMatch(/Ordered by Enrique Medina \(at home, at a dinner party for his alibi\) - not here and never comes here/);
        expect(facts).toMatch(/led by Bartin Okoro \(in the van\)/);
    });
    it('a boss leading in person is just the leader', () => {
        const p = readOpPlan('ORDERED BY: Corvin Tull | leads it in person\nAIM: the relic\nSTEP: climb in\nSTEP: slip away', 'The Grey Hands');
        expect(p.boss.name).toBe('');
        expect(p.leader.name).toBe('Corvin Tull');
    });
    it('the head of it all put in charge is moved to ordering it', () => {
        const p = shapePlan(readOpPlan('LEADER: Serlos Medina | the van\nAIM: the art\nCREW: Tiago Reyes | hacker | server room\nSTEP: crack it\nSTEP: drive off', 'Medina Syndicate'), { people });
        expect(p.boss.name).toBe('Serlos Medina');
        expect(p.leader.name).toBe('Tiago Reyes');
    });
    it('the prompt asks for both, and keeps the head off the crew', () => {
        const { user } = buildOpPrompt({ side: { name: 'Red Comet Corsairs' }, people: [{ name: 'Admiral Vex', head: true }] });
        expect(user).toMatch(/ORDERED BY: <who set it in motion>/);
        expect(user).toMatch(/a trusted lieutenant leads it on site/);
        expect(user).toMatch(/The head of it all is never one of the crew/);
        expect(user).toMatch(/everyone named in a step is on a CREW line/);
    });
});

// Bartin Medina, the family scion: of the Syndicate, but his sheet keeps him
// out of the field - he was still drafted onto the crew.
describe('someone their sheet keeps out of the field', () => {
    const family = [
        { name: 'Enrique Medina', objectId: 'enr', tied: true },
        { name: 'Serlos Medina', objectId: 'ser', head: true },
        { name: 'Bartin Medina', objectId: 'bar', away: 'later', rank: 'family scion' },
        { name: 'Tiago Reyes', objectId: 'tia' },
    ];
    const plan = readOpPlan(`ORDERED BY: Enrique Medina | at home
LEADER: Bartin Medina | inside the gallery
AIM: Steal the Saint's reliquary
CREW: Bartin Medina | charm | front desk
CREW: Tiago Reyes | locks | vault
STEP: Bartin distracts the night guard
STEP: Tiago opens the vault
STEP: Drive off in the van`, 'Medina Syndicate');
    const shaped = shapePlan(plan, { people: family, against: [], aware: false });

    it('is never on the crew or leading on site', () => {
        expect(shaped.crew.map((c) => c.name)).toEqual(['Tiago Reyes']);
        expect(shaped.leader.name).toBe('Tiago Reyes');
    });
    it('is out of the steps', () => {
        expect(shaped.steps[0].text).toBe('One of the crew distracts the night guard');
    });
    it('is not drafted back from a step that names him', () => {
        const again = shapePlan({ ...plan, crew: [], steps: [{ text: 'Bartin picks the lock', status: 'pending' }] }, { people: family });
        expect(again.crew).toEqual([]);
    });
    it('the prompt tells the model so', () => {
        const { user } = buildOpPrompt({ side: { name: 'Medina Syndicate' }, people: family });
        expect(user).toMatch(/Bartin Medina \(family scion; stays out of the field/);
    });
});
