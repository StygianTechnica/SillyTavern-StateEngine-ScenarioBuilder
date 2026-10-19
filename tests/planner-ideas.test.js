import {
    emptyGm, normalizeGm, addIdeas, resolveIdea, editIdea, ideaKey, openIdeas, addHappening, removeHappening, dueHappenings, settleAgenda,
    setDayPlan, applyBeats, applyCheck, duePasses, frictionLines, addSeed, setOutline,
} from '../src/planner/model.js';
import { buildIdeasPrompt, readIdeas, buildDayPrompt, readDayPlan } from '../src/planner/prompts.js';

let n = 0;
const newId = () => `idea_${++n}`;

describe('ideas', () => {
    it('takes ideas in as proposals, without repeats or what the user turned down', () => {
        const gm = emptyGm();
        const added = addIdeas(gm, [
            { kind: 'quest', name: 'The Drowned Bell', text: 'A bell rings under the lake.', why: 'the Pale Choir', ties: ['Pale Choir'] },
            { kind: 'quest', name: 'the drowned bell', text: 'duplicate' },
            { kind: 'happening', text: 'An envoy arrives', inDays: 3 },
            { kind: 'bogus', text: 'x' },
        ], { newId });
        expect(added.map((i) => i.kind)).toEqual(['quest', 'happening']);
        expect(openIdeas(gm)).toHaveLength(2);
        resolveIdea(gm, added[0].id, 'dismissed');
        expect(addIdeas(gm, [{ kind: 'quest', name: 'The Drowned Bell', text: 'again' }], { newId })).toEqual([]);
        expect(gm.dismissedIdeas).toContain(ideaKey(added[0]));
        expect(openIdeas(gm).map((i) => i.kind)).toEqual(['happening']);
    });

    it('keys enrichments by their quest too, and lets the user edit before accepting', () => {
        const gm = emptyGm();
        const [a] = addIdeas(gm, [{ kind: 'enrich', target: 'The Cache', text: 'Its guardian is a lich', objectives: ['Find the key'] }], { newId });
        expect(addIdeas(gm, [{ kind: 'enrich', target: 'Another Quest', text: 'Its guardian is a lich' }], { newId })).toHaveLength(1);
        editIdea(gm, a.id, { text: ' Its guardian is a dragon ', objectives: ['Find the key', 'Bribe the guard'] });
        expect(gm.ideas[0]).toMatchObject({ text: 'Its guardian is a dragon', objectives: ['Find the key', 'Bribe the guard'] });
        expect(resolveIdea(gm, a.id, 'accepted').status).toBe('accepted');
        expect(resolveIdea(gm, 'nope', 'accepted')).toBeNull();
    });

    it('survives a round trip and drops junk', () => {
        const gm = emptyGm();
        addIdeas(gm, [{ kind: 'seed', text: 'A cracked bell', why: 'the reckoning' }], { newId });
        expect(normalizeGm(JSON.parse(JSON.stringify(gm))).ideas).toEqual(gm.ideas);
        expect(normalizeGm({ ideas: [{ id: 'x', kind: 'quest' }], agenda: [{ id: 'y', text: 't' }] })).toMatchObject({ ideas: [], agenda: [] });
    });
});

