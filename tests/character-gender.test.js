import { describe, it, expect } from 'vitest';
import { genderOf } from '../src/generate/run.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';

const character = { id: 'character', noun: 'character' };

describe('a person is a he or a she', () => {
    it('takes the one picked, else what the idea and their text say', () => {
        expect(genderOf({ chosen: 'f', texts: ['a grizzled old man'] })).toBe('f');
        // Cyberpunk, fantasy, sci-fi, real world.
        expect(genderOf({ texts: ['a netrunner who sold her own memories'] })).toBe('f');
        expect(genderOf({ texts: ['the priest of a drowned god'] })).toBe('m');
        expect(genderOf({ texts: ['', 'The captain lost his ship at Vega.'] })).toBe('m');
        expect(genderOf({ texts: ['a waitress at a Brooklyn diner'] })).toBe('f');
        // The idea comes before their own text.
        expect(genderOf({ texts: ['a widow', 'He was once a soldier.'] })).toBe('f');
        expect(genderOf({ texts: ['a smuggler with a conscience', ''] })).toBe('');
    });

    it('tells the writer he or she, and never they', () => {
        const { user } = buildGenerationPrompt({ task: 'create', type: character, fields: [], fixedName: 'Kiri Vance', gender: 'f', person: true });
        expect(user).toContain('Kiri Vance is a woman: write she / her everywhere - never "they" or "them" for this one person');
        const him = buildGenerationPrompt({ task: 'enrich', type: character, entry: { name: 'Bram', values: {} }, fields: [{ name: 'description', label: 'Description', kind: 'text' }], gender: 'm', person: true });
        expect(him.user).toContain('Bram is a man: write he / him everywhere');
        // Not known (a name someone gave): the model reads it from the name, and keeps to it.
        const open = buildGenerationPrompt({ task: 'fill', type: character, entry: { name: 'Sam Reyes', values: {} }, fields: [{ name: 'description', label: 'Description', kind: 'text' }], person: true });
        expect(open.user).toContain('Sam Reyes is a man or a woman - whichever their name');
        expect(open.user).toContain('never "they" or "them" for this one person');
        // Not a person: nothing said.
        const place = buildGenerationPrompt({ task: 'create', type: { id: 'location', noun: 'location' }, fields: [], fixedName: 'Arcadia' });
        expect(place.user).not.toContain('never "they"');
    });
});
