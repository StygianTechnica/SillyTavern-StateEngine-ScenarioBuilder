// What a faction's people share, and what the world's descriptions overuse.
import { normalizeKindred, hasKindred, buildKindredPrompt, readKindred, kindredLine, overusedPhrases, overusedRule } from '../src/generate/kindred.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';

describe('what a faction has in common', () => {
    const answer = 'PEOPLE: humans raised in the order\nDRESS: ash-grey robes with a red sash\nMARKS: shaved heads, a burn on the left palm\nSPEECH: none\nSKILLS: varies';
    it('reads a cult', () => {
        expect(readKindred(null, answer).values).toEqual({ people: 'humans raised in the order', dress: 'ash-grey robes with a red sash', marks: 'shaved heads, a burn on the left palm', speech: '', skills: '' });
    });
    it('a small model bending the lines', () => {
        expect(readKindred(null, '**DRESS:** "cheap suits"\n- SPEECH: mob slang').values).toMatchObject({ dress: 'cheap suits', speech: 'mob slang' });
    });
    it('no lines asks again', () => {
        expect(readKindred(null, 'They are a cult.').error).toBeTruthy();
    });
    it('a group that shares nothing is settled too', () => {
        const none = normalizeKindred({ ...readKindred(null, 'PEOPLE: none\nDRESS: none').values, at: 'now' });
        expect(hasKindred(none)).toBe(false);
        expect(none.at).toBe('now');
        expect(kindredLine(none)).toBe('');
    });
    it('the line for the prompt names only what is shared', () => {
        expect(kindredLine({ dress: 'red robes', marks: 'shaved heads', speech: '' })).toBe('How they dress: red robes; Marks and hair: shaved heads');
    });
    it('copes with nothing stored', () => {
        expect(hasKindred(normalizeKindred(undefined))).toBe(false);
    });
    it('the question allows for groups that share little', () => {
        const { user } = buildKindredPrompt({ faction: { name: 'Ceres Salvagers', description: 'Scrappers.' }, members: [{ name: 'Dak', description: 'A squat welder.' }], world: 'Space.' });
        expect(user).toContain('Ceres Salvagers: Scrappers.');
        expect(user).toContain('- Dak: A squat welder.');
        expect(user).toContain('may share almost nothing');
    });
});

describe('what has been used too often', () => {
    const real = [
        'Delvin is a lean man in his mid-30s, with sharp cheekbones and piercing blue eyes that seem to bore into those he looks at.',
        'Nichiro Fukudo is a lean, wiry man in his early thirties, with a shaved head and eyes that seem to bore into those he meets.',
        'Enrique Medina is a striking figure in his mid-30s whose dark eyes seem to bore into those he looks at.',
        'Inji is lean and athletic, with piercing blue eyes that seem to bore into those he meets.',
        'A burly old dock worker with a broken nose and hands like shovels.',
    ];
    it('finds the shared phrases and stock words', () => {
        const found = overusedPhrases(real);
        expect(found.some((p) => p.includes('seem to bore'))).toBe(true);
        expect(found).toContain('lean');
    });
    it('a phrase counts once, not every piece of it', () => {
        const found = overusedPhrases(real);
        expect(found.filter((p) => p.includes('seem to'))).toHaveLength(1);
    });
    it('nothing from a world with variety', () => {
        expect(overusedPhrases(['A burly old dock worker with a broken nose.', 'A tiny seamstress who hums while she works.', 'A one-eyed priest in a moth-eaten cassock.'])).toEqual([]);
    });
    it('the rule, or nothing', () => {
        expect(overusedRule(['lean', 'piercing blue eyes'])).toContain('"lean", "piercing blue eyes"');
        expect(overusedRule([])).toBe('');
    });
});

describe('in the prompt', () => {
    const type = { id: 'character', label: 'Character', noun: 'character' };
    const fields = [{ name: 'background', label: 'Background', kind: 'text' }];
    const input = { task: 'fill', type, fields, entry: { name: 'Ilse', values: {} }, kindred: 'How they dress: red robes', kindredOf: 'The Pale Choir', overused: overusedRule(['lean']) };
    it('says what the faction shares, and warns off the phrases', () => {
        const { user } = buildGenerationPrompt(input);
        expect(user).toContain("# What The Pale Choir's people have in common");
        expect(user).toContain('How they dress: red robes');
        expect(user).toContain('used these too often');
    });
    it('no warning when the description is not being written', () => {
        const { user } = buildGenerationPrompt({ ...input, entry: { name: 'Ilse', values: { description: 'Short and round.' } } });
        expect(user).not.toContain('used these too often');
    });
    it('a person is not given relatives no one wrote', () => {
        expect(buildGenerationPrompt({ ...input, person: true }).user).toContain('never kin');
        expect(buildGenerationPrompt({ ...input, type: { id: 'faction', label: 'Faction', noun: 'faction' }, person: false }).user).not.toContain('never kin');
    });
    it('nothing added without them', () => {
        const { user } = buildGenerationPrompt({ ...input, kindred: '', overused: '' });
        expect(user).not.toContain('have in common');
    });
});
