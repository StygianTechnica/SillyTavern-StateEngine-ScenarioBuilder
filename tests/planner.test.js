import {
    emptyGm, normalizeGm, addRequest, setRequestStatus, setDayPlan, applyCheck, applyBeats, trackPace, paceAim, postSignals,
    duePasses, planSection, motifsOf, isVeiled, openRequests,
} from '../src/planner/model.js';
import { buildDayPrompt, readDayPlan, buildCheckPrompt, readCheck, buildInspirePrompt, readInspiration } from '../src/planner/prompts.js';
import { parseDirectorNote, buildDirectorPrompt } from '../src/director/prompt.js';

const plan = {
    moments: [
        { text: 'An envoy of the Pale Choir arrives at the gate', when: 'afternoon', trigger: 'if the scene is at the fortress', ties: ['Pale Choir'] },
        { text: 'Niamh calls a council of war', when: 'evening', ties: ['Niamh'] },
        { text: 'A rival smuggler shows up at the tavern', when: 'night', ties: [] },
    ],
    agendas: [{ who: 'Graxx', wants: 'Remus committed before nightfall', will: 'press him at supper', hidden: 'he already sent word to the Choir' }],
    offscreen: ['Death knight patrols push closer to Redhaven'],
    requests: [{ request: 'req_1', moments: [3] }],
};

function withPlan() {
    const gm = emptyGm();
    addRequest(gm, { id: 'req_1', text: 'add an NPC - a rival smuggler', urgency: 'today', at: '2026-10-18T10:00:00Z' });
    setDayPlan(gm, plan, { day: 4, turn: 10, at: '2026-10-18T10:05:00Z' });
    return gm;
}

describe('planner data', () => {
    it('normalizes junk to an empty plan and keeps what is valid', () => {
        expect(normalizeGm(undefined)).toEqual(emptyGm());
        const gm = normalizeGm({ day: { day: 2, moments: [{ text: ' A storm ' }, { nope: 1 }] }, queue: [{ id: 'r', text: 'x', urgency: 'bogus' }, { text: 'no id' }], pace: { hold: true, baselineWords: -3 } });
        expect(gm.day.moments).toEqual([expect.objectContaining({ id: 'm1', text: 'A storm', status: 'pending', droppable: true })]);
        expect(gm.queue).toEqual([expect.objectContaining({ id: 'r', urgency: 'whenever', status: 'waiting' })]);
        expect(gm.pace).toMatchObject({ hold: true, baselineWords: 0 });
    });

    it('drops old finished requests but keeps open ones', () => {
        const gm = emptyGm();
        for (let i = 0; i < 30; i++) { addRequest(gm, { id: `d${i}`, text: `done ${i}` }); setRequestStatus(gm, `d${i}`, 'done'); }
        addRequest(gm, { id: 'open', text: 'still wanted' });
        expect(gm.queue.filter((r) => r.status === 'done')).toHaveLength(20);
        expect(openRequests(gm).map((r) => r.id)).toEqual(['open']);
    });
});

