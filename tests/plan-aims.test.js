// Assassins Inc: White Cerberus is to stop Enrique's art heist, but the
// plan said "the heist" ("The heist remains the top priority", "arrive at
// the Arcadia Museum for the heist", "they will pull it off in the end")
// and the story drifted toward the team pulling one.
import { opposedJobs, jobsLine, jobsTouched, planTexts } from '../src/planner/aims.js';
import { buildNow } from '../src/guidance/build.js';
import { buildDayPrompt } from '../src/planner/prompts.js';

const gm = {
    volume: { outlineWish: 'Zane is among the agents assigned to stop the art heist. There will be some bickering during the heist operation, but they will pull it off in the end.' },
    outline: { acts: [{ beats: [
        { status: 'active', text: "Adam assigns Cyril and Inji to stop Enrique's operation, with Zane as a partner." },
        { status: 'pending', text: "The team infiltrates Enrique's fortress during the art auction with Zane creating a diversion." },
    ] }] },
    settled: [{ text: 'The heist remains the top priority.' }],
    day: { moments: [{ text: "Zane arrives with intel on Enrique's heist plans" }], agendas: [{ wants: "to secure the art collection during Enrique's heist", will: 'sends Galice and Vex to handle the heist directly' }] },
    triggers: [{ when: 'Cyril and Inji arrive at the Arcadia Museum for the heist', then: "The four agents discuss their plan to infiltrate and disrupt Enrique's heist." }],
};

describe('whose job is whose', () => {
    it("reads Enrique's art heist from the plan, the vaguer operation folded in", () => {
        expect(opposedJobs(planTexts(gm), { player: ['Cyril', 'Cyril Moriarty'] })).toEqual([{ noun: 'heist', mod: 'art', owner: 'Enrique' }]);
    });

    it('says it in one line', () => {
        const line = jobsLine(opposedJobs(planTexts(gm), { player: ['Cyril'] }), 'Cyril');
        expect(line).toBe('Whose job is whose: the art heist is Enrique\'s - Cyril\'s side is out to stop it, never to carry it out; "the heist" always means Enrique\'s, and their success is stopping it.');
    });

    it("works in other genres, and never takes the player's own job", () => {
        const fantasy = opposedJobs(['The party must thwart the cult\'s summoning before the eclipse.', "Morvath's summoning draws near."], { player: ['Aria'] });
        expect(fantasy).toEqual([{ noun: 'summoning', mod: '', owner: 'the cult' }]);
        expect(opposedJobs(['Thwart the summoning before the eclipse.', "Morvath's summoning draws near."], { player: ['Aria'] })).toEqual([{ noun: 'summoning', mod: '', owner: 'Morvath' }]);
        const scifi = opposedJobs(['Prevent the hijacking of the colony ship.'], { player: ['Rook'] });
        expect(jobsLine(scifi, 'Rook')).toContain('the hijacking is the other side\'s - Rook\'s side is out to stop it');
        expect(opposedJobs(["Stop Aria's ritual"], { player: ['Aria'] })).toEqual([]);
        expect(opposedJobs(['The crew plans the heist of the century.'], { player: ['Rook'] })).toEqual([]);
    });

    it('reaches the narrator only when the chat speaks of it', () => {
        const jobs = opposedJobs(planTexts(gm), { player: ['Cyril'] });
        expect(jobsTouched(jobs, 'Inji has intel on the heist.')).toHaveLength(1);
        expect(jobsTouched(jobs, 'Cyril trains with Vex.')).toHaveLength(0);
        const line = jobsLine(jobs, 'Cyril');
        const note = buildNow({ cast: [{ name: 'Cyril', player: true }], jobs: line });
        expect(note).toContain("the art heist is Enrique's");
        expect(buildNow({ cast: [{ name: 'Cyril', player: true }], jobs: '' })).toBe('');
    });

    it('the day plan is told too', () => {
        const { prompt } = buildDayPrompt({ userName: 'Cyril', messages: [], jobs: jobsLine(opposedJobs(planTexts(gm), { player: ['Cyril'] }), 'Cyril') });
        expect(prompt).toContain("WHOSE JOB IS WHOSE");
        expect(prompt).toContain("the art heist is Enrique's");
    });
});
