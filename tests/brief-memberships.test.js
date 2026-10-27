import { describe, it, expect } from 'vitest';
import { briefMemberships, memberKindOf, libraryMemberships } from '../src/library/faction-sync.js';
import { withMemberships } from '../src/generate/run.js';

const factions = [
    { id: 'fac_cerb', name: 'White Cerberus', aliases: ['the Dogs'] },
    { id: 'fac_omi', name: 'Omicron Innovations' },
    { id: 'fac_hand', name: 'Iron Hand' },
    { id: 'fac_tide', name: 'Tidewardens' },
    { id: 'fac_fleet', name: 'Ninth Fleet' },
    { id: 'fac_nypd', name: 'NYPD' },
];
const kinds = (brief) => Object.fromEntries(briefMemberships(brief, factions).map((m) => [m.id, m.kind]));

describe('who a new character belongs to, from the idea', () => {
    it('reads a boss as leading and a member as one of them, across genres', () => {
        // Cyberpunk
        expect(kinds('The boss of White Cerberus, a scarred netrunner')).toEqual({ fac_cerb: 'leads' });
        expect(kinds('a White Cerberus enforcer who hates Omicron Innovations')).toEqual({ fac_cerb: 'member of' });
        expect(kinds('a corporate fixer working for Omicron Innovations')).toEqual({ fac_omi: 'member of' });
        expect(kinds("the Dogs' new lieutenant")).toEqual({ fac_cerb: 'member of' });
        // Fantasy
        expect(kinds('An old priestess who leads the Tidewardens')).toEqual({ fac_tide: 'leads' });
        expect(kinds('a young knight sworn to the Iron Hand')).toEqual({ fac_hand: 'member of' });
        expect(kinds('a smuggler in the Iron Hand, an expert with knives')).toEqual({ fac_hand: 'member of' });
        // Sci-fi
        expect(kinds('Commander of the Ninth Fleet, tired of war')).toEqual({ fac_fleet: 'leads' });
        // Real world
        expect(kinds('a detective with the NYPD, member of the NYPD bomb squad')).toEqual({ fac_nypd: 'member of' });
    });

    it('leaves out a faction the idea only sets them against or near', () => {
        expect(kinds('a rival of White Cerberus')).toEqual({});
        expect(kinds('a smuggler who owes the Iron Hand money')).toEqual({});
        expect(kinds('a former member of the Iron Hand')).toEqual({});
        expect(kinds('an Omicron Innovations spy inside White Cerberus')).toEqual({});
        expect(kinds('a hunter of the Tidewardens')).toEqual({});
        expect(kinds('a merchant who has heard of the Iron Hand')).toEqual({});
    });

    it('makes the model\'s words for belonging count as membership', () => {
        expect(memberKindOf('boss of')).toBe('leads');
        expect(memberKindOf('leader')).toBe('leads');
        expect(memberKindOf('enforcer for')).toBe('member of');
        expect(memberKindOf('works for')).toBe('works for');
        expect(memberKindOf('loyal agent')).toBe('member of');
        expect(memberKindOf('rival')).toBeNull();
        expect(memberKindOf('former member')).toBeNull();
    });

    it('puts the idea\'s memberships first, over what the model wrote', () => {
        const model = [
            { otherId: 'fac_cerb', name: 'White Cerberus', kind: 'ally' },
            { otherId: 'fac_omi', name: 'Omicron Innovations', kind: 'enemy' },
            { otherId: 'chr_vex', name: 'Vex', kind: 'friend' },
        ];
        const out = withMemberships(model, 'The boss of White Cerberus', factions);
        expect(out).toEqual([
            { otherId: 'fac_cerb', name: 'White Cerberus', kind: 'leads' },
            { otherId: 'fac_omi', name: 'Omicron Innovations', kind: 'enemy' },
            { otherId: 'chr_vex', name: 'Vex', kind: 'friend' },
        ]);
        // No idea: the model's "enforcer for" still makes them a member.
        const plain = withMemberships([{ otherId: 'fac_hand', name: 'Iron Hand', kind: 'enforcer for' }], '', factions);
        const members = libraryMemberships(factions, plain.map((r) => ({ from: 'chr_new', to: r.otherId, kind: r.kind })));
        expect(members.get('chr_new')).toEqual(['fac_hand']);
    });
});
