import { describe, it, expect } from 'vitest';
import { notInPerson } from '../src/guidance/spoken.js';

const people = [
    { id: 'e', name: 'Enrique Medina' },
    { id: 'b', name: 'Bartin Medina' },
    { id: 'i', name: 'Inji Miyama' },
    { id: 'k', name: 'Lord Varric' },
    { id: 'r', name: 'Rook' },
];

describe('those the player says will not turn up in person', () => {
    it('Assassins Inc: Enrique sends his people', () => {
        expect(notInPerson(['"But Enrique wouldn\'t show up at a small heist like this in person."'], people)).toEqual(['Enrique Medina']);
        expect(notInPerson(['"Well, Enrique would never do something like that himself."'], people)).toEqual(['Enrique Medina']);
        expect(notInPerson(['He didn\'t think Enrique would be there in person.'], people)).toEqual(['Enrique Medina']);
    });
    it('in other stories too', () => {
        expect(notInPerson(['Varric won\'t come himself - he never leaves the keep.'], people)).toEqual(['Lord Varric']);
        expect(notInPerson(['"Rook isn\'t going to show up, he sends drones."'], people)).toEqual(['Rook']);
    });
    it('not for his people, not when here, and undone when they come', () => {
        expect(notInPerson(['Enrique\'s men won\'t show up until midnight.'], people)).toEqual([]);
        expect(notInPerson(['Enrique wouldn\'t come in person.'], people, { here: ['e'] })).toEqual([]);
        expect(notInPerson(['Enrique wouldn\'t come in person.', 'Then Enrique walks in, smiling.'], people)).toEqual([]);
        expect(notInPerson(['Enrique wouldn\'t come in person.', 'If Enrique shows up, we run.'], people)).toEqual(['Enrique Medina']);
        expect(notInPerson(['Enrique is a piece of shit.'], people)).toEqual([]);
    });
});

import { heldOutNamed } from '../src/guidance/spoken.js';
import { planSection } from '../src/planner/model.js';

describe('a boss set to stay out of the field', () => {
    const cast = [
        { id: 'e', name: 'Enrique Medina', meta: { inPerson: 'remote' } },
        { id: 'i', name: 'Inji Miyama', meta: {} },
    ];
    it('is named when the messages bring them up and they are not here', () => {
        expect(heldOutNamed(cast, ['Enrique has a reputation for being cautious.']).remote).toEqual(['Enrique Medina']);
        expect(heldOutNamed(cast, ['Inji checks the door.']).remote).toEqual([]);
        expect(heldOutNamed(cast, ['Enrique smiles.'], { here: ['e'] }).remote).toEqual([]);
    });
});

describe('agendas say who is not in the scene', () => {
    const gm = { outline: { acts: [] }, agenda: [], queue: [], day: { moments: [], agendas: [
        { who: 'Enrique Medina', wants: 'the art', will: 'probe for Cyril' },
        { who: 'Inji', wants: 'the mission done', will: '' },
    ] } };
    it('marks them', () => {
        const text = planSection(gm, { here: ['Cyril', 'Inji Miyama', 'Zane'], notInPerson: ['Enrique Medina'] });
        expect(text).toContain('Enrique Medina (not here, and not coming in person: works only through their people) wants');
        expect(text).toContain('Inji wants');
        const loose = planSection(gm, { here: ['Cyril', 'Inji Miyama'] });
        expect(loose).toContain('Enrique Medina (not in this scene: acts from where they are, or through others) wants');
    });
});

describe('an end boss saved for their beat', () => {
    const boss = [{ id: 'e', name: 'Enrique Medina', meta: { inPerson: 'later' } }];
    it('is held until the beat now names them', () => {
        expect(heldOutNamed(boss, ['Enrique steps out of the shadows.'], { beatTies: ['Cyril', 'Inji', 'Zane'] })).toEqual({ remote: [], later: ['Enrique Medina'] });
        expect(heldOutNamed(boss, ['Enrique steps out of the shadows.'], { beatTies: ['Enrique Medina'] }).later).toEqual([]);
        expect(heldOutNamed(boss, ['Enrique steps out.'], { beatTies: ['Enrique'] }).later).toEqual([]);
    });
    it('is tagged in the agendas', () => {
        const gm = { outline: { acts: [] }, agenda: [], queue: [], day: { moments: [], agendas: [{ who: 'Enrique Medina', wants: 'the art', will: '' }] } };
        expect(planSection(gm, { here: ['Cyril'], later: ['Enrique Medina'] })).toContain('Enrique Medina (works from the shadows');
    });
});

import { heldBackText } from '../src/guidance/spoken.js';
describe('the day plan hears who is held back', () => {
    it('names those saved for later and those who stay out of the field', () => {
        const people = [
            { id: 't', name: 'Dr. Tole', meta: { inPerson: 'later' } },
            { id: 'e', name: 'Enrique Medina', meta: { inPerson: 'remote' } },
            { id: 'i', name: 'Inji Miyama', meta: {} },
        ];
        const text = heldBackText(people, { beatTies: ['Cyril'] });
        expect(text).toContain('Working from the shadows, not met in person today: Dr. Tole');
        expect(text).toContain('Stay out of the field: Enrique Medina');
        expect(text).not.toContain('Inji');
        expect(heldBackText(people, { beatTies: ['Dr. Tole'], here: ['e'] })).toBe('');
    });
});
