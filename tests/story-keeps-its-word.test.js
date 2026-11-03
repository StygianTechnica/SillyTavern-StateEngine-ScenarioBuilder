// What the story sets up stays set up (Assassins Inc): a beat's people
// count only once the beat is under way, a swiped reply takes back the
// beats it finished, a happening whose day goes by is put off - more
// firmly each day - and what the story arranges for later (Adam Miller's
// test "tomorrow morning") is still there when its day comes.
import {
    emptyGm, undoUnseenBeats, stampBeats, undoBeatsFrom, finishBeat, restoreBeat, activeBeat, addChronicle, planSection, beatFrom,
    addHappening, settleAgenda, dueSection, dueToday, readWhen, setByStory, setDayPlan, applyBeats, MAX_LATE,
} from '../src/planner/model.js';
import { buildDayPrompt } from '../src/planner/prompts.js';
import { buildDirectorPrompt, parseDirectorNote } from '../src/director/prompt.js';

const outline = () => {
    const g = emptyGm();
    g.outline = { premise: '', themes: [], seeds: [], acts: [{ id: 'a1', title: 'The Call', beats: [
        { id: 'b1', text: 'Adam insists on a combat assessment between Cyril and Inji.', ties: ['Adam Miller', 'Inji Miyama'], status: 'active', locked: true, by: 'planner', note: '' },
        { id: 'b2', text: 'Adam assigns Cyril a mission.', ties: ['Adam Miller'], status: 'pending', locked: false, by: 'planner', note: '' },
    ] }] };
    return g;
};

// The chat by index: Inji long ago, Adam lately.
const chat = Array.from({ length: 300 }, (_, i) => (i === 25 ? 'Inji Miyama hands Cyril a bundle of clothes.' : i === 290 ? 'Adam Miller leans back in his chair.' : 'Cyril waits.'));
const from = (i) => chat.slice(i);

describe('a beat\'s people count from when it was under way', () => {
    it('keeps where the beat began, once', () => {
        const g = outline();
        stampBeats(g, 280);
        stampBeats(g, 299);
        expect(activeBeat(g.outline).since).toBe(280);
        expect(g.outline.acts[0].beats[1].since ?? -1).toBe(-1);
    });

    it('puts back a beat called done whose person was only seen before it began', () => {
        const g = outline();
        stampBeats(g, 280);
        const b1 = g.outline.acts[0].beats[0];
        b1.status = 'done';
        addChronicle(g, 'Inji Miyama hands Cyril a bundle of clothes.');
        addChronicle(g, 'Beat: Adam insists on a combat assessment between Cyril and Inji.');
        const back = undoUnseenBeats(g, (b) => from(beatFrom(g, b)), 'Cyril', chat);
        expect(back).toEqual(['Inji Miyama']);
        expect(activeBeat(g.outline).id).toBe('b1');
        // Inji did come into the story before: that line stays.
        expect(g.volume.chronicle.map((c) => c.text)).toEqual(['Inji Miyama hands Cyril a bundle of clothes.']);
    });

    it('with the whole chat, as before, the old mention is enough', () => {
        const g = outline();
        g.outline.acts[0].beats[0].status = 'done';
        expect(undoUnseenBeats(g, chat, 'Cyril')).toEqual([]);
    });

    it('tells the director a returning person is no stranger', () => {
        const g = outline();
        const text = planSection(g, { newcomers: ['Inji Miyama'], returning: ['Inji Miyama'], waited: 1 });
        expect(text).toMatch(/Away from the story since this beat began: Inji Miyama/);
        expect(text).toMatch(/been in the story before/);
        expect(text).not.toMatch(/Not yet in the story/);
        expect(planSection(g, { newcomers: ['Riven'], waited: 1 })).toMatch(/Not yet in the story: Riven\./);
    });
});

