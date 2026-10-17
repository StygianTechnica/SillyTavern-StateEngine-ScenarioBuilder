import { filterEntries, sortEntries, tagsOf, chatStatusOf, entityHistory } from '../src/ui/catalog-model.js';
import { relationsOf } from '../src/library/relations.js';

const parents = { market: 'city', stall: 'market' };
const entries = [
    { id: 'city', type: 'location', name: 'City', meta: { tags: ['urban'] } },
    { id: 'market', type: 'location', name: 'Market', meta: { tags: ['urban', 'busy'] } },
    { id: 'stall', type: 'location', name: 'Stall', meta: { tags: [] } },
    { id: 'mira', type: 'character', name: 'Mira', aliases: ['The Widow'], description: 'innkeeper', meta: { tags: [], pinned: true } },
    { id: 'blade', type: 'item', name: 'Blade', base: { owner: 'mira', location: 'stall' }, meta: { tags: ['weapon'] } },
    { id: 'guild', type: 'faction', name: 'Guild', base: { members: ['mira'], related_entity_ids: ['market'] }, meta: { tags: [] } },
];
const doc = { canonical: { locationId: 'market', castIds: ['mira'] }, inPlay: ['market', 'mira', 'city'] };

describe('catalog filters', () => {
    it('searches names, aliases, tags and descriptions', () => {
        expect(filterEntries(entries, { search: 'widow' }).map((e) => e.id)).toEqual(['mira']);
        expect(filterEntries(entries, { search: 'busy' }).map((e) => e.id)).toEqual(['market']);
    });

    it('filters by tag, chat status and place', () => {
        expect(filterEntries(entries, { tag: 'urban' }).map((e) => e.id)).toEqual(['city', 'market']);
        expect(filterEntries(entries, { status: 'play' }, { doc }).map((e) => e.id)).toEqual(['city']);
        expect(filterEntries(entries, { within: 'market' }, { parents }).map((e) => e.id)).toEqual(['market', 'stall', 'blade']);
    });

    it('sorts with pinned first', () => {
        expect(sortEntries(entries, 'name').map((e) => e.id)[0]).toBe('mira');
        expect(sortEntries(entries.filter((e) => e.type === 'location'), 'status', doc).map((e) => e.id)).toEqual(['market', 'city', 'stall']);
    });

    it('lists tags and statuses', () => {
        expect(tagsOf(entries)).toEqual(['busy', 'urban', 'weapon']);
        expect(chatStatusOf('mira', doc)).toBe('scene');
        expect(chatStatusOf('stall', doc)).toBe('unused');
    });
    it('counts creatures in the scene', () => {
        expect(chatStatusOf('zombies', { canonical: { castIds: [], creatureIds: ['zombies'] } })).toBe('scene');
    });
});

describe('relationships', () => {
    it('reads references both ways and the tree', () => {
        const r = relationsOf(entries.find((e) => e.id === 'mira'), entries, parents, (_t, f) => f.toUpperCase());
        expect(r.incoming).toEqual([{ id: 'blade', field: 'owner', label: 'OWNER' }, { id: 'guild', field: 'members', label: 'MEMBERS' }]);
        const market = relationsOf(entries.find((e) => e.id === 'market'), entries, parents);
        expect(market.parentPath).toEqual(['city']);
        expect(market.children).toEqual(['stall']);
        expect(market.incoming).toEqual([{ id: 'guild', field: 'related_entity_ids', label: 'Related' }]);
        const blade = relationsOf(entries.find((e) => e.id === 'blade'), entries, parents);
        expect(blade.outgoing.map((o) => [o.field, o.ids])).toEqual([['owner', ['mira']], ['location', ['stall']]]);
    });
});

describe('entity history', () => {
    it('collects what happened to one entry, newest first', () => {
        const history = entityHistory({
            history: [
                { at: '2026-01-01', before: { castIds: [] }, after: { castIds: ['mira'] }, source: 'user' },
                { at: '2026-01-03', before: { castIds: ['mira'] }, after: { castIds: [] }, source: 'validation' },
                { at: '2026-01-02', before: { weather: [] }, after: { weather: ['Rainy'] }, source: 'user' },
            ],
            drift: [{ at: '2026-01-04', objectId: 'mira', text: 'Mira left', resolution: 'accepted' }],
            narrative: { mira: { text: 'scarred', updatedAt: '2026-01-05' } },
        }, 'mira');
        expect(history.map((h) => h.text)).toEqual(['Current description changed', 'Mira left', 'Left the scene', 'Joined the scene']);
    });
});
