import { describe, it, expect } from 'vitest';
import { looksBrief, buildCast } from '../src/guidance/build.js';
import { pronounsFrom } from '../src/naming/classify.js';

// Doc (Assassins Inc): cut at 160 characters, her hair never reached the
// prompt and the model gave her long auburn hair.
const DOC = 'Doc\'s lean yet athletic build stands at 5\'8" with a compact frame well-suited to navigating tight spaces within the White Cerberus hideouts. Her sharp facial features are often obscured by a pair of round, silver-rimmed goggles perched atop her short, choppy hair which falls just below her ears in a practical bob. Her pale skin bears several small, faded scars from various lab mishaps and close calls, each one a testament to her dedication to the rebel cause. Doc favors functional attire - durable cargo pants, layered tops, and sturdy boots that allow for easy movement.';

describe('looksBrief', () => {
    it('keeps the sentences that say how they look', () => {
        const b = looksBrief(DOC, 360);
        expect(b).toContain('short, choppy hair');
        expect(b).toContain('5\'8"');
        expect(b.length).toBeLessThanOrEqual(360);
        expect(b).not.toContain('…');
    });
    it('keeps the order written', () => {
        const b = looksBrief(DOC, 400);
        expect(b.indexOf('lean yet athletic')).toBeLessThan(b.indexOf('choppy hair'));
    });
    it('leaves a short description whole', () => {
        expect(looksBrief('A tall man.', 160)).toBe('A tall man.');
    });
    it('cuts one long sentence when nothing fits whole', () => {
        const b = looksBrief(`${'word '.repeat(100)}hair.`, 60);
        expect(b.length).toBeLessThanOrEqual(60);
        expect(b.endsWith('…')).toBe(true);
    });
});

describe('pronounsFrom', () => {
    it('reads she from her own prose', () => {
        expect(pronounsFrom(DOC)).toBe('f');
    });
    it('is not tied by one "his" in a woman\'s text', () => {
        expect(pronounsFrom('She lost her brother; his ship sank. Her grief is quiet.')).toBe('f');
    });
    it('claims nothing when the text does not say', () => {
        expect(pronounsFrom('A drone mechanic of the lower docks.')).toBe('');
        expect(pronounsFrom('She met him; he left her.')).toBe('');
    });
});

describe('cast line', () => {
    it('marks pronouns and carries the hair', () => {
        const out = buildCast({ cast: [{ name: 'Doc', bloodline: 'human', gender: 'f', description: DOC }, { name: 'Cyril', player: true, gender: 'm' }] });
        expect(out).toContain('- Doc (human; she / her):');
        expect(out).toContain('choppy hair');
        expect(out).toContain('- Cyril (he / him): the player character');
    });
    it('is unchanged without a gender', () => {
        const out = buildCast({ cast: [{ name: 'Kiri', bloodline: 'elf', description: 'A quiet scout.' }] });
        expect(out).toContain('- Kiri (elf): A quiet scout.');
    });
});