describe('a swiped reply takes back the beats it finished', () => {
    it('puts the beat back under way, out of the chronicle', () => {
        const g = outline();
        finishBeat(g, 'b1', { index: 300 });
        expect(g.outline.acts[0].beats[0]).toMatchObject({ status: 'done', doneAt: 300 });
        expect(activeBeat(g.outline).id).toBe('b2');
        expect(undoBeatsFrom(g, 301)).toEqual([]);
        expect(undoBeatsFrom(g, 300)).toEqual(['b1']);
        expect(activeBeat(g.outline).id).toBe('b1');
        expect(g.outline.acts[0].beats[1].status).toBe('pending');
        expect(g.volume.chronicle).toHaveLength(0);
    });

    it('never takes back the user\'s own call', () => {
        const g = outline();
        finishBeat(g, 'b1');
        expect(undoBeatsFrom(g, 0)).toEqual([]);
    });

    it('a beat brought back is under way afresh', () => {
        const g = outline();
        stampBeats(g, 10);
        finishBeat(g, 'b1', { index: 20 });
        restoreBeat(g, 'b1');
        expect(g.outline.acts[0].beats[0]).toMatchObject({ status: 'active', since: -1, doneAt: -1 });
    });
});

describe('a happening whose day goes by', () => {
    it('is put off to today, later each day, and passes only past MAX_LATE', () => {
        const g = emptyGm();
        addHappening(g, { id: 'ag_1', text: 'Medina agents try to seize Cyril on his way to Adam\'s office', day: 10, source: 'world' });
        settleAgenda(g, 12);
        expect(g.agenda[0]).toMatchObject({ status: 'coming', day: 12, late: 2 });
        settleAgenda(g, 12 + MAX_LATE);
        expect(g.agenda[0].status).toBe('passed');
    });

    it('a dated event\'s opening still passes on its day', () => {
        const g = emptyGm();
        addHappening(g, { id: 'ag_2', text: 'The tournament begins', day: 4, source: 'event:ev1' });
        settleAgenda(g, 5);
        expect(g.agenda[0].status).toBe('passed');
    });

    it('is said more firmly each day it slips', () => {
        const g = emptyGm();
        addHappening(g, { id: 'ag_1', text: 'Medina agents strike', day: 10, source: 'world' });
        addHappening(g, { id: 'ag_3', text: 'A rumour in Bearville', day: 12, source: 'ideas' });
        expect(dueToday(g, 10)).toEqual([]);
        expect(dueSection(g, 11)).toMatch(/\[ag_1\] Medina agents strike - put off once already/);
        expect(dueSection(g, 12)).toMatch(/put off twice already/);
        expect(dueSection(g, 13)).toMatch(/put off 3 days already - it happens now: open this reply with it/);
        // Due on its own day, never put off yet: nothing pressing.
        expect(dueSection(g, 12)).not.toMatch(/rumour/);
    });
});

