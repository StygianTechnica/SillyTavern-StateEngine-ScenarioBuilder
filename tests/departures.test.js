import { describe, it, expect } from 'vitest';
import { shownLeaving } from '../src/director/departures.js';

// Assassins Inc: Riven walked out twice and was brought straight back in.
const STORMS_OUT = 'Riven\'s face darkened at Cyril\'s rebuke, his eyes flashing with a mix of anger and hurt pride. With that, Riven stood up abruptly, his chair scraping against the floor as he turned on his heel and walked away. "Looks like you had quite the encounter with Riven," she commented. Galice\'s tone was gentle, her words aimed at reassuring Cyril rather than defending Riven.';
const EXITS = 'Riven paused at the armory door, his posture stiffening as he turned back to face Cyril. With that terse warning, he turned on his heel once more and exited the armory, leaving Cyril to absorb the weight of Riven\'s words.';

describe('shownLeaving', () => {
    it('sees someone walk out, though they are named after', () => {
        expect(shownLeaving(['Riven'], STORMS_OUT)).toBe(true);
        expect(shownLeaving(['Riven'], EXITS)).toBe(true);
    });
    it('reads the director\'s own situation line', () => {
        expect(shownLeaving(['Riven'], 'Galice reassures Cyril after Riven leaves.')).toBe(true);
    });
    it('lets someone who comes back in again', () => {
        expect(shownLeaving(['Riven'], `${STORMS_OUT} Moments later Riven came back, scowling.`)).toBe(false);
    });
    it('is false for someone only talked about or still here', () => {
        expect(shownLeaving(['Doc'], STORMS_OUT)).toBe(false);
        expect(shownLeaving(['Riven'], 'Riven leans on the workbench, arms crossed.')).toBe(false);
        expect(shownLeaving([], STORMS_OUT)).toBe(false);
    });
});
