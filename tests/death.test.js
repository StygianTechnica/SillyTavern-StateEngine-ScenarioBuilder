import { normalizeDead, deadIds, withoutDead, deadText, isDead, deathsFrom, deadByName } from '../src/state/death.js';
import { parseDirectorNote, dossierText, buildDirectorPrompt } from '../src/director/prompt.js';
import { normalizeChatDoc } from '../src/store/schema.js';
import { buildGuidance, guidanceParts } from '../src/guidance/build.js';

const doc = { dead: normalizeDead([
    { id: 'chr_aldric', name: 'Lord Aldric', how: 'run through by Varyn', at: '2026-10-20', source: 'director' },
    { id: 'chr_aldric', name: 'Lord Aldric again' },
    { name: 'no id' },
]) };

describe('the dead of a story', () => {
    it('are kept once each, with how they died', () => {
        expect(doc.dead).toEqual([{ id: 'chr_aldric', name: 'Lord Aldric', how: 'run through by Varyn', at: '2026-10-20', source: 'director', reply: null, wasHere: '' }]);
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

    it('remember the reply they died in, and go when it is taken back - those the user marked stay', () => {
        const dead = normalizeDead([
            { id: 'chr_a', name: 'Aldric', source: 'director', reply: 12, wasHere: 'castIds' },
            { id: 'chr_b', name: 'Bren', source: 'director', reply: 8 },
            { id: 'chr_c', name: 'Cass', source: 'user' },
            { id: 'crt_d', name: 'Old Dog', source: 'director', reply: 14, wasHere: 'creatureIds' },
        ]);
        expect(deathsFrom(dead, 12).map((d) => d.id)).toEqual(['chr_a', 'crt_d']);
        expect(deathsFrom(dead, 9).map((d) => d.id)).toEqual(['chr_a', 'crt_d']);
        expect(deathsFrom(dead, 0).map((d) => d.id)).toEqual(['chr_a', 'chr_b', 'crt_d']);
        expect(deathsFrom(dead, 15)).toEqual([]);
        expect(dead[0].wasHere).toBe('castIds');
    });

    it('can rise when the story brings them back (RISES), kept out of the prose', () => {
        const parsed = parseDirectorNote('RISES | Lord Aldric | raised by the necromancer\nREVIVED | none\n\nHis eyes open.');
        expect(parsed.risings).toEqual([{ name: 'Lord Aldric', how: 'raised by the necromancer' }]);
        expect(parsed.note).toBe('His eyes open.');
        expect(deadByName(doc.dead, 'lord aldric')?.id).toBe('chr_aldric');
        expect(deadByName(doc.dead, 'Someone else')).toBeNull();
    });

    it('the director is told it may report a rising only while someone is dead', () => {
        const base = { cast: [{ name: 'Remus', player: true }], userName: 'Remus', messages: [] };
        expect(buildDirectorPrompt({ ...base, deadText: deadText(doc) }).prompt).toContain('RISES | <name>');
        expect(buildDirectorPrompt(base).prompt).not.toContain('RISES | <name>');
    });
});

describe('the dead keep who they were', () => {
    it('is told with their ties, so a small model does not fill the gap', async () => {
        const { deadText: text } = await import('../src/state/death.js');
        const d = { dead: normalizeDead([{ id: 'chr_varyn', name: 'Varyn Vance', how: "at Maziel's hands" }]) };
        expect(text(d, { about: () => 'rogue, champion of Ferunox' })).toBe("Varyn Vance, rogue, champion of Ferunox (at Maziel's hands).");
    });

    it('never lets a correction put a power or the dead in the scene', async () => {
        const { placesTheAbsent } = await import('../src/state/death.js');
        const names = ['Ferunox, the Sovereign of the Unbound Ember', 'Ferunox', 'Varyn Vance'];
        expect(placesTheAbsent('Ferunox, the Sovereign of the Unbound Ember is still present in this scene.', names)).toBe(true);
        expect(placesTheAbsent('Varyn Vance is in this scene.', names)).toBe(true);
        expect(placesTheAbsent('Niamh is still present in this scene.', names)).toBe(false);
        expect(placesTheAbsent('The scene is now at the Graveyard.', names)).toBe(false);
    });
});

describe('a death the story already showed', () => {
    it('is seen in the story before the reply that reported it', async () => {
        const { shownDeadIn } = await import('../src/state/death.js');
        expect(shownDeadIn('Varyn Vance', "Niamh rushed past to find Kael looming over Varyn's lifeless form.")).toBe(true);
        expect(shownDeadIn('Varyn Vance', 'Kael held Varyn\'s bleeding body in his arms.')).toBe(true);
        expect(shownDeadIn('Varyn Vance', 'Varyn parried the blow and pressed on.')).toBe(false);
        expect(shownDeadIn('Varyn Vance', 'The knight was dead. Varyn wiped his blade.')).toBe(false);
    });
});
