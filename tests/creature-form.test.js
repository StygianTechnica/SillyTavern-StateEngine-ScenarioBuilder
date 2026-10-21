import { guessCreatureForm, creatureFormOf, readCount, addCount, takeCount, normalizeCounts, creatureLabel } from '../src/library/creature-form.js';
import { normalizeCanonical } from '../src/store/schema.js';
import { parseDirectorNote, dossierText } from '../src/director/prompt.js';
import { guidanceParts, buildGuidance } from '../src/guidance/build.js';

describe('one being or a kind', () => {
    it('is guessed from the name, and the user\'s choice wins', () => {
        for (const n of ['Zombies', 'Skeleton Warriors', 'wolves', 'a horde of ghouls', 'the Undead', "Death's Legion"]) expect(guessCreatureForm(n)).toBe('kind');
        for (const n of ['Ashmaw', 'the grey wolf', 'Varyn\'s horse', 'Pegasus', 'The Kraken', 'Moss']) expect(guessCreatureForm(n)).toBe('individual');
        expect(creatureFormOf({ name: 'Zombies', meta: { creatureForm: 'individual' } })).toBe('individual');
    });
});

describe('a kind\'s numbers in the scene', () => {
    it('are read from the words the director uses', () => {
        expect(readCount('3 zombies')).toEqual({ count: 3, name: 'zombies' });
        expect(readCount('two skeletal warriors')).toEqual({ count: 2, name: 'skeletal warriors' });
        expect(readCount('a pair of wolves')).toEqual({ count: 2, name: 'wolves' });
        expect(readCount('a dozen rats')).toEqual({ count: 12, name: 'rats' });
        expect(readCount('a zombie')).toEqual({ count: 1, name: 'zombie' });
        expect(readCount('the zombies')).toEqual({ count: null, name: 'zombies' });
        expect(readCount('a horde of ghouls')).toEqual({ count: null, name: 'ghouls' });
    });

    it('go up as more come and down as they fall, and they are gone at none', () => {
        let counts = addCount({}, 'z', 3);
        expect(counts).toEqual({ z: 3 });
        counts = addCount(counts, 'z', 2);
        expect(takeCount(counts, 'z', 2)).toEqual({ counts: { z: 3 }, gone: false });
        expect(takeCount({ z: 1 }, 'z')).toEqual({ counts: {}, gone: true });
        expect(takeCount({}, 'z', 2)).toEqual({ counts: {}, gone: false });
        expect(takeCount({ z: 5 }, 'z', null, { all: true })).toEqual({ counts: {}, gone: true });
    });

    it('are kept only for creatures in the scene', () => {
        expect(normalizeCounts({ z: 3, w: 2, x: 0, y: 1.5 }, ['z', 'x', 'y'])).toEqual({ z: 3 });
        expect(normalizeCanonical({ creatureIds: ['z'], creatureCounts: { z: 4, gone: 2 } }).creatureCounts).toEqual({ z: 4 });
    });

    it('are named in the prompts', () => {
        expect(creatureLabel('Zombies', { form: 'kind', count: 3 })).toBe('3 Zombies');
        expect(creatureLabel('Zombies', { form: 'kind' })).toBe('Zombies (some)');
        expect(creatureLabel('Ashmaw', { form: 'individual', count: 3 })).toBe('Ashmaw');
        const creatures = [{ name: 'Zombies', form: 'kind', count: 3, active: true }, { name: 'Ashmaw', form: 'individual', active: true }, { name: 'Rats', form: 'kind', active: false }];
        const text = dossierText({ cast: [{ name: 'Remus', player: true }], location: { path: ['Crypt'], creatures } });
        expect(text).toContain('- 3 Zombies [in the scene] (a kind - its numbers count down as they fall)');
        expect(text).toContain('- Ashmaw [in the scene]');
        const scene = guidanceParts(buildGuidance({ location: { path: ['Crypt'], creatures }, budget: 2000 })).guidance_scene;
        expect(scene).toContain('Also here: 3 Zombies and Ashmaw.');
        expect(scene).toContain('Living hereabouts, unseen unless the story brings them in: Rats.');
    });

    it('fall with a DIES line that says how many', () => {
        expect(parseDirectorNote('DIES | 2 zombies | cut down by Varyn').deaths).toEqual([{ name: '2 zombies', how: 'cut down by Varyn' }]);
    });
});