describe('what the story sets for later', () => {
    it('reads when it falls', () => {
        expect(readWhen('tomorrow morning')).toEqual({ inDays: 1, part: 'morning' });
        expect(readWhen('at dawn', 'evening')).toEqual({ inDays: 1, part: 'dawn' });
        expect(readWhen('this afternoon', 'morning')).toEqual({ inDays: 0, part: 'afternoon' });
        expect(readWhen('in three days')).toEqual({ inDays: 3, part: '' });
        expect(readWhen('the day after tomorrow')).toEqual({ inDays: 2, part: '' });
        expect(readWhen('tonight')).toEqual({ inDays: 0, part: 'night' });
        expect(readWhen('next week')).toEqual({ inDays: 7, part: '' });
    });

    it('goes on the agenda, and moves when the story moves it', () => {
        const g = emptyGm();
        const test = 'Adam Miller runs Cyril\'s test under his own supervision; if Cyril passes, Doc and Galice stop training him';
        setByStory(g, { id: 'ag_t', text: test, day: 11, when: 'morning', ties: ['Adam Miller'] });
        expect(g.agenda[0]).toMatchObject({ source: 'promise', day: 11, late: 0 });
        setByStory(g, { id: 'ag_x', text: 'Adam Miller runs Cyril\'s test under his supervision - if Cyril passes, Doc and Galice stop training him', day: 12, when: 'morning' });
        expect(g.agenda).toHaveLength(1);
        expect(g.agenda[0].day).toBe(12);
        expect(dueSection(g, 11)).toMatch(/SET FOR LATER[\s\S]*tomorrow, morning: Adam Miller runs/);
        expect(dueSection(g, 12)).toMatch(/DUE TODAY[\s\S]*nobody stands in for them[\s\S]*\[ag_t\] Adam Miller runs/);
    });

    it('is in the day plan even when the plan left it out', () => {
        const g = emptyGm();
        setByStory(g, { id: 'ag_t', text: 'Adam Miller runs Cyril\'s test', day: 12, when: 'morning', ties: ['Adam Miller'] });
        setDayPlan(g, { moments: [{ text: 'Vex briefs Cyril on drills' }] }, { day: 12, turn: 1 });
        expect(g.day.moments.map((m) => m.source)).toEqual(['', 'agenda:ag_t']);
        expect(g.day.moments[1]).toMatchObject({ droppable: false, when: 'morning' });
        expect(g.agenda[0].status).toBe('planned');
        // DUE TODAY says it; the plan's own line does not repeat it.
        expect(planSection(g, {})).not.toMatch(/Adam Miller runs/);
    });

    it('is kept by a BEAT line - only with its people in the chat - or can no longer happen', () => {
        const g = emptyGm();
        setByStory(g, { id: 'ag_t', text: 'Adam Miller runs Cyril\'s test', day: 12, ties: ['Adam Miller'] });
        setDayPlan(g, { moments: [] }, { day: 12, turn: 1 });
        applyBeats(g, [{ id: 'ag_t', status: 'done', note: 'Cyril passes' }], { seen: ['Vex arrives.'], player: 'Cyril' });
        expect(g.agenda[0].status).toBe('planned');
        applyBeats(g, [{ id: 'ag_t', status: 'done', note: 'Cyril passes' }], { seen: ['Adam Miller watches.'], player: 'Cyril' });
        expect(g.agenda[0].status).toBe('done');
        expect(g.day.moments[0].status).toBe('done');
        expect(g.volume.chronicle.at(-1).text).toMatch(/Adam Miller runs Cyril's test \(Cyril passes\)/);
        const h = emptyGm();
        setByStory(h, { id: 'ag_u', text: 'Riven duels Cyril', day: 3 });
        applyBeats(h, [{ id: 'ag_u', status: 'skipped', note: 'Riven is dead' }]);
        expect(h.agenda[0].status).toBe('passed');
    });

    it('the day planner hears what must not slip', () => {
        const { prompt } = buildDayPrompt({ messages: [], happenings: [{ id: 'ag_t', text: 'Adam runs the test', when: 'morning', due: 'today', late: 1, promise: true }] });
        expect(prompt).toMatch(/\[ag_t\] Adam runs the test - today, morning \(set in the story: those involved keep it themselves, no one stands in for them; put off 1 day already - it must happen today, early\)/);
    });
});

describe('the director\'s lines', () => {
    it('reads SET lines and BEAT lines for due happenings, and drops a bare FORMAT heading', () => {
        const parsed = parseDirectorNote([
            'FORMAT',
            'SET | Adam Miller | Cyril\'s test under Adam\'s own supervision; pass and Doc and Galice stop training him | tomorrow morning',
            'SET | <who is to do it> | <what> | <when>',
            'BEAT | ag_mx12ab | done | Adam watches Cyril clear the course',
            '',
            'Adam paces the office.',
        ].join('\n'));
        expect(parsed.sets).toEqual([{ who: 'Adam Miller', what: 'Cyril\'s test under Adam\'s own supervision; pass and Doc and Galice stop training him', when: 'tomorrow morning' }]);
        expect(parsed.beats).toEqual([{ id: 'ag_mx12ab', status: 'done', note: 'Adam watches Cyril clear the course' }]);
        expect(parsed.note).toBe('Adam paces the office.');
    });

    it('asks for SET lines, and BEAT lines when something is due', () => {
        expect(buildDirectorPrompt({ messages: [] }).prompt).toContain('SET | <who is to do it>');
        const due = buildDirectorPrompt({ messages: [], gmPlan: 'DUE TODAY (private)\n- [ag_mx12ab] Adam runs the test' }).prompt;
        expect(due).toContain('BEAT | <its id> | done');
    });
});
