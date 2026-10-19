// Intimate scenes: a character's own note reaches the narrator only while
// the scene is flagged so - and never the player character's.
import { isIntimate, intimacySection } from '../src/guidance/intimacy.js';
import { buildGuidance, guidanceParts } from '../src/guidance/build.js';
import { normalizeEntryMeta, normalizeChatDoc } from '../src/store/schema.js';

describe('whether the scene is intimate', () => {
    it("follows the story's reading on auto, the user's choice otherwise", () => {
        expect(isIntimate('auto', true)).toBe(true);
        expect(isIntimate('auto', 'true')).toBe(true);
        expect(isIntimate('auto', false)).toBe(false);
        expect(isIntimate('auto', '')).toBe(false);
        expect(isIntimate('on', false)).toBe(true);
        expect(isIntimate('off', true)).toBe(false);
    });
});

describe('the intimate-scene guidance', () => {
    const cast = [
        { name: 'Varyn', nsfw: 'Slow, teasing, playful; checks in often.' },
        { name: 'Remus', player: true, nsfw: 'Inexperienced, shy.' },
        { name: 'Graxx', nsfw: '' },
    ];

    it('gives the notes of those present who have one, never the player', () => {
        const s = intimacySection({ intimate: true, cast });
        expect(s.full).toContain('- Varyn: Slow, teasing, playful; checks in often.');
        expect(s.full).not.toContain('Remus');
        expect(s.full).not.toContain('Graxx');
    });

    it('is left out when the scene is not intimate, or no one has a note', () => {
        expect(intimacySection({ intimate: false, cast })).toBeNull();
        expect(intimacySection({ intimate: true, cast: [cast[2]] })).toBeNull();
    });

    it('reaches the guidance closest to the reply, only while intimate', () => {
        const input = { cast, intimate: true };
        expect(guidanceParts(buildGuidance(input)).guidance_direction).toContain('Varyn: Slow, teasing');
        expect(buildGuidance({ ...input, intimate: false }).text).not.toContain('teasing');
    });
});

describe('stored', () => {
    it('as entry meta and the chat\'s choice', () => {
        expect(normalizeEntryMeta({ nsfw: 'Gentle.' }).nsfw).toBe('Gentle.');
        expect(normalizeEntryMeta({}).nsfw).toBe('');
        expect(normalizeChatDoc({}).nsfwMode).toBe('auto');
        expect(normalizeChatDoc({ nsfwMode: 'on' }).nsfwMode).toBe('on');
        expect(normalizeChatDoc({ nsfwMode: 'maybe' }).nsfwMode).toBe('auto');
    });
});
