import { buildImagePrompt, stripNames, worldExclusions, kindWord } from '../src/images/prompt.js';

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

describe('the look of the world', () => {
    const wasteland = { worldType: 'post_apocalyptic', era: 'early 2000s', tone: 'gritty', tech: { level: 'tl6', flavors: ['salvaged / scavenged'] } };
    const fortress = { type: 'location', name: "Niamh's Fortress", description: "Niamh's Fortress looms over the wasteland." };
    it('sets a picture in its kind of world, and makes a style\'s "fantasy" that world\'s genre', () => {
        const { prompt } = buildImagePrompt({ entry: fortress, overview: wasteland, options: { style: 'dark_oil' } });
        expect(prompt).toContain('The fortress looms over the wasteland');
        expect(prompt).toContain('post-apocalyptic wasteland, ruins of the modern world, rusted twisted metal');
        expect(prompt).toContain('scavenged scrap-built gear and vehicles');
        expect(prompt).toContain('dark post-apocalyptic oil painting');
        expect(prompt).not.toContain('fantasy');
    });
    it('rules out the storybook castle in a later age, but not the ruins of modern life', () => {
        const no = worldExclusions(wasteland);
        expect(no).toEqual(expect.arrayContaining(['medieval castle', 'stone turrets', 'fairytale', 'spaceships']));
        expect(no).not.toContain('modern clothing');
        expect(no).not.toContain('screens');
        expect(worldExclusions({ worldType: 'fantasy', tech: { level: 'tl3' } })).not.toContain('medieval castle');
    });
    it('keeps a fantasy world as it was', () => {
        expect(buildImagePrompt({ entry: fortress, overview: { worldType: 'fantasy' }, options: { style: 'painterly' } }).prompt).toContain('painterly fantasy illustration');
        expect(kindWord('The Blackened Bridge')).toBe('bridge');
        expect(kindWord('Liston')).toBe('');
    });
});

describe('faction image prompts', () => {
    const guild = { type: 'faction', name: 'The Ledger Guild', aliases: [], description: 'A guild of moneylenders.' };
    it('asks for heraldry in the castle age and branding in a later one', () => {
        expect(buildImagePrompt({ entry: guild, overview: { worldType: 'fantasy' } }).prompt).toContain('heraldic emblem and banner');
        const scifi = buildImagePrompt({ entry: guild, overview: { worldType: 'science_fiction' } }).prompt;
        expect(scifi).toContain('logo and branding');
        expect(scifi).not.toContain('heraldic');
        expect(buildImagePrompt({ entry: guild, overview: { worldType: 'fantasy', tech: { level: 'tl8' } } }).prompt).toContain('logo and branding');
    });
});

describe('the anime style', () => {
    const mira = { type: 'character', name: 'Mira', aliases: [], description: 'A tired innkeeper with ink-stained fingers.', role: 'innkeeper' };
    const wood = { type: 'location', name: 'Ironwood', aliases: [], description: 'An ancient forest of black-barked trees.' };
    it('leads the prompt, uses Midjourney\'s anime model and keeps photorealism out', () => {
        const { prompt } = buildImagePrompt({ entry: mira, options: { provider: 'midjourney', style: 'anime' } });
        expect(prompt.startsWith('anime key visual, Japanese animation style')).toBe(true);
        expect(prompt).toContain('expressive anime eyes');
        expect(prompt).toContain('--niji 6');
        expect(prompt).not.toContain('--v 7');
        expect(prompt).toMatch(/--no [^-]*photorealistic/);
        expect(buildImagePrompt({ entry: wood, options: { provider: 'midjourney', style: 'anime' } }).prompt).not.toContain('eyes');
        // Another style keeps the chosen version.
        expect(buildImagePrompt({ entry: mira, options: { provider: 'midjourney', style: 'painterly' } }).prompt).toContain('--v 7');
    });
    it('gives Stable Diffusion anime tags and a negative that pulls away from realism', () => {
        const { prompt, negative } = buildImagePrompt({ entry: wood, options: { provider: 'stable_diffusion', style: 'anime' } });
        expect(prompt.startsWith('anime, anime key visual, anime screencap')).toBe(true);
        expect(negative).toContain('photorealistic');
        expect(negative).toContain('3d render');
    });
    it('opens a sentence prompt with the look', () => {
        expect(buildImagePrompt({ entry: wood, options: { provider: 'natural', style: 'anime' } }).prompt.startsWith('An anime key visual in Japanese animation style')).toBe(true);
    });
});
