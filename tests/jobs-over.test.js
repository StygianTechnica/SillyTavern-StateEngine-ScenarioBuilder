// Assassins Inc: the museum job was over, and the note still said "Cyril's
// side is out to stop it" - so Inji told a wounded Cyril that the mission to
// stop Enrique's heist hinged on the team pulling together.
import { opposedJobs, jobsOver, jobsOverLine, jobsLine, intentNow, overJobsIn, overBriefing, beatsSpent } from '../src/planner/aims.js';
import { dossierText } from '../src/director/prompt.js';
import { unsettledReason } from '../src/planner/model.js';

const heist = { noun: 'heist', mod: 'art', owner: 'Enrique' };
const job = (over) => ({ status: 'withdrew', boss: { name: 'Enrique Medina' }, leader: { name: 'Delvin Timmers' }, side: 'Medina Syndicate', aim: 'Steal the Mirabelle Collection of priceless antique perfume bottles', ...over });

describe('a job that has run its course', () => {
    it('is over once the story ended it', () => {
        for (const status of ['withdrew', 'got away', 'stopped']) expect(jobsOver([heist], [job({ status })])).toEqual([heist]);
    });
    it('not while one of theirs is still running', () => {
        expect(jobsOver([heist], [job(), job({ status: 'running' })])).toEqual([]);
        expect(jobsOver([heist], [job(), job({ status: 'pulling out' })])).toEqual([]);
    });
    it('not before anything has happened', () => {
        expect(jobsOver([heist], [])).toEqual([]);
    });
    it('not when the user only cleared it away', () => {
        expect(jobsOver([heist], [job({ status: 'ended' })])).toEqual([]);
    });
    it("not someone else's job", () => {
        expect(jobsOver([heist], [job({ boss: { name: 'Raquelo Arnett' }, leader: { name: 'Susuke' }, side: 'Omicron Innovations' })])).toEqual([]);
    });
    it('not a job of another kind', () => {
        const ritual = { noun: 'ritual', mod: '', owner: 'the cult' };
        const raid = { status: 'stopped', side: 'The Ashen Cult', aim: 'Steal the relic from the abbey' };
        expect(jobsOver([ritual], [raid])).toEqual([]);
        expect(jobsOver([ritual], [{ ...raid, aim: 'Complete the ritual at the standing stones' }])).toEqual([ritual]);
    });
    it('across genres', () => {
        const hijack = { noun: 'hijacking', mod: '', owner: 'Vance' };
        expect(jobsOver([hijack], [{ status: 'got away', boss: { name: 'Captain Vance' }, side: 'Red Reach', aim: 'Finish the hijacking of the ore hauler' }])).toEqual([hijack]);
        const robbery = { noun: 'robbery', mod: 'bank', owner: 'Dutch' };
        expect(jobsOver([robbery], [{ status: 'withdrew', leader: { name: 'Dutch Weller' }, side: 'Weller gang', aim: 'Rob the First National' }])).toEqual([robbery]);
    });
});

describe('what the reply is told', () => {
    it('says it is over, without saying who won', () => {
        expect(jobsOverLine([heist])).toBe("Enrique's art heist is over and done: no one is still preparing for it or out to stop it.");
        expect(jobsOverLine([])).toBe('');
    });
    it('more than one', () => {
        expect(jobsOverLine([heist, { noun: 'raid', mod: '', owner: '' }])).toBe("Enrique's art heist and The raid are over and done: no one is still preparing for them or out to stop them.");
    });
    it('the old line stays for a job still on', () => {
        expect(jobsLine([heist], 'Cyril')).toContain('out to stop it');
    });
});

describe('what someone means to do', () => {
    const over = [heist];
    it('drops an aim at a job that is over', () => {
        expect(intentNow("Convince Cyril of his importance in stopping Enrique's heist and offer support", over)).toBe('');
        expect(intentNow('Prepare the team for the heist', over)).toBe('');
    });
    it('keeps every other aim', () => {
        expect(intentNow('Get Cyril patched up and home', over)).toBe('Get Cyril patched up and home');
        expect(intentNow('Find out who fenced the bottles after the heist', over)).toBe('Find out who fenced the bottles after the heist');
    });
    it('keeps it while the job is on', () => {
        expect(intentNow("Stop Enrique's heist", [])).toBe("Stop Enrique's heist");
    });
    it('reads the real one as a stop', () => {
        expect(opposedJobs(["stopping Enrique's heist"])[0].noun).toBe('heist');
    });
});

describe('the plan after a job is over', () => {
    const over = [heist];
    const outline = { acts: [{ beats: [
        { id: 'b42', status: 'active', text: "Cyril, Inji, and Zane receive orders from Adam to stop Enrique's art heist operation." },
        { id: 'b41', status: 'pending', text: 'Adam arranges a meeting with Bartin Medina.' },
        { id: 'b19', status: 'pending', locked: true, text: "They will stop Enrique's heist in the end." },
        { id: 'b1', status: 'done', text: "Adam says to stop Enrique's heist." },
    ] }] };
    it('a beat aimed at it is spent', () => {
        expect(beatsSpent(outline, over)).toEqual(['b42']);
    });
    it('not while the job is on', () => {
        expect(beatsSpent(outline, [])).toEqual([]);
    });
    it('the chat is read whole', () => {
        const doc = { gm: { outline }, op: job({}), opsDone: [] };
        expect(overJobsIn(doc, ['Cyril'])[0].noun).toBe('heist');
        expect(overJobsIn({ gm: { outline } }, ['Cyril'])).toEqual([]);
    });
    it('the briefing is told', () => {
        expect(overBriefing(over)).toContain('nothing like it starts, unless the latest chat brings it');
        expect(overBriefing([])).toBe('');
        expect(dossierText({ userName: 'Cyril', jobsOver: overBriefing(over) })).toContain('OVER AND DONE');
    });
    it('across genres', () => {
        const ritual = { noun: 'ritual', mod: '', owner: 'the cult' };
        const acts = { acts: [{ beats: [{ id: 'a', status: 'active', text: "Kiri must foil the cult's ritual at the stones." }, { id: 'b', status: 'pending', text: 'Kiri rides north.' }] }] };
        expect(beatsSpent(acts, [ritual])).toEqual(['a']);
    });
});

describe('what someone only believes is not a settled fact', () => {
    it('the real lines', () => {
        expect(unsettledReason('Inji believes his expectations were reasonable, and that their unity should not be questioned.')).toContain('judgement');
        expect(unsettledReason("Inji's harsh words to Cyril were not meant as hate, but a reprimand for endangering the team.")).toContain('judgement');
    });
});

describe('a task is not a settled fact', () => {
    it('the real line', () => {
        expect(unsettledReason("Enrique's heist operation is real, and Cyril's team must stop it.")).toContain('for now');
    });
    it('what is simply so still settles', () => {
        expect(unsettledReason('The vault must be opened with two keys.')).toBe('');
    });
});
