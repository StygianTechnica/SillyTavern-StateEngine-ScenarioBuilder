// Assassins Inc: the beat is "Adam assigns Cyril and Inji to stop Enrique's
// operation, with Zane as a partner", and Cyril asked "Are you sending me
// in there?" - but the director's briefing was Cyril's own post written
// back, the note in the chat said nothing of the beat, and Adam sent
// Galice and Vex.
import { asksWhatNext, buildNow } from '../src/guidance/build.js';
import { withoutEcho } from '../src/director/prompt.js';

const post = 'Cyril was intrigued at Inji\'s suggestion.  The man was not an elite agent for being worthless.  He surely knew plenty of people.  That charm of him probably worked wonders too.\n\nCyril breathed in, brushing his long black hair away from his pale face.  "So who\'s on the ground to stop the heist directly?  Are you sending me in there?  It might be a good opportunity for me to actually do something outside the training room."';

describe('the player asks who is in it', () => {
    it('is asking what comes next', () => {
        expect(asksWhatNext(post)).toBe(true);
        expect(asksWhatNext('"Who is going in on the job?"')).toBe(true);
        expect(asksWhatNext('"Am I part of the team?"')).toBe(true);
        expect(asksWhatNext('"What\'s my role in this?"')).toBe(true);
        expect(asksWhatNext('"Who are you?"')).toBe(false);
        expect(asksWhatNext('"Is she going to be okay?"')).toBe(false);
        expect(asksWhatNext('Cyril sends a message to Zane.')).toBe(false);
    });

    it('is answered with the beat, its people in their parts', () => {
        const note = buildNow({ cast: [{ name: 'Cyril', player: true }], next: 'Adam assigns Cyril and Inji to stop Enrique\'s operation, with Zane as a partner.' });
        expect(note).toContain('the answer is where the story goes now: Adam assigns Cyril and Inji');
        expect(note).toContain('no one else takes their place and no one it names is left out');
    });
});

describe('a briefing that writes the player\'s post back', () => {
    it('loses what it copied, and keeps its own', () => {
        const briefing = 'The man was not an elite agent for being worthless. He surely knew plenty of people. That charm of him probably worked wonders too.\n\nAdam\'s words hung in the air as he awaited any further objections.';
        expect(withoutEcho(briefing, post)).toBe('Adam\'s words hung in the air as he awaited any further objections.');
    });

    it('keeps a briefing that only shares a few words with it', () => {
        const briefing = 'SCENE | Adam\'s office\nAdam hands out the assignments: Cyril and Inji go in, with Zane as a partner.';
        expect(withoutEcho(briefing, post)).toBe(briefing);
        expect(withoutEcho(briefing, '')).toBe(briefing);
    });
});
