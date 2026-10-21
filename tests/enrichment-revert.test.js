import { enrichmentRecord, normalizeEnrichments, revertPlan, ENRICHMENTS_KEPT } from '../src/generate/revert.js';
import { normalizeEntryMeta } from '../src/store/schema.js';

describe('an enrichment recorded', () => {
    it('keeps what each field held before and what was written, and nothing that did not change', () => {
        const r = enrichmentRecord({ id: 'e1', at: 't', source: 'sheet', before: { description: 'Mine.', mood: '', traits: [] }, after: { name: 'X', description: 'Generated.', mood: '', traits: ['bold'] } });
        expect(r).toEqual({ id: 'e1', at: 't', source: 'sheet', fields: { description: { before: 'Mine.', after: 'Generated.' }, traits: { before: [], after: ['bold'] } }, reverted: [] });
        expect(enrichmentRecord({ id: 'e2', before: { a: 'same' }, after: { a: 'same' } })).toBe(null);
    });

    it('is stored on the entry, the latest few', () => {
        const many = Array.from({ length: ENRICHMENTS_KEPT + 3 }, (_, i) => ({ id: `e${i}`, fields: { description: { before: '', after: `v${i}` } } }));
        const kept = normalizeEntryMeta({ enrichments: many }).enrichments;
        expect(kept).toHaveLength(ENRICHMENTS_KEPT);
        expect(kept[0].id).toBe('e3');
        expect(normalizeEnrichments([{ id: 'x', fields: {} }, null])).toEqual([]);
    });
});

describe('putting it back', () => {
    const record = { id: 'e1', fields: { description: { before: 'Mine.', after: 'Generated.' }, traits: { before: null, after: ['bold'] } }, reverted: [] };

    it('puts every field back, or just the one asked for', () => {
        expect(revertPlan(record, { description: 'Generated.', traits: ['bold'] })).toEqual({ patch: { description: 'Mine.', traits: [] }, changedSince: [] });
        expect(revertPlan(record, { description: 'Generated.' }, ['description'])).toEqual({ patch: { description: 'Mine.' }, changedSince: [] });
    });

    it('says which fields were changed since, so the user can agree first', () => {
        expect(revertPlan(record, { description: 'Edited by hand.', traits: ['bold'] }).changedSince).toEqual(['description']);
    });

    it('leaves alone what was already put back', () => {
        expect(revertPlan({ ...record, reverted: ['description'] }, {}).patch).toEqual({ traits: [] });
    });
});
