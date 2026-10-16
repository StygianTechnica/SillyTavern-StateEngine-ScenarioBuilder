import { detectDrift, readObserved, applyAccepted, correctionText, describeItem, DEFAULT_POLICIES } from '../src/validate/drift.js';
import { emptyCanonical } from '../src/store/schema.js';

const parents = { market: 'city', docks: 'city', stall: 'market' };
const objects = new Map([
    ['market', { id: 'market', type: 'location', name: 'Market', confirmed: true }],
    ['docks', { id: 'docks', type: 'location', name: 'Docks', confirmed: true }],
    ['stall', { id: 'stall', type: 'location', name: 'Stall', confirmed: true }],
    ['moon', { id: 'moon', type: 'location', name: 'Moon', confirmed: true }],
    ['inn', { id: 'inn', type: 'location', name: 'Strange Inn', confirmed: false }],
    ['mira', { id: 'mira', type: 'character', name: 'Mira', confirmed: true }],
    ['bob', { id: 'bob', type: 'character', name: 'Bob', confirmed: true }],
    ['ghost', { id: 'ghost', type: 'character', name: 'Ghost', confirmed: false }],
]);
const canon = (patch) => ({ ...emptyCanonical(), ...patch });
const observed = (raw) => readObserved(raw);

describe('drift detection', () => {
    it('reports nothing when observed matches canonical', () => {
        const items = detectDrift({ canonical: canon({ locationId: 'market', castIds: ['mira'] }), observed: observed({ scene_location: 'market', scene_characters: ['mira'] }), objects, parents });
        expect(items).toEqual([]);
    });

    it('takes the first location named when none is set', () => {
        const [item] = detectDrift({ canonical: canon(), observed: observed({ scene_location: 'market' }), objects, parents });
        expect(item).toMatchObject({ field: 'location', classification: 'library_match', action: 'accept' });
    });

    it('treats a move within the tree as natural progress', () => {
        const [item] = detectDrift({ canonical: canon({ locationId: 'market' }), observed: observed({ scene_location: 'stall' }), objects, parents });
        expect(item).toMatchObject({ classification: 'natural', action: 'accept' });
    });

    it('follows the story to an unconnected place by default', () => {
        const [item] = detectDrift({ canonical: canon({ locationId: 'market' }), observed: observed({ scene_location: 'moon' }), objects, parents });
        expect(item).toMatchObject({ classification: 'library_match', action: 'accept' });
    });

    it('asks about it when the policy says ask', () => {
        const [item] = detectDrift({ canonical: canon({ locationId: 'market' }), observed: observed({ scene_location: 'moon' }), objects, parents, policies: { ...DEFAULT_POLICIES, location: 'ask' } });
        expect(item.action).toBe('ask');
    });

    it('adjusts when the policy says canonical wins', () => {
        const [item] = detectDrift({ canonical: canon({ locationId: 'market' }), observed: observed({ scene_location: 'moon' }), objects, parents, policies: { ...DEFAULT_POLICIES, location: 'canonical' } });
        expect(item.action).toBe('adjust');
        expect(correctionText(item, { nameOf: (id) => objects.get(id)?.name ?? id })).toBe('The scene is still at Market, not Moon.');
    });

    it('follows the story to a place it invents (State Engine reviews confirmation)', () => {
        const [item] = detectDrift({ canonical: canon({ locationId: 'market' }), observed: observed({ scene_location: 'inn' }), objects, parents });
        expect(item).toMatchObject({ classification: 'candidate', action: 'accept' });
    });

    it('asks or adjusts for inventions when the policy says so', () => {
        const input = { canonical: canon({ locationId: 'market' }), observed: observed({ scene_location: 'inn' }), objects, parents };
        expect(detectDrift({ ...input, policies: { ...DEFAULT_POLICIES, location: 'ask' } })[0].action).toBe('ask');
        expect(detectDrift({ ...input, policies: { ...DEFAULT_POLICIES, location: 'canonical' } })[0].action).toBe('adjust');
    });

    it('treats a rejected name as a contradiction', () => {
        const [item] = detectDrift({ canonical: canon({ locationId: 'market' }), observed: observed({ scene_location: 'inn' }), objects, parents, rejected: [{ type: 'location', name: 'strange inn' }] });
        expect(item).toMatchObject({ classification: 'contradiction', action: 'adjust' });
    });

    it('splits cast changes into joins and exits', () => {
        const items = detectDrift({ canonical: canon({ castIds: ['mira'] }), observed: observed({ scene_characters: ['bob', 'ghost'] }), objects, parents });
        expect(items.map((i) => [i.op, i.objectId, i.classification, i.action])).toEqual([
            ['add', 'bob', 'library_match', 'accept'],
            ['add', 'ghost', 'candidate', 'accept'],
            ['remove', 'mira', 'natural', 'accept'],
        ]);
    });

    it('follows the story when everyone leaves', () => {
        const [item] = detectDrift({ canonical: canon({ castIds: ['mira', 'bob'] }), observed: observed({ scene_characters: [] }), objects, parents });
        expect(item).toMatchObject({ op: 'clear', action: 'accept' });
    });

    it('ignores fields the model left blank', () => {
        expect(detectDrift({ canonical: canon({ weather: ['Rainy'], indoor: true }), observed: observed({ scene_weather: [], scene_isindoor: '' }), objects, parents })).toEqual([]);
    });

    it('is idempotent: an observed value already seen is not raised again', () => {
        const input = { canonical: canon({ locationId: 'market' }), observed: observed({ scene_location: 'moon' }), objects, parents, policies: { ...DEFAULT_POLICIES, location: 'ask' } };
        expect(detectDrift(input)).toHaveLength(1);
        expect(detectDrift({ ...input, lastObserved: observed({ scene_location: 'moon' }) })).toEqual([]);
    });

    it('lets decorative fields follow the story', () => {
        const items = detectDrift({ canonical: canon({ weather: ['Clear'], temperature: 'Mild' }), observed: observed({ scene_weather: ['Rainy'], scene_temperature: 'Cool' }), objects, parents });
        expect(items.map((i) => [i.field, i.action])).toEqual([['weather', 'accept'], ['temperature', 'accept']]);
    });
});

describe('applying and describing', () => {
    it('applies accepted items to a new canonical object', () => {
        const before = canon({ locationId: 'market', castIds: ['mira'] });
        let next = applyAccepted(before, { field: 'cast', op: 'add', objectId: 'bob' });
        next = applyAccepted(next, { field: 'cast', op: 'remove', objectId: 'mira' });
        next = applyAccepted(next, { field: 'location', observed: 'docks' });
        next = applyAccepted(next, { field: 'indoor', observed: false });
        expect(next).toMatchObject({ locationId: 'docks', castIds: ['bob'], indoor: false });
        expect(before.castIds).toEqual(['mira']);
    });

    it('describes items for the review queue', () => {
        const nameOf = (id) => objects.get(id)?.name ?? id;
        expect(describeItem({ field: 'location', canonical: 'market', observed: 'moon', reason: 'moved to an unconnected place' }, nameOf)).toBe('Location: Market → Moon (moved to an unconnected place)');
        expect(describeItem({ field: 'cast', op: 'remove', objectId: 'mira' }, nameOf)).toBe('Characters present: Mira left');
    });
});
