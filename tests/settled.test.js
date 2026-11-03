// Assassins Inc: the Novakorp run was only a training simulation, and Adam
// agreed Cyril would not be sent against Omicron Innovations - both lost
// once the chat that settled them scrolled away: Adam spoke of the
// "Novakorp intel" and asked again for an Omicron job. And when Cyril
// asked what came next, the beat - Adam's match with Inji - never came.
import { emptyGm, normalizeGm, addSettled, removeSettled, settledSection, SETTLED_LIMIT } from '../src/planner/model.js';
import { buildNow, asksWhatNext } from '../src/guidance/build.js';
import { parseDirectorNote } from '../src/director/prompt.js';
import { buildDayPrompt } from '../src/planner/prompts.js';
import { noteMood, emptyCompany, normalizeCompany } from '../src/director/company.js';

const SIM = 'The Novakorp run was only a training simulation - nothing real was taken';
const OMI = 'Adam agreed Cyril will not be sent against Omicron Innovations';

describe('what the story has settled', () => {
    it('kept, once each, and taken back', () => {
        const gm = emptyGm();
        expect(addSettled(gm, { id: 's1', text: SIM })).toMatchObject({ text: SIM, source: 'user' });
        expect(addSettled(gm, { id: 's2', text: SIM })).toBeNull();
        addSettled(gm, { id: 's3', text: OMI, source: 'director' });
        expect(normalizeGm(JSON.parse(JSON.stringify(gm))).settled.map((x) => x.id)).toEqual(['s1', 's3']);
        expect(settledSection(gm)).toContain(`- ${OMI}`);
        expect(removeSettled(gm, 's1')).toBe(true);
        expect(settledSection(emptyGm())).toBe('');
    });

    it("a full list lets the director's go before the user's", () => {
        const gm = emptyGm();
        addSettled(gm, { id: 'u', text: 'The user said this' });
        const words = ['harbor', 'dragon', 'violin', 'glacier', 'lantern', 'meteor', 'orchid', 'quarry', 'saddle', 'tundra', 'walnut', 'zephyr', 'basalt'];
        for (let i = 0; i < SETTLED_LIMIT; i++) addSettled(gm, { id: `d${i}`, text: `${words[i]} ${words[i]}ward`, source: 'director' });
        expect(gm.settled).toHaveLength(SETTLED_LIMIT);
        expect(gm.settled[0].id).toBe('u');
    });

    it('the director notes one with a SETTLED line', () => {
        const out = parseDirectorNote(`SUMMARY: x\nDIRECTION: y\nSETTLED | ${OMI}\nSET | Adam | a match | tomorrow`);
        expect(out.settled).toEqual([OMI]);
        expect(out.sets).toHaveLength(1);
        expect(parseDirectorNote('SETTLED | <what is now true or agreed, and who agreed it>').settled).toEqual([]);
    });

    it('the day plan keeps to it', () => {
        const { prompt } = buildDayPrompt({ userName: 'Cyril', messages: [], settled: [SIM, OMI] });
        expect(prompt).toContain(`SETTLED IN THE STORY`);
        expect(prompt).toContain(`- ${SIM}`);
    });
});

describe('the note for this reply', () => {
    const cast = [{ name: 'Cyril', player: true }, { name: 'Adam Miller' }];

    it('carries what is settled, every reply', () => {
        const note = buildNow({ cast, settled: [SIM, OMI] });
        expect(note).toContain('Keep to what the story has settled');
        expect(note).toContain(`${SIM}; ${OMI}.`);
        expect(buildNow({ cast })).toBe('');
    });

    it('answers "what next?" with the beat now', () => {
        expect(asksWhatNext('He then looked to Adam sternly.  "What do you want from me next?"')).toBe(true);
        expect(asksWhatNext('"So, what now?" Cyril asked.')).toBe(true);
        expect(asksWhatNext("What's the plan?")).toBe(true);
        expect(asksWhatNext('"What job do you have for me?"')).toBe(true);
        expect(asksWhatNext('Cyril wondered what Inji was thinking.')).toBe(false);
        expect(asksWhatNext('"What is that thing?"')).toBe(false);
        const note = buildNow({ cast, next: "A mock combat is arranged between Cyril and Inji to assess Cyril's skills." });
        expect(note).toContain("Cyril asks what comes next - the answer is where the story goes now: A mock combat is arranged between Cyril and Inji to assess Cyril's skills. Bring it in this reply.");
    });
});

describe('one mood sample per reply, whatever the swipes', () => {
    it('a swipe replaces the sample, and old duplicates fold on load', () => {
        const key = (when) => `Assassins Inc - 2026-10-25@00h05m51s894ms#368@${when}`;
        const present = [{ id: 'adam', name: 'Adam Miller' }];
        let c = emptyCompany();
        c = noteMood(c, { key: key('2026-11-03T22:40:00Z'), turn: 1, mood: 'Angry', present });
        c = noteMood(c, { key: key('2026-11-03T22:41:00Z'), turn: 2, mood: 'Angry', present });
        expect(c.samples).toHaveLength(1);
        const dup = { samples: [1, 2, 3].map((i) => ({ key: key(`t${i}`), turn: i, kind: 'sour', mood: 'x', present, named: [] })), choices: {} };
        expect(normalizeCompany(dup).samples.map((s) => s.turn)).toEqual([3]);
    });
});
