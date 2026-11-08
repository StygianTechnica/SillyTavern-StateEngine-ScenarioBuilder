// The other side's operation: a rival crew the game master plays, with a
// plan of its own that moves whether or not the player does.
import { startOp, afterBriefing, opFacts, opGuidance, markOp, crewOut, isLive } from '../src/ops/model.js';
import { buildOpPrompt, readOpPlan, opPlanText, matchPeople, isPersonName, findSide } from '../src/ops/generate.js';
import { parseDirectorNote, buildDirectorPrompt } from '../src/director/prompt.js';

const HEIST = `LEADER: Enrique Medina | in the catering van at the loading dock
AIM: Steal the Ashen Codex from the West Wing vault.
VEHICLE: a white catering van
ENTRY: Through the service entrance, with a bribed night guard's keycard.
CREW: Delvin "Ice" Timmors | drones and cameras | on the roof
CREW: Marta Quell | safecracker | at the vault door
CREW: Two hired gunmen | muscle | in the main hall
STEP: Kill the cameras and the alarm | done
STEP: Crack the vault
STEP: Carry the Codex to the van
STEP: Drive off before the police arrive
WITHDRAW: The police are called
WITHDRAW: Enrique is hurt
BREAK: 2`;

const plan = () => ({ ...readOpPlan(HEIST, 'Medina Syndicate'), placeName: "Saint Aora's Museum", against: 'Cyril and White Cerberus' });

describe('the plan, written', () => {
    it('reads the leader, crew, way in, steps and breaking point', () => {
        const p = readOpPlan(HEIST, 'Medina Syndicate');
        expect(p.leader).toEqual({ name: 'Enrique Medina', where: 'in the catering van at the loading dock', objectId: '' });
        expect(p.aim).toBe('Steal the Ashen Codex from the West Wing vault');
        expect(p.vehicle).toBe('a white catering van');
        expect(p.crew.map((c) => [c.name, c.skill, c.post])).toEqual([
            ['Delvin "Ice" Timmors', 'drones and cameras', 'on the roof'],
            ['Marta Quell', 'safecracker', 'at the vault door'],
            ['Two hired gunmen', 'muscle', 'in the main hall'],
        ]);
        expect(p.steps.map((s) => s.status)).toEqual(['done', 'pending', 'pending', 'pending']);
        expect(p.withdraw).toEqual(['The police are called', 'Enrique is hurt']);
        expect(p.breakAt).toBe(2);
        // The lines round-trip, so the user can edit them.
        expect(readOpPlan(opPlanText(p), 'Medina Syndicate')).toEqual(p);
    });

    it('needs an aim and steps', () => {
        expect(readOpPlan('LEADER: Bob\nCREW: Al | muscle | door', 'X')).toBeNull();
        expect(readOpPlan('AIM: the gold', 'X')).toBeNull();
    });

    it('takes a vehicle of none, markdown and bullets', () => {
        const p = readOpPlan('**AIM:** Take the relic from the shrine\n- VEHICLE: none\n- STEP 1: Climb the wall\n- STEP 2: Slip away into the forest', 'The Grey Hands');
        expect(p.vehicle).toBe('');
        expect(p.steps.map((s) => s.text)).toEqual(['Climb the wall', 'Slip away into the forest']);
        expect(p.breakAt).toBe(1);
    });

    it('names people, not hands described', () => {
        expect(isPersonName('Marta Quell')).toBe(true);
        expect(isPersonName('Two hired gunmen')).toBe(false);
        expect(isPersonName('the driver')).toBe(false);
    });

    it('matches its people to the library, nicknames too', () => {
        const p = matchPeople(readOpPlan(HEIST, 'Medina Syndicate'), [
            { id: 'enr', name: 'Enrique Medina' },
            { id: 'dt', name: 'Delvin Timmors', aliases: ['Ice', 'Delvin "Ice" Timmors'] },
        ]);
        expect(p.leader.objectId).toBe('enr');
        expect(p.crew.map((c) => c.objectId)).toEqual(['dt', '', '']);
    });

    it('finds the side by faction, or a person standing for theirs', () => {
        const factions = [{ id: 'f_med', name: 'Medina Syndicate' }, { id: 'f_wc', name: 'White Cerberus' }];
        const characters = [{ id: 'serlos', name: 'Serlos Medina' }];
        const members = new Map([['serlos', ['f_med']]]);
        expect(findSide('the Medina Syndicate', factions, characters, members).faction.id).toBe('f_med');
        expect(findSide('Medina', factions, characters, members).faction.id).toBe('f_med');
        const byPerson = findSide('Serlos Medina', factions, characters, members);
        expect([byPerson.faction.id, byPerson.leader.id]).toEqual(['f_med', 'serlos']);
        expect(findSide('Nobody', factions, characters, members).faction).toBeNull();
    });
});

