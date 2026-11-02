// Company: the player character's mood after each reply, against who was
// there, keeps those they have had enough of away - and brings back those
// not seen in a while, or someone they are glad of.
import { noteMood, standings, chooseFor, companyLines, rankNearby, emptyCompany, normalizeCompany } from '../src/director/company.js';

const galice = { id: 'chr_g', name: 'Galice Buckar' };
const doc = { id: 'chr_d', name: 'Doc' };
const zane = { id: 'chr_z', name: 'Zane' };

const feel = (c, turn, mood, present, thought = '') => noteMood(c, { key: `r${turn}`, turn, mood, thought, present });

describe('the tally', () => {
    it('someone the player is put out with again and again is kept away', () => {
        let c = emptyCompany();
        c = feel(c, 1, 'Annoyed', [galice, doc]);
        c = feel(c, 2, 'Annoyed', [galice], 'Why is Galice always hovering?');
        const s = standings(c, 2);
        expect(s.get('chr_g').standing).toBe('less');
        expect(s.get('chr_d').standing).toBe('');
    });

    it('one sour scene is not enough, and warm ones count back', () => {
        let c = feel(emptyCompany(), 1, 'Annoyed', [galice], 'Galice again.');
        expect(standings(c, 1).get('chr_g').standing).toBe('');
        c = feel(c, 2, 'Bored', [zane, galice]);
        c = feel(c, 3, 'Playful', [zane]);
        c = feel(c, 4, 'Loving', [zane]);
        expect(standings(c, 4).get('chr_z').standing).toBe('');
        c = feel(c, 5, 'Happy', [zane]);
        expect(standings(c, 5).get('chr_z').standing).toBe('more');
    });

    it("a swipe replaces its reply's mood; neutral moods leave no mark", () => {
        let c = feel(emptyCompany(), 1, 'Annoyed', [galice]);
        c = feel(c, 1, 'Happy', [galice]);
        expect(c.samples).toHaveLength(1);
        expect(c.samples[0].kind).toBe('warm');
        c = feel(c, 1, 'Neutral', [galice]);
        expect(c.samples).toHaveLength(0);
    });

    it('old moods fade', () => {
        let c = emptyCompany();
        for (const t of [1, 2, 3]) c = feel(c, t, 'Annoyed', [galice]);
        expect(standings(c, 3).get('chr_g').standing).toBe('less');
        expect(standings(c, 40).get('chr_g')?.standing ?? '').toBe('');
    });

    it("the user's word wins either way", () => {
        let c = emptyCompany();
        for (const t of [1, 2, 3]) c = feel(c, t, 'Annoyed', [galice]);
        c = chooseFor(c, 'chr_g', 'Galice Buckar', 'fine');
        expect(standings(c, 3).get('chr_g').standing).toBe('');
        c = chooseFor(c, 'chr_d', 'Doc', 'less');
        expect(standings(c, 3).get('chr_d').standing).toBe('less');
        expect(normalizeCompany(JSON.parse(JSON.stringify(c))).choices.chr_d).toEqual({ name: 'Doc', choice: 'less' });
    });
});

describe('what the director hears', () => {
    it('keep them brief, and bring someone else', () => {
        let c = emptyCompany();
        for (const t of [1, 2, 3]) c = feel(c, t, 'Annoyed', [galice, doc]);
        for (const t of [4, 5]) c = feel(c, t, 'Happy', [zane]);
        const text = companyLines(c, { turn: 5, player: 'Cyril' });
        expect(text).toMatch(/Less of: Galice Buckar, Doc/);
        expect(text).toMatch(/prefer those Cyril is glad of - Zane/);
    });

    it('nothing when no one is kept away', () => {
        expect(companyLines(feel(emptyCompany(), 1, 'Happy', [zane]), { turn: 1 })).toBe('');
    });

    it('who could turn up: glad-of first, the longest absent next, the kept-away last', () => {
        let c = emptyCompany();
        for (const t of [1, 2, 3]) c = feel(c, t, 'Annoyed', [galice]);
        for (const t of [4, 5]) c = feel(c, t, 'Happy', [zane]);
        const nearby = [
            { id: 'chr_g', name: 'Galice Buckar', why: 'seen earlier in this story' },
            { id: 'chr_v', name: 'Vex', why: 'seen earlier in this story' },
            { id: 'chr_a', name: 'Adam Miller', why: 'leads White Cerberus, based at The Signal Box' },
            { id: 'chr_z', name: 'Zane', why: 'seen earlier in this story' },
        ];
        const seen = new Map([['chr_g', { index: 99 }], ['chr_v', { index: 60 }], ['chr_z', { index: 98 }]]);
        const ranked = rankNearby(nearby, { company: c, turn: 5, seen, total: 100, player: 'Cyril' });
        expect(ranked.map((x) => x.name)).toEqual(['Zane', 'Adam Miller', 'Vex', 'Galice Buckar']);
        expect(ranked[1].why).toMatch(/not seen in the story yet/);
        expect(ranked[2].why).toMatch(/not in a scene for a while/);
        expect(ranked[3].keepAway).toBe(true);
        expect(ranked[3].why).toMatch(/Cyril has had enough of them/);
    });
});