describe('the agenda', () => {
    it('holds dated happenings in order, and says which are due', () => {
        const gm = emptyGm();
        addHappening(gm, { id: 'a2', text: 'A storm', day: 9 });
        addHappening(gm, { id: 'a1', text: 'An envoy arrives', day: 5, when: 'afternoon' });
        addHappening(gm, { id: 'a3', text: 'A festival', day: 6 });
        expect(gm.agenda.map((x) => x.id)).toEqual(['a1', 'a3', 'a2']);
        expect(dueHappenings(gm, 5).map((x) => x.id)).toEqual(['a1', 'a3']);
        expect(dueHappenings(gm, 5, 0).map((x) => x.id)).toEqual(['a1']);
        removeHappening(gm, 'a2');
        expect(gm.agenda).toHaveLength(2);
    });

    it('follows the day plan: planned, then done, and passed when its day goes by', () => {
        const gm = emptyGm();
        addHappening(gm, { id: 'a1', text: 'An envoy arrives', day: 5 });
        addHappening(gm, { id: 'a2', text: 'A storm', day: 5 });
        setDayPlan(gm, { moments: [{ text: 'The envoy is at the gate', happening: 'a1' }, { text: 'Nothing to do with the agenda', happening: 'zz' }] }, { day: 5, turn: 1 });
        expect(gm.day.moments.map((m) => m.source)).toEqual(['agenda:a1', '']);
        settleAgenda(gm, 5);
        expect(gm.agenda.find((x) => x.id === 'a1').status).toBe('planned');
        applyBeats(gm, [{ id: 'm1', status: 'done' }]);
        expect(gm.agenda.find((x) => x.id === 'a1').status).toBe('done');
        settleAgenda(gm, 6);
        expect(gm.agenda.find((x) => x.id === 'a2').status).toBe('passed');
    });

    it('a CHECK that plays out a happening\'s moment marks it done', () => {
        const gm = emptyGm();
        addHappening(gm, { id: 'a1', text: 'A duel at dawn', day: 2 });
        setDayPlan(gm, { moments: [{ text: 'The challenger arrives', happening: 'a1' }] }, { day: 2, turn: 0 });
        applyCheck(gm, { done: [{ id: 'm1', how: 'swords drawn' }] });
        expect(gm.agenda[0].status).toBe('done');
    });
});

describe('ideas cadence and helpers', () => {
    it('thinks up ideas every so often, never on Light unless asked', () => {
        const gm = emptyGm();
        gm.day = { day: 1, madeTurn: 0, moments: [], agendas: [], offscreen: [] };
        gm.counters.lastCheck = 'z';
        gm.counters.sinceIdeas = 20;
        expect(duePasses(gm, { day: 1, turn: 5 })).toEqual(['ideas']);
        expect(duePasses(gm, { day: 1, turn: 5, level: 'light' })).toEqual([]);
        expect(duePasses(gm, { day: 1, turn: 5, level: 'light', ideasEvery: 10 })).toEqual(['ideas']);
        expect(duePasses(gm, { day: 2, turn: 5 })).toEqual(['ideas', 'day']);
    });

    it('turns frictions into lines: sour relationships, rivals, kept secrets, open oaths', () => {
        const lines = frictionLines({
            cells: [
                { from: { name: 'Graxx' }, to: { name: 'Niamh' }, polarity: -2, polarity_label: 'antagonistic', type: 'rival', trend: 'cooling' },
                { from: { name: 'Varyn' }, to: { name: 'Remus' }, polarity: 2, polarity_label: 'close', trend: 'stable' },
                { from: { name: 'Elyon' }, to: { name: 'Remus' }, polarity: 0, polarity_label: 'neutral', trend: 'volatile' },
            ],
            relations: [{ from: 'fac_a', to: 'fac_b', kind: 'enemy' }, { from: 'fac_a', to: 'fac_c', kind: 'ally' }],
            knowledge: [
                { kind: 'secret', status: 'kept', text: 'Graxx sent word to the Choir', knownBy: [{ name: 'Graxx' }] },
                { kind: 'secret', status: 'revealed', text: 'old news' },
                { kind: 'oath', status: 'broken', text: 'to guard the gate', madeBy: [{ name: 'Varyn' }] },
            ],
            nameOf: (id) => ({ fac_a: 'Pale Choir', fac_b: 'Silent Wardens', fac_c: 'Redhaven' })[id],
        });
        expect(lines).toEqual([
            'Graxx sees Niamh as antagonistic (rival), cooling',
            'Elyon sees Remus as neutral, volatile',
            'Pale Choir and Silent Wardens: enemies',
            'A secret known to Graxx: Graxx sent word to the Choir',
            'An oath broken by Varyn: to guard the gate',
        ]);
    });

    it('plants a seed only in an outline', () => {
        const gm = emptyGm();
        expect(addSeed(gm, { text: 'A cracked bell' })).toBe(false);
        setOutline(gm, { acts: [{ title: 'A', beats: [{ text: 'x' }] }] });
        expect(addSeed(gm, { text: 'A cracked bell', payoff: 'the reckoning' })).toBe(true);
        expect(gm.outline.seeds).toEqual([{ id: 's1', text: 'A cracked bell', payoff: 'the reckoning' }]);
    });
});