describe('the prompt, across settings', () => {
    const cases = [
        ['cyberpunk', { name: 'Medina Syndicate', description: 'A crime family in Arcadia City' }, 'stealing a prototype from the Omicron lab', 'Omicron Tower'],
        ['fantasy', { name: 'The Grey Hands', description: 'A thieves\' guild of Vallen' }, 'robbing the temple of its sun-relic during the festival', 'Temple of Aurel'],
        ['sci-fi', { name: 'Red Comet Corsairs', description: 'Pirates of the Kessel belt' }, 'boarding the freighter Halcyon for its reactor cores', 'Freighter Halcyon'],
        ['real world', { name: 'The Docklands Crew', description: 'An East London armed robbery gang' }, 'hitting the Hatton Garden vault over the bank holiday', 'Hatton Garden Safe Deposit'],
    ];
    it.each(cases)('%s: plans their side, from their people and the story, without the player', (_genre, side, request, placeName) => {
        const { user, system } = buildOpPrompt({ side, people: [{ name: 'Old Brannoc', rank: 'Boss', description: 'runs it' }], request, placeName, against: ['White Cerberus'], playerName: 'Cyril', aware: false, story: 'Cyril: I watch the loading dock.', pool: { men: ['Tavo'], women: ['Rina'] } });
        expect(system).toMatch(/opposition/);
        expect(user).toContain(side.name);
        expect(user).toContain(request);
        expect(user).toContain(placeName);
        expect(user).toContain('Old Brannoc (Boss)');
        expect(user).toMatch(/They do not know it/);
        expect(user).toMatch(/Never plan what Cyril does/);
        expect(user).toMatch(/Tavo/);
        expect(user).toMatch(/\| done/);
    });
    it('a side that knows is told so; canon only invents no one', () => {
        const { user } = buildOpPrompt({ side: { name: 'X' }, aware: true, canonOnly: true, pool: { men: ['Tavo'] } });
        expect(user).toMatch(/They know it\./);
        expect(user).toMatch(/Use only the people listed/);
        expect(user).not.toMatch(/Tavo/);
    });
});

describe('the operation, played', () => {
    it('starts at the first step the story has not played', () => {
        const op = startOp(plan(), 10, 'op1');
        expect(op.current).toBe(1);
        expect(op.steps.map((s) => s.status)).toEqual(['done', 'current', 'pending', 'pending']);
        expect(op.status).toBe('running');
    });

    it('does not wait: a step not reported is done once its replies run out', () => {
        let op = startOp(plan(), 10, 'op1');
        op = afterBriefing(op, {}, 10);
        expect(op.current).toBe(1);
        op = afterBriefing(op, {}, 11);
        expect(op.current).toBe(2);
        expect(op.log.at(-1).text).toMatch(/Done: Crack the vault/);
    });

    it('moves on when the director says the step is done, and gets away after the last', () => {
        let op = startOp(plan(), 10, 'op1');
        op = afterBriefing(op, { report: { status: 'done', how: 'the vault swings open' } }, 10);
        op = afterBriefing(op, { report: { status: 'done' } }, 11);
        op = afterBriefing(op, { report: { status: 'done' } }, 12);
        expect(op.status).toBe('got away');
        expect(isLive(op)).toBe(false);
        expect(opFacts(op, { turn: 13 })).toMatch(/got what they came for.*Their operation is over/);
        expect(opFacts(op, { turn: 14 })).toBe('');
    });

    it('held three times and they pull out, then they are gone', () => {
        let op = startOp(plan(), 10, 'op1');
        op = afterBriefing(op, { report: { status: 'held', how: 'Inji blocks the vault corridor' } }, 10);
        op = afterBriefing(op, { report: { status: 'held', how: 'a guard on the door' } }, 11);
        expect(op.status).toBe('running');
        expect(op.current).toBe(1);
        op = afterBriefing(op, { report: { status: 'held', how: 'the vault lock holds' } }, 12);
        expect(op.status).toBe('pulling out');
        expect(opFacts(op)).toMatch(/THEY ARE PULLING OUT/);
        expect(opGuidance(op)).toMatch(/pulling out/);
        op = afterBriefing(op, {}, 13);
        expect(op.status).toBe('withdrew');
    });

    it('breaks when enough of the crew are down, from the fight and the deaths', () => {
        let op = startOp(plan(), 10, 'op1');
        op = afterBriefing(op, { fighters: [{ name: 'Marta Quell', condition: 'down' }, { name: 'Ice', condition: 'wounded' }] }, 10);
        expect(crewOut(op)).toBe(1);
        expect(op.status).toBe('running');
        op = afterBriefing(op, { deaths: [{ name: 'Two hired gunmen' }] }, 11);
        expect(op.status).toBe('pulling out');
        expect(op.log.at(-1).text).toMatch(/2 of the crew are out of it/);
    });

    it('breaks when the leader goes down; stopped when no one is left', () => {
        const op = afterBriefing(startOp(plan(), 10, 'op1'), { fighters: [{ name: 'Enrique', condition: 'down' }] }, 10);
        expect(op.status).toBe('pulling out');
        const all = afterBriefing(startOp({ ...plan(), breakAt: 3 }, 10, 'op1'), { fighters: ['Delvin "Ice" Timmors', 'Marta Quell', 'Two hired gunmen'].map((name) => ({ name, condition: 'down' })) }, 10);
        expect(all.status).toBe('stopped');
    });

    it('a swipe applies the same reply again from where it began', () => {
        const start = startOp(plan(), 10, 'op1');
        const once = afterBriefing(start, { report: { status: 'done' } }, 10);
        // The swipe's briefing says nothing this time: the step is not moved twice.
        const again = afterBriefing(once, { report: { status: 'held', how: 'a locked door' } }, 10);
        expect(again.current).toBe(1);
        expect(again.held).toBe(1);
        const third = afterBriefing(again, { report: { status: 'done' } }, 10);
        expect(third.current).toBe(2);
        expect(third.log.filter((l) => /^Done/.test(l.text))).toHaveLength(1);
    });

    it('they learn who is against them only when the story shows it', () => {
        let op = startOp(plan(), 10, 'op1');
        expect(opFacts(op)).toMatch(/They do not know Cyril and White Cerberus is here against them|do not know Cyril and White Cerberus/);
        op = afterBriefing(op, { report: { status: 'spotted', how: 'Ice\'s drone sees Inji' } }, 10);
        expect(op.aware).toBe(true);
        expect(opFacts(op)).toMatch(/They know Cyril and White Cerberus is against them/);
    });

    it('the director sees the whole plan; the narrator only the step now', () => {
        const op = startOp(plan(), 10, 'op1');
        const facts = opFacts(op);
        expect(facts).toMatch(/Medina Syndicate, led by Enrique Medina \(in the catering van at the loading dock\)/);
        expect(facts).toMatch(/They came in a white catering van/);
        expect(facts).toMatch(/- Marta Quell - safecracker; posted at the vault door/);
        expect(facts).toMatch(/step 2 of 4 now: Crack the vault\. Next: Carry the Codex to the van/);
        expect(facts).toMatch(/They pull out if: The police are called; Enrique is hurt/);
        expect(facts).toMatch(/they do not wait for anyone/);
        const told = opGuidance(op);
        expect(told).toMatch(/Crack the vault/);
        expect(told).not.toMatch(/Marta|Codex to the van/);
    });

    it('the user steps in: a step on, pull out, end', () => {
        const op = startOp(plan(), 10, 'op1');
        expect(markOp(op, 'next', 11).current).toBe(2);
        expect(markOp(op, 'pull out', 11).status).toBe('pulling out');
        expect(markOp(op, 'end', 11).status).toBe('ended');
    });
});

