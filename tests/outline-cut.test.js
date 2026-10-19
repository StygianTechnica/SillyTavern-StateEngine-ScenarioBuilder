// An outline answer cut off by the token limit still gives its complete
// beats; a volume's steer is kept in full.
import { closeCutJson, readOutline } from '../src/planner/prompts.js';
import { normalizeGm } from '../src/planner/model.js';

describe('a JSON answer cut off', () => {
    it('keeps everything up to its last complete object, closed', () => {
        const raw = '```json\n{"premise":"The road to the temple","acts":[{"title":"The Road","beats":[{"text":"They leave Redhaven at dawn.","ties":["Remus"]},{"text":"Undead harry the column","ti';
        const fixed = closeCutJson(raw);
        const outline = readOutline(JSON.parse(fixed));
        expect(outline.premise).toBe('The road to the temple');
        expect(outline.acts[0].beats.map((b) => b.text)).toEqual(['They leave Redhaven at dawn.']);
    });

    it('leaves a whole answer as it is, and gives up on nothing complete', () => {
        expect(closeCutJson('noise {"a":{"b":1}} more')).toBe('{"a":{"b":1}}');
        expect(closeCutJson('{"acts":[{"title":"Cut')).toBe('');
        expect(closeCutJson('no json')).toBe('');
    });
});

describe("a volume's steer", () => {
    it('is kept in full, not cut at 600 characters', () => {
        const long = 'The cache is a trap. '.repeat(60).trim();
        expect(normalizeGm({ volume: { number: 2, direction: long } }).volume.direction).toBe(long);
    });
});
