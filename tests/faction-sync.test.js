import { libraryMemberships, mergeFactions, isFactionTracking, trackingDefs, wantedFactions, TIES_FIELD } from '../src/library/faction-sync.js';

describe('faction memberships from the library', () => {
    it('come from a faction\'s members and from member-type relationships to it', () => {
        const factions = [{ id: 'fac_guild', base: { members: ['chr_mira'] } }, { id: 'fac_watch', members: [] }];
        const relations = [
            { from: 'chr_tobin', to: 'fac_watch', kind: 'Member of' },
            { from: 'chr_tobin', to: 'fac_guild', kind: 'distrusts' },
            { from: 'chr_ash', to: 'fac_watch', kind: 'leads' },
            { from: 'chr_ash', to: 'chr_mira', kind: 'member of' },
        ];
        const m = libraryMemberships(factions, relations);
        expect(m.get('chr_mira')).toEqual(['fac_guild']);
        expect(m.get('chr_tobin')).toEqual(['fac_watch']);
        expect(m.get('chr_ash')).toEqual(['fac_watch']);
    });
});

describe('merging into the runtime list', () => {
    it('adds the library\'s, keeps the story\'s own', () => {
        expect(mergeFactions(['fac_story'], ['fac_guild'], [])).toEqual(['fac_story', 'fac_guild']);
    });
    it('takes out one it wrote that the library no longer has, but not the story\'s', () => {
        expect(mergeFactions(['fac_story', 'fac_guild'], [], ['fac_guild'])).toEqual(['fac_story']);
        expect(mergeFactions(['fac_guild'], ['fac_guild'], ['fac_guild'])).toEqual(['fac_guild']);
    });
});

describe('faction tracking', () => {
    const defs = [
        { id: 'a', name: 'role', scope: 'global', type: 'string' },
        { id: 'b', name: 'factions', scope: 'chat', type: 'array', itemType: 'object', itemObjectType: 'faction', behaviors: { prompted: true } },
        { id: 'c', name: 'mood', scope: 'chat', type: 'enum', behaviors: { prompted: true } },
    ];
    it('makes factions settable and adds the story-detected ties after it', () => {
        const next = trackingDefs(defs);
        expect(next.map((d) => d.name)).toEqual(['role', 'factions', TIES_FIELD, 'mood']);
        expect(next[1]).toMatchObject({ id: 'b', behaviors: { prompted: false } });
        expect(next[2]).toMatchObject({ scope: 'chat', type: 'array', itemObjectType: 'faction', behaviors: { prompted: true } });
        expect(next[3].behaviors.prompted).toBe(true);
        expect(isFactionTracking(defs)).toBe(false);
        expect(isFactionTracking(next)).toBe(true);
        expect(trackingDefs(next).filter((d) => d.name === TIES_FIELD)).toHaveLength(1);
    });
    it('needs a factions field to take over', () => {
        expect(trackingDefs([{ name: 'mood' }])).toBeNull();
    });
    it('holds a character to the library plus what the story shows, real factions only', () => {
        expect(wantedFactions(['fac_a'], ['fac_b', 'fac_a', 'loc_x'], ['fac_a', 'fac_b'])).toEqual(['fac_a', 'fac_b']);
        expect(wantedFactions(undefined, ['fac_b'], ['fac_a'])).toEqual([]);
    });
});
