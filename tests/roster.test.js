import { describe, it, expect } from 'vitest';
// The Medina Syndicate: everyone was a "member of" relationship, all the
// same, and the story took Enrique (third in command) for its head.
import { normalizeRoster, addTier, placePerson, moveTier, removeTier, setTitle, rosterIds, rosterLeaders, placeIn, standingWords, rosterLines, tierFor, readRoster, buildRosterPrompt } from '../src/library/roster.js';
import { libraryMemberships } from '../src/library/faction-sync.js';

const tiers = () => {
    let r = addTier(addTier(addTier({}, 'Patriarch'), 'Underbosses'), 'Capos');
    const [a, b, c] = r.tiers.map((t) => t.id);
    r = placePerson(r, 'serlos', a, 'Founder and Leader');
    r = placePerson(r, 'tiago', b, '');
    r = placePerson(r, 'randres', b, 'Head of operations');
    r = placePerson(r, 'enrique', c, 'Power Broker');
    return { r, a, b, c };
};

describe('a chain of command', () => {
    it('holds people in tiers, top down', () => {
        const { r } = tiers();
        expect(rosterIds(r)).toEqual(['serlos', 'tiago', 'randres', 'enrique']);
        expect(rosterLeaders(r).map((p) => p.id)).toEqual(['serlos']);
        expect(placeIn(r, 'enrique')).toEqual({ tier: 2, tierName: 'Capos', title: 'Power Broker' });
        expect(standingWords(placeIn(r, 'enrique'))).toBe('Power Broker (Capos)');
        expect(standingWords(placeIn(r, 'tiago'))).toBe('Underbosses');
    });
    it('moves people and tiers, keeping titles', () => {
        const { r, b } = tiers();
        const moved = placePerson(r, 'enrique', b);
        expect(placeIn(moved, 'enrique')).toMatchObject({ tier: 1, title: 'Power Broker' });
        expect(setTitle(moved, 'enrique', 'Broker').tiers[1].people.find((p) => p.id === 'enrique').title).toBe('Broker');
        const up = moveTier(r, r.tiers[2].id, -1);
        expect(up.tiers.map((t) => t.name)).toEqual(['Patriarch', 'Capos', 'Underbosses']);
        expect(rosterIds(removeTier(r, b))).toEqual(['serlos', 'enrique']);
    });
    it('keeps one place per person', () => {
        expect(rosterIds(normalizeRoster({ tiers: [{ name: 'A', people: [{ id: 'x' }] }, { name: 'B', people: [{ id: 'x' }, { id: 'y' }] }] }))).toEqual(['x', 'y']);
    });
    it('reads as lines for a prompt', () => {
        const names = { serlos: 'Serlos Medina', tiago: 'Tiago Moriarty', randres: 'Randrés Moriarty', enrique: 'Enrique Medina' };
        expect(rosterLines(tiers().r, (id) => names[id])).toEqual([
            'Patriarch: Serlos Medina (Founder and Leader)',
            'Underbosses: Tiago Moriarty, Randrés Moriarty (Head of operations)',
            'Capos: Enrique Medina (Power Broker)',
        ]);
    });
    it('counts as membership', () => {
        const m = libraryMemberships([{ id: 'f', meta: { roster: tiers().r } }], []);
        expect(m.get('enrique')).toEqual(['f']);
    });
});

describe('a new member takes a fitting tier', () => {
    const corp = (() => { let r = addTier(addTier(addTier({}, 'C-Suite'), 'Directors'), 'Staff'); return r; })();
    it('a CEO or one who leads takes the top', () => {
        expect(tierFor(corp, { kind: 'member of', role: 'CEO of Omicron Innovations' })).toBe(corp.tiers[0].id);
        expect(tierFor(corp, { kind: 'leads', role: '' })).toBe(corp.tiers[0].id);
    });
    it('a role that names a tier takes it; else none', () => {
        expect(tierFor(corp, { kind: 'member of', role: 'Director of Research' })).toBe(corp.tiers[1].id);
        const mob = tiers().r;
        expect(tierFor(mob, { kind: 'member of', role: 'a capo in Bearville' })).toBe(mob.tiers[2].id);
        expect(tierFor(corp, { kind: 'member of', role: 'Security consultant' })).toBe('');
        expect(tierFor({}, { kind: 'leads' })).toBe('');
    });
});

describe('a suggested chain', () => {
    const people = [{ id: 'serlos', name: 'Serlos Medina', role: 'Founder and Leader' }, { id: 'enrique', name: 'Enrique Medina', role: 'Power Broker' }];
    it('asks for tiers named for the kind of group', () => {
        const p = buildRosterPrompt({ faction: { name: 'Medina Syndicate', description: 'A crime family.' }, people });
        expect(p.user).toContain('a mob family: Boss, Underboss, Capos');
        expect(p.user).toContain('1. Serlos Medina - Founder and Leader');
    });
    it('reads the answer by number', () => {
        const r = readRoster('Here: {"tiers":[{"name":"Boss","people":[{"n":1,"title":"Patriarch"}]},{"name":"Capos","people":[{"n":2,"title":"Power Broker"},{"n":9}]},{"name":"","people":[]}]}', people);
        expect(r.tiers.map((t) => t.name)).toEqual(['Boss', 'Capos']);
        expect(placeIn(r, 'enrique')).toMatchObject({ tier: 1, title: 'Power Broker' });
        expect(readRoster('no json', people)).toBe(null);
    });
});

import { normalizeEntryMeta } from '../src/store/schema.js';
describe('the store keeps them', () => {
    // The store keeps only the entry fields it knows: the chain and "In
    // person" were dropped on every save, so Add a tier did nothing.
    it('keeps a roster and In person through a save', () => {
        const m = normalizeEntryMeta({ roster: { tiers: [{ id: 't1', name: 'Boss', people: [{ id: 'serlos', title: 'Patriarch' }] }] }, inPerson: 'later' });
        expect(m.roster.tiers[0]).toEqual({ id: 't1', name: 'Boss', people: [{ id: 'serlos', title: 'Patriarch' }] });
        expect(m.inPerson).toBe('later');
        expect(normalizeEntryMeta({ inPerson: 'nonsense' }).inPerson).toBe('');
    });
});
