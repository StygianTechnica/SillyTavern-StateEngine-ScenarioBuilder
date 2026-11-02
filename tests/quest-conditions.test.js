import { describe, it, expect } from 'vitest';
import { conditionOf, conditionTarget } from '../src/quests/model.js';

// Assassins Inc: Archivist kept a mission's win condition as a plan of its
// own, and it was made into a quest.
const t22 = {
    kind: 'plan',
    title: 'Cyril\'s success conditions are extracting the asset undetected and reaching a',
    goal: 'Cyril\'s success conditions are extracting the asset undetected and reaching a designated extraction point',
    text: 'Cyril\'s success conditions are extracting the asset undetected and reaching a designated extraction point',
    involved: [{ name: 'Cyril' }, { name: 'Doc' }, { name: 'Galice Buckar' }],
    steps: [{ text: 'Cyril is tasked with locating and extracting a high-value asset in a virtual city' }],
};

describe('conditionOf', () => {
    it('sees a thread that only says how a quest is won', () => {
        expect(conditionOf(t22)).toEqual({ field: 'completion', text: t22.text });
        expect(conditionOf({ title: 'Win conditions for the trial', text: 'The trial is won when Kiri reaches the bell.' })?.field).toBe('completion');
        expect(conditionOf({ title: 'The heist', text: 'The mission fails if the guards raise the alarm.' })?.field).toBe('abandon');
    });
    it('leaves real quests alone', () => {
        for (const title of ['Prove Worth to Riven and White Cerberus through Infiltration Training', 'Perfect Stealth Drone Resonance Frequency', 'Investigate Urgent Priority Transmission', 'Research Cyril\'s Former Identity', 'Uncover Cyril\'s True Identity']) {
            expect(conditionOf({ title, text: `${title}.` })).toBeNull();
        }
        expect(conditionOf(null)).toBeNull();
    });
});

describe('conditionTarget', () => {
    const candidates = [
        { id: 'heist', texts: ['Extract the asset from the virtual city', 'Locate the high-value asset', 'Reach the extraction point'] },
        { id: 'drone', texts: ['Perfect the drone resonance frequency', 'Test resonance frequencies with Cyril'] },
    ];
    it('finds the quest it belongs to by the words they share', () => {
        expect(conditionTarget(t22, candidates)).toBe('heist');
    });
    it('names none when nothing clearly matches - the people alone do not count', () => {
        expect(conditionTarget(t22, [{ id: 'x', texts: ['Cyril, Doc and Galice talk'] }, candidates[1]])).toBeNull();
        expect(conditionTarget(t22, [])).toBeNull();
    });
});
