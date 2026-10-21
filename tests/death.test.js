import { normalizeDead, deadIds, withoutDead, deadText, isDead } from '../src/state/death.js';
import { parseDirectorNote, dossierText } from '../src/director/prompt.js';
import { normalizeChatDoc } from '../src/store/schema.js';
import { buildGuidance, guidanceParts } from '../src/guidance/build.js';

const doc = { dead: normalizeDead([
    { id: 'chr_aldric', name: 'Lord Aldric', how: 'run through by Varyn', at: '2026-10-20', source: 'director' },
    { id: 'chr_aldric', name: 'Lord Aldric again' },
    { name: 'no id' },
]) };

describe('the dead of a story', () => {
    it('are kept once each, with how they died', () => {
        expect(doc.dead).toEqual([{ id: 'chr_aldric', name: 'Lord Aldric', how: 'run through by Varyn', at: '2026-10-20', source: 'director' }]);
        expect(isDead(doc, 'chr_aldric')).toBe(true);
        expect(normalizeChatDoc({}).dead).toEqual([]);
    });

    it('are taken out of any cast', () => {
        expect(withoutDead(['chr_remus', 'chr_aldric', 'chr_varyn'], deadIds(doc))).toEqual(['chr_remus', 'chr_varyn']);
    });

    it('are reported by the director with a DIES line, kept out of the prose', () => {
        const parsed = parseDirectorNote('DIES | Lord Aldric | run through by Varyn\nDIED | Two guards\nDIES | none\n\nThe hall falls silent.');
        expect(parsed.deaths).toEqual([{ name: 'Lord Aldric', how: 'run through by Varyn' }, { name: 'Two guards', how: '' }]);
        expect(parsed.note).toBe('The hall falls silent.');
    });

    it('are told to the director and the narrator, never to be shown alive', () => {
        expect(deadText(doc)).toBe('Lord Aldric (run through by Varyn).');
        expect(dossierText({ cast: [{ name: 'Remus', player: true }], deadText: deadText(doc) })).toContain('THE DEAD (gone for good');
        const parts = guidanceParts(buildGuidance({ location: { path: ['Hall'] }, dead: deadText(doc), budget: 2000 }));
        expect(parts.guidance_scene).toContain('never written alive, speaking or acting: Lord Aldric (run through by Varyn).');
        expect(deadText({ dead: [] })).toBe('');
    });
});
