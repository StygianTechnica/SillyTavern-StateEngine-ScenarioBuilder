// A beat called done whose people never came into the story did not happen:
// it is under way again, by itself or by the user's hand, an outline review
// never calls it done, and the newcomer it waits on becomes a must.
import { undoUnseenBeats, restoreBeat, setOutline, beatsOf, addChronicle, activeBeat, newcomerWait, planSection, FIRM_AFTER, emptyGm } from '../src/planner/model.js';

const chat = [
    'Doc and Galice exchanged a glance as Cyril came in from the training area.',
    'Zane grinned and handed Cyril a water bottle.',
];

const gm = () => {
    const g = emptyGm();
    g.outline = { premise: '', themes: [], seeds: [], acts: [{ id: 'a1', title: 'The Call', beats: [
        { id: 'b1', text: 'Adam arrives at HQ and insists on a combat assessment.', ties: ['Cyril', 'Galice Buckar', 'Adam Miller'], status: 'active', locked: true, by: 'user', note: '' },
    ] }] };
    return g;
};

describe('a beat called done whose people never came', () => {
    it('is under way again, and the chronicle forgets it', () => {
        const g = gm();
        g.outline.acts[0].beats[0].status = 'done';
        g.outline.acts[0].beats.push({ id: 'b3', text: 'The combat assessment against Inji.', ties: ['Inji Miyama'], status: 'active', locked: false, by: 'planner', note: '' });
        addChronicle(g, 'Adam Miller strides into the common room.');
        addChronicle(g, 'Beat: Adam arrives at HQ and insists on a combat assessment.');
        addChronicle(g, 'Zane shows Cyril his kitchen.');
        expect(undoUnseenBeats(g, [...chat, 'Inji Miyama waved.'], 'Cyril')).toEqual(['Adam Miller']);
        expect(activeBeat(g.outline).id).toBe('b1');
        expect(g.volume.chronicle.map((c) => c.text)).toEqual(['Zane shows Cyril his kitchen.']);
    });

    it('leaves a beat whose people did come', () => {
        const g = gm();
        g.outline.acts[0].beats[0].status = 'done';
        expect(undoUnseenBeats(g, [...chat, 'Adam Miller walks in.'], 'Cyril')).toEqual([]);
        expect(g.outline.acts[0].beats[0].status).toBe('done');
    });

    it('can be brought back by hand', () => {
        const g = gm();
        g.outline.acts[0].beats[0].status = 'done';
        g.outline.acts[0].beats.push({ id: 'b3', text: 'Later.', ties: [], status: 'active', locked: false, by: 'planner', note: '' });
        addChronicle(g, 'Beat: Adam arrives at HQ and insists on a combat assessment.');
        restoreBeat(g, 'b1');
        expect(activeBeat(g.outline).id).toBe('b1');
        expect(g.outline.acts[0].beats[1].status).toBe('pending');
        expect(g.volume.chronicle).toHaveLength(0);
    });

    it('an outline review never calls it done', () => {
        const g = gm();
        setOutline(g, { acts: [{ title: 'The Call', beats: [{ id: 'b1', text: 'Adam arrives at HQ.', status: 'done' }, { text: 'The assessment.', status: 'pending' }] }] }, { review: true, unseen: (b) => (b.ties.includes('Adam Miller') ? ['Adam Miller'] : []) });
        expect(beatsOf(g.outline).find((b) => b.id === 'b1').status).toBe('active');
    });
});

describe('a newcomer kept waiting', () => {
    it('becomes a must for this reply', () => {
        const g = gm();
        expect(newcomerWait(g, 'b1', 10)).toBe(0);
        expect(newcomerWait(g, 'b1', 10 + FIRM_AFTER)).toBe(FIRM_AFTER);
        expect(planSection(g, { newcomers: ['Adam Miller'], waited: FIRM_AFTER })).toMatch(/Now: Adam Miller comes into the story in this reply/);
        expect(planSection(g, { newcomers: ['Adam Miller'], waited: 1 })).toMatch(/Not yet in the story: Adam Miller/);
        expect(newcomerWait(g, 'b3', 20)).toBe(0);
    });
});
