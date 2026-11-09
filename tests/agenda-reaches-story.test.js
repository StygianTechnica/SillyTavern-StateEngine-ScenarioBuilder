// Assassins Inc: "The Medina Syndicate sends a pair of enforcers to Bearville
// District" stayed "planned" on the agenda and never reached a reply. The day
// plan had tied it to a moment about the museum; that moment was dropped.
import { emptyGm, setDayPlan, settleAgenda, addHappening, planSection, waitingHappening, aboutHappening } from '../src/planner/model.js';

const enforcers = { id: 'ag_1', day: 50, text: 'The Medina Syndicate sends a pair of enforcers to Bearville District, seeking information on Cyril\'s whereabouts.', ties: ['Medina Syndicate'], source: 'ideas' };
const withItem = (x = enforcers) => { const gm = emptyGm(); addHappening(gm, x); return gm; };
const plan = (text, happening = 'ag_1') => ({ moments: [{ text, when: 'night', happening }], agendas: [], offscreen: [] });

describe('a moment really about the happening', () => {
    it('not the museum moment the plan tied it to', () => {
        expect(aboutHappening('Enrique receives intel that White Cerberus has infiltrated the museum and dispatches a team to neutralize them.', enforcers)).toBe(false);
    });
    it('not one sharing only the names it ties in', () => {
        expect(aboutHappening('The Medina Syndicate raids the museum.', enforcers)).toBe(false);
    });
    it('the same thing in other words', () => {
        expect(aboutHappening('Two enforcers turn up in Bearville asking questions.', enforcers)).toBe(true);
    });
    it('a short happening, reworded, across genres', () => {
        expect(aboutHappening('Zane meets Cyril at the pier.', { text: 'Zane meets Cyril at dawn', ties: ['Zane', 'Cyril'] })).toBe(true);
        expect(aboutHappening('The Pale Choir burns the harbour at night.', { text: 'An envoy from the Pale Choir arrives at the gate', ties: ['Pale Choir'] })).toBe(false);
        expect(aboutHappening('The envoy from the Pale Choir comes to the gate at last.', { text: 'An envoy from the Pale Choir arrives at the gate', ties: ['Pale Choir'] })).toBe(true);
        expect(aboutHappening('A relief freighter docks at Ceres with the medicine.', { text: 'The relief freighter docks at Ceres', ties: [] })).toBe(true);
    });
    it('the day plan links only that', () => {
        const wrong = withItem();
        setDayPlan(wrong, plan('Enrique dispatches a team to the museum.'), { day: 50, turn: 1 });
        expect(wrong.day.moments[0].source).not.toBe('agenda:ag_1');
        const right = withItem();
        setDayPlan(right, plan('Two enforcers turn up in Bearville asking questions.'), { day: 50, turn: 1 });
        expect(right.day.moments[0].source).toBe('agenda:ag_1');
    });
});

describe('planned means a moment is waiting', () => {
    it('goes back to coming when its moment is dropped', () => {
        const gm = withItem();
        setDayPlan(gm, plan('Two enforcers turn up in Bearville asking questions.'), { day: 50, turn: 1 });
        settleAgenda(gm);
        expect(gm.agenda[0].status).toBe('planned');
        gm.day.moments[0].status = 'skipped';
        settleAgenda(gm);
        expect(gm.agenda[0].status).toBe('coming');
    });
});

describe('waiting to reach them', () => {
    it('due with nothing carrying it', () => {
        expect(waitingHappening(withItem(), 50)?.id).toBe('ag_1');
    });
    it('not before its day, or without a day to go by', () => {
        expect(waitingHappening(withItem(), 49)).toBeNull();
        expect(waitingHappening(withItem(), null)).toBeNull();
    });
    it('not while a moment is carrying it', () => {
        const gm = withItem();
        setDayPlan(gm, plan('Two enforcers turn up in Bearville asking questions.'), { day: 50, turn: 1 });
        expect(waitingHappening(gm, 50)).toBeNull();
        gm.day.moments[0].status = 'skipped';
        expect(waitingHappening(gm, 50)?.id).toBe('ag_1');
    });
    it('leaves what has its own lines or is over', () => {
        expect(waitingHappening(withItem({ ...enforcers, source: 'promise' }), 50)).toBeNull();
        expect(waitingHappening(withItem({ ...enforcers, source: 'event:e1' }), 50)).toBeNull();
        const gm = withItem();
        gm.agenda[0].status = 'passed';
        expect(waitingHappening(gm, 50)).toBeNull();
    });
    it('not before its part of the day', () => {
        const gm = withItem({ ...enforcers, when: 'night' });
        expect(waitingHappening(gm, 50, 'morning')).toBeNull();
        expect(waitingHappening(gm, 50, 'night')?.id).toBe('ag_1');
    });
    it('goes in the plan once, with its id, and never moves the event', () => {
        const gm = withItem();
        addHappening(gm, { ...enforcers, id: 'ag_2', text: 'A festival of masks fills the harbour.' });
        const text = planSection(gm, { today: 50 });
        expect(text).toContain('Waiting to reach them [ag_1]');
        expect(text).toContain('never moved to this scene');
        expect(text).not.toContain('ag_2');
    });
    it('says nothing while the scene is tense or held', () => {
        expect(planSection(withItem(), { today: 50, quiet: true })).not.toContain('Waiting to reach them');
    });
});
