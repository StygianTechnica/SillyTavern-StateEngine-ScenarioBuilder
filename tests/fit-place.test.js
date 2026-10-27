import { parentFrame, surpriseKind, placeRuleFor } from '../src/generate/fit-place.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';
import { planName } from '../src/naming/engine.js';
import { nameKindFor } from '../src/naming/classify.js';
import { makeRng } from '../src/naming/random.js';

const NEON = { name: 'Lodestar Neon Mile', description: 'A nightlife and entertainment district of clubs, bars, holo-theatres and casinos under endless neon.' };
const SQUARE = { name: 'Firebrand Square', description: 'The corporate heart of Arcadia City, where megacorps keep their headquarters.' };
const cyber = { worldType: 'science_fiction', tone: 'gritty, noir', premise: 'A cyberpunk megacity run by corporations.', tech: { level: 'tl9' } };

describe('what a parent place is for', () => {
    it('reads a district\'s purpose, and that its places are its own', () => {
        expect(parentFrame(NEON)).toEqual({ purpose: 'pleasure', public: true });
        expect(parentFrame(SQUARE)).toEqual({ purpose: 'business', public: true });
        expect(parentFrame({ name: 'Redhaven', description: 'a port town on the coast' })).toEqual({ purpose: 'harbour', public: true });
    });

    it('a tower or a fortress keeps its rooms its owner\'s', () => {
        expect(parentFrame({ name: 'Omicron Tower', description: 'Omicron Innovations\' headquarters' }).public).toBe(false);
        expect(parentFrame({ name: 'Castle Dunmore', description: 'the seat of House Dunmore' }).public).toBe(false);
    });
});

describe('a surprise place that fits', () => {
    it('is a place for a night out on the Neon Mile, and business on the square', () => {
        const rand = makeRng('t');
        for (let i = 0; i < 10; i++) {
            expect(surpriseKind(parentFrame(NEON), { later: true, rand })).toMatch(/club|bar|casino|karaoke|venue|cabaret|arcade|theatre|hotel/);
            expect(surpriseKind(parentFrame(SQUARE), { later: true, rand })).toMatch(/office|bank|trading|hotel|restaurant|coffee|law|club|plaza|data|clinic|gym/);
        }
    });

    it('is of its age, and not what the neighbours already are', () => {
        expect(surpriseKind({ purpose: 'pleasure' }, { later: false, rand: () => 0 })).toBe('a tavern');
        const siblings = [{ name: 'The Velvet Gull', description: 'a nightclub' }, { name: 'Zenith Casino', description: 'a casino' }];
        for (let i = 0; i < 20; i++) expect(surpriseKind(parentFrame(NEON), { later: true, siblings, rand: makeRng('s', i) })).not.toMatch(/a nightclub|a casino/);
    });

    it('is left to the model where the purpose is unknown', () => {
        expect(surpriseKind({ purpose: '' })).toBe('');
    });
});

describe('the rule for a place inside another', () => {
    it('in a district: what it is for, its own owners, and not another of what is there', () => {
        const rule = placeRuleFor('Firebrand Square', parentFrame(SQUARE), { factions: ['Omicron Innovations'], siblings: ['Omicron Tower'] });
        expect(rule).toMatch(/Firebrand Square is a business district/);
        expect(rule).toMatch(/not a branch, office, outpost or front of Omicron Innovations/);
        expect(rule).toMatch(/Already in Firebrand Square: Omicron Tower\. Make something different/);
        expect(placeRuleFor('Lodestar Neon Mile', parentFrame(NEON))).toMatch(/a place people actually go to, not a rundown backwater/);
    });

    it('in a fortress: true to the people tied to it, as before', () => {
        expect(placeRuleFor('Castle Dunmore', { purpose: '', public: false })).toMatch(/keep it true to that place and the people tied to it - their side/);
    });

    it('goes into the prompt, with the surprise kind', () => {
        const type = { id: 'location', label: 'Location', noun: 'location' };
        const placeRule = placeRuleFor('Lodestar Neon Mile', parentFrame(NEON));
        const { user } = buildGenerationPrompt({ task: 'create', type, fields: [], surpriseKind: 'a karaoke bar', placeRule, place: { path: [NEON], factions: [] }, parentName: 'Lodestar Neon Mile', fixedName: 'Redline Bar' });
        expect(user).toContain('Surprise the user: make it a karaoke bar');
        expect(user).toContain('Lodestar Neon Mile is a nightlife and entertainment district');
        expect(user).not.toContain('the people tied to it - their side');
    });
});

describe('names for places that draw people in', () => {
    const GRIM = /Hanged|Skull|Leech|Headless|Dead Man|Gallows|Drown|Gravedigger|Butcher|Hangman|Corpse|Rotting|Mangy/;
    const roll = (brief, purpose, seed) => planName({ typeId: 'location', brief, hasParent: true, purpose }, { naming: { seed }, overview: cyber, names: [] });

    it('are not named like a gallows inn because the world is gritty', () => {
        for (let i = 0; i < 40; i++) for (const brief of ['a nightclub', 'a cocktail bar', 'a jazz club', 'a private club']) {
            const n = roll(brief, 'pleasure', `g${i}`).name;
            expect(n, n).not.toMatch(GRIM);
        }
    });

    it('a bar in a later age has a sign like a club\'s, and an office tower no saint', () => {
        const signs = Array.from({ length: 30 }, (_, i) => roll('a cocktail bar', 'pleasure', `b${i}`).name);
        expect(signs.some((n) => / Bar$/.test(n))).toBe(true);
        for (let i = 0; i < 30; i++) {
            const n = roll('an office tower', 'business', `o${i}`).name;
            expect(n, n).not.toMatch(/^Saint /);
            expect(n, n).not.toMatch(/Office tower|Office Tower/);
        }
    });

    it('reads public buildings as named buildings, not forts or bases', () => {
        expect(nameKindFor('location', 'a music hall', { hasParent: true })).toMatchObject({ kind: 'building', subtype: 'venue', noun: 'music hall' });
        expect(nameKindFor('location', 'a police station', { hasParent: true })).toMatchObject({ kind: 'building', noun: 'police station' });
        expect(nameKindFor('location', 'a bank', { hasParent: true })).toMatchObject({ kind: 'building', noun: 'bank' });
        // ...but a secret lab is still a base, and a lord's hall a hall.
        expect(nameKindFor('location', 'a secret laboratory').kind).toBe('base');
        expect(nameKindFor('location', 'the great hall').kind).toBe('settlement');
    });

    it('writes a possessive the way a sign does', () => {
        for (let i = 0; i < 60; i++) expect(roll('a restaurant', 'business', `p${i}`).name).not.toMatch(/s's\b/);
    });
});
