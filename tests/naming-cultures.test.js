import { normalizeCultureDef, newCultureDef, resolveCulture, inheritedCulture, describeShift, defaultCultureChoice, cultureChoices } from '../src/naming/cultures.js';
import { planName } from '../src/naming/engine.js';
import { STOCKS } from '../src/naming/stocks/index.js';
import { fold } from '../src/naming/text.js';

function roll(n, req, naming, overview = {}) {
    const out = [];
    let counter = 0;
    for (let i = 0; i < n; i++) {
        const r = planName(req, { naming: { ...naming, counter }, overview, names: out });
        counter = r.counter;
        if (r.mode === 'rolled') out.push(r.name);
    }
    return out;
}

describe('a world\'s own cultures', () => {
    it('keeps what makes sense and fills the rest', () => {
        const d = normalizeCultureDef({ name: ' Vaskari ', seeds: [{ language: 'old_norse', weight: 9 }, { language: 'klingon', weight: 1 }], mutation: 7, style: { feature: 'kit', bogus: 'native', building: 'odd' }, banned: ['Hrafn', 'Hrafn', ''] }, 'c1');
        expect(d).toMatchObject({ id: 'c1', name: 'Vaskari', kind: 'invented', mutation: 3, seeds: [{ language: 'old_norse', weight: 5 }], style: { feature: 'kit' }, banned: ['Hrafn'] });
        expect(normalizeCultureDef({ kind: 'real', realId: 'real:nowhere:modern' }, 'c2').realId).toBe('real:english:modern');
        expect(normalizeCultureDef({ kind: 'sound', sound: { syllables: [4, 1] } }, 'c3').sound.syllables).toEqual([4, 4]);
    });

    it('makes a new one from a preset with its sound shifts kept, or from a real culture or sounds', () => {
        const elves = newCultureDef('preset:elves', { seed: 's', ids: ['c1'] });
        expect(elves.id).toBe('c2');
        expect(elves.name).toBe('Elves');
        expect(elves.seeds.map((x) => x.language)).toEqual(['finnish', 'welsh', 'icelandic']);
        expect(elves.shifts.length).toBeGreaterThan(0);
        expect(newCultureDef('real:japanese:modern', { seed: 's' })).toMatchObject({ kind: 'real', realId: 'real:japanese:modern' });
        expect(newCultureDef('sound', { seed: 's' }).kind).toBe('sound');
        expect(describeShift('th-d')).toBe('th → d');
        expect(describeShift('h-drop')).toMatch(/starting h → nothing/);
    });

    it('names in a real culture under its own name, keeping its own bans', () => {
        const naming = { seed: 'r', cultures: { c1: { kind: 'real', realId: 'real:japanese:modern', name: 'Neo-Tokyo', banned: ['Sato'] } } };
        const c = resolveCulture('c1', { naming, seed: 'r' });
        expect(c.label).toBe('Neo-Tokyo');
        expect(c.real).toBe(true);
        const names = roll(30, { typeId: 'character', brief: 'a man', cultureId: 'c1' }, naming, { worldType: 'science_fiction' });
        const families = new Set(STOCKS.japanese.eras.modern.family);
        for (const n of names) {
            expect(families.has(n.split(' ')[0]), n).toBe(true);
            expect(n.startsWith('Sato '), n).toBe(false);
        }
    });

    it('builds an alien tongue from its sounds', () => {
        const naming = { seed: 'a', cultures: { c1: { kind: 'sound', name: 'Xith', sound: { consonants: 'k:3 x:2 th', vowels: 'a:3 i', shapes: 'CV:3 CVC', syllables: [2, 2] } } } };
        const people = roll(20, { typeId: 'character', brief: 'a man', cultureId: 'c1' }, naming, { worldType: 'science_fiction' });
        const cities = roll(10, { typeId: 'location', brief: 'a city', cultureId: 'c1' }, naming, { worldType: 'science_fiction' });
        for (const n of [...people, ...cities]) expect(n.toLowerCase(), n).toMatch(/^(k|x|th|a|i)+$/);
        expect(people.every((n) => !n.includes(' '))).toBe(true);
    });

    it('learns from the user\'s own names without ever handing one out', () => {
        const learned = ['Brakka', 'Drogga', 'Grukka', 'Morgga', 'Thrakka', 'Vrogga', 'Zukka', 'Hrokka', 'Krugga', 'Snagga', 'Uggra', 'Brugga'];
        const naming = { seed: 'l', cultures: { c1: { name: 'Grot', seeds: [{ language: 'hungarian', weight: 1 }], mutation: 0, learned, learnedWeight: 5 } } };
        const names = roll(40, { typeId: 'character', brief: 'a man', cultureId: 'c1' }, naming);
        // Hungarian puts the family name first: the given name is the last word.
        const given = names.map((n) => n.split(' ').pop());
        expect(given.some((n) => /(gg|kk)r?a$/.test(n))).toBe(true);
        for (const n of given) expect(learned.map(fold)).not.toContain(fold(n));
    });

    it('lists the world\'s own first in the picker', () => {
        expect(cultureChoices({ cultures: { c1: { id: 'c1', name: 'Vaskari' } } })[0]).toEqual({ value: 'c1', label: 'Vaskari', group: 'This world' });
    });
});

describe('whose names a new thing takes', () => {
    const entries = { kingdom: { culture: 'c1' }, city: {}, inn: {}, guild: { culture: 'preset:desert' } };
    const parents = { city: 'kingdom', inn: 'city' };
    it('takes a faction\'s, else the nearest place above with one', () => {
        expect(inheritedCulture(entries, parents, { placeId: 'inn' })).toEqual({ id: 'c1', from: 'kingdom' });
        expect(inheritedCulture(entries, parents, { placeId: 'inn', factionIds: ['guild'] })).toEqual({ id: 'preset:desert', from: 'guild' });
        expect(inheritedCulture(entries, parents, { placeId: 'nowhere' })).toEqual({ id: '', from: '' });
        expect(inheritedCulture(entries, { a: 'b', b: 'a' }, { placeId: 'a' })).toEqual({ id: '', from: '' });
    });

    it('says why the world default is what it is', () => {
        expect(defaultCultureChoice({ worldType: 'modern', premise: 'Neon nights in Tokyo' })).toEqual({ id: 'real:japanese:modern', why: '"tokyo" on the front page' });
        expect(defaultCultureChoice({}, { defaultCulture: 'c1' })).toEqual({ id: 'c1', why: 'chosen by you' });
    });
});