describe('the director, on the other side', () => {
    it('reads OPERATION and OPPOSED lines, as a small model bends them', () => {
        const p = parseDirectorNote('OPERATION: Held | Inji pins Marta down\nOPPOSED | The Medina Syndicate | robbing the museum vault\nSCENE | Night at the museum\n\nThe crew works. Next: the vault.');
        expect(p.operation).toEqual({ status: 'held', how: 'Inji pins Marta down' });
        expect(p.opposed).toEqual({ who: 'The Medina Syndicate', what: 'robbing the museum vault' });
        expect(p.note).not.toMatch(/OPERATION|OPPOSED/);
        expect(parseDirectorNote('OPERATION | pulled out | sirens').operation.status).toBe('pulling out');
        expect(parseDirectorNote('OPERATION | <done, held, spotted or pulling out> | <how>').operation).toBeNull();
    });

    it('asks for OPPOSED with no plan, OPERATION with one, and shows THE OTHER SIDE', () => {
        const base = { cast: [{ name: 'Cyril', player: true }], messages: [{ name: 'Cyril', text: 'I watch the dock.', isUser: true }] };
        const none = buildDirectorPrompt({ ...base, opposition: true }).prompt;
        expect(none).toMatch(/OPPOSED \| <the group>/);
        expect(none).not.toMatch(/OPERATION \|/);
        expect(buildDirectorPrompt({ ...base, opposition: false }).prompt).not.toMatch(/OPPOSED/);
        const op = startOp(plan(), 10, 'op1');
        const live = buildDirectorPrompt({ ...base, opLive: true, opFacts: opFacts(op) }).prompt;
        expect(live).toMatch(/THE OTHER SIDE \(you play them/);
        expect(live).toContain('OPERATION | <done, held, spotted, suspicious, or pulling out> | <how, a few words>');
        expect(live).toContain('CREW | <their name> | <where they are now>');
        expect(live).toContain('LOST | <their name, or one of their hands> | <how> | <where>');
        expect(live).not.toMatch(/OPPOSED \|/);
    });
});
