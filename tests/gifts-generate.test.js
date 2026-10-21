import { buildGiftsPrompt, readGifts, GIFTS_CHARS, buildActsPrompt, readActs, ACTS_CHARS } from '../src/generate/gifts.js';

const entry = { name: 'Remus', noun: 'character', description: 'A grim templar of the war god, scarred and tireless.', facts: ['Role: champion of the Iron Temple'] };
const patron = { name: 'Graxx the War Father', description: 'God of battle and endurance.', acts: 'a roar in the clash of steel' };

describe('writing gifts', () => {
    it('builds on the sheet and the patron, as plain text', () => {
        const p = buildGiftsPrompt({ entry, patrons: [patron], overview: { premise: 'A world of warring gods.' } });
        expect(p.plain).toBe(true);
        expect(p.user).toContain('Remus (character): A grim templar');
        expect(p.user).toContain('- Role: champion of the Iron Temple');
        expect(p.user).toContain('champion of Graxx the War Father');
        expect(p.user).toContain('a roar in the clash of steel');
        expect(p.user).toContain('granted rather than learned');
    });

    it('without a patron, from the sheet alone', () => {
        const p = buildGiftsPrompt({ entry });
        expect(p.user).not.toContain('Remus is the champion of');
        expect(p.user).not.toContain('granted rather than learned');
    });

    it('keeps what is written, follows a steer, and holds to the world\'s limits', () => {
        const p = buildGiftsPrompt({ entry, current: 'Never tires.', brief: 'something to do with fire', overview: { magic: { presence: 'none' } } });
        expect(p.user).toContain('keep it, and build on it: Never tires.');
        expect(p.user).toContain('Make it this: something to do with fire');
        expect(p.user).toMatch(/Never break this: There is NO magic/);
    });

    it('reads the answer, dropping a label and quotes, and refusing nothing or JSON', () => {
        expect(readGifts('Gifts: "He does not tire in battle; wounds close as he fights."')).toEqual({ values: 'He does not tire in battle; wounds close as he fights.', error: '' });
        expect(readGifts('').error).toBeTruthy();
        expect(readGifts('{"gifts": "x"}').error).toBeTruthy();
        expect(readGifts('word '.repeat(300)).values.length).toBeLessThanOrEqual(GIFTS_CHARS);
    });
});

describe('writing how a power makes itself known', () => {
    it('builds on the sheet and names its champions, as plain text', () => {
        const p = buildActsPrompt({ power: { name: 'Graxx the War Father', description: 'God of battle.', facts: ['Domain: war'] }, champions: ['Remus'], current: 'a roar in battle' });
        expect(p.plain).toBe(true);
        expect(p.user).toContain('Graxx the War Father - a power with no body');
        expect(p.user).toContain('- Domain: war');
        expect(p.user).toContain('Its champions: Remus.');
        expect(p.user).toContain('keep it, and build on it: a roar in battle');
    });

    it('reads the answer, dropping a label, and refusing nothing or JSON', () => {
        expect(readActs('Signs: a roar in the clash of steel; red dreams').values).toBe('a roar in the clash of steel; red dreams');
        expect(readActs('').error).toBeTruthy();
        expect(readActs('["a"]').error).toBeTruthy();
        expect(readActs('word '.repeat(200)).values.length).toBeLessThanOrEqual(ACTS_CHARS);
    });
});

describe('fitting text to its room', () => {
    it('leaves short text alone, and shortens long text at a whole phrase - never mid-word, never with "…"', async () => {
        const { fitText } = await import('../src/library/powers.js');
        expect(fitText('a voice in the storm', 100)).toBe('a voice in the storm');
        const signs = 'a voice in the storm; dreams of falling stars; a cold wind and whispers; frost on the altar';
        expect(fitText(signs, 60)).toBe('a voice in the storm; dreams of falling stars');
        const prose = 'He never tires. His wounds close as he fights. He hears the war god in the clash of steel.';
        expect(fitText(prose, 50)).toBe('He never tires. His wounds close as he fights.');
        const out = fitText('word '.repeat(50), 33);
        expect(out.endsWith('word')).toBe(true);
        expect(out).not.toContain('…');
    });

    it('keeps a power\'s signs and a person\'s gifts long enough for what is written', async () => {
        const { normalizePowerMeta } = await import('../src/library/powers.js');
        const { normalizeEntryMeta } = await import('../src/store/schema.js');
        const long = 'a voice in the storm; '.repeat(20);
        expect(normalizePowerMeta({ on: true, acts: long }).acts.length).toBeGreaterThan(300);
        expect(normalizeEntryMeta({ gifts: 'He never tires. '.repeat(40) }).gifts.length).toBeGreaterThan(400);
    });
});
