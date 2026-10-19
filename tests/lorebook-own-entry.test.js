// An object's own lorebook entry over a mention of it in another entry:
// "Niamh, one of their skilled scouts" in the Redhaven entry made Niamh,
// and her own entry - looks, past, sister, Varyn - must not be lost to it.
import { readEntries, isOwnEntry, heldFromMention, ownOver, keepDetail, buildExtractPrompt } from '../src/import/lorebook.js';

const NIAMH_TEXT = [
    'Niamh is a 35-year-old skilled scout and hunter in Graxx\'s group, the Ravagers. She has shoulder-length raven-black hair, piercing emerald eyes and a lean athletic build.',
    '            She is fiercely independent but fiercely loyal to those she trusts, with quiet confidence and a dry wit.',
    '            Born into poverty, she joined the Ravagers to protect herself and her younger sister, Aisling, and rose through the ranks.',
    '            Her long friendship with Varyn carries an unspoken romantic undertone.',
].join('\n');

const [redhaven, niamh] = readEntries('Alvarand', {
    entries: {
        17: { uid: 17, comment: 'Redhaven Entry', key: ['Redhaven', 'Niamh'], content: 'Redhaven is a fortified settlement. Niamh, one of their skilled scouts, deals with outsiders.' },
        18: { uid: 18, comment: 'Niamh', key: ['Niamh', 'Varyn'], content: NIAMH_TEXT },
    },
});

describe("an object's own entry", () => {
    const obj = { name: 'Niamh', aliases: ['the scout'] };

    it('is the entry titled with its name or an alias, not one that mentions it', () => {
        expect(isOwnEntry(niamh, obj)).toBe(true);
        expect(isOwnEntry(redhaven, obj)).toBe(false);
        expect(isOwnEntry({ title: 'The Scout', keys: [] }, obj)).toBe(true);
    });

    it('may replace only what came from another lorebook entry', () => {
        expect(heldFromMention({ source: redhaven.source }, niamh)).toBe(true);
        expect(heldFromMention({ source: niamh.source }, niamh)).toBe(false);
        expect(heldFromMention({ source: '' }, niamh)).toBe(false);
        expect(heldFromMention({}, niamh)).toBe(false);
    });

    it('replaces what differs, fills blanks, adds aliases, and reports what it replaced', () => {
        const existing = { name: 'Niamh', aliases: [], description: 'Skilled scout for Redhaven.', personality: 'Cunning, resourceful', goals: '', role: 'Scout' };
        const { patch, replaced } = ownOver(existing, {
            description: 'A 35-year-old scout and hunter with raven-black hair.',
            personality: 'Independent, loyal, dry wit',
            goals: 'Protect her sister Aisling',
            role: 'Scout',
            relationships: '',
            aliases: ['Varyn'],
        });
        expect(patch).toEqual({
            description: 'A 35-year-old scout and hunter with raven-black hair.',
            personality: 'Independent, loyal, dry wit',
            goals: 'Protect her sister Aisling',
            aliases: ['Varyn'],
        });
        expect(replaced).toEqual({ description: 'Skilled scout for Redhaven.', personality: 'Cunning, resourceful' });
    });
});

describe('keeping the detail', () => {
    it("uses the entry's own text when the model cut it to a summary", () => {
        const full = keepDetail('Skilled scout and intermediary for Redhaven.', niamh);
        expect(full).toContain('Aisling');
        expect(full).toContain('Varyn');
        expect(full).not.toMatch(/\n {2,}/);
    });

    it('keeps a description that already holds the detail, and short entries as they are', () => {
        const long = NIAMH_TEXT.replace(/\s+/g, ' ').slice(0, 400);
        expect(keepDetail(long, niamh)).toBe(long);
        expect(keepDetail('A scout.', redhaven)).toBe('A scout.');
    });

    it('asks for every detail, not a summary', () => {
        const prompt = buildExtractPrompt(niamh, { typeNoun: 'character', name: 'Niamh', fields: [] });
        expect(prompt.user).toMatch(/keeping every detail/);
        expect(prompt.user).not.toMatch(/in a few sentences/);
    });
});