describe('the day plan and the queue', () => {
    it('numbers the moments and marks the requests it plans for', () => {
        const gm = withPlan();
        expect(gm.day.moments.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
        expect(gm.queue[0]).toMatchObject({ status: 'planned', plannedAs: ['m3'] });
    });

    it('settles a request when its moment is done, and puts it back when it falls through', () => {
        const gm = withPlan();
        applyBeats(gm, [{ id: 'm3', status: 'done', note: 'Vesk swaggers in' }]);
        expect(gm.queue[0].status).toBe('done');
        const other = withPlan();
        expect(applyBeats(other, [{ id: 'M3', status: 'skipped', note: 'they left town' }])).toBe(true);
        expect(other.queue[0]).toMatchObject({ status: 'waiting', plannedAs: [] });
        expect(other.checkWanted).toBe(true);
    });

    it('applies a CHECK: done, dropped and new moments, new ones planned for requests', () => {
        const gm = withPlan();
        addRequest(gm, { id: 'req_2', text: 'a new quest' });
        applyCheck(gm, { done: [{ id: 'm1', how: 'the envoy came' }], skipped: [{ id: 'm2', why: 'Niamh rode out' }], add: [{ text: 'A dying courier gasps out a plea' }], requests: [{ request: 'req_2', moments: [1] }] });
        expect(gm.day.moments.map((m) => [m.id, m.status])).toEqual([['m1', 'done'], ['m2', 'skipped'], ['m3', 'pending'], ['m4', 'pending']]);
        expect(gm.queue.find((r) => r.id === 'req_2')).toMatchObject({ status: 'planned', plannedAs: ['m4'] });
    });

    it('a new day puts unfinished planned requests back in the queue', () => {
        const gm = withPlan();
        setDayPlan(gm, { moments: [{ text: 'Dawn bells' }] }, { day: 5, turn: 30 });
        expect(gm.queue[0]).toMatchObject({ status: 'waiting', plannedAs: [] });
    });
});

describe('pace', () => {
    it('reads a post for dialogue, questions and an out-of-character hold', () => {
        expect(postSignals('"Where is she?" I ask.')).toMatchObject({ dialogue: true, question: true, hold: false });
        expect(postSignals('*nods* [stay]').hold).toBe(true);
        expect(postSignals('(ooc: linger here a bit)').hold).toBe(true);
    });

    it('counts replies in a scene and idle ones, starting again when the scene changes', () => {
        const gm = emptyGm();
        trackPace(gm, { sceneKey: 'hall|Supper', active: false, userText: 'I sit down at the long table and look around the hall carefully.' });
        trackPace(gm, { sceneKey: 'hall|Supper', active: false, userText: 'ok' });
        expect(gm.pace).toMatchObject({ sceneReplies: 2, idleReplies: 2 });
        trackPace(gm, { sceneKey: 'hall|Supper', active: true, userText: 'ok' });
        expect(gm.pace.idleReplies).toBe(0);
        trackPace(gm, { sceneKey: 'gate|Envoy', active: false, userText: 'ok' });
        expect(gm.pace).toMatchObject({ sceneReplies: 1, idleReplies: 1 });
    });

    const idleGm = (replies, idle, baseline = 40) => { const gm = emptyGm(); Object.assign(gm.pace, { sceneReplies: replies, idleReplies: idle, baselineWords: baseline }); return gm; };

    it('moves on when the posts turn short and nothing is happening', () => {
        expect(paceAim(idleGm(12, 5), { level: 'gentle', recentUser: ['I nod.', 'ok', '*listens*'] }).aim).toBe('move on');
    });

    it('never moves on while the user is talking, asking or holding', () => {
        expect(paceAim(idleGm(40, 8), { recentUser: ['ok', '"Tell me more about the Choir," I say.'] }).aim).not.toBe('move on');
        expect(paceAim(idleGm(40, 8), { recentUser: ['ok', 'Why?'] }).aim).not.toBe('move on');
        expect(paceAim(idleGm(40, 8), { recentUser: ['ok', 'ok'], tense: true }).aim).not.toBe('move on');
        const held = idleGm(40, 8); held.pace.hold = true;
        expect(paceAim(held, { recentUser: ['ok', 'ok'] }).aim).toBe('linger');
    });

    it('lingers with an engaged user, and is steady by default', () => {
        expect(paceAim(idleGm(3, 0), { recentUser: ['"I won\'t leave without her," I tell Graxx, and slam my fist on the table hard enough to rattle the cups.'] }).aim).toBe('linger');
        expect(paceAim(idleGm(3, 1), { recentUser: ['I walk over to the window and look out over the courtyard below for a while.'] }).aim).toBe('steady');
        expect(paceAim(idleGm(40, 8), { level: 'off', recentUser: ['ok'] }).aim).toBe('steady');
    });

    it('a faster pacing tips sooner', () => {
        const gm = idleGm(8, 2);
        expect(paceAim(gm, { level: 'gentle', recentUser: ['ok'] }).aim).toBe('steady');
        expect(paceAim(gm, { level: 'fast', recentUser: ['ok'] }).aim).toBe('move on');
    });
});

describe('cadence', () => {
    it('plans a day when there is none, the day changed or it ran long', () => {
        expect(duePasses(emptyGm(), { day: 1, turn: 0 })).toEqual(['day']);
        const gm = withPlan();
        expect(duePasses(gm, { day: 5, turn: 11 })).toEqual(['day']);
        expect(duePasses(gm, { day: 4, turn: 35 })).toEqual(['day']);
        expect(duePasses(gm, { day: 4, turn: 35, level: 'light' })).toEqual([]);
    });

    it('checks every few replies, after a skipped beat, or for a new request - once', () => {
        const gm = withPlan();
        gm.counters.lastCheck = '2026-10-18T10:05:00Z';
        expect(duePasses(gm, { day: 4, turn: 11 })).toEqual([]);
        gm.counters.sinceCheck = 3;
        expect(duePasses(gm, { day: 4, turn: 13 })).toEqual(['check']);
        expect(duePasses(gm, { day: 4, turn: 13, level: 'light' })).toEqual([]);
        gm.counters.sinceCheck = 0;
        addRequest(gm, { id: 'req_9', text: 'visit somewhere new', at: '2026-10-18T11:00:00Z' });
        expect(duePasses(gm, { day: 4, turn: 14, level: 'light' })).toEqual(['check']);
        gm.counters.lastCheck = '2026-10-18T11:05:00Z';
        expect(duePasses(gm, { day: 4, turn: 15, level: 'light' })).toEqual([]);
        gm.checkWanted = true;
        expect(duePasses(gm, { day: 4, turn: 16, level: 'light' })).toEqual(['check']);
    });
});

describe('the director\'s private section', () => {
    it('carries the pace, the next two moments, agendas, soon requests and motifs', () => {
        const gm = withPlan();
        addRequest(gm, { id: 'req_s', text: 'more romance', urgency: 'soon' });
        const text = planSection(gm, { pace: { aim: 'move on', why: 'the talk has run its course' }, motifs: ['a cracked bell'] });
        expect(text).toMatch(/^GM PLAN \(private/);
        expect(text).toContain('Pace: move on - the talk has run its course');
        expect(text).toContain('Never decide for the player character');
        expect(text).toContain('[m1]: An envoy');
        expect(text).toContain('[m2]: Niamh');
        expect(text).not.toContain('[m3]');
        expect(text).toContain('Graxx wants Remus committed before nightfall');
        expect(text).toContain('The user would like: more romance');
        expect(text).toContain('a cracked bell');
    });

    it('is empty with nothing to say', () => {
        expect(planSection(emptyGm(), { pace: { aim: 'steady', why: '' } })).toBe('');
    });

    it('takes motifs from every inspiration in turn, and veils until peeked', () => {
        const gm = emptyGm();
        gm.inspirations = [{ id: 'a', motifs: ['a1', 'a2'] }, { id: 'b', motifs: ['b1'] }];
        expect(motifsOf(gm)).toEqual(['a1', 'b1', 'a2']);
        expect(isVeiled(gm, 'm1', false)).toBe(true);
        gm.peeked = ['m1'];
        expect(isVeiled(gm, 'm1', false)).toBe(false);
        expect(isVeiled(gm, 'm2', true)).toBe(false);
    });
});

describe('planner passes', () => {
    it('the day prompt carries requests, motifs, the player rule and the JSON shape', () => {
        const { system, prompt } = buildDayPrompt({ dossier: 'THE SETTING\nA grim land.', userName: 'Remus', requests: [{ id: 'req_1', text: 'a new quest', urgency: 'soon' }], motifs: ['lamps going out one by one'], dateText: 'day 4 of Frostfall' });
        expect(system).toContain('never plan what Remus says');
        expect(prompt).toContain('[req_1] a new quest (soon)');
        expect(prompt).toContain('lamps going out one by one');
        expect(prompt).toContain('"moments"');
        expect(prompt).toContain('PLAN THE DAY - day 4 of Frostfall');
    });

    it('reads a day plan, dropping what does not fit', () => {
        const out = readDayPlan({ moments: [{ text: 'A raid at dusk', ties: ['Death knights', 7] }, { when: 'night' }], agendas: [{ who: 'Graxx' }, { who: 'Niamh', wants: 'allies' }], requests: [{ request: 'req_1', moments: [1, 'x', 0] }] });
        expect(out.moments).toEqual([{ text: 'A raid at dusk', when: '', trigger: '', ties: ['Death knights'], droppable: true }]);
        expect(out.agendas).toEqual([{ who: 'Niamh', wants: 'allies', will: '', hidden: '' }]);
        expect(out.requests).toEqual([{ request: 'req_1', moments: [1] }]);
        expect(readDayPlan({ moments: [] })).toBeNull();
        expect(readDayPlan('nope')).toBeNull();
    });

    it('builds and reads a check', () => {
        const { prompt } = buildCheckPrompt({ moments: [{ id: 'm1', text: 'Envoy arrives', status: 'pending' }], messages: [{ name: 'Narrator', text: 'The envoy bows.' }] });
        expect(prompt).toContain('[m1] Envoy arrives - pending');
        expect(readCheck({ done: ['M1', { id: 'm2', how: 'fast' }], skipped: [{ id: 'm3' }], add: [{ text: 'x' }, { text: 'y' }, { text: 'z' }] }))
            .toEqual({ done: [{ id: 'm1', how: '' }, { id: 'm2', how: 'fast' }], skipped: [{ id: 'm3', why: '' }], add: [expect.objectContaining({ text: 'x' }), expect.objectContaining({ text: 'y' })], requests: [] });
    });

    it('distils inspiration into motifs and drops any that quote the text', () => {
        const source = 'The keeper climbs the stair each night to light the lamp that no ship needs anymore';
        expect(buildInspirePrompt({ title: 'Lighthouse', text: source }).system).toContain('Never quote the text');
        expect(readInspiration({ motifs: ['a duty kept long after its purpose', 'light the lamp that no ship needs anymore', ''] }, source)).toEqual(['a duty kept long after its purpose']);
    });
});

describe('the director and the plan', () => {
    it('puts the GM PLAN before the chat and asks for BEAT lines only when there are moments', () => {
        const withMoments = buildDirectorPrompt({ messages: [], gmPlan: 'GM PLAN (private)\n- Coming up [m1]: An envoy arrives' }).prompt;
        expect(withMoments.indexOf('GM PLAN')).toBeLessThan(withMoments.indexOf('THE LATEST CHAT'));
        expect(withMoments).toContain('BEAT | <moment id> | done');
        const paceOnly = buildDirectorPrompt({ messages: [], gmPlan: 'GM PLAN (private)\n- Pace: linger - engaged.' }).prompt;
        expect(paceOnly).not.toContain('BEAT |');
        expect(buildDirectorPrompt({ messages: [] }).prompt).not.toContain('GM PLAN');
    });

    it('reads BEAT lines and keeps them out of the briefing', () => {
        const parsed = parseDirectorNote('The envoy waits at the gate.\nBEAT | m1 | done | the envoy bows to Niamh\nBEAT | [m2] | Skipped | <why>\nBEAT | m1 | skipped | dup');
        expect(parsed.beats).toEqual([{ id: 'm1', status: 'done', note: 'the envoy bows to Niamh' }, { id: 'm2', status: 'skipped', note: '' }]);
        expect(parsed.note).not.toContain('BEAT');
    });
});
