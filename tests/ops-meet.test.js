// The other side met where they are - not finishing step after step while
// the player character closes in, never shown them. The museum: Cyril
// "circling back to the survaillance room", where Tadam Chi was at work.
import { startOp, afterBriefing, crewMet, opMeet, opFacts } from '../src/ops/model.js';
import { buildNow } from '../src/guidance/build.js';

const museum = startOp({
    side: 'Medina Syndicate', aim: 'the Maribelle perfume bottles', placeName: "Saint Aora's Museum",
    leader: { name: 'Delvin Timmers', where: 'leads it in person, in the museum' },
    crew: [{ name: 'Tadam Chi', skill: 'hacking', post: 'surveillance room' }, { name: 'Nichiro Fukudo', skill: 'thief', post: 'Darkened Alcove' }],
    steps: [{ text: 'Tadam Chi loops the cameras from the surveillance room' }, { text: 'Nichiro Fukudo lifts the bottles' }, { text: 'Get away the way they came' }],
    aware: false, against: 'Cyril',
}, 786);
const post = 'Cyril took cover then activated his communications to Inji and Zane. "They\'re in the surveillance room, and that darkened alcove we cleared earlier. Be alert, use caution. I\'m circling back to the survaillance room."';

describe('who the player character comes upon', () => {
    it('headed there - a typo too - and not where he only says they are', () => {
        expect(crewMet(museum, { here: 'Storage room corridors', post })).toEqual([{ name: 'Tadam Chi', where: 'surveillance room', here: false }]);
    });
    it('there already', () => {
        expect(crewMet(museum, { here: 'The Darkened Alcove' }).map((m) => m.name)).toEqual(['Nichiro Fukudo']);
        expect(crewMet(museum, { here: 'Storage room corridors' })).toEqual([]);
    });
    it('the narrator is told to show them', () => {
        const line = opMeet(museum, { here: 'Storage room corridors', post, player: 'Cyril' });
        expect(line).toContain('Tadam Chi of Medina Syndicate is at surveillance room right now (Tadam Chi loops the cameras from the surveillance room), not expecting anyone. Cyril is headed there');
        expect(line).toContain('show them plainly, in sight and at it');
        expect(buildNow({ op: museum, playerPost: post, location: { path: ["Saint Aora's Museum", 'Storage room corridors'] }, cast: [{ name: 'Cyril', player: true }] })).toContain(line);
        expect(opFacts(museum, { turn: 787, here: 'Storage room corridors', player: 'Cyril', post })).toContain('Cyril is headed to where Tadam Chi is (surveillance room): Cyril comes upon them in this reply');
    });
    it('a guessed position is never met', () => {
        const op = { ...museum, crew: [{ ...museum.crew[0], where: "somewhere in Saint Aora's Museum" }] };
        expect(crewMet(op, { here: "Saint Aora's Museum" })).toEqual([]);
    });
});

describe('their step held while the player character is on them', () => {
    it('not done on time - held, and in time they pull out', () => {
        let op = afterBriefing(museum, { met: ['Tadam Chi'], metBy: 'Cyril' }, 787);
        expect(op.current).toBe(0);
        expect(op.log.at(-1).text).toBe('Held at "Tadam Chi loops the cameras from the surveillance room": Cyril is on Tadam Chi.');
        op = afterBriefing(op, { met: ['Tadam Chi'], metBy: 'Cyril' }, 788);
        op = afterBriefing(op, { met: ['Tadam Chi'], metBy: 'Cyril' }, 789);
        expect(op.status).toBe('pulling out');
    });
    it('unhindered, it moves on as before', () => {
        expect(afterBriefing(museum, {}, 787).current).toBe(1);
    });
});

describe('across genres', () => {
    it('a fantasy raid and a boarding party', () => {
        const abbey = startOp({ side: 'The Ashen Hand', aim: 'the reliquary', leader: { name: 'Mother Grael' }, crew: [{ name: 'Kessa', post: 'bell tower' }], steps: [{ text: 'Kessa watches the road' }] }, 1);
        expect(crewMet(abbey, { here: 'Abbey courtyard', post: 'Aldric climbs the stairs to the belltower, sword drawn.' })).toEqual([]);
        expect(crewMet(abbey, { here: 'Abbey courtyard', post: 'Aldric climbs up into the bell tower, sword drawn.' }).map((m) => m.name)).toEqual(['Kessa']);
        const ship = startOp({ side: 'Red Tide', aim: 'fuel cells', leader: { name: 'Ysolde' }, crew: [{ name: 'Dex', post: 'Cargo Bay Two' }], steps: [{ text: 'Dex loads the fuel cells' }] }, 1);
        expect(crewMet(ship, { here: 'Cargo Bay 2 catwalk' })).toEqual([]);
        expect(crewMet(ship, { here: 'Cargo Bay Two' }).map((m) => m.name)).toEqual(['Dex']);
    });
});

describe('the rest of their crew stay put', () => {
    it('Nichiro, with the bottles at the alcove, does not burst into the surveillance room', () => {
        const op = { ...afterBriefing(museum, {}, 787), tapped: true, tappedWith: 'communicator' };
        const line = opMeet(op, { here: 'Storage room corridors', post, player: 'Cyril' });
        expect(line).toContain('Tadam Chi of Medina Syndicate is at surveillance room right now (Tadam Chi loops the cameras from the surveillance room)');
        expect(line).toContain("The rest of them stay where they are in this reply - Nichiro Fukudo (at Darkened Alcove; last: Nichiro Fukudo lifts the bottles) - and do not turn up there; if any comes later, Cyril's side hears it on their communicator on the way first.");
    });
    it('the game master is told they move one place at a time', () => {
        expect(opFacts(museum, { turn: 787, player: 'Cyril' })).toContain('None turns up where Cyril is without that.');
    });
});
