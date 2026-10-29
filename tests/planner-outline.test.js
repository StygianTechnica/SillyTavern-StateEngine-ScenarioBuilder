import { SHAPES, shapeOf, actAt, targetAt, shapeCurve, tensionAim } from '../src/planner/shapes.js';
import {
    emptyGm, normalizeGm, setOutline, positionOf, currentAct, activeBeat, beatsOf, editBeat, lockBeat, removeBeat, addBeat, finishBeat,
    mergeArchivistTension, addOwnReading, tensionNow, duePasses, planSection, FIRST_OUTLINE_AFTER, startAt, replaceBeat,
} from '../src/planner/model.js';
import { buildOutlinePrompt, readOutline, buildCheckPrompt, readCheck, buildDayPrompt, buildBeatPrompt, readBeat } from '../src/planner/prompts.js';

const serial = shapeOf('adventure-serial');

const answer = {
    premise: 'Remus must choose between the god who claims him and the people who need him.',
    themes: ['debt', 'loyalty'],
    acts: [
        { title: 'The call', beats: [{ text: 'Graxx offers an alliance', status: 'done' }, { text: 'Elyon\'s priests demand Remus return', status: 'active' }] },
        { title: 'Episodes', beats: [{ text: 'A raid on the river villages' }, { text: 'The Pale Choir sends an envoy' }] },
        { title: 'The great danger', beats: [{ text: 'The death knights march on Redhaven' }] },
        { title: 'Homecoming', beats: [{ text: 'A reckoning with Elyon' }] },
    ],
    seeds: [{ text: 'A cracked bell in the chapel', payoff: 'A reckoning with Elyon' }],
};

function outlined() {
    const gm = emptyGm();
    gm.shape = 'adventure-serial';
    setOutline(gm, answer, { turn: 6, at: '2026-10-18T12:00:00Z' });
    return gm;
}

describe('story shapes', () => {
    it('every shape has acts sharing the whole story, with sane bands', () => {
        for (const s of SHAPES) {
            expect(s.acts.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 5);
            for (const a of s.acts) expect(a.band[0]).toBeLessThan(a.band[1]);
            expect(['threat', 'uncertainty', 'emotional']).toContain(s.lean);
        }
    });

    it('finds the act at a position and the band within it', () => {
        expect(actAt(serial, 0).index).toBe(0);
        expect(actAt(serial, 0.5).act.title).toBe('Episodes');
        expect(actAt(serial, 1).index).toBe(3);
        const rise = shapeOf('slow-burn');
        expect(targetAt(rise, 0.75).center).toBeGreaterThan(targetAt(rise, 0.71).center);
        const curve = shapeCurve(serial, 20);
        expect(curve).toHaveLength(21);
        for (const p of curve) { expect(p.min).toBeGreaterThanOrEqual(0); expect(p.max).toBeLessThanOrEqual(5); expect(p.min).toBeLessThanOrEqual(p.max); }
    });

    it('aims to build below the band, ease above it, and hold inside', () => {
        const thriller = shapeOf('thriller');
        const band = targetAt(thriller, 0.4);
        const low = tensionAim(thriller, 0.4, { threat: 1, uncertainty: 0.5, emotional: 1, overall: 0.8 });
        expect(low).toMatchObject({ word: 'build', lean: 'threat' });
        expect(tensionAim(thriller, 0.4, { threat: 5, uncertainty: 5, emotional: 5, overall: 5 }).word).toBe('ease');
        expect(tensionAim(thriller, 0.4, { overall: (band.min + band.max) / 2 }).word).toBe('hold');
        expect(tensionAim(thriller, 0.4, null)).toBeNull();
    });

    it('builds along another kind of pressure when the shape\'s own is already high', () => {
        const mystery = shapeOf('mystery');
        expect(tensionAim(mystery, 0.05, { threat: 0, uncertainty: 3.6, emotional: 0, overall: 1.2 })).toMatchObject({ word: 'build', lean: 'threat' });
    });

    it('wants a breather after too long at the top', () => {
        const romance = shapeOf('romance');
        const band = targetAt(romance, 0.7);
        const high = { overall: band.max, threat: 2, uncertainty: 2, emotional: band.max };
        expect(tensionAim(romance, 0.7, high, [high, high]).word).toBe('ease');
        expect(tensionAim(romance, 0.7, high, [{ overall: 1 }, high]).word).not.toBe('ease');
    });
});

