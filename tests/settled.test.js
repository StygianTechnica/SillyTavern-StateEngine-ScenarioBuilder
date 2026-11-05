// Assassins Inc: the Novakorp run was only a training simulation, and Adam
// agreed Cyril would not be sent against Omicron Innovations - both lost
// once the chat that settled them scrolled away: Adam spoke of the
// "Novakorp intel" and asked again for an Omicron job. And when Cyril
// asked what came next, the beat - Adam's match with Inji - never came.
import { emptyGm, normalizeGm, addSettled, removeSettled, settledSection, SETTLED_LIMIT, unsettledReason, keptSettled, settledNow, retireSettled, SETTLED_RETIRE } from '../src/planner/model.js';
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
        expect(note).toContain('Settled and done with');
        expect(note).toContain('brings it up again unless someone else does');
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
        expect(note).toContain("Cyril asks what comes next - the answer is where the story goes now: A mock combat is arranged between Cyril and Inji to assess Cyril's skills. Those it names are the ones in it, in the parts it gives them; no one else takes their place and no one it names is left out. Bring it in this reply.");
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

describe('what the director may settle, and what the note carries', () => {
    // Assassins Inc's list, filled by the director: four lines more about
    // the simulation, scene-bound ones, and one still open - every reply,
    // and Adam asked for a report on the trial.
    const d = (id, text) => ({ id, text, source: 'director', at: id });
    const list = [
        { id: 'u0', text: SIM, source: 'user', at: 'a' },
        { id: 'u1', text: OMI, source: 'user', at: 'b' },
        d('d2', "This trial is to assess Cyril's skills in a more direct way."),
        d('d3', "This is a simulation trial to gauge Cyril's abilities; the outcome doesn't directly affect his mission or standing."),
        d('d5', 'Cyril has an intimate connection to this terminal, allowing seamless access for diagnostic purposes.'),
        d('d6', 'Cyril is a valuable asset to White Cerberus and his safety remains their top priority.'),
        d('d7', "Adam and Galice's intentions for the simulation trial remain unclear"),
        d('d8', 'Adam vouched for this little meet-up; the group agrees to proceed'),
        d('d11', 'The night Cyril, Inji and Vex spent together is private and for their enjoyment, not surveillance'),
    ];

    it('turns away lines that point at the scene or are still open', () => {
        expect(unsettledReason(list[2].text)).toMatch(/points/);
        expect(unsettledReason(list[4].text)).toMatch(/points/);
        expect(unsettledReason(list[6].text)).toMatch(/open/);
        expect(unsettledReason(SIM)).toBe('');
        expect(unsettledReason('Adam agreed that Cyril stays out of it')).toBe('');
        expect(keptSettled(list).map((x) => x.id)).toEqual(['u0', 'u1', 'd6', 'd11']);
        const gm = emptyGm();
        expect(addSettled(gm, { id: 'x', text: list[6].text, source: 'director' })).toBeNull();
        expect(addSettled(gm, { id: 'y', text: list[6].text })).not.toBeNull();
        expect(settledSection({ settled: list })).not.toContain('this terminal');
    });

    it("sends only what the latest messages touch, the user's too", () => {
        // A name in the line is enough; Novakorp stays out until it comes up.
        expect(settledNow(list, { recentText: 'Adam waved them into his office.', skipWords: ['Cyril'] })).toEqual([OMI]);
        expect(settledNow(list, { recentText: 'Adam wanted the Novakorp report.', skipWords: ['Cyril'] })).toEqual([SIM, OMI]);
        expect(settledNow(list, { recentText: 'Galice smirked: "Spent the night with Inji and Vex, did we? Private, is it?"', skipWords: ['Cyril'] })).toEqual([list[8].text]);
        // The player's name alone is not touching it.
        expect(settledNow(list, { recentText: 'Cyril, Cyril, Cyril.', skipWords: ['Cyril'] })).toEqual([]);
    });
});

describe('settled lines retire on their own', () => {
    const d = (id, text, touched = null) => ({ id, text, source: 'director', at: id, touched });
    it("the director's go after a long stretch untouched; the user's never", () => {
        const gm = { settled: [{ id: 'u', text: SIM, source: 'user', at: 'a' }, d('old', 'Bartin Medina owes Cyril a favour', 10), d('fresh', 'The night together stays private', null), d('stale', 'Adam vouched for this little meet-up', 50)] };
        // First pass: the scene-bound one goes, the unseen one starts its count.
        let r = retireSettled(gm, 60);
        expect(r.retired).toEqual(['Bartin Medina owes Cyril a favour', 'Adam vouched for this little meet-up']);
        expect(gm.settled.find((s) => s.id === 'fresh').touched).toBe(60);
        // Touched again, it counts from then.
        retireSettled(gm, 60 + SETTLED_RETIRE, ['fresh']);
        expect(gm.settled.map((s) => s.id)).toEqual(['u', 'fresh']);
        r = retireSettled(gm, 61 + 2 * SETTLED_RETIRE);
        expect(r.retired).toEqual(['The night together stays private']);
        expect(gm.settled.map((s) => s.id)).toEqual(['u']);
        expect(retireSettled(gm, 9999).changed).toBe(false);
    });

    it('a new one from the director starts counting from its reply', () => {
        const gm = emptyGm();
        expect(addSettled(gm, { id: 'n', text: 'Bartin Medina owes Cyril a favour', source: 'director', turn: 7 }).touched).toBe(7);
        expect(normalizeGm(JSON.parse(JSON.stringify(gm))).settled[0].touched).toBe(7);
    });
});
