import { buildImagePrompt, stripNames, worldExclusions } from '../src/images/prompt.js';

const mira = { type: 'character', name: 'Mira Vane', aliases: ['Mira'], description: 'Mira is a tired innkeeper with ink-stained fingers. Mira\'s apron is patched.', role: 'innkeeper' };
const forest = { type: 'location', name: 'Ironwood', aliases: [], description: 'An ancient forest of black-barked trees.' };
const overview = { era: 'late medieval', tone: 'gritty' };

describe('image prompts', () => {
    it('takes the entry\'s own names out', () => {
        expect(stripNames('Mira is tired. Mira\'s apron.', ['Mira'])).toBe('is tired. apron.');
    });

    it('builds a Midjourney prompt with parameters', () => {
        const { prompt } = buildImagePrompt({ entry: mira, overview });
        expect(prompt).toMatch(/^portrait of an innkeeper, /);
        expect(prompt).not.toContain('Mira');
        expect(prompt).toContain('late medieval, gritty mood');
        expect(prompt).toContain('painterly fantasy illustration');
        expect(prompt).toMatch(/ --ar 2:3 --v 7 --stylize 250 --no text, watermark, signature, frame$/);
    });

    it('uses the current description instead of the base one', () => {
        const { prompt } = buildImagePrompt({ entry: forest, narrative: 'A burnt forest of ash and blackened stumps.', environment: { lighting: 'smoky dusk' } });
        expect(prompt).toContain('burnt forest');
        expect(prompt).not.toContain('black-barked');
        expect(prompt).toContain('smoky dusk');
        expect(prompt).toContain('--ar 16:9');
    });

    it('honours Midjourney options', () => {
        const { prompt } = buildImagePrompt({ entry: forest, options: { style: 'custom', customStyle: 'by moonlight', midjourney: { version: 'niji 6', stylize: 100, chaos: 20, raw: true, no: '', sref: 'https://x/y.png', extra: '--q 2' } } });
        expect(prompt).toContain('by moonlight');
        expect(prompt).toMatch(/--ar 16:9 --niji 6 --chaos 20 --style raw --sref https:\/\/x\/y.png --q 2$/);
        expect(prompt).not.toContain('--stylize');
    });

    it('never lets "--" from a description become a parameter', () => {
        const { prompt } = buildImagePrompt({ entry: { ...forest, description: 'a glade -- quiet' } });
        expect(prompt.startsWith('a glade - quiet')).toBe(true);
    });

    it('builds Stable Diffusion prompts with a negative', () => {
        const result = buildImagePrompt({ entry: mira, options: { provider: 'stable_diffusion' } });
        expect(result.prompt).toMatch(/highly detailed$/);
        expect(result.negative).toContain('watermark');
    });

    it('builds a natural-language sentence', () => {
        const { prompt } = buildImagePrompt({ entry: forest, options: { provider: 'natural', style: 'ink' } });
        expect(prompt).toMatch(/^Ink and watercolour sketch of an ancient forest/);
        expect(prompt.endsWith('.')).toBe(true);
    });

    it('can keep names when asked', () => {
        expect(buildImagePrompt({ entry: mira, options: { includeNames: true } }).prompt.startsWith('Mira Vane, portrait')).toBe(true);
    });
});

describe('world limits in image prompts', () => {
    const overview = { magic: { presence: 'rare', kinds: ['divine'], absent: ['arcane'] }, tech: { level: 'tl3', absent: ['clockwork'] } };
    const entry = { type: 'location', name: 'The Drowned Lantern', description: 'A crooked inn.' };
    it('lists what the world rules out', () => {
        const no = worldExclusions(overview);
        expect(no).toEqual(expect.arrayContaining(['arcane magic', 'clockwork', 'firearms', 'cars']));
        expect(worldExclusions({ magic: { presence: 'none' } })).toContain('magic');
        expect(worldExclusions({ tech: { level: 'tl8' } })).not.toContain('cars');
        expect(worldExclusions({ tech: { level: 'tl3', spread: 'relic' } })).not.toContain('firearms');
    });
    it('puts them in --no and the negative prompt, unless switched off', () => {
        const mj = buildImagePrompt({ entry, overview, options: { provider: 'midjourney', midjourney: { no: 'text' } } }).prompt;
        expect(mj).toMatch(/--no text, arcane magic, clockwork, firearms/);
        const sd = buildImagePrompt({ entry, overview, options: { provider: 'stable_diffusion' } }).negative;
        expect(sd).toContain('arcane magic');
        expect(buildImagePrompt({ entry, overview, options: { provider: 'midjourney', respectLimits: false, midjourney: { no: '' } } }).prompt).not.toContain('--no');
    });
});
