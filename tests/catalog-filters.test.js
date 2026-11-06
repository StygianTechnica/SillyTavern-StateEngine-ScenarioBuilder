import {
    filterEntries, sortEntries, groupEntries, quickMatch, factionsByEntry, fieldText, addTags, removeTag, cleanTag, tagHue,
    normalizeFilter, isFiltering, saveFilter, reparentCheck, NO_FACTION, EMPTY_FILTER,
} from '../src/ui/catalog-model.js';

const entries = [
    { id: 'mira', type: 'character', name: 'Mira', base: { role: 'Innkeeper', factions: ['guild'] }, meta: { tags: ['Villain', 'act2'] } },
    { id: 'bors', type: 'character', name: 'Bors', base: { role: 'Guard captain' }, meta: { tags: ['act2'], origin: 'story', canonLocked: true } },
    { id: 'kel', type: 'character', name: 'Kel', base: { role: '' }, confirmed: false, meta: { tags: [], origin: 'director', provisional: true } },
    { id: 'zed', type: 'character', name: 'Zed', base: { role: 'guard' }, meta: { tags: ['villain'], generated: ['role'], pinned: true } },
    { id: 'sun', type: 'lore', name: 'The Sun', meta: { power: { on: true } } },
    { id: 'guild', type: 'faction', name: 'Guild', base: { members: ['bors'], related_entity_ids: ['market'] }, meta: {} },
    { id: 'watch', type: 'faction', name: 'Abbey Watch', base: { members: ['zed', 'bors'] }, meta: {} },
    { id: 'market', type: 'location', name: 'Market', meta: {} },
];
const people = entries.filter((e) => e.type === 'character');
const names = new Map(entries.map((e) => [e.id, e.name]));
const nameOf = (id) => names.get(id) ?? '';
const factions = factionsByEntry(entries);
const doc = { canonical: { castIds: ['mira'] }, inPlay: ['bors'], dead: [{ id: 'bors' }] };
const ids = (list) => list.map((e) => e.id);

describe('quick filters', () => {
    it('knows active, inactive, the player, the dead, powers, canon, the story and what to review', () => {
        const ctx = { doc, playerId: 'mira' };
        const pick = (q) => ids(entries.filter((e) => quickMatch(q, e, ctx)));
        expect(pick('active')).toEqual(['mira', 'bors']);
        expect(pick('inactive')).not.toContain('mira');
        expect(pick('player')).toEqual(['mira']);
        expect(pick('dead')).toEqual(['bors']);
        expect(pick('power')).toEqual(['sun']);
        expect(pick('locked')).toEqual(['bors']);
        expect(pick('story')).toEqual(['bors', 'kel']);
        expect(pick('unreviewed')).toEqual(['kel', 'zed']);
    });
    it('combines several quick filters (all must hold)', () => {
        expect(ids(filterEntries(people, { quick: ['active', 'dead'] }, { doc }))).toEqual(['bors']);
    });
});

describe('tags in filters', () => {
    it('matches all of / any of / none of, whatever the case', () => {
        expect(ids(filterEntries(people, { tags: ['villain', 'act2'], tagMode: 'all' }))).toEqual(['mira']);
        expect(ids(filterEntries(people, { tags: ['villain', 'act2'], tagMode: 'any' }))).toEqual(['mira', 'bors', 'zed']);
        expect(ids(filterEntries(people, { tags: ['villain'], tagMode: 'none' }))).toEqual(['bors', 'kel']);
    });
    it('adds, cleans and removes tags', () => {
        expect(addTags(['villain'], '#Villain, ally ,  act  II', ['Act II'])).toEqual(['villain', 'ally', 'Act II']);
        expect(addTags([], '  ,#, ')).toEqual([]);
        expect(cleanTag('##red   hand')).toBe('red hand');
        expect(removeTag(['a', 'b'], 'a')).toEqual(['b']);
    });
    it('gives a tag the same colour every time', () => {
        expect(tagHue('Villain')).toBe(tagHue('villain'));
        expect(tagHue('villain')).toBeGreaterThanOrEqual(0);
        expect(tagHue('villain')).toBeLessThan(360);
    });
});

