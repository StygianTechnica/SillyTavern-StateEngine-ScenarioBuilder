// Assassins Inc: Cyril, who cannot stand Doc and Galice, shook Adam's hand
// to be rid of their training - and was handed straight back to them. The
// mood read after each reply said "Playful"; the day plan, made before the
// beat turned to Adam's match between Cyril and Inji, kept steering to Doc
// and Galice. Now the user's own post tells how Cyril feels, and a new beat
// re-plans the rest of the day.
import { postMood, noteMood, emptyCompany, companyLines } from '../src/director/company.js';
import { duePasses, planBehindBeat, planSection, setDayPlan, emptyGm } from '../src/planner/model.js';

const present = [{ id: 'adam', name: 'Adam Miller' }, { id: 'doc', name: 'Doc' }, { id: 'galice', name: 'Galice Buckar' }];
const p363 = "Cyril took a deep breath.  He didn't care for Galice's interest in him.  He'd shot her a dirty look when she'd started suggesting she wanted anything to do with any of it. \n\nFinally he looked to Adam.  \"So does this satisfy you, or are we still at odds?  You want my talents on your team and I'm willing to do it, but no more of this stupid training.\"";
const p367 = 'Cyril\'s brows knit.  He didn\'t understand why they had to take charge of everything.  He was perfectly capable of shopping for himself.  He rolled his eyes again and huffed slightly.  It would have been more fun if Inji had been there.\n\n"Yeah yeah, just put me on payroll.  I know how to shop."  Cyril grumbled.\n\nHe then looked to Adam sternly.  "What do you want from me next?"';
const p349 = 'He found himself admiring Inji\'s figure as he withdrew from the smoke filled corridor.\n\nCyril moved up beside him.  "Got it."  He said.  He smirked smugly.';

describe('how the player character feels, from the post', () => {
    it('sour, naming the one it is about', () => {
        expect(postMood(p363, present)).toEqual({ kind: 'sour', named: ['galice'] });
        expect(postMood(p367, present)).toEqual({ kind: 'sour', named: [] });
    });

    it('warm, or nothing - and never from what is said aloud', () => {
        expect(postMood(p349, [{ id: 'inji', name: 'Inji Miyama' }]).kind).toBe('warm');
        expect(postMood('Cyril nodded and followed.', present).kind).toBe('');
        expect(postMood('"I hate waiting," Cyril said with a grin.', present).kind).toBe('warm');
    });

    it('the post wins over a mood read that says otherwise', () => {
        let c = emptyCompany();
        c = noteMood(c, { key: 'a', turn: 1, mood: 'Playful', present, post: p363 });
        c = noteMood(c, { key: 'b', turn: 2, mood: 'Playful', present, post: p367 });
        expect(c.samples.map((s) => s.kind)).toEqual(['sour', 'sour']);
        expect(companyLines(c, { turn: 2, player: 'Cyril' })).toContain('Less of: Galice Buckar');
        // Nothing in the post: the mood read stands.
        c = noteMood(c, { key: 'c', turn: 3, mood: 'Happy', present, post: 'Cyril followed.' });
        expect(c.samples[2].kind).toBe('warm');
    });
});

describe('a new beat re-plans the day', () => {
    const gmAt = (beat) => {
        const gm = emptyGm();
        gm.outline = { acts: [{ id: 'a1', title: 'Episodes', beats: [{ id: 'b3', text: 'The drill.', status: beat === 'b3' ? 'active' : 'done', ties: [] }, { id: 'b17', text: 'Adam arranges a match between Cyril and Inji.', status: beat === 'b17' ? 'active' : 'pending', ties: ['Inji Miyama'] }] }] };
        return gm;
    };

    it('a plan made for the earlier beat is due again, and its moments are not shown', () => {
        const gm = gmAt('b3');
        setDayPlan(gm, { moments: [{ text: 'Adam reassesses strategies with Doc and Galice.' }] }, { day: 5, turn: 10 });
        expect(gm.day.beatId).toBe('b3');
        expect(planBehindBeat(gm)).toBe(false);
        expect(duePasses(gm, { day: 5, turn: 11 })).not.toContain('day');
        gm.outline.acts[0].beats[0].status = 'done';
        gm.outline.acts[0].beats[1].status = 'active';
        expect(planBehindBeat(gm)).toBe(true);
        expect(duePasses(gm, { day: 5, turn: 11 })).toContain('day');
        const text = planSection(gm);
        expect(text).not.toContain('Doc and Galice');
        expect(text).toContain('the beat now: Adam arranges a match between Cyril and Inji.');
        expect(text).toContain('the player character asks what comes next');
    });
});
