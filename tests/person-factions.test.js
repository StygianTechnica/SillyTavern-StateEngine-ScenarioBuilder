// A person's own sheet shows their factions and rank in each - read from the
// same places the faction's chain of command uses.
import { factionsOf } from '../src/library/person-factions.js';
import { placePerson, removePerson, rosterOf } from '../src/library/roster.js';

const medina = {
    id: 'f_medina', name: 'Medina Syndicate',
    meta: { roster: { tiers: [{ id: 't1', name: 'Patriarch', people: [{ id: 'serlos', title: 'Founder' }] }, { id: 't3', name: 'Power Brokers', people: [{ id: 'enrique', title: 'Third in command' }] }, { id: 't4', name: 'Crew', people: [] }] } },
};
const cerberus = { id: 'f_wc', name: 'White Cerberus', base: { members: ['inji'] }, meta: {} };
const omicron = { id: 'f_om', name: 'Omicron Innovations', meta: {} };
const factions = [omicron, medina, cerberus];
const relations = [
    { from: 'cyril', to: 'f_wc', kind: 'member of' },
    { from: 'delvin', to: 'f_medina', kind: 'works for' },
    { from: 'cyril', to: 'f_medina', kind: 'rival' },
];

describe("a person's factions, from their own side", () => {
    it('lists each faction they belong to, with their rank where they have one', () => {
        expect(factionsOf('enrique', factions, relations).map((m) => [m.faction.name, m.place?.tierName, m.place?.title])).toEqual([['Medina Syndicate', 'Power Brokers', 'Third in command']]);
        expect(factionsOf('inji', factions, relations).map((m) => [m.faction.name, m.place])).toEqual([['White Cerberus', null]]);
        // A tie that is not membership (a rival) is not belonging.
        expect(factionsOf('cyril', factions, relations).map((m) => m.faction.name)).toEqual(['White Cerberus']);
        expect(factionsOf('nobody', factions, relations)).toEqual([]);
    });

    it('a rank picked from the person\'s sheet is the one the faction shows', () => {
        const before = factionsOf('delvin', factions, relations)[0];
        expect(before.place).toBeNull();
        const roster = placePerson(rosterOf(medina), 'delvin', 't4', 'Drone man');
        const after = factionsOf('delvin', [{ ...medina, meta: { roster } }], relations)[0];
        expect([after.place.tierName, after.place.title]).toEqual(['Crew', 'Drone man']);
        // No rank again: still one of them, with no rank.
        const unranked = factionsOf('delvin', [{ ...medina, meta: { roster: removePerson(roster, 'delvin') } }], relations)[0];
        expect([unranked.faction.name, unranked.place]).toEqual(['Medina Syndicate', null]);
    });
});
