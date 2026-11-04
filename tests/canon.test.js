// Continuity against the library, in code (src/guidance/canon.js): Dr.
// Adrigo Tole, of Omicron Innovations, written as "a consultant for White
// Cerberus"; and the dead speaking.

import { factionSlips, deadActing, correctionText } from '../src/guidance/canon.js';
import { buildNow } from '../src/guidance/build.js';

const factions = [
    { id: 'fac_o', name: 'Omicron Innovations', aliases: ['Omicron'] },
    { id: 'fac_w', name: 'White Cerberus', aliases: [] },
];
const tole = { name: 'Doctor Adrigo Tole', aliases: ['Dr. Tole', 'Tole'], factionIds: ['fac_o'] };
const vex = { name: 'Vex', aliases: [], factionIds: ['fac_w'] };
const cyril = { name: 'Cyril', aliases: [], factionIds: ['fac_w'], player: true };
const here = [tole, vex, cyril];

describe('factionSlips', () => {
    it('catches someone here tied to a faction they are not of', () => {
        expect(factionSlips(here, factions, ['- Doctor Adrigo Tole: Tole, a consultant for White Cerberus, wants a deal.'])).toEqual([
            { name: 'Doctor Adrigo Tole', faction: 'White Cerberus', theirs: ['Omicron Innovations'] },
        ]);
        expect(factionSlips(here, factions, ['Tole works for White Cerberus now.'])).toHaveLength(1);
        expect(factionSlips(here, factions, ['The White Cerberus consultant, Tole, smiled.'])).toHaveLength(1);
    });

    it('leaves their own side, someone else\'s tie, denials and plain mentions alone', () => {
        const fine = [
            'Tole, lead researcher for Omicron Innovations, nodded.',
            'Vex, an agent of White Cerberus, glared at Tole.',
            'Tole glared at Vex, an agent of White Cerberus.',
            'Tole is not an agent of White Cerberus.',
            'Tole wants to take Cyril away from White Cerberus.',
            'Tole met them at the White Cerberus safehouse.',
        ];
        expect(factionSlips(here, factions, fine)).toEqual([]);
    });

    it('never checks the player character, or someone with no faction', () => {
        expect(factionSlips(here, factions, ['Cyril, an agent of Omicron Innovations, waits.'])).toEqual([]);
        expect(factionSlips([{ name: 'Zane', aliases: [], factionIds: [] }], factions, ['Zane works for Omicron.'])).toEqual([]);
    });
});

describe('deadActing', () => {
    const dead = [{ name: 'Marcus Hale', aliases: ['Hale'] }];
    it('catches the dead speaking or acting', () => {
        expect(deadActing(dead, 'Marcus smiled at her. "Good to see you."')).toEqual(['Marcus Hale']);
        expect(deadActing(dead, 'Hale quietly said nothing.')).toEqual(['Marcus Hale']);
    });
    it('leaves memories, bodies and a return from death alone', () => {
        expect(deadActing(dead, 'She remembered how Marcus smiled.')).toEqual([]);
        expect(deadActing(dead, 'Marcus lay still; his body cooled.')).toEqual([]);
        expect(deadActing(dead, 'The ritual took hold. Marcus breathed again. Marcus stood.')).toEqual([]);
    });
});

describe('the correction in the chat', () => {
    it('leads the in-chat note', () => {
        const corrections = correctionText({ slips: [{ name: 'Doctor Adrigo Tole', faction: 'White Cerberus', theirs: ['Omicron Innovations'] }], dead: ['Marcus Hale'] });
        expect(corrections).toMatch(/^Correction: Doctor Adrigo Tole is not of White Cerberus and never was - Doctor Adrigo Tole is of Omicron Innovations\./);
        expect(corrections).toMatch(/Correction: Marcus Hale is dead\./);
        const note = buildNow({ corrections, settled: ['The deal is off.'], cast: [{ name: 'Cyril', player: true }] });
        expect(note).toMatch(/^\[Game master's note for this reply, not part of the story: Correction: Doctor Adrigo Tole/);
        expect(note).toMatch(/Keep to what the story has settled/);
        expect(buildNow({ corrections: '' })).toBe('');
        expect(correctionText()).toBe('');
    });
});
