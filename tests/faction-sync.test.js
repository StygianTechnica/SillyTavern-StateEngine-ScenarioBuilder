import { libraryMemberships, mergeFactions } from '../src/library/faction-sync.js';

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
