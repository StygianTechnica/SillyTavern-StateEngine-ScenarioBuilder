// The planner plans the world around the player character, never the
// player character: Assassins Inc's day plan and outline kept writing what
// Cyril does ("Cyril goes outside to contemplate"), which never happened
// because the user plays Cyril.
import { playerLed, readDayPlan, readCheck, buildDayPrompt, buildCheckPrompt, buildOutlinePrompt, buildBeatPrompt, withoutPlayerBeats } from '../src/planner/prompts.js';

const PC = ['Cyril Vance'];

describe('a moment or beat the player character leads', () => {
    it('is one the player character does, alone or with others', () => {
        expect(playerLed('Cyril goes outside to contemplate his navel.', PC)).toBe(true);
        expect(playerLed('Cyril Vance confronts Bartin about his past.', PC)).toBe(true);
        expect(playerLed('Inji and Cyril work with Zane to disrupt the plan.', PC)).toBe(true);
        expect(playerLed('Cyril and Inji Miyama slip into the warehouse.', PC)).toBe(true);
    });

    it('is not the world acting on them, or someone else acting', () => {
        expect(playerLed('Cyril receives a call from Adam.', PC)).toBe(false);
        expect(playerLed('Cyril is cornered by two enforcers.', PC)).toBe(false);
        expect(playerLed("Cyril's old contact turns up at the door.", PC)).toBe(false);
        expect(playerLed('Adam assigns Cyril and Inji to stop the operation.', PC)).toBe(false);
        expect(playerLed('Zane arrives with news.', PC)).toBe(false);
        expect(playerLed('Cyril goes outside.', [])).toBe(false);
    });
});

describe('the day plan', () => {
    it('asks for the world around the player character, and for the beat to move', () => {
        const { prompt } = buildDayPrompt({ userName: 'Cyril', messages: [], story: { shape: 'Thriller', act: 'The Call', beat: 'Adam assigns Cyril to the job.' } });
        expect(prompt).toContain('A moment is what the world does around Cyril, never what Cyril does');
        expect(prompt).toContain('At least one moment moves the beat now along');
        expect(prompt).toContain('An agenda fits the beat');
        expect(buildDayPrompt({ userName: 'Cyril', messages: [] }).prompt).not.toContain('At least one moment moves the beat');
        expect(buildCheckPrompt({ userName: 'Cyril', messages: [], moments: [] }).prompt).toContain('never what Cyril does');
    });

    it('lets a talk under way land where the beat comes about', () => {
        const story = { shape: 'Thriller', act: 'The Call', beat: 'Adam assigns Cyril and Inji to stop Enrique, with Zane as a partner.' };
        const day = buildDayPrompt({ userName: 'Cyril', messages: [], story }).prompt;
        expect(day).toContain('If the talk under way in THE LATEST CHAT is where the beat now should come about');
        expect(day).toContain('and so can where it lands, when the beat now comes about there');
        const plain = buildDayPrompt({ userName: 'Cyril', messages: [] }).prompt;
        expect(plain).not.toContain('where it lands');
        expect(plain).toContain('A talk under way is not a moment; what it leads to, once it is over, can be. Give each');
        expect(buildCheckPrompt({ userName: 'Cyril', messages: [], moments: [], beat: story.beat }).prompt).toContain('no pending moment lands it, add one for its outcome');
        expect(buildCheckPrompt({ userName: 'Cyril', messages: [], moments: [] }).prompt).not.toContain('lands it');
    });

    it('drops moments the player character leads, and keeps request links in step', () => {
        const plan = readDayPlan({
            moments: [{ text: 'Cyril goes outside to think.' }, { text: 'Adam calls the team in.' }, { text: 'Zane sends word of a job.' }],
            requests: [{ request: 'req_1', moments: [1, 3] }, { request: 'req_2', moments: [1] }],
        }, { playerNames: PC });
        expect(plan.moments.map((m) => m.text)).toEqual(['Adam calls the team in.', 'Zane sends word of a job.']);
        expect(plan.requests).toEqual([{ request: 'req_1', moments: [2] }]);
    });

    it('keeps them when nothing else would be left', () => {
        expect(readDayPlan({ moments: [{ text: 'Cyril goes outside.' }] }, { playerNames: PC }).moments).toHaveLength(1);
    });

    it('never adds one in a check', () => {
        const check = readCheck({ add: [{ text: 'Cyril heads for the docks.' }, { text: 'A courier arrives for Cyril.' }], requests: [{ request: 'req_1', moments: [2] }] }, { playerNames: PC });
        expect(check.add.map((m) => m.text)).toEqual(['A courier arrives for Cyril.']);
        expect(check.requests).toEqual([{ request: 'req_1', moments: [1] }]);
    });
});

