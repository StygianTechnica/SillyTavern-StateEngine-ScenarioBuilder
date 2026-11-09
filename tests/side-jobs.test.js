// Two rival jobs at once: a faction war the player character stumbles into.
import { startOp, afterBriefing, isLive, markOp } from '../src/ops/model.js';
import { readOpPlan } from '../src/ops/generate.js';
import { liveJobs, roomForJob, sidesOppose, alsoFacts, focused, settled, normalizeOpsAlso } from '../src/ops/side-jobs.js';
import { rivalAtWork, shownAtWork, repeatJob } from '../src/ops/detect.js';

const PLAN = (leader) => `LEADER: ${leader} | at the docks
AIM: Seize the shipment
CREW: Marta Quell | muscle | gate
STEP: Take the gate
STEP: Load the crates
STEP: Get away
BREAK: 2`;
const job = (id, side, more = {}) => ({ ...startOp(readOpPlan(PLAN(`${side} Boss`), side), 10, id), sideId: `f_${id}`, ...more });
const a = job('a', 'Medina Syndicate');
const b = job('b', 'The Quiet Hand');

describe('how many at once', () => {
    it('room for one beside the main job', () => {
        expect(roomForJob({ op: null, opsAlso: [] })).toBe(true);
        expect(roomForJob({ op: a, opsAlso: [] })).toBe(true);
        expect(roomForJob({ op: a, opsAlso: [b] })).toBe(false);
    });
    it('only those still running count', () => {
        const over = markOp(b, 'end', 12);
        expect(isLive(over)).toBe(false);
        expect(liveJobs({ op: a, opsAlso: [over] })).toHaveLength(1);
        expect(roomForJob({ op: a, opsAlso: [over] })).toBe(true);
    });
    it('stored safely, and an older chat has none', () => {
        expect(normalizeOpsAlso(undefined)).toEqual([]);
        expect(normalizeOpsAlso([b, null])).toHaveLength(1);
    });
});

describe('working against each other', () => {
    const rel = [{ from: 'f_a', to: 'f_b', kind: 'enemy of' }];
    it('at odds in the setting, or at the same place', () => {
        expect(sidesOppose(a, b, rel)).toBe(true);
        expect(sidesOppose(a, b, [])).toBe(false);
        expect(sidesOppose({ ...a, placeId: 'docks' }, { ...b, placeId: 'docks' }, [])).toBe(true);
    });
    it('not friends, or a job and itself', () => {
        expect(sidesOppose(a, b, [{ from: 'f_a', to: 'f_b', kind: 'ally of' }])).toBe(false);
        expect(sidesOppose(a, a, rel)).toBe(false);
    });
    it('the briefing gets one line for the other job, and that they oppose', () => {
        const line = alsoFacts([{ ...b, opposes: 'Medina Syndicate', placeName: 'the docks' }]);
        expect(line.split('\n')).toHaveLength(1);
        expect(line).toContain('The Quiet Hand, after Seize the shipment at the docks. Their step now: Take the gate.');
        expect(line).toContain('They and Medina Syndicate are working against each other');
        expect(alsoFacts([])).toBe('');
        expect(alsoFacts([markOp(b, 'end', 12)])).toBe('');
    });
});

describe('which comes first', () => {
    const withCrew = (o, id) => ({ ...o, crew: [{ ...o.crew[0], objectId: id }] });
    it('the one with people in the scene', () => {
        const [main, other] = focused(withCrew(a, 'x'), [withCrew(b, 'y')], { castIds: ['y'] });
        expect(main.id).toBe('b');
        expect(other.id).toBe('a');
    });
    it('stays put otherwise', () => {
        expect(focused(withCrew(a, 'x'), [withCrew(b, 'y')], { castIds: ['x', 'y'] })[0].id).toBe('a');
        expect(focused(withCrew(a, 'x'), [withCrew(b, 'y')], { castIds: [] })[0].id).toBe('a');
    });
});

describe('when one ends', () => {
    const over = (o) => markOp(o, 'end', 12);
    it('the other takes the main place', () => {
        const s = settled(over(a), [b], 13);
        expect(s.op.id).toBe('b');
        expect(s.also).toEqual([]);
        expect(s.done.map((o) => o.id)).toEqual(['a']);
    });
    it('the one beside it just goes to the record', () => {
        const s = settled(a, [over(b)], 13);
        expect(s.op.id).toBe('a');
        expect(s.done.map((o) => o.id)).toEqual(['b']);
    });
    it('not on the turn it ended: a swipe can take that back', () => {
        const ended = afterBriefing(afterBriefing(afterBriefing(a, { report: { status: 'done' } }, 10), { report: { status: 'done' } }, 11), { report: { status: 'done' } }, 12);
        expect(ended.status).toBe('got away');
        expect(settled(ended, [b], 12).op.id).toBe('a');
        expect(settled(ended, [b], 13).op.id).toBe('b');
    });
    it('nothing else running: the ended one stays to be read', () => {
        expect(settled(over(a), [], 13).op.id).toBe('a');
    });
});

describe('who may start', () => {
    it('a side already on a job is not started again', () => {
        expect(repeatJob([a], 20, { side: 'Medina Syndicate', sideIds: new Set(['f_a']) })).toBe(true);
    });
    it('another side is', () => {
        expect(repeatJob([a], 20, { side: 'The Quiet Hand', sideIds: new Set(['f_b']) })).toBe(false);
    });
    it('the search for a rival skips sides already at work', () => {
        const factions = [{ id: 'm', name: 'Medina Syndicate' }, { id: 'q', name: 'Quiet Hand' }];
        const relations = [{ from: 'us', to: 'm', kind: 'enemy' }, { from: 'us', to: 'q', kind: 'enemy' }];
        const input = { factions, relations, mine: ['us'], texts: ['Medina Syndicate raid the docks.\n\nQuiet Hand ambush the convoy.'], members: new Map() };
        expect(rivalAtWork(input).who).toBe('Quiet Hand');
        expect(rivalAtWork({ ...input, texts: ['Medina Syndicate raid the docks.'], skip: ['m'] })).toBeNull();
    });
    it('in an encounter, only a group the latest chat shows on a job', () => {
        expect(shownAtWork(['Quiet Hand'], 'Across the yard the Quiet Hand began their raid.')).toBe(true);
        expect(shownAtWork(['Quiet Hand'], 'He had heard of the Quiet Hand.')).toBe(false);
        expect(shownAtWork(['Pale Choir'], 'The Pale Choir set an ambush at the ford.')).toBe(true);
    });
});
