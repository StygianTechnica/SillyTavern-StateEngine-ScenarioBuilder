// Nothing plays out that the chat does not show: a moment called done
// whose people never turned up stays pending, and a beat's person no
// message names yet is brought to the player in person.
import { unseenTies, applyCheck, applyBeats, planSection, emptyGm } from '../src/planner/model.js';
import { buildDayPrompt, buildCheckPrompt } from '../src/planner/prompts.js';

const chat = [
    'Doc and Galice exchanged a glance as Cyril came in from the training area.',
    'Zane grinned and handed Cyril a water bottle.',
];

const gm = () => {
    const g = emptyGm();
    g.day = { day: 3, madeAt: '', madeTurn: 0, agendas: [], offscreen: [], moments: [
        { id: 'm1', text: 'Adam confronts Galice about Cyril.', when: '', trigger: '', ties: ['Adam Miller', 'Galice Buckar'], source: '', droppable: true, status: 'pending', note: '' },
        { id: 'm2', text: 'Galice reviews Cyril\'s workout records.', when: '', trigger: '', ties: ['Galice Buckar', 'Cyril'], source: '', droppable: true, status: 'pending', note: '' },
    ] };
    g.outline = { premise: '', themes: [], seeds: [], acts: [{ id: 'a1', title: 'The Call', beats: [
        { id: 'b1', text: 'Adam arrives at HQ and insists on a combat assessment.', ties: ['Cyril', 'Galice Buckar', 'Inji Miyama', 'Adam Miller'], status: 'active', locked: true, by: 'user', note: '' },
    ] }] };
    return g;
};

describe('unseenTies', () => {
    it('names only the people the chat never shows', () => {
        expect(unseenTies(['Adam Miller', 'Galice Buckar', 'Doc', 'Cyril'], chat, 'Cyril')).toEqual(['Adam Miller']);
    });

    it('takes any word of a name, as a whole word, in any case', () => {
        expect(unseenTies(['Zane Kovac'], chat)).toEqual([]);
        expect(unseenTies(['Docent'], chat)).toEqual(['Docent']);
        expect(unseenTies(['zane'], chat)).toEqual([]);
    });

    it('leaves the player and names too short to judge alone', () => {
        expect(unseenTies(['Cyril', 'Al'], ['nothing here'], 'Cyril')).toEqual([]);
    });
});

describe('a moment done in no chat', () => {
    it('stays pending when CHECK calls it done', () => {
        const g = gm();
        applyCheck(g, { done: [{ id: 'm1', how: 'Adam confronted Galice' }, { id: 'm2', how: 'they went over it' }], skipped: [], add: [] }, { seen: chat, player: 'Cyril' });
        expect(g.day.moments.find((m) => m.id === 'm1').status).toBe('pending');
        expect(g.day.moments.find((m) => m.id === 'm2').status).toBe('done');
        expect(g.volume.chronicle.some((c) => c.text.includes('Adam'))).toBe(false);
    });

    it('can still be skipped', () => {
        const g = gm();
        applyCheck(g, { done: [], skipped: [{ id: 'm1', why: 'no longer fits' }], add: [] }, { seen: chat });
        expect(g.day.moments.find((m) => m.id === 'm1').status).toBe('skipped');
    });

    it('stays pending when the director calls it done, unless its briefing brings them in', () => {
        const g = gm();
        applyBeats(g, [{ id: 'm1', status: 'done', note: '' }], { seen: chat, player: 'Cyril' });
        expect(g.day.moments.find((m) => m.id === 'm1').status).toBe('pending');
        applyBeats(g, [{ id: 'm1', status: 'done', note: '' }], { seen: [...chat, 'Adam strides into the gym, scowling at Galice.'], player: 'Cyril' });
        expect(g.day.moments.find((m) => m.id === 'm1').status).toBe('done');
    });

    it('is taken on its word without a chat to judge by', () => {
        const g = gm();
        applyCheck(g, { done: ['m1'], skipped: [], add: [] });
        expect(g.day.moments.find((m) => m.id === 'm1').status).toBe('done');
    });
});

describe('a beat\'s newcomer', () => {
    it('the director is told to bring them to the player character in person', () => {
        const text = planSection(gm(), { newcomers: ['Adam Miller'] });
        expect(text).toMatch(/Not yet in the story: Adam Miller/);
        expect(text).toMatch(/in person/);
    });

    it('no line without one', () => {
        expect(planSection(gm(), { newcomers: [] })).not.toMatch(/Not yet in the story/);
    });

    it('the day plan opens with them coming to the player', () => {
        const { prompt } = buildDayPrompt({ userName: 'Cyril', messages: [], story: { shape: 'Thriller', act: 'The Call', beat: 'Adam arrives at HQ.' }, newcomers: ['Adam Miller'] });
        expect(prompt).toMatch(/The beat brings in Adam Miller, not yet seen in the story/);
        expect(prompt).toMatch(/an agenda alone is not enough/);
    });

    it('CHECK counts only what the chat shows', () => {
        const { prompt } = buildCheckPrompt({ userName: 'Cyril', messages: [], moments: [] });
        expect(prompt).toMatch(/Only what THE LATEST CHAT shows counts as done/);
    });
});

describe('a chronicle line the story never showed', () => {
    it('can be taken out', async () => {
        const { addChronicle, removeChronicle } = await import('../src/planner/model.js');
        const g = gm();
        addChronicle(g, 'Doc reassures Adam.');
        addChronicle(g, 'Adam confronts Galice.');
        expect(removeChronicle(g, 0, 'Doc reassures Adam.')).toBe(true);
        expect(g.volume.chronicle.map((c) => c.text)).toEqual(['Adam confronts Galice.']);
    });

    it('not when the list has moved on under it', async () => {
        const { addChronicle, removeChronicle } = await import('../src/planner/model.js');
        const g = gm();
        addChronicle(g, 'Adam confronts Galice.');
        expect(removeChronicle(g, 0, 'Doc reassures Adam.')).toBe(false);
        expect(g.volume.chronicle).toHaveLength(1);
    });
});
