// Assassins Inc: in the middle of a standoff with Delvin and Nichiro, an
// OPPOSED line of "Omicron Innovations/Enrique's team" started an Omicron crew
// at the museum, four new people - Omicron unnamed for seventy messages.
import { sideInStory } from '../src/ops/generate.js';
import { encounterOpen, repeatJob, JOB_GAP } from '../src/ops/detect.js';

const medina = { id: 'f1', name: 'Medina Syndicate' };
const omicron = { id: 'f2', name: 'Omicron Innovations' };
const enrique = { id: 'c1', name: 'Enrique Medina' };
const tole = { id: 'c2', name: 'Dr. Adrigo Tole' };
const factions = [medina, omicron];
const characters = [enrique, tole];
const memberships = new Map([['c1', ['f1']], ['c2', ['f2']]]);
const lib = { factions, characters, memberships };
const standoff = '"You mean the priceless perfume collection Enrique is so hell-bent on getting his hands on," Delvin corrects.';

describe('a group the story has in it', () => {
    it('takes the one the chat shows, of two run together', () => {
        expect(sideInStory("Omicron Innovations/Enrique's team", { recent: standoff, ...lib })).toBe('Medina Syndicate');
    });
    it('not a group the chat has not named', () => {
        expect(sideInStory('Omicron Innovations', { recent: standoff, ...lib })).toBe('');
    });
    it('by the faction or one of its people', () => {
        expect(sideInStory('Omicron Innovations', { recent: 'A badge read Omicron Innovations.', ...lib })).toBe('Omicron Innovations');
        expect(sideInStory('Omicron Innovations', { recent: 'Adrigo Tole stepped from the car.', ...lib })).toBe('');
        expect(sideInStory('Omicron Innovations', { recent: 'Dr. Adrigo Tole stepped from the car.', ...lib })).toBe('Omicron Innovations');
    });
    it('a person standing for their faction', () => {
        expect(sideInStory('Enrique Medina', { recent: standoff, ...lib })).toBe('Medina Syndicate');
    });
    it('a group the library does not have, across genres', () => {
        expect(sideInStory('the Pale Choir', { recent: 'Heralds of the Pale Choir sang at the gate.' })).toBe('the Pale Choir');
        expect(sideInStory('the Pale Choir', { recent: 'The market was quiet.' })).toBe('');
        expect(sideInStory('Ceres Salvagers', { recent: 'Ceres Salvagers hailed the ship.' })).toBe('Ceres Salvagers');
        expect(sideInStory('', { recent: 'Anything.' })).toBe('');
    });
});

describe('the same job again', () => {
    const job = { side: 'Medina Syndicate', sideId: 'f1', endedTurn: 829, leader: { objectId: 'delvin' }, boss: { objectId: 'enrique' }, crew: [{ objectId: 'nichiro' }] };
    const ops = [job, null, { side: 'Old', endedTurn: null }];
    it('the same side, soon after', () => {
        expect(repeatJob(ops, 834, { side: 'Medina Syndicate', sideIds: new Set(['f1']) })).toBe(true);
        expect(repeatJob(ops, 829 + JOB_GAP - 1, { side: 'Medina Syndicate' })).toBe(true);
    });
    it('a branch of it, under another name', () => {
        expect(repeatJob(ops, 834, { side: "Enrique's Posse", sideIds: new Set(['f9', 'f1']) })).toBe(true);
    });
    it('by the people, when no faction ties them', () => {
        expect(repeatJob(ops, 834, { side: "Enrique's Posse", memberIds: new Set(['nichiro']) })).toBe(true);
    });
    it('another side is free to start', () => {
        expect(repeatJob(ops, 834, { side: 'Omicron Innovations', sideIds: new Set(['f2']), memberIds: new Set(['tole']) })).toBe(false);
        expect(repeatJob([{ side: 'The Pale Choir', sideId: 'c1', endedTurn: 10 }], 12, { side: 'The Iron Oath', sideIds: new Set(['c2']) })).toBe(false);
    });
    it('and they may try again in time', () => {
        expect(repeatJob(ops, 829 + JOB_GAP, { side: 'Medina Syndicate', sideIds: new Set(['f1']) })).toBe(false);
    });
    it('nothing has ended: nothing to repeat', () => {
        expect(repeatJob([], 900, { side: 'Medina Syndicate' })).toBe(false);
    });
});

describe('one encounter at a time', () => {
    const lastOp = { leader: { objectId: 'delvin' }, crew: [{ objectId: 'nichiro' }, { objectId: '' }] };
    it('a fight under way', () => {
        expect(encounterOpen({ fight: { fighters: [{ name: 'Delvin' }], ended: false } })).toBe(true);
    });
    it('a fight over, or none', () => {
        expect(encounterOpen({ fight: { fighters: [{ name: 'Delvin' }], ended: true } })).toBe(false);
        expect(encounterOpen({})).toBe(false);
    });
    it('the last crew still in the scene', () => {
        expect(encounterOpen({ lastOp, castIds: ['cyril', 'nichiro'] })).toBe(true);
        expect(encounterOpen({ lastOp, castIds: ['cyril', 'inji'] })).toBe(false);
    });
});
