// Standing from the story (src/state/standing-model.js). Assassins Inc:
// Doc and Galice jumped to one wild theory about Cyril's implant after
// another and were laughed off - yet the others still hung on their word.
import { markIn, scornIn, standingMarks, addMarks, openPattern, openPatterns, moveStanding, dismissPattern, standingText, sidelinedText, normalizeStanding, levelWord } from '../src/state/standing-model.js';
import { buildCast } from '../src/guidance/build.js';

const doc = { id: 'doc', name: 'Doc', aliases: [], gender: 'f' };
const galice = { id: 'gal', name: 'Galice Buckar', aliases: ['Galice'], gender: 'f' };
const inji = { id: 'inj', name: 'Inji Miyama', aliases: ['Inji'], gender: 'm' };
const cyril = { id: 'cyr', name: 'Cyril', aliases: [], gender: 'm', player: true };
const people = [doc, galice, inji, cyril];

describe('what the story says someone did', () => {
    it('reads being shown wrong, conduct, and the other way - across genres', () => {
        expect(markIn("Cyril laughed off Doc's theory about the implant.", doc)).toMatchObject({ sign: -1, kind: 'shown wrong' });
        expect(markIn("Doc's diagnosis turned out to be completely wrong.", doc)).toMatchObject({ sign: -1 });
        expect(markIn('Maester Oren jumped to conclusions about the plague again.', { name: 'Maester Oren', aliases: ['Oren'] })).toMatchObject({ sign: -1 });
        expect(markIn('Lieutenant Vasq lost her temper and struck the ensign.', { name: 'Lieutenant Vasq', aliases: ['Vasq'] })).toMatchObject({ sign: -1, kind: 'lashing out' });
        expect(markIn('Detective Hale botched the stakeout.', { name: 'Detective Hale', aliases: ['Hale'] })).toMatchObject({ kind: 'a botched job' });
        expect(markIn("Ser Brannoc's hunch proved right: the bridge was mined.", { name: 'Ser Brannoc', aliases: ['Brannoc'] })).toMatchObject({ sign: 1, kind: 'proven right' });
        expect(markIn('Galice apologized to the team.', galice)).toMatchObject({ sign: 1, kind: 'made amends' });
    });
    it('not plans, fears, someone else, or a saved bother', () => {
        expect(markIn('Doc might be wrong about it.', doc)).toBeNull();
        expect(markIn("Doc laughed off Galice's theory.", doc, { others: ['Galice'] })).toBeNull();
        expect(markIn('Zane saved Cyril the trouble of calling.', { name: 'Zane', aliases: [] })).toBeNull();
        expect(markIn('Doc was not wrong.', doc)).toMatchObject({ sign: 1 });
    });
    it('reads the scorn in the user\'s posts - lists of names and her / she', () => {
        expect(scornIn("It wasn't the first time Doc or Galice sprang to ridiculous conclusions.", people, { post: true }).map((x) => x.id).sort()).toEqual(['doc', 'gal']);
        expect(scornIn('Doc kept talking. She was a stupid woman who made ridiculous assumptions.', people, { post: true }).map((x) => x.id)).toEqual(['doc']);
        // "He" in the user's post is Cyril, not the last man named.
        expect(scornIn('Inji left. He didn\'t want to look stupid.', people, { post: true })).toEqual([]);
        expect(scornIn('"You\'re an idiot," Cyril said.', people, { speech: false, post: true })).toEqual([]);
        expect(scornIn('Was Doc insane?', people, { post: true })).toEqual([]);
    });
});

