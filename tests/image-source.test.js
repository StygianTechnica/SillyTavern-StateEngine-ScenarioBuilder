import { describe, it, expect } from 'vitest';
import { imageSourceFor, buildImagePrompt } from '../src/images/prompt.js';
import { normalizeEntryMeta } from '../src/store/schema.js';

describe('which description a picture is drawn from', () => {
    it('is the newer of the saved one and the chat\'s, unless picked', () => {
        // No chat description: the saved one.
        expect(imageSourceFor({ narrative: '', descriptionAt: '' })).toBe('saved');
        // The story changed it after the last save.
        expect(imageSourceFor({ narrative: 'Scarred now.', narrativeAt: '2026-10-27T10:00:00Z', descriptionAt: '2026-10-26T10:00:00Z' })).toBe('chat');
        // The user edited the description since.
        expect(imageSourceFor({ narrative: 'Scarred now.', narrativeAt: '2026-10-27T10:00:00Z', descriptionAt: '2026-10-27T12:00:00Z' })).toBe('saved');
        // Saved before dates were kept: the chat's, as before.
        expect(imageSourceFor({ narrative: 'Scarred now.', narrativeAt: '2026-10-27T10:00:00Z' })).toBe('chat');
        // Picked wins.
        expect(imageSourceFor({ narrative: 'Scarred now.', narrativeAt: '2026-10-27T10:00:00Z', picked: 'saved' })).toBe('saved');
        expect(normalizeEntryMeta({ descriptionAt: '2026-10-27T12:00:00Z' }).descriptionAt).toBe('2026-10-27T12:00:00Z');
    });

    it('follows the saved description once the chat\'s is not used', () => {
        const entry = { type: 'character', name: 'Inji', description: 'A lean man with close-cropped white hair and piercing blue eyes, in a sleek black suit.' };
        const p = buildImagePrompt({ entry, narrative: '', options: { provider: 'midjourney', style: 'anime' } }).prompt;
        expect(p).toContain('white hair');
    });
});
