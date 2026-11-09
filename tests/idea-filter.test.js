// Assassins Inc: 14 quest ideas and details offered, 14 dismissed.
import { narrowIdeas, tiedToNow, ENRICH_REFUSALS } from '../src/planner/idea-filter.js';

const player = ['Cyril'];
const recent = 'Vex leaned on the bar. "Doctor Tole called again," Inji said. Enrique has men in the museum.';
const quest = (name, text, ties) => ({ kind: 'quest', name, text, ties });
const enrich = (target, text) => ({ kind: 'enrich', target, text, objectives: [] });
const refused = (x) => ({ ...x, status: 'dismissed' });
const tole = quest("Discover Dr. Tole's True Intentions", 'Uncover what he plans for the implant.', ['Vex', 'Doctor Adrigo Tole']);

describe('a new quest idea', () => {
    it('goes through when it ties in who the latest chat has', () => {
        expect(narrowIdeas([tole], { recent, player })).toEqual([tole]);
    });
    it('not when only the player character ties it to anything', () => {
        expect(narrowIdeas([quest('Retrieve a Missing Prototype', 'Intel says it is hidden.', ['Cyril'])], { recent, player })).toEqual([]);
        expect(narrowIdeas([quest('The Hidden Vault', 'A vault under the city.', [])], { recent, player })).toEqual([]);
    });
    it('not when the ties are not in the latest chat', () => {
        expect(narrowIdeas([quest('The Salt Road', 'Bandits on the road.', ['Graxx'])], { recent, player })).toEqual([]);
    });
    it('not what was turned down, reworded', () => {
        const again = quest("Dr. Tole's True Intentions", 'Cyril discovers his secret plans.', ['Vex']);
        expect(narrowIdeas([again], { recent, player, past: [refused(tole)] })).toEqual([]);
    });
    it('not what Review rejected, or the board already has', () => {
        const q = quest('Stop the Museum Heist', 'Thwart the job.', ['Enrique']);
        expect(narrowIdeas([q], { recent, player, rejected: [{ name: "Stop Enrique's Museum Heist" }] })).toEqual([]);
        expect(narrowIdeas([q], { recent, player, open: [{ name: 'Stop the Museum Job Heist' }] })).toEqual([]);
    });
    it('not a talk', () => {
        expect(narrowIdeas([quest('Discuss Terms with Vex', 'Have a chat.', ['Vex'])], { recent, player })).toEqual([]);
    });
    it('one at a time', () => {
        const other = quest('Follow the Money', 'Trace who pays Enrique.', ['Enrique']);
        expect(narrowIdeas([tole, other], { recent, player })).toEqual([tole]);
    });
    it('across genres', () => {
        const fantasy = quest('Break the Oath of Ash', 'The Pale Choir holds the oath.', ['Maelis']);
        expect(narrowIdeas([fantasy], { recent: 'Maelis burned the letter.', player: ['Kiri'] })).toEqual([fantasy]);
        const scifi = quest('Restart the Ceres Relay', 'The fleet is blind.', ['Commander Reyes']);
        expect(narrowIdeas([scifi], { recent: 'Reyes swore at the console.', player: ['Vance'] })).toEqual([scifi]);
    });
});

describe('detail for a quest', () => {
    const more = enrich('Secure Art Collection', 'Some pieces have dark histories.');
    it('goes through at first', () => {
        expect(narrowIdeas([more], { recent, player })).toEqual([more]);
        expect(narrowIdeas([more], { recent, player, past: [refused(more)] })).toEqual([more]);
    });
    it('stops once it has been refused enough for that quest', () => {
        const past = Array.from({ length: ENRICH_REFUSALS }, () => refused(more));
        expect(narrowIdeas([more], { recent, player, past })).toEqual([]);
        expect(narrowIdeas([enrich('Find the Heir', 'She has a scar.')], { recent, player, past })).toHaveLength(1);
    });
    it('not for a quest that is no quest', () => {
        expect(narrowIdeas([enrich('Find Private Location for Intimacy', 'A spark.')], { recent, player })).toEqual([]);
    });
});

describe('during an encounter', () => {
    it('holds quests and detail, not happenings or seeds', () => {
        const other = [{ kind: 'happening', text: 'A storm.' }, { kind: 'seed', text: 'A cracked bell.' }];
        expect(narrowIdeas([tole, enrich('X', 'y'), ...other], { recent, player, encounter: true })).toEqual(other);
    });
});

describe('tied to now', () => {
    it('by first name, not by the player', () => {
        expect(tiedToNow({ ties: ['Enrique Medina'] }, { recent, player })).toBe(true);
        expect(tiedToNow({ ties: ['Cyril Moriarty'] }, { recent: 'Cyril sat.', player })).toBe(false);
    });
});
