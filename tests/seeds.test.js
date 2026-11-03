// Seeds reach the director: an accepted seed idea (or one the outline
// wrote) is something to plant in passing, one at a time, until a BEAT
// line says it is planted - and a swiped reply takes the planting back.
import { emptyGm, addSeed, openSeeds, planSection, applyBeats, unplantSeedsFrom, setOutline } from '../src/planner/model.js';
import { buildDirectorPrompt, parseDirectorNote } from '../src/director/prompt.js';

const withOutline = () => {
    const g = emptyGm();
    g.outline = { premise: '', themes: [], seeds: [], acts: [{ id: 'a1', title: 'The Call', beats: [
        { id: 'b1', text: 'Adam assigns Cyril a mission.', ties: [], status: 'active', locked: false, by: 'planner', note: '' },
    ] }] };
    return g;
};

describe('seeds', () => {
    it('are planted one at a time, oldest first', () => {
        const g = withOutline();
        addSeed(g, { text: 'A Medina sigil scratched into Cyril\'s door', payoff: 'the Medina capture attempt' });
        addSeed(g, { text: 'Inji favours his left side', payoff: 'the combat assessment' });
        const text = planSection(g, {});
        expect(text).toMatch(/Plant when there is room \[s1\]: A Medina sigil scratched into Cyril's door \(it pays off later: the Medina capture attempt\)/);
        expect(text).not.toMatch(/Inji favours/);
    });

    it('a BEAT line plants one, or drops it; the next comes up', () => {
        const g = withOutline();
        addSeed(g, { text: 'A Medina sigil on the door' });
        addSeed(g, { text: 'Inji favours his left side' });
        applyBeats(g, [{ id: 's1', status: 'done', note: 'Cyril notices it' }], { index: 40 });
        expect(g.outline.seeds[0]).toMatchObject({ status: 'planted', plantedAt: 40 });
        expect(planSection(g, {})).toMatch(/\[s2\]: Inji favours/);
        applyBeats(g, [{ id: 's2', status: 'skipped' }]);
        expect(openSeeds(g)).toEqual([]);
        expect(planSection(g, {})).not.toMatch(/Plant when/);
    });

    it('a swiped reply takes the planting back', () => {
        const g = withOutline();
        addSeed(g, { text: 'A Medina sigil on the door' });
        applyBeats(g, [{ id: 's1', status: 'done' }], { index: 40 });
        expect(unplantSeedsFrom(g, 41)).toEqual([]);
        expect(unplantSeedsFrom(g, 40)).toEqual(['s1']);
        expect(openSeeds(g)[0]).toMatchObject({ id: 's1', plantedAt: -1 });
    });

    it('an outline review keeps the seeds it had and adds new ones', () => {
        const g = withOutline();
        addSeed(g, { text: 'A Medina sigil on the door' });
        applyBeats(g, [{ id: 's1', status: 'done' }], { index: 40 });
        addSeed(g, { text: 'Inji favours his left side' });
        setOutline(g, { acts: [{ title: 'The Call', beats: [{ id: 'b1', text: 'Adam assigns Cyril a mission.', status: 'active' }] }], seeds: [{ text: 'Inji favours his left side' }, { text: 'Vex keeps a second phone' }] }, { review: true });
        expect(g.outline.seeds.map((x) => [x.id, x.status])).toEqual([['s1', 'planted'], ['s2', 'open'], ['s3', 'open']]);
    });

    it('the director is asked for a BEAT line, and it is read', () => {
        expect(buildDirectorPrompt({ messages: [], gmPlan: 'GM PLAN\n- Plant when there is room [s1]: a sigil' }).prompt).toContain('BEAT | <its id> | done');
        expect(parseDirectorNote('BEAT | s1 | done | Cyril spots the sigil\n\nAdam paces.').beats).toEqual([{ id: 's1', status: 'done', note: 'Cyril spots the sigil' }]);
    });
});
