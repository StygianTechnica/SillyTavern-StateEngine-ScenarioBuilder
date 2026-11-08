// Where the other side is, what the player character finds, their radio,
// and the one Cyril took down in the storage room - from the museum chat,
// where the enemy was left for the player to place.
import { startOp, afterBriefing, opFacts, radioTaken, crewOut, crewTotal, breakPoint } from '../src/ops/model.js';
import { parseDirectorNote as parseBriefing } from '../src/director/prompt.js';

const plan = {
    side: 'Medina Syndicate', aim: 'the relics', placeName: "Saint Aora's Museum",
    leader: { name: 'Delvin Timmers', where: 'in the museum' },
    crew: [{ name: 'Tadam Chi', skill: 'hacking', post: 'posted surveillance room' }, { name: 'Nichiro Fukudo', skill: 'muscle', post: '' }],
    steps: [{ text: 'Reach the Darkened Alcove' }, { text: 'Lift the relics' }, { text: 'Leave on foot' }],
    aware: false, against: 'Cyril and White Cerberus',
};

describe('where they are', () => {
    const op = startOp(plan, 10);
    it('starts each at their post, and asks for the rest', () => {
        expect(op.crew.map((c) => c.where)).toEqual(['surveillance room', '']);
        const facts = opFacts(op, { turn: 10, here: 'Storage Room Corridors', player: 'Cyril' });
        expect(facts).toMatch(/Tadam Chi - hacking; posted surveillance room: now at surveillance room/);
        expect(facts).toMatch(/Nichiro Fukudo - muscle: NOT PLACED YET/);
        expect(facts).toMatch(/Cyril is at Storage Room Corridors\. By where each of them is, say plainly in the briefing what Cyril finds there/);
    });
    it('moves them by CREW lines, the leader too', () => {
        const next = afterBriefing(op, { moves: [{ name: 'Nichiro', where: 'Darkened Alcove' }, { name: 'Delvin', where: 'loading dock' }] }, 10);
        expect(next.crew[1].where).toBe('Darkened Alcove');
        expect(next.leader.where).toBe('loading dock');
    });
});

describe('one of theirs taken down with no name', () => {
    const op = startOp(plan, 10);
    const next = afterBriefing(op, { lost: [{ who: 'one of their hands', how: 'knocked out by Cyril', where: 'storage room' }] }, 10);
    it('counts him, and does not break them for one', () => {
        expect([next.hands, next.handsOut, crewOut(next), crewTotal(next), breakPoint(next)]).toEqual([1, 1, 1, 3, 2]);
        expect(next.status).toBe('running');
        expect(next.log.at(-1).text).toBe('Out of it: one of their hands down at storage room.');
    });
    it('the leader checks in next reply - with no one to answer, they know something is wrong', () => {
        expect(next.checkIn).toBe(11);
        expect(opFacts(next, { turn: 11 })).toMatch(/CHECK-IN in this reply: Delvin Timmers calls the one at storage room over their channel\. No one answers/);
        const after = afterBriefing(next, {}, 11);
        expect(after.suspicious).toBe(true);
        expect(after.aware).toBe(false);
        expect(opFacts(after, { turn: 12 })).toMatch(/They know something is wrong - the one at storage room went quiet - but not who/);
    });
    it('with his radio in Cyril\'s hands, an answer that convinces keeps them unaware', () => {
        const after = afterBriefing({ ...next, tapped: true }, {}, 11);
        expect(after.suspicious).toBe(false);
        expect(afterBriefing({ ...next, tapped: true }, { report: { status: 'suspicious', how: 'the voice was wrong' } }, 11).suspicious).toBe(true);
    });
    it('a named one is marked by how', () => {
        const caught = afterBriefing(op, { lost: [{ who: 'Tadam', how: 'zip-tied in the surveillance room' }] }, 10);
        expect(caught.crew[0].state).toBe('caught');
    });
});

describe('held with nothing named', () => {
    it('is not held', () => {
        expect(afterBriefing(startOp(plan, 10), { report: { status: 'held', how: '' } }, 10).held).toBe(0);
    });
});

describe('their radio', () => {
    it('listening in, even after "rather than destroying"', () => {
        expect(radioTaken('Rather than foolishly destroying the communicator as Inji had previously, he listened in on the communications so that he could hear them.')).toBe(true);
        expect(radioTaken('She pockets the walkie-talkie and keeps the volume low.')).toBe(true);
        expect(radioTaken('Kael keeps the sending stone close, listening for the cultists.')).toBe(true);
    });
    it('got rid of', () => {
        expect(radioTaken('Inji quickly disabled the comms device.')).toBe(false);
        expect(radioTaken('He smashed the radio under his boot.')).toBe(false);
    });
    it('says nothing of it', () => {
        expect(radioTaken('Cyril headed for the storage rooms, gun at the ready.')).toBe(null);
    });
    it('the game master is told to give their chatter', () => {
        expect(opFacts({ ...startOp(plan, 10), tapped: true }, { turn: 10, player: 'Cyril' })).toMatch(/Cyril's side holds one of their radios and hears their channel: put in the briefing one or two short lines/);
    });
});

describe('the briefing lines', () => {
    it('reads CREW, LOST and suspicious', () => {
        const parsed = parseBriefing('Cyril finds the storage room empty.\nOPERATION | suspicious | Tadam went quiet\nCREW | Nichiro Fukudo | Darkened Alcove\nLOST | one of their hands | knocked out | storage room');
        expect(parsed.operation).toEqual({ status: 'suspicious', how: 'Tadam went quiet' });
        expect(parsed.crewMoves).toEqual([{ name: 'Nichiro Fukudo', where: 'Darkened Alcove' }]);
        expect(parsed.crewLost).toEqual([{ who: 'one of their hands', how: 'knocked out', where: 'storage room' }]);
    });
});

describe('a CREW line bent by a small model', () => {
    it('reads several on one line, a colon for the bar', () => {
        const parsed = parseBriefing('Cyril listens.\nCREW | Tadam Chi: in the museum foyer waiting to create a diversion, Nichiro Fukudo: scouting the upper gallery levels');
        expect(parsed.crewMoves).toEqual([
            { name: 'Tadam Chi', where: 'in the museum foyer waiting to create a diversion' },
            { name: 'Nichiro Fukudo', where: 'scouting the upper gallery levels' },
        ]);
        expect(parseBriefing('CREW | Brother Aldo - at the chapel door, watching the road').crewMoves).toEqual([{ name: 'Brother Aldo', where: 'at the chapel door, watching the road' }]);
    });
});

describe('the narrator hears their radio', () => {
    it('when the channel is tapped, with where they are', async () => {
        const { opGuidance } = await import('../src/ops/model.js');
        const op = afterBriefing({ ...startOp(plan, 10), tapped: true }, { moves: [{ name: 'Nichiro', where: 'upper galleries' }] }, 10);
        expect(opGuidance(op)).toContain('write one or two short lines of their radio talk');
        expect(opGuidance(op)).toContain('Tadam Chi at surveillance room; Nichiro Fukudo at upper galleries');
        expect(opGuidance(startOp(plan, 10))).not.toContain('radio talk');
    });
});
