// A rejection taken off the Review list stays a rejection.
import { normalizeChatDoc } from '../src/store/schema.js';
import { detectDrift } from '../src/validate/drift.js';

describe('a hidden rejection', () => {
    it('is kept, with its flag', () => {
        const doc = normalizeChatDoc({ rejected: [{ type: 'location', name: 'The Bleakfast', hidden: true }, { type: 'quest', name: 'Zombie Purge' }] });
        expect(doc.rejected).toEqual([{ type: 'location', name: 'The Bleakfast', hidden: true }, { type: 'quest', name: 'Zombie Purge' }]);
    });

    it('still keeps the story from bringing it back', () => {
        const bleak = { id: 'loc_b', type: 'location', name: 'The Bleakfast', confirmed: true };
        const items = detectDrift({
            canonical: { locationId: 'loc_a', castIds: [] },
            observed: { location: 'loc_b', cast: [] },
            objects: new Map([['loc_b', bleak], ['loc_a', { id: 'loc_a', type: 'location', name: 'Gate', confirmed: true }]]),
            rejected: [{ type: 'location', name: 'The Bleakfast', hidden: true }],
        });
        expect(items.find((x) => x.field === 'location')).toMatchObject({ classification: 'contradiction' });
    });
});
