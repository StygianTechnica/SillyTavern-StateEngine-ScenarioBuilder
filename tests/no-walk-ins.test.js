// Assassins Inc: a locked beat wanted Zane, and after three replies of waiting
// he was walked in on Cyril and Inji in Inji's quarters. Taken out by hand, he
// was due back as soon as the three-reply hold ran out.
import { privateMoment, noteOutByHand, takenOutHere, tieTakenOut, elsewhereEntering } from '../src/director/whereabouts.js';
import { planSection, emptyGm } from '../src/planner/model.js';

const close = ['She kissed him.', 'He moved on.', 'Their lips met again.', 'He held her in his arms.'];

describe('a private moment', () => {
    it('the real scene', () => {
        const recent = ['Reluctantly, Cyril released his hold on Inji.', 'his touch light and affectionate.', 'His words were suggestive and not terribly subtle.', "Inji's gaze drifts down to Cyril's lips."];
        expect(privateMoment({ people: 2, recent })).toBe(true);
    });
    it('takes two people', () => {
        expect(privateMoment({ people: 3, recent: close })).toBe(false);
        expect(privateMoment({ people: 1, recent: close })).toBe(false);
    });
    it('one kiss in passing is not one', () => {
        expect(privateMoment({ people: 2, recent: ['She kissed him.', 'They loaded the truck.', 'The radio crackled.', 'He drove.'] })).toBe(false);
    });
    it('is over once it is over', () => {
        expect(privateMoment({ people: 2, recent: [...close, 'He dressed.', 'They left.', 'The street was empty.', 'A car passed.'] })).toBe(false);
    });
    it('across genres', () => {
        expect(privateMoment({ people: 2, recent: ['The knight drew her into bed.', 'Their kisses grew slow.'] })).toBe(true);
        expect(privateMoment({ people: 2, recent: ['The reactor hummed.', 'Dana checked the seals.'] })).toBe(false);
    });
});

describe('taken out by hand', () => {
    const list = noteOutByHand([], { out: [{ id: 'z', name: 'Zane' }], place: 'quarters' });
    it('is remembered at that place only', () => {
        expect(takenOutHere(list, 'quarters').map((e) => e.id)).toEqual(['z']);
        expect(takenOutHere(list, 'alley')).toEqual([]);
    });
    it('put back by hand, it is forgotten', () => {
        expect(noteOutByHand(list, { back: ['z'], place: 'quarters' })).toEqual([]);
    });
    it('taken out again is one entry, at the new place', () => {
        expect(noteOutByHand(list, { out: [{ id: 'z', name: 'Zane' }], place: 'alley' })).toEqual([{ id: 'z', name: 'Zane', place: 'alley' }]);
    });
    it('a beat naming them does not count', () => {
        const out = takenOutHere(list, 'quarters');
        expect(tieTakenOut('Zane', out)).toBe(true);
        expect(tieTakenOut('Enrique', out)).toBe(false);
        expect(tieTakenOut('Zan', out)).toBe(false);
        expect(tieTakenOut('Maelis', [{ id: 'm', name: 'Maelis Vane' }])).toBe(true);
    });
});

describe('what the game master can do about it', () => {
    const zane = { id: 'z', name: 'Zane' };
    const inji = { id: 'i', name: 'Inji' };
    const keep = (userPost) => elsewhereEntering(['Zane'], { characters: [zane, inji], elsewhere: [zane], castIds: ['i'], userPost, namedIn: (t, list) => list.filter((c) => t.includes(c.name)), namesOf: (c) => [c.name] });
    it('cannot walk them in', () => {
        expect(keep('He smiled at Inji.')).toEqual(['Zane']);
    });
    it('being spoken of is not enough', () => {
        expect(keep('He wondered what Zane was doing.')).toEqual(['Zane']);
    });
    it("the player's own narration can", () => {
        expect(keep('Zane walked in through the door.')).toEqual([]);
    });
});

describe('the plan during one', () => {
    const gm = { ...emptyGm(), outline: { acts: [{ title: 'One', beats: [{ id: 'b', status: 'active', text: 'Cyril, Inji and Zane are ambushed.', ties: ['Zane'] }] }] } };
    it('holds the beat back', () => {
        const text = planSection(gm, { privateNow: true });
        expect(text).toContain('A private moment between two people');
        expect(text).not.toContain('ambushed');
        expect(text).not.toContain('Who is in it');
    });
    it('otherwise goes on as before', () => {
        const text = planSection(gm, {});
        expect(text).toContain('ambushed');
        expect(text).not.toContain('A private moment');
    });
});
