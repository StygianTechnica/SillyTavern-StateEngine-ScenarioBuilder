// A character's Background and Voice & mannerisms: added once to the
// setting, a description of looks only beside a Background, voice in the
// guidance, and an intimate-scene note written from who they are.
import { missingCharacterFields, lengthenCharacterFields, CHARACTER_EXTRA_FIELDS } from '../src/library/character-fields.js';
import { editorKind } from '../src/library/fields.js';
import { buildGenerationPrompt, APPEARANCE_ABOUT } from '../src/generate/prompt.js';
import { buildIntimacyPrompt } from '../src/generate/intimacy.js';
import { buildCast } from '../src/guidance/build.js';

const character = { id: 'character', noun: 'character', label: 'Character', plural: 'Characters' };

describe('the extra character fields', () => {
    it('adds only what is missing', () => {
        expect(missingCharacterFields([{ name: 'personality' }]).map((f) => f.name)).toEqual(['background', 'voice']);
        expect(missingCharacterFields([{ name: 'background' }, { name: 'voice' }])).toEqual([]);
    });

    it('are long text, so State Engine never cuts them at 300 characters', () => {
        expect(CHARACTER_EXTRA_FIELDS.every((f) => f.multiline === true)).toBe(true);
    });

    it('makes those added before as short text long text, keeping their ids - and nothing else', () => {
        const defs = [
            { id: 'f1', name: 'personality', type: 'string', multiline: true },
            { id: 'f2', name: 'background', type: 'string' },
            { id: 'f3', name: 'voice', type: 'string', multiline: true },
            { id: 'f4', name: 'role', type: 'string' },
        ];
        const out = lengthenCharacterFields(defs);
        expect(out.map((d) => [d.id, d.multiline === true])).toEqual([['f1', true], ['f2', true], ['f3', true], ['f4', false]]);
        expect(lengthenCharacterFields(out)).toBeNull();
    });

    it("tells generation what each is for, from the field's description", () => {
        const voice = editorKind(CHARACTER_EXTRA_FIELDS[1]);
        expect(voice).toMatchObject({ name: 'voice', label: 'Voice & mannerisms', kind: 'longtext' });
        expect(voice.about).toMatch(/speech patterns/);
    });

    it('makes the description looks only when a Background is beside it', () => {
        const fields = CHARACTER_EXTRA_FIELDS.map(editorKind);
        const withBg = buildGenerationPrompt({ task: 'enrich', type: character, entry: { name: 'Kael', values: {} }, fields });
        expect(withBg.user).toContain(APPEARANCE_ABOUT);
        const without = buildGenerationPrompt({ task: 'enrich', type: character, entry: { name: 'Kael', values: {} }, fields: [] });
        expect(without.user).not.toContain(APPEARANCE_ABOUT);
    });
});

describe('voice in the guidance', () => {
    it('says how each one present talks', () => {
        const text = buildCast({ cast: [{ name: 'Kael', voice: 'Clipped, dry, never wastes a word; cracks his knuckles before a fight.' }] });
        expect(text).toMatch(/Kael.*Voice: clipped, dry/);
    });
});

describe('the intimate-scene note', () => {
    it('is written from who they are, keeping what is already there', () => {
        const p = buildIntimacyPrompt({ name: 'Varyn', personality: 'Playful, protective', background: 'Raised in the fire cult', voice: 'Teasing drawl', existing: 'Slow and gentle.' });
        expect(p.user).toContain('Personality: Playful, protective');
        expect(p.user).toContain('Background: Raised in the fire cult');
        expect(p.user).toContain('Voice & mannerisms: Teasing drawl');
        expect(p.user).toMatch(/keep every point of it[\s\S]*Slow and gentle\./);
        expect(p.plain).toBe(true);
    });
});
