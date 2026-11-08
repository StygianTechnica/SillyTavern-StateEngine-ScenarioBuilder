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

// The next live plan: Serlos credited with Enrique's heist, and a crew that
// did not know Cyril was there set out to steal his prosthetic eye.
import { tiedFirst, buildOpPrompt } from '../src/ops/generate.js';

const medinas = [
    { name: 'Serlos Medina', objectId: 'ser', head: true },
    { name: 'Enrique Medina', objectId: 'enr', away: 'later' },
    { name: 'Bartin Medina', objectId: 'bar', away: 'later', rank: 'family scion' },
    { name: 'Tadam Chi', objectId: '' },
];

describe('whose job it is', () => {
    const story = "Bartin was at the gala last week, bored as ever. Inji waited for any sign of Enrique's operatives. The heist would start at midnight.";
    const tied = tiedFirst(medinas, story);
    it('ties the off-site one the story names with the job, not the one merely mentioned', () => {
        expect(tied.find((p) => p.name === 'Enrique Medina').tied).toBe(true);
        expect(tied.find((p) => p.name === 'Bartin Medina').tied).toBe(false);
    });
    it('tells the model Enrique ordered it from afar', () => {
        const { user } = buildOpPrompt({ side: { name: 'Medina Syndicate' }, people: tied });
        expect(user).toMatch(/Enrique Medina \(named in the story with this job - ordered it from afar; stays out of the field/);
    });
    it('puts Enrique, not the head, as the one who ordered it', () => {
        const plan = readOpPlan(`ORDERED BY: Serlos Medina | at his mansion with an alibi
LEADER: Delvin Timmers | in the museum
AIM: The relics
CREW: Tadam Chi | hacking | surveillance room
STEP: Tadam hacks the locks
STEP: Grab the relics
STEP: Get away on foot`, 'Medina Syndicate');
        expect(shapePlan(plan, { people: tied }).boss.name).toBe('Enrique Medina');
    });
});

describe('what an unaware crew comes for', () => {
    const plan = readOpPlan(`LEADER: Delvin Timmers | in the museum
AIM: Steal Cyril's experimental prosthetic eye from Saint Aora's Museum
CREW: Tadam Chi | hacking | surveillance room
STEP: Tadam hacks the access control
STEP: Slip past the guards to the alcove where Cyril's eye is displayed
STEP: Get away on foot`, 'Medina Syndicate');
    const shaped = shapePlan(plan, { people: medinas, against: ['Cyril', 'White Cerberus'], placeName: "Saint Aora's Museum" });
    it('is never the player character\'s', () => {
        expect(shaped.aim).toBe("Whatever is most worth taking at Saint Aora's Museum");
    });
    it('reads "the eye", not "anyone unexpected\'s eye"', () => {
        expect(shaped.steps[1].text).toBe('Slip past the guards to the alcove where the eye is displayed');
    });
    it('takes the request as the aim when there is one', () => {
        expect(shapePlan(plan, { people: medinas, against: ['Cyril'], fallbackAim: 'the Ashen Codex' }).aim).toBe('the Ashen Codex');
    });
    it('the prompt says so', () => {
        expect(buildOpPrompt({ side: { name: 'X' }, playerName: 'Cyril' }).user).toMatch(/nothing Cyril owns, carries or is made of/);
    });
});