describe('the ideas pass', () => {
    it('asks for every kind normally, and only happenings and seeds in canon', () => {
        const input = { dossier: 'THE SETTING', frictions: ['Graxx sees Niamh as antagonistic'], quests: [{ name: 'The Cache', status: 'Active', objectives: 0 }], lore: [{ name: 'The Graveborn Compact', description: 'old law' }], agenda: [{ text: 'A storm', inDays: 2 }], dismissed: ['the drowned bell'] };
        const open = buildIdeasPrompt(input).prompt;
        expect(open).toContain('FRICTIONS');
        expect(open).toContain('- The Cache (Active; 0 objectives)');
        expect(open).toContain('LORE NOT YET IN PLAY');
        expect(open).toContain('- A storm (in 2 days)');
        expect(open).toContain('TURNED DOWN BEFORE');
        expect(open).toContain('"quests"');
        expect(open).toContain('"enrich"');
        const canon = buildIdeasPrompt({ ...input, canonOnly: true }).prompt;
        expect(canon).toContain('fixed canon');
        expect(canon).not.toContain('"quests"');
    });

    it('reads ideas, two of each kind at most, none of the forbidden kinds in canon', () => {
        const json = {
            quests: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
            enrich: [{ quest: 'The Cache', text: 'a lich', objectives: ['x', 'y', 'z', 'w'] }],
            happenings: [{ text: 'An envoy', in_days: 99, when: 'dusk' }, { text: 'A storm' }],
            seeds: [{ text: 'A bell', payoff: 'later' }],
        };
        const ideas = readIdeas(json);
        expect(ideas.filter((i) => i.kind === 'quest').map((i) => i.name)).toEqual(['A', 'B']);
        expect(ideas.find((i) => i.kind === 'enrich')).toMatchObject({ target: 'The Cache', objectives: ['x', 'y', 'z'] });
        expect(ideas.filter((i) => i.kind === 'happening')).toEqual([
            expect.objectContaining({ text: 'An envoy', inDays: 30, when: 'dusk' }),
            expect.objectContaining({ text: 'A storm', inDays: 3 }),
        ]);
        expect(readIdeas(json, { canonOnly: true }).map((i) => i.kind)).toEqual(['happening', 'happening', 'seed']);
        expect(readIdeas('nope')).toEqual([]);
    });

    it('the day pass is told what is on the calendar and links a moment to it', () => {
        const prompt = buildDayPrompt({ dossier: '', happenings: [{ id: 'ag1', text: 'An envoy arrives', when: 'afternoon', due: 'today' }, { id: 'ag2', text: 'A festival', due: 'tomorrow' }] }).prompt;
        expect(prompt).toContain('ON THE CALENDAR');
        expect(prompt).toContain('- [ag1] An envoy arrives - today, afternoon');
        expect(prompt).toContain('- [ag2] A festival - tomorrow');
        expect(prompt).toContain('"happening"');
        expect(buildDayPrompt({ dossier: '' }).prompt).not.toContain('"happening"');
        expect(readDayPlan({ moments: [{ text: 'The envoy bows', happening: '[ag1]' }] }).moments[0].happening).toBe('ag1');
    });
});
