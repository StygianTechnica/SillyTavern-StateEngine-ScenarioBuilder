// Assassins Inc: Enrique's job was marked "got away" with Delvin on Cyril's
// cameras, picking a display case. The slot it left went to an Omicron crew.
import { startOp, afterBriefing, stillInStory, isLive, reopenOp, reopenable } from '../src/ops/model.js';
import { readOpPlan } from '../src/ops/generate.js';

const PLAN = `LEADER: Delvin "Ice" Timmers | in the hall
AIM: Steal the perfume bottles
CREW: Nichiro Fukudo | lookout | hall
STEP: Pick the case
STEP: Bag the bottles
STEP: Get away with it the way they came
BREAK: 2`;
const read = readOpPlan(PLAN, 'Medina Syndicate');
const plan = { ...read, leader: { ...read.leader, objectId: 'delvin' }, crew: read.crew.map((c) => ({ ...c, objectId: 'nichiro' })) };
const begun = () => startOp(plan, 10, 'op1');
const atLastStep = () => afterBriefing(afterBriefing(begun(), { report: { status: 'done' } }, 10), { report: { status: 'done' } }, 11);
const onCamera = 'On the screens, he sees Delvin "Ice" Timmers stop in front of an ornate display case.';

describe('the last step of a job', () => {
    it('waits while the story has them', () => {
        const op = afterBriefing(atLastStep(), { report: { status: 'done' }, inStory: true }, 12);
        expect(isLive(op)).toBe(true);
        expect(op.status).toBe('running');
    });
    it('waits without running out of patience', () => {
        let op = atLastStep();
        for (let t = 12; t < 30; t++) op = afterBriefing(op, { inStory: true }, t);
        expect(op.status).toBe('running');
    });
    it('ends once they are out of it', () => {
        expect(afterBriefing(atLastStep(), { report: { status: 'done' } }, 12).status).toBe('got away');
    });
    it('leaves earlier steps to go on', () => {
        expect(afterBriefing(begun(), { report: { status: 'done' }, inStory: true }, 10).current).toBe(1);
    });
});

describe('still in the story', () => {
    const op = begun();
    it('in the scene, or named by the latest messages', () => {
        expect(stillInStory(op, { castIds: ['nichiro'] })).toBe(true);
        expect(stillInStory(op, { recent: onCamera })).toBe(true);
    });
    it('not named, or named getting away', () => {
        expect(stillInStory(op, { castIds: ['cyril'], recent: 'The hall was empty.' })).toBe(false);
        expect(stillInStory(op, { recent: 'Delvin slipped away through the tunnel.' })).toBe(false);
    });
    it('not someone already out of it', () => {
        const caught = { ...op, leader: { name: '' }, crew: [{ name: 'Nichiro Fukudo', objectId: 'nichiro', state: 'caught' }] };
        expect(stillInStory(caught, { castIds: ['nichiro'], recent: 'Nichiro glared.' })).toBe(false);
    });
    it('across genres', () => {
        const cult = { leader: { name: 'Morvath' }, crew: [] };
        expect(stillInStory(cult, { recent: 'Morvath raised the knife over the altar.' })).toBe(true);
        expect(stillInStory(cult, { recent: 'Morvath vanished in smoke.' })).toBe(false);
        expect(stillInStory({ leader: { name: 'Captain Oren' }, crew: [] }, { recent: 'The hull rang.' })).toBe(false);
    });
});

describe('putting a job back', () => {
    const away = () => afterBriefing(atLastStep(), { report: { status: 'done' } }, 12);
    it('runs again on its last step', () => {
        const op = reopenOp(away(), 20);
        expect(op).toMatchObject({ status: 'running', endedTurn: null, endText: '', current: 2 });
        expect(op.steps.map((s) => s.status)).toEqual(['done', 'done', 'current']);
        expect(isLive(op)).toBe(true);
    });
    it('only one that got away', () => {
        expect(reopenOp(begun(), 20)).toBeNull();
        expect(reopenOp({ ...away(), status: 'ended' }, 20)).toBeNull();
    });
    it('offers the newest, not long after', () => {
        const a = { id: 'a', status: 'got away', endedTurn: 10 };
        const b = { id: 'b', status: 'got away', endedTurn: 30 };
        const ended = { id: 'c', status: 'ended', endedTurn: 35 };
        expect(reopenable([a, b, ended], 40)?.id).toBe('b');
        expect(reopenable([a], 80)).toBeNull();
        expect(reopenable([ended], 40)).toBeNull();
    });
});
