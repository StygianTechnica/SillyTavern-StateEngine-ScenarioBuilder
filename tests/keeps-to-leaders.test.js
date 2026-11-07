import { describe, it, expect } from 'vitest';
// Assassins Inc: the world model wrote "Enrique Medina leads the Syndicate";
// the library has his father Serlos as its founder and leader.
import { keepsToLeaders, applyConditions } from '../src/world/situations.js';

describe('who leads a faction keeps to the library', () => {
    const leaders = ['Serlos Medina', 'Randrés Moriarty'];
    it('turns away a leader the library never named', () => {
        expect(keepsToLeaders('Enrique Medina leads the Syndicate, with his brother Bartin serving as enforcer.', leaders)).toBe(false);
    });
    it('takes one that names a leader, or says it changed hands', () => {
        expect(keepsToLeaders('Serlos Medina rules with an iron fist; Enrique handles deals.', leaders)).toBe(true);
        expect(keepsToLeaders('Enrique Medina took over after his father fell ill.', leaders)).toBe(true);
        expect(keepsToLeaders('The council of elders.', [])).toBe(true);
    });
    it('in a world pass, and never over one set by hand', () => {
        const world = { conditions: {} };
        const opts = { day: 5, resolve: () => 'f', nameOf: () => 'Medina Syndicate', leadersOf: () => leaders };
        applyConditions(world, [{ name: 'Medina Syndicate', standing: 'thriving', leadership: 'Enrique Medina leads the Syndicate.', mood: 'confident' }], opts);
        expect(world.conditions.f.leadership).toBe('');
        expect(world.conditions.f.mood).toBe('confident');
        world.conditions.f = { ...world.conditions.f, leadership: 'Tiago runs it day to day.', leadBy: 'user' };
        applyConditions(world, [{ name: 'Medina Syndicate', standing: 'strained', leadership: 'Serlos Medina leads.', mood: '' }], opts);
        expect(world.conditions.f.leadership).toBe('Tiago runs it day to day.');
        expect(world.conditions.f.leadBy).toBe('user');
    });
});