describe('a pattern, offered and decided', () => {
    const items = [
        { key: 'm1', text: "Cyril laughed off Doc's theory about the implant.", witnesses: ['inj', 'gal'] },
        { key: 'p2', text: 'It wasn\'t the first time Doc sprang to ridiculous conclusions.', witnesses: ['inj'], post: true },
        { key: 'm3', text: 'Doc apologized for the mix-up.', witnesses: [] },
        { key: 'm4', text: "Doc's diagnosis was wrong again.", witnesses: ['adam'] },
    ];
    it('adds up, is offered once, and moves a step when the user says so', () => {
        const { found, seen } = standingMarks(items, { people });
        expect(found.doc).toHaveLength(4);
        let s = addMarks({}, found);
        expect(standingMarks(items, { people, seen }).found).toEqual({});
        const pattern = openPattern(s.people.doc);
        expect(pattern.sign).toBe(-1);
        expect(openPatterns({ people: { doc: { ...s.people.doc, name: 'Doc' } } })[0]).toMatchObject({ id: 'doc', name: 'Doc', sign: -1 });
        const moved = moveStanding(s.people.doc, -1);
        expect(moved.level).toBe(-1);
        expect(moved.by.sort()).toEqual(['adam', 'gal', 'inj']);
        expect(openPattern(moved)).toBeNull();
        expect(openPattern(dismissPattern(s.people.doc))).toBeNull();
        s = normalizeStanding({ people: { doc: moved } });
        expect(s.people.doc.level).toBe(-1);
    });
    it('by hand, and back to as described', () => {
        let p = moveStanding({}, -1);
        p = moveStanding(p, -1);
        expect(levelWord(p.level)).toBe('not taken seriously');
        expect(moveStanding(moveStanding(p, 1), 1)).toMatchObject({ level: 0, line: '', by: [] });
        expect(moveStanding({ level: -3 }, -1).level).toBe(-3);
    });
});

describe('what the narrator and the planner are told', () => {
    const low = { level: -2, line: 'full of wild theories she never tests', by: ['adam', 'inj'] };
    it('only while someone who holds it is here, and they act on it', () => {
        const text = standingText(low, { name: 'Doc', gender: 'f', here: [{ id: 'adam', name: 'Adam Miller' }, { id: 'cyr', name: 'Cyril' }] });
        expect(text).toBe('How Adam Miller sees Doc now: full of wild theories she never tests - they do not take her word as fact: they check what she claims, ask someone else first and give the real work to others, and Doc is not the one the scene turns to.');
        expect(standingText(low, { name: 'Doc', gender: 'f', here: [{ id: 'vex', name: 'Vex' }] })).toBe('');
        expect(standingText({ level: 2 }, { name: 'Ser Brannoc', gender: 'm', here: [{ id: 'k', name: 'King Aldric' }] })).toMatch(/King Aldric sees Ser Brannoc now: trusted - they trust his judgment/);
        expect(standingText({ level: 0 }, { name: 'Doc', here: [{ id: 'a', name: 'A' }] })).toBe('');
    });
    it('in the cast, and the planner sidelines the discredited', () => {
        const cast = buildCast({ cast: [{ name: 'Cyril', player: true }, { name: 'Doc', role: 'Medic', standing: 'How Adam Miller sees Doc now: doubted - they weigh what she says less.' }] });
        expect(cast).toContain('How Adam Miller sees Doc now: doubted');
        expect(sidelinedText([{ name: 'Doc', level: -2 }, { name: 'Vex', level: -1 }])).toBe('Not taken seriously now: Doc - give them fewer moments and never the lead or the answer others wait on.');
        expect(sidelinedText([{ name: 'Vex', level: -1 }])).toBe('');
    });
});

// From the user's latest post: the scorn is hers, not Adam's or Inji's.
describe('whose the scorn is', () => {
    const adam = { id: 'adm', name: 'Adam Miller', aliases: ['Adam', 'Miller'], gender: 'm' };
    const all = [doc, galice, inji, cyril, adam];
    it('the one nearest before it, and those joined to them', () => {
        expect(scornIn("Doc talked on. He was baffled as to why Adam didn't call her out more for the stupid things that came out of her mouth.", all, { post: true }).map((x) => x.id)).toEqual(['doc']);
        expect(scornIn("He was annoyed at Inji playing hero to protect Doc's feelings over a stupid remark.", all, { post: true }).map((x) => x.id)).toEqual(['doc']);
        expect(scornIn('Adam left. These women were going to drive White Cerberus into the ground with their stupidity.', all, { post: true })).toEqual([]);
        expect(scornIn('Galice and Doc had said all kinds of ridiculous things.', all, { post: true }).map((x) => x.id).sort()).toEqual(['doc', 'gal']);
        expect(scornIn('Doc and Galice argued. Both of them were nosy.', all, { post: true }).map((x) => x.id).sort()).toEqual(['doc', 'gal']);
    });
});