describe('factions and fields', () => {
    it('reads memberships from both sides', () => {
        expect(factions.get('bors').sort()).toEqual(['guild', 'watch']);
        expect(factions.get('mira')).toEqual(['guild']);
        expect(factions.get('market')).toEqual(['guild']);
        expect(factions.has('kel')).toBe(false);
    });
    it('filters by a faction or by none', () => {
        expect(ids(filterEntries(people, { faction: 'watch' }, { factions }))).toEqual(['bors', 'zed']);
        expect(ids(filterEntries(people, { faction: NO_FACTION }, { factions }))).toEqual(['kel']);
    });
    it('filters by any field: part of the value, or set at all', () => {
        expect(ids(filterEntries(people, { field: 'role', fieldValue: 'guard' }))).toEqual(['bors', 'zed']);
        expect(ids(filterEntries(people, { field: 'role' }))).toEqual(['mira', 'bors', 'zed']);
        expect(fieldText(entries[0], 'factions', nameOf)).toBe('Guild');
        expect(fieldText({ base: { armed: true } }, 'armed')).toBe('yes');
    });
});

describe('sorting and groups', () => {
    it('sorts by faction and by a field, the unset last, pinned first', () => {
        expect(ids(sortEntries(people, 'faction', null, { factions, nameOf }))).toEqual(['zed', 'bors', 'mira', 'kel']);
        expect(ids(sortEntries(people.map((e) => ({ ...e, meta: { ...e.meta, pinned: false } })), 'field:role', null, { nameOf }))).toEqual(['zed', 'bors', 'mira', 'kel']);
    });
    it('sorts numbers in a field as numbers', () => {
        const acts = [{ id: 'a', name: 'A', base: { act: '10' } }, { id: 'b', name: 'B', base: { act: '2' } }];
        expect(ids(sortEntries(acts, 'field:act'))).toEqual(['b', 'a']);
    });
    it('groups a faction sort under headings', () => {
        const sorted = sortEntries(people, 'faction', null, { factions, nameOf });
        expect(groupEntries(sorted, 'faction', { factions, nameOf }).map((g) => [g.label, ids(g.entries)])).toEqual([
            ['Pinned', ['zed']], ['Abbey Watch', ['bors']], ['Guild', ['mira']], ['No faction', ['kel']],
        ]);
        expect(groupEntries(sorted, 'name')).toEqual([{ label: '', entries: sorted }]);
    });
});

describe('the remembered filter', () => {
    it('normalizes what the settings hold', () => {
        expect(normalizeFilter(null)).toEqual(EMPTY_FILTER);
        expect(normalizeFilter({ tags: ['a', 3], tagMode: 'odd', quick: ['dead', 'nope'] })).toEqual({ ...EMPTY_FILTER, tags: ['a'], quick: ['dead'] });
        expect(isFiltering(normalizeFilter({}))).toBe(false);
        expect(isFiltering(normalizeFilter({ faction: 'guild' }))).toBe(true);
    });
    it('saves a filter under a name, replacing one of the same name and type', () => {
        let list = saveFilter([], { name: 'My villains', type: 'character', filter: { tags: ['villain'] }, sort: 'name' });
        list = saveFilter(list, { name: 'my villains', type: 'character', filter: { tags: ['villain'], quick: ['active'] }, sort: 'faction' });
        list = saveFilter(list, { name: 'My villains', type: 'location', filter: {}, sort: 'name' });
        expect(list).toHaveLength(2);
        expect(list.find((s) => s.type === 'character')).toMatchObject({ name: 'my villains', sort: 'faction', filter: { quick: ['active'] } });
        expect(saveFilter(list, { name: '  ', type: 'character', filter: {} })).toBe(list);
    });
});

describe('dropping a place on a place', () => {
    const parents = { market: 'city', stall: 'market' };
    const places = new Set(['city', 'market', 'stall', 'docks']);
    it('allows a move inside another place, or out to no parent', () => {
        expect(reparentCheck(parents, 'docks', 'city', places)).toBe('ok');
        expect(reparentCheck(parents, 'stall', null, places)).toBe('ok');
        expect(reparentCheck(parents, 'stall', 'city', places)).toBe('ok');
    });
    it('refuses itself, its own parts, where it already is, and what is not a place', () => {
        expect(reparentCheck(parents, 'market', 'market', places)).toBe('same');
        expect(reparentCheck(parents, 'city', 'stall', places)).toBe('cycle');
        expect(reparentCheck(parents, 'market', 'city', places)).toBe('unchanged');
        expect(reparentCheck(parents, 'city', null, places)).toBe('unchanged');
        expect(reparentCheck(parents, 'mira', 'city', places)).toBe('invalid');
        expect(reparentCheck(parents, '', 'city', places)).toBe('invalid');
    });
});
