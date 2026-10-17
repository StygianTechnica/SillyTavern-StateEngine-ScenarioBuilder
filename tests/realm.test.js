import { inheritedRealm, placeOverview, lookLines, describeMagic, describeTech } from '../src/library/world-options.js';
import { normalizeEntryMeta } from '../src/store/schema.js';
import { buildImagePrompt, worldExclusions } from '../src/images/prompt.js';

// A multiverse: a galaxy at TL11, one planet in it a dead-magic desert, a
// city on that planet, and a fantasy realm beside the galaxy.
const overview = { worldType: 'multiverse', magic: { presence: 'common' }, tech: { level: 'tl4', absent: ['gunpowder'] } };
const parents = { planet: 'galaxy', city: 'planet' };
const meta = {
    galaxy: { realm: { worldType: 'science_fiction', tech: 'tl11' } },
    planet: { realm: { magic: 'none', notes: 'a tidally locked desert world' } },
    realm: { realm: { worldType: 'fantasy', tech: 'tl3', magic: 'everywhere' } },
};

describe('the world in a place', () => {
    it('inherits each setting from the nearest place that sets it', () => {
        expect(inheritedRealm(parents, meta, 'city')).toEqual({ worldType: 'science_fiction', magic: 'none', tech: 'tl11', notes: 'a tidally locked desert world', from: { worldType: 'galaxy', magic: 'planet', tech: 'galaxy', notes: 'planet' } });
        expect(inheritedRealm(parents, meta, 'nowhere')).toEqual({ worldType: '', magic: '', tech: '', notes: '', from: {} });
    });

    it('is the overview with the place\'s kind of world, magic and technology', () => {
        const city = placeOverview(overview, parents, meta, 'city');
        expect(city.worldType).toBe('science_fiction');
        expect(city.magic.presence).toBe('none');
        expect(city.tech).toMatchObject({ level: 'tl11', absent: [] });
        expect(city.placeNotes).toBe('a tidally locked desert world');
        expect(describeMagic(city.magic).limits.join(' ')).toMatch(/no magic/i);
        expect(describeTech(city.tech).lines.join(' ')).toContain('TL11');
        // Elsewhere, the setting's own.
        expect(placeOverview(overview, parents, meta, null)).toBe(overview);
        expect(placeOverview(overview, parents, meta, 'realm')).toMatchObject({ worldType: 'fantasy', magic: { presence: 'everywhere' }, tech: { level: 'tl3' } });
    });

    it('tells writers how it differs, and shapes the picture', () => {
        const city = placeOverview(overview, parents, meta, 'city');
        expect(lookLines(city)[0]).toBe('Here, the world is different: a tidally locked desert world.');
        expect(worldExclusions(city)).toContain('medieval castle');
        expect(worldExclusions(placeOverview(overview, parents, meta, 'realm'))).not.toContain('medieval castle');
        const { prompt } = buildImagePrompt({ entry: { type: 'location', name: 'Dune City', description: 'A city of glass.' }, overview: city, options: { style: 'painterly' } });
        expect(prompt).toContain('science fiction, futuristic technology');
        expect(prompt).toContain('painterly science fiction illustration');
    });

    it('is kept on a location\'s metadata', () => {
        expect(normalizeEntryMeta({ realm: { worldType: 'fantasy', tech: 'tl3', junk: 1 } }).realm).toEqual({ worldType: 'fantasy', magic: '', tech: 'tl3', notes: '' });
        expect(normalizeEntryMeta({}).realm).toEqual({ worldType: '', magic: '', tech: '', notes: '' });
    });
});
