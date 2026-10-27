import { recordName, buildIndex, acceptable } from '../src/naming/registry.js';
import { typeForBrief } from '../src/naming/classify.js';
import { normalizeCultureDef } from '../src/naming/cultures.js';
import { planName } from '../src/naming/engine.js';
import { keptNames, keptNameLines, knownAsText } from '../src/library/alias-kinds.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';

describe('a rolled name remembers what it means', () => {
    it('the registry keeps the meaning, and keeps it when the name is used', () => {
        let reg = recordName([], { name: 'Valdrheim', kind: 'settlement', culture: 'c1', meaning: 'wolf-home', state: 'o' });
        expect(reg[0]).toMatchObject({ n: 'Valdrheim', m: 'wolf-home', s: 'o' });
        reg = recordName(reg, { name: 'Valdrheim', state: 'u' });
        expect(reg[0]).toMatchObject({ s: 'u', m: 'wolf-home', c: 'c1' });
        expect(recordName([], { name: 'Hessa' })[0]).not.toHaveProperty('m');
    });
});

describe('a kept name', () => {
    it('is never handed out again, and stays kept over a later offer', () => {
        let reg = recordName([], { name: 'Hessa Tarn', state: 'k' });
        reg = recordName(reg, { name: 'Hessa Tarn', state: 'o' });
        expect(reg[0].s).toBe('k');
        const index = buildIndex({ registry: reg, counter: 5000 });
        expect(acceptable('Hessa Tarn', index)).toBe(false);
    });

    it('becomes used when an entry takes it', () => {
        expect(recordName(recordName([], { name: 'Hessa Tarn', state: 'k' }), { name: 'Hessa Tarn', state: 'u' })[0].s).toBe('u');
    });
});

describe('what a /sb-name brief is for', () => {
    it('reads people, places, factions and ships', () => {
        expect(typeForBrief('a tavern by the docks')).toBe('location');
        expect(typeForBrief('a smuggler woman')).toBe('character');
        expect(typeForBrief('a rival corporation')).toBe('faction');
        expect(typeForBrief('the mercenary company')).toBe('faction');
        expect(typeForBrief('a pirate ship')).toBe('item');
        expect(typeForBrief('a mountain range')).toBe('location');
        expect(typeForBrief('a mining colony')).toBe('location');
        expect(typeForBrief('an elf')).toBe('character');
        expect(typeForBrief('')).toBe('character');
    });
});

describe('a culture\'s own words', () => {
    it('are kept as capitalised words, no repeats', () => {
        const d = normalizeCultureDef({ name: 'Harbourfolk', seeds: [{ language: 'english', weight: 1 }], pools: { adjectives: 'tarred, salt, tarred, grey-green', nouns: ['gull', ' net '] } }, 'c1');
        expect(d.pools).toEqual({ adjectives: ['Tarred', 'Salt', 'Grey-Green'], nouns: ['Gull', 'Net'] });
        expect(normalizeCultureDef({ kind: 'sound' }, 'c2').pools).toEqual({ adjectives: [], nouns: [] });
    });

    it('turn up in its descriptive names, across genres', () => {
        const naming = (seed) => ({ seed, cultures: { c1: { name: 'Harbourfolk', seeds: [{ language: 'english', weight: 1 }], pools: { adjectives: ['Tarred', 'Brackish'], nouns: ['Gull', 'Eel'] } } } });
        for (const [overview, brief] of [[{ worldType: 'fantasy' }, 'a tavern'], [{ worldType: 'fantasy' }, 'a thieves gang'], [{ worldType: 'science_fiction', tech: { level: 'tl9' } }, 'a street gang']]) {
            const names = [];
            for (let i = 0; i < 40; i++) {
                const r = planName({ typeId: brief.includes('gang') ? 'faction' : 'location', brief, cultureId: 'c1' }, { naming: { ...naming(`w${i}`), counter: i }, overview, names });
                if (r.mode === 'rolled') names.push(r.name);
            }
            expect(names.some((n) => /Tarred|Brackish|Gull|Eel/.test(n)), `${brief}: ${names.join(', ')}`).toBe(true);
        }
    });
});

describe('a name kept to a few', () => {
    const info = { Nightjar: { kind: 'codename', knownBy: ['ch_vex', 'f_ravens'] } };
    const nameOf = (id) => ({ ch_vex: 'Vex', f_ravens: 'the Ravens' }[id] ?? '');
    const isGroup = (id) => id.startsWith('f_');

    it('lists who uses it: people and groups', () => {
        expect(keptNames(['Nightjar', 'Mags'], info, nameOf, isGroup)).toEqual([{ alias: 'Nightjar', kind: 'codename', people: ['Vex'], groups: ['the Ravens'] }]);
    });

    it('tells the director who here does not know it - a crew member does', () => {
        const kept = keptNames(['Nightjar'], info, nameOf, isGroup);
        const cast = [{ name: 'Mara Quell', keptNames: kept }, { name: 'Vex' }, { name: 'Sefa', factions: ['the Ravens'] }, { name: 'Inspector Hale' }, { name: 'Remus', player: true }];
        const lines = keptNameLines(cast);
        expect(lines).toEqual(['"Nightjar" is Mara Quell\'s codename, used only by Vex and members of the Ravens. Inspector Hale and Remus do not know it: to them it is Mara Quell, and no one says "Nightjar" in front of them unless the story has them learn it.']);
        // Everyone here knows it: nothing to say.
        expect(keptNameLines([{ name: 'Mara Quell', keptNames: kept }, { name: 'Vex' }])).toEqual([]);
        // The narrator's line is unchanged.
        expect(knownAsText('Mara Quell', ['Nightjar'], info, nameOf)).toMatch(/used only by Vex and the Ravens/);
    });

    it('goes into the director\'s prompt', () => {
        const kept = keptNames(['Nightjar'], info, nameOf, isGroup);
        const { prompt } = buildDirectorPrompt({ cast: [{ name: 'Remus', player: true }, { name: 'Mara Quell', keptNames: kept }, { name: 'Inspector Hale' }], location: { path: ['Arcadia City'] }, messages: [] });
        expect(prompt).toContain('NAMES NOT EVERYONE HERE KNOWS');
        expect(prompt).toContain('Remus and Inspector Hale do not know it');
    });
});