describe('the outline', () => {
    it('takes an outline in with ids, one active beat and a position', () => {
        const gm = outlined();
        expect(beatsOf(gm.outline).map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
        expect(activeBeat(gm.outline).text).toBe('Elyon\'s priests demand Remus return');
        expect(currentAct(gm.outline).act.title).toBe('The call');
        expect(positionOf(gm.outline)).toBeCloseTo(1.5 / 6, 3);
        expect(gm.outline.seeds[0].text).toBe('A cracked bell in the chapel');
        expect(normalizeGm(JSON.parse(JSON.stringify(gm))).outline).toEqual(gm.outline);
    });

    it('a review keeps what is done and the user\'s words, and drops what it leaves out', () => {
        const gm = outlined();
        editBeat(gm, 'b4', 'The envoy is the Choir\'s high priestess in disguise');
        setOutline(gm, {
            acts: [
                { title: 'The call', beats: [{ id: 'b1', text: 'rewritten history!', status: 'pending' }, { id: 'b2', text: 'The priests arrive', status: 'done' }] },
                { title: 'Episodes', beats: [{ id: 'b4', text: 'planner tries to change it' }, { text: 'Niamh is wounded' }] },
                { title: 'The great danger', beats: [{ text: 'Siege' }] },
                { title: 'Homecoming', beats: [{ text: 'Peace, of a kind' }] },
            ],
        }, { turn: 20 });
        const beats = beatsOf(gm.outline);
        expect(beats.find((b) => b.id === 'b1')).toMatchObject({ text: 'Graxx offers an alliance', status: 'done' });
        expect(beats.find((b) => b.id === 'b2')).toMatchObject({ text: 'The priests arrive', status: 'done' });
        expect(beats.find((b) => b.id === 'b4')).toMatchObject({ text: 'The envoy is the Choir\'s high priestess in disguise', locked: true, by: 'user' });
        expect(beats.some((b) => b.id === 'b3')).toBe(false);
        expect(beats.find((b) => b.text === 'Niamh is wounded').id).toBe('b7');
        expect(gm.outline.premise).toBe(answer.premise);
        expect(activeBeat(gm.outline).act).toBeUndefined();
        expect(activeBeat(gm.outline).id).toBe('b4');
    });

    it('never loses done or locked beats the answer forgets', () => {
        const gm = outlined();
        lockBeat(gm, 'b6', true);
        setOutline(gm, { acts: [{ title: 'Only act', beats: [{ text: 'Something new' }] }] });
        const beats = beatsOf(gm.outline);
        expect(beats.map((b) => b.id)).toEqual(expect.arrayContaining(['b1', 'b6']));
        expect(beats[0].id).toBe('b1');
    });

    it('lets the user add, remove and finish beats', () => {
        const gm = outlined();
        const added = addBeat(gm, 'a2', 'A storm strands them at the ford');
        expect(added).toMatchObject({ locked: true, by: 'user', status: 'pending' });
        removeBeat(gm, 'b1');
        expect(beatsOf(gm.outline).some((b) => b.id === 'b1')).toBe(true);
        finishBeat(gm, 'b2');
        expect(activeBeat(gm.outline).id).toBe('b3');
        removeBeat(gm, 'b3');
        expect(activeBeat(gm.outline).id).toBe('b4');
    });
});

describe('tension readings', () => {
    it('merges Archivist\'s readings by message index and keeps the past through a rebuild', () => {
        const gm = emptyGm();
        expect(mergeArchivistTension(gm, [{ message_index: 10, threat: 1, uncertainty: 2, emotional: 3, overall: 2, reason: 'a' }, { message_index: 20, threat: 3, uncertainty: 3, emotional: 3, overall: 3, reason: 'b' }])).toBe(true);
        expect(mergeArchivistTension(gm, [{ message_index: 20, overall: 3, threat: 3, uncertainty: 3, emotional: 3, reason: 'b' }])).toBe(false);
        mergeArchivistTension(gm, [{ message_index: 30, overall: 4, reason: 'c' }]);
        expect(gm.tension.map((r) => r.index)).toEqual([10, 20, 30]);
        expect(tensionNow(gm).now).toMatchObject({ overall: 4, source: 'archivist' });
        expect(tensionNow(gm).recent.map((r) => r.index)).toEqual([10, 20]);
    });

    it('keeps the planner\'s own readings when there is no Archivist, and averages a missing overall', () => {
        const gm = emptyGm();
        expect(addOwnReading(gm, { threat: 3, uncertainty: 1, emotional: 2, reason: 'a standoff' }, { index: 7 })).toMatchObject({ overall: 2, source: 'planner', index: 7 });
        expect(addOwnReading(gm, { reason: 'nothing' })).toBeNull();
        mergeArchivistTension(gm, [{ message_index: 5, overall: 1 }]);
        expect(gm.tension.every((r) => r.source === 'archivist')).toBe(true);
    });
});

describe('outline cadence', () => {
    it('waits for a shape, then writes the first outline after a few replies', () => {
        const gm = emptyGm();
        expect(duePasses(gm, { day: 1, turn: 10 })).toEqual(['day']);
        gm.shape = 'mystery';
        expect(duePasses(gm, { day: 1, turn: FIRST_OUTLINE_AFTER - 1 })).toEqual(['day']);
        expect(duePasses(gm, { day: 1, turn: FIRST_OUTLINE_AFTER })).toEqual(['outline', 'day']);
    });

    it('reviews every so often, and after a compile except on Light', () => {
        const gm = outlined();
        gm.day = { day: 1, madeTurn: 6, moments: [], agendas: [], offscreen: [] };
        gm.counters.lastCheck = 'z';
        expect(duePasses(gm, { day: 1, turn: 7 })).toEqual([]);
        gm.counters.sinceOutline = 15;
        expect(duePasses(gm, { day: 1, turn: 8 })).toEqual(['outline']);
        expect(duePasses(gm, { day: 1, turn: 8, level: 'light' })).toEqual([]);
        expect(duePasses(gm, { day: 1, turn: 8, outlineEvery: 30 })).toEqual([]);
        gm.counters.sinceOutline = 0;
        gm.outlineWanted = true;
        expect(duePasses(gm, { day: 1, turn: 9 })).toEqual(['outline']);
        expect(duePasses(gm, { day: 1, turn: 9, level: 'light' })).toEqual([]);
    });
});

describe('the story in the plans', () => {
    it('the director\'s section carries the beat and the aim', () => {
        const gm = outlined();
        const text = planSection(gm, { aim: { word: 'build', lean: 'uncertainty', why: 'raise questions' }, story: { shape: 'Adventure serial', act: 'The call' } });
        expect(text).toContain('- Story: Adventure serial, in "The call" - the beat now: Elyon\'s priests demand Remus return');
        expect(text).toContain('- Aim: build (uncertainty) - raise questions. Bring it to the player character');
        expect(text).not.toContain('well short');
    });

    it('says plainly when the story is well short of its shape, and names the beat after', () => {
        const gm = outlined();
        const text = planSection(gm, { aim: { word: 'build', lean: 'threat', why: 'bring in danger', short: 1.5 }, story: { shape: 'Adventure serial', act: 'The great danger', next: 'The pass is closed' } });
        expect(text).toContain('(then: The pass is closed)');
        expect(text).toContain('well short of where "The great danger" wants it: this reply needs a real turn');
        const hold = planSection(gm, { aim: { word: 'hold', lean: 'threat', why: 'keep it there', short: 0 } });
        expect(hold).toContain('- Aim: hold (threat) - keep it there.');
        expect(hold).not.toContain('Bring it to the player character');
    });

    it('measures how far short a build is', () => {
        const thriller = shapeOf('thriller');
        const aim = tensionAim(thriller, 0.4, { threat: 1, uncertainty: 0.5, emotional: 1, overall: 0.8 });
        expect(aim.short).toBeCloseTo(targetAt(thriller, 0.4).min - 0.8, 1);
        expect(tensionAim(thriller, 0.4, { threat: 5, uncertainty: 5, emotional: 5, overall: 5 }).short).toBe(0);
    });

    it('the day prompt carries the story, and the check asks about the beat and the tension', () => {
        const day = buildDayPrompt({ dossier: '', story: { shape: 'Mystery', act: 'Clues and lies', beat: 'A witness lies', next: 'The lie unravels', aim: { word: 'hold', lean: 'uncertainty', why: 'keep it there' } } }).prompt;
        expect(day).toContain('WHERE THE STORY IS GOING');
        expect(day).toContain('The beat now: A witness lies');
        expect(day).toContain('Tension: hold (uncertainty)');
        const check = buildCheckPrompt({ moments: [], beat: 'A witness lies', askTension: true }).prompt;
        expect(check).toContain('"beat_done"');
        expect(check).toContain('"tension"');
        expect(buildCheckPrompt({ moments: [] }).prompt).not.toContain('"tension"');
        expect(readCheck({ beat_done: true, tension: { threat: 9, uncertainty: '2', emotional: null, reason: 'a lie' } }))
            .toMatchObject({ beatDone: true, tension: { threat: 5, uncertainty: 2, emotional: null, reason: 'a lie' } });
        expect(readCheck({ tension: { reason: 'x' } }).tension).toBeNull();
    });
});

describe('the outline pass', () => {
    it('writes from the shape, reviews with ids, and rewrites keeping done and locked beats', () => {
        const write = buildOutlinePrompt({ dossier: 'THE SETTING', userName: 'Remus', shape: serial, outline: null, tension: { now: { overall: 2.1, reason: 'a tense truce' } }, motifs: ['a cracked bell'] }).prompt;
        expect(write).toContain('THE STORY\'S SHAPE: Adventure serial');
        expect(write).toContain('- Episodes (55%; 1.5-4)');
        expect(write).toContain('overall 2.1');
        expect(write).toContain('a cracked bell');
        expect(write).toContain('WRITE THE OUTLINE');
        const gm = outlined();
        lockBeat(gm, 'b5', true);
        const review = buildOutlinePrompt({ dossier: '', shape: serial, outline: gm.outline }).prompt;
        expect(review).toContain('REVIEW THE OUTLINE');
        expect(review).toContain('- [b1] Graxx offers an alliance - done');
        expect(review).toContain('[locked]');
        const rewrite = buildOutlinePrompt({ dossier: '', shape: serial, outline: gm.outline, rewrite: true }).prompt;
        expect(rewrite).toContain('START THE OUTLINE OVER');
        expect(rewrite).toContain('[b1]');
        expect(rewrite).toContain('[b5]');
        expect(rewrite).not.toContain('[b3]');
    });

    it('reads an outline, dropping empty acts and bad statuses', () => {
        const out = readOutline({ premise: 'p', acts: [{ title: 'A', beats: [{ id: '[b2]', text: 'x', status: 'DONE' }, { text: 'y', status: 'weird' }] }, { title: 'empty', beats: [] }] });
        expect(out.acts).toEqual([{ title: 'A', beats: [{ id: 'b2', text: 'x', ties: [], status: 'done' }, { id: '', text: 'y', ties: [], status: 'pending' }] }]);
        expect(readOutline({ acts: [] })).toBeNull();
    });
});

describe('joining a story already under way', () => {
    it('keeps the user\'s hint on where the story is', () => {
        expect(emptyGm().join).toEqual({ act: -1, note: '' });
        expect(normalizeGm({ join: { act: 2, note: '  They fled the city.  ' } }).join).toEqual({ act: 2, note: 'They fled the city.' });
        expect(normalizeGm({ join: { act: -5 } }).join.act).toBe(-1);
    });

    it('starts the outline at the chosen chapter: earlier beats done, the first beat there active', () => {
        const gm = outlined();
        startAt(gm, 1);
        const beats = beatsOf(gm.outline);
        expect(beats.filter((b) => b.id === 'b1' || b.id === 'b2').every((b) => b.status === 'done')).toBe(true);
        expect(activeBeat(gm.outline).id).toBe('b3');
        expect(currentAct(gm.outline).act.title).toBe('Episodes');
        expect(positionOf(gm.outline)).toBeCloseTo(2.5 / 6, 3);
        startAt(gm, 99);
        expect(activeBeat(gm.outline).id).toBe('b3');
    });

    it('moves an active beat past the start chapter back to pending', () => {
        const gm = outlined();
        for (const b of beatsOf(gm.outline)) b.status = 'pending';
        beatsOf(gm.outline).find((b) => b.id === 'b6').status = 'active';
        startAt(gm, 2);
        expect(activeBeat(gm.outline).id).toBe('b5');
        expect(beatsOf(gm.outline).find((b) => b.id === 'b6').status).toBe('pending');
    });

    it('tells the outline pass the story is in progress, with the story so far and the chapter', () => {
        const base = { dossier: 'THE SETTING', shape: serial, outline: null };
        const fresh = buildOutlinePrompt(base);
        expect(fresh.system).not.toContain('already under way');
        expect(fresh.prompt).not.toContain('TAKING OVER');
        const judged = buildOutlinePrompt({ ...base, underWay: true, storySoFar: 'Summary: Remus fled Elyon\'s temple.' });
        expect(judged.system).toContain('already under way');
        expect(judged.prompt).toContain('THE STORY SO FAR');
        expect(judged.prompt).toContain('Remus fled');
        expect(judged.prompt.indexOf('THE STORY SO FAR')).toBeLessThan(judged.prompt.indexOf('THE LATEST CHAT'));
        expect(judged.prompt).toContain('Judge from the story so far');
        const placed = buildOutlinePrompt({ ...base, startAct: { index: 1, title: 'Episodes' } });
        expect(placed.prompt).toContain('the story is now in act 2, "Episodes"');
        const review = buildOutlinePrompt({ ...base, outline: outlined().outline, underWay: true });
        expect(review.prompt).not.toContain('TAKING OVER');
    });
});

describe('regenerating', () => {
    it('a fresh regenerate drops the user\'s locked beats still to come, but never what is done', () => {
        const gm = outlined();
        editBeat(gm, 'b4', 'My envoy beat');
        setOutline(gm, { acts: [{ title: 'The call', beats: [{ text: 'New opening' }] }, { title: 'Episodes', beats: [{ id: 'b4', text: 'planner words' }] }] }, { keepLocked: false });
        const beats = beatsOf(gm.outline);
        expect(beats.find((b) => b.id === 'b1')).toMatchObject({ text: 'Graxx offers an alliance', status: 'done' });
        expect(beats.some((b) => b.text === 'My envoy beat')).toBe(false);
        expect(beats.find((b) => b.text === 'planner words')).toMatchObject({ locked: false, by: 'planner' });
        expect(beats.find((b) => b.text === 'planner words').id).not.toBe('b4');
    });

    it('a regenerated beat takes the planner\'s words and is no longer locked; a done beat is never replaced', () => {
        const gm = outlined();
        editBeat(gm, 'b3', 'mine');
        expect(replaceBeat(gm, 'b3', { text: ' A flood cuts the road ', ties: ['River villages'] })).toBe(true);
        expect(beatsOf(gm.outline).find((b) => b.id === 'b3')).toMatchObject({ text: 'A flood cuts the road', ties: ['River villages'], locked: false, by: 'planner' });
        expect(replaceBeat(gm, 'b1', { text: 'rewrite history' })).toBe(false);
        expect(replaceBeat(gm, 'b3', { text: '  ' })).toBe(false);
    });

    it('the beat prompt marks the beat, asks for a different idea and carries the user\'s steer', () => {
        const gm = outlined();
        const { prompt } = buildBeatPrompt({ dossier: 'THE SETTING', shape: serial, outline: gm.outline, beatId: 'b3', wish: 'more about Niamh' });
        expect(prompt).toContain('>> A raid on the river villages - pending');
        expect(prompt).toContain('- Graxx offers an alliance - done');
        expect(prompt).toContain('Not a rewording of "A raid on the river villages"');
        expect(prompt).toContain('The user wants: more about Niamh');
        expect(buildBeatPrompt({ dossier: '', shape: serial, outline: gm.outline, beatId: 'b3' }).prompt).not.toContain('The user wants');
        expect(readBeat({ text: 'Niamh is wounded', ties: ['Niamh', 3] })).toEqual({ text: 'Niamh is wounded', ties: ['Niamh'] });
        expect(readBeat({ ties: [] })).toBeNull();
    });

    it('the rewrite prompt keeps locked beats only when asked, and carries the steer', () => {
        const gm = outlined();
        lockBeat(gm, 'b5', true);
        const keep = buildOutlinePrompt({ dossier: '', shape: serial, outline: gm.outline, rewrite: true, wish: 'more intrigue' }).prompt;
        expect(keep).toContain('[b5]');
        expect(keep).toContain('- more intrigue');
        const fresh = buildOutlinePrompt({ dossier: '', shape: serial, outline: gm.outline, rewrite: true, keepLocked: false }).prompt;
        expect(fresh).not.toContain('[b5]');
        expect(fresh).toContain('[b1]');
        expect(fresh).not.toContain('WHAT THE USER WANTS');
    });
});