describe('the outline', () => {
    const shape = { label: 'Thriller', blurb: 'x', lean: 'threat', acts: [{ title: 'The Call', share: 1, band: [1, 3] }] };

    it('asks for beats to come about the world around the player character', () => {
        expect(buildOutlinePrompt({ userName: 'Cyril', messages: [], shape }).prompt).toContain('A beat still to come is what the world and the other people do around Cyril');
        const outline = { acts: [{ title: 'The Call', beats: [{ id: 'b1', text: 'Zane calls.', status: 'pending' }] }] };
        expect(buildBeatPrompt({ userName: 'Cyril', messages: [], shape, outline, beatId: 'b1' }).prompt).toContain('never what Cyril does');
    });

    it('leaves out beats to come the player character leads - not history, not the user\'s own', () => {
        const outline = { acts: [
            { title: 'The Call', beats: [
                { id: 'b1', text: 'Cyril recovers with Inji\'s help.', status: 'done' },
                { id: 'b2', text: 'Cyril goes outside to contemplate his navel.', status: 'pending' },
                { id: 'b3', text: 'Adam assigns Cyril and Inji to stop Enrique.', status: 'active' },
                { id: 'b4', text: 'Cyril confronts Bartin.', status: 'pending' },
            ] },
            { title: 'Homecoming', beats: [{ id: 'b5', text: 'Cyril decides where his loyalties lie.', status: 'pending' }] },
        ] };
        const { outline: out, dropped } = withoutPlayerBeats(outline, PC, ['b4']);
        expect(out.acts[0].beats.map((b) => b.id)).toEqual(['b1', 'b3', 'b4']);
        // An act left with nothing keeps what it had.
        expect(out.acts[1].beats.map((b) => b.id)).toEqual(['b5']);
        expect(dropped).toEqual(['Cyril goes outside to contemplate his navel.']);
    });
});

describe('the beat in the director\'s plan', () => {
    it('settles who is in it, over any agenda', async () => {
        const { planSection, emptyGm } = await import('../src/planner/model.js');
        const g = emptyGm();
        g.outline = { premise: '', themes: [], seeds: [], acts: [{ id: 'a1', title: 'The Call', beats: [
            { id: 'b3', text: 'Adam assigns Cyril and Inji to stop Enrique\'s operation, with Zane as a partner.', ties: ['Inji Miyama', 'Zane'], status: 'active', locked: false, by: 'planner', note: '' },
        ] }] };
        const text = planSection(g);
        expect(text).toContain('the beat now: Adam assigns Cyril and Inji');
        expect(text).toContain('Who is in it: the people the beat names, in the parts it gives them, are who it is');
        expect(text).toContain('no one tells someone the beat names that they are left out');
        expect(planSection(emptyGm())).not.toContain('Who is in it');
    });
});

describe('a briefing written before the plan changed', () => {
    it('is not reused once the plan, the beat or a settled line is revised', async () => {
        const { planStamp, emptyGm } = await import('../src/planner/model.js');
        const { canUseAhead } = await import('../src/director/ahead.js');
        const g = emptyGm();
        g.day = { day: 1, madeAt: 'a', moments: [{ id: 'm1', text: 'Zane calls.', status: 'pending' }], agendas: [{ who: 'Adam', wants: 'x', will: 'keep Cyril out' }], offscreen: [] };
        const before = planStamp(g);
        // Checked off by the check after a reply: the same plan.
        expect(planStamp({ ...g, day: { ...g.day, moments: [{ ...g.day.moments[0], status: 'done' }] } })).toBe(before);
        expect(planStamp({ ...g, day: { ...g.day, madeAt: 'b' } })).not.toBe(before);
        expect(planStamp({ ...g, day: { ...g.day, agendas: [{ who: 'Adam', wants: 'x', will: 'send Cyril, Inji and Zane' }] } })).not.toBe(before);
        expect(planStamp({ ...g, settled: [{ text: 'Cyril is on the heist team.' }] })).not.toBe(before);
        const ahead = { after: 'r1', plan: 'p1', raw: 'note' };
        expect(canUseAhead(ahead, 'r1', { enabled: true, plan: 'p1' })).toBe(true);
        expect(canUseAhead(ahead, 'r1', { enabled: true, plan: 'p2' })).toBe(false);
        expect(canUseAhead({ after: 'r1', raw: 'note' }, 'r1', { enabled: true, plan: 'p2' })).toBe(true);
    });
});
