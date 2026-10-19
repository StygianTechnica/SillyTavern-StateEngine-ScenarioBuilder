// A volume recap that is not clean JSON is still read, as far as it goes.
import { readRecapText } from '../src/planner/prompts.js';

const PROSE = 'The siege of Redhaven tested every alliance. Remus fell unconscious holding the gate, and woke to a morning bought with blood. Graxx offered a deal for the cache.';

describe('reading a recap that is not clean JSON', () => {
    it('takes a recap with an unescaped quote', () => {
        const raw = `{"title":"The Long Night","recap":"${PROSE} He said "never again" and meant it.","threads":["The cache near the ruined temple","Niamh's doubts"]}`;
        const r = readRecapText(raw);
        expect(r.title).toBe('The Long Night');
        expect(r.recap).toContain('He said "never again" and meant it.');
        expect(r.threads).toEqual(['The cache near the ruined temple', "Niamh's doubts"]);
    });

    it('takes what there is of an answer cut short', () => {
        const r = readRecapText(`\`\`\`json\n{"title":"Ashes","recap":"${PROSE}\n\nThen the horde`);
        expect(r.title).toBe('Ashes');
        expect(r.recap).toMatch(/^The siege of Redhaven[\s\S]*\n\nThen the horde$/);
    });

    it('takes plain prose, with a title line if there is one', () => {
        const r = readRecapText(`Title: The Long Night\n\n${PROSE}`);
        expect(r).toMatchObject({ title: 'The Long Night', recap: PROSE });
        expect(readRecapText(PROSE).recap).toBe(PROSE);
    });

    it('gives up on nothing usable', () => {
        expect(readRecapText('')).toBeNull();
        expect(readRecapText('{"title":"x"}')).toBeNull();
        expect(readRecapText('Sorry.')).toBeNull();
    });
});
