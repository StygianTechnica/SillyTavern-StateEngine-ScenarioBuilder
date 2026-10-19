// An outline pass never brings back a beat the story has played out as a
// fresh copy, and adds nothing to a chapter the story has finished.
import { emptyGm, setOutline, sameBeat, beatsOf } from '../src/planner/model.js';

const DEAL = "Graxx proposes a deal: he'll provide aid in securing Redhaven if Remus shares the cache's contents with him.";

function gmWith(acts) {
    const gm = emptyGm();
    gm.outline = { premise: 'p', themes: [], seeds: [], updatedAt: '', madeTurn: 0, acts };
    return gm;
}

const start = () => gmWith([
    { id: 'a1', title: 'Siege', beats: [{ id: 'b1', text: 'An undead horde approaches the fortress; they fortify the walls.', ties: [], status: 'done', locked: false, by: 'planner', note: '' }] },
    { id: 'a2', title: 'Homecoming', beats: [
        { id: 'b2', text: DEAL, ties: [], status: 'done', locked: false, by: 'planner', note: '' },
        { id: 'b3', text: 'With the temple contents secured, Remus and his allies face the consequences in Redhaven.', ties: [], status: 'active', locked: false, by: 'planner', note: '' },
    ] },
]);

describe('the same beat in other words', () => {
    it('is recognised', () => {
        expect(sameBeat(DEAL, "Graxx proposes a deal: he'll provide aid in securing Redhaven if Remus shares the cache contents with him, sparking tension among allies.")).toBe(true);
        expect(sameBeat(DEAL, 'Niamh confronts Remus about potential betrayal, adding strain to their relationship.')).toBe(false);
    });
});

describe('an outline pass', () => {
    it('does not add a copy of a beat the story has played out', () => {
        const gm = start();
        setOutline(gm, { acts: [
            { title: 'Siege', beats: [{ id: 'b1', text: 'x' }] },
            { title: 'Homecoming', beats: [
                { text: "Graxx proposes a deal: he'll provide aid in securing Redhaven if Remus shares the cache contents with him." },
                { id: 'b3', text: 'With the temple contents secured, Remus and his allies face the consequences in Redhaven.' },
                { text: 'Niamh confronts Remus about his dealings with Graxx.' },
            ] },
        ] });
        const beats = beatsOf(gm.outline);
        expect(beats.filter((b) => sameBeat(b.text, DEAL))).toHaveLength(1);
        expect(beats.find((b) => b.id === 'b2').status).toBe('done');
        expect(beats.find((b) => b.id === 'b3').status).toBe('active');
        expect(beats.some((b) => /Niamh confronts/.test(b.text))).toBe(true);
    });

    it('matches a beat whose id the answer lost, instead of making a new one', () => {
        const gm = start();
        setOutline(gm, { acts: [
            { title: 'Siege', beats: [{ id: 'b1', text: 'x' }] },
            { title: 'Homecoming', beats: [{ text: 'With the temple contents secured, Remus and his allies must face the consequences in Redhaven.', status: 'pending' }] },
        ] });
        const b3 = beatsOf(gm.outline).filter((b) => /temple contents secured/.test(b.text));
        expect(b3).toHaveLength(1);
        expect(b3[0].id).toBe('b3');
    });

    it('adds nothing new to a finished chapter, and never the same new beat twice', () => {
        const gm = start();
        setOutline(gm, { acts: [
            { title: 'Siege', beats: [{ id: 'b1', text: 'x' }, { text: 'The horde breaks through the eastern gate.' }] },
            { title: 'Homecoming', beats: [
                { id: 'b3', text: 'With the temple contents secured, Remus and his allies face the consequences in Redhaven.' },
                { text: 'Niamh confronts Remus about his dealings with Graxx.' },
                { text: 'Niamh confronts Remus about his dealings with Graxx, straining their bond.' },
            ] },
        ] });
        const beats = beatsOf(gm.outline);
        expect(beats.some((b) => /eastern gate/.test(b.text))).toBe(false);
        expect(beats.filter((b) => /Niamh confronts/.test(b.text))).toHaveLength(1);
    });
});
