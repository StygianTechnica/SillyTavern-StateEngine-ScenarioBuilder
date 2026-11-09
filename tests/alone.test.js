// Cyril stormed out, Adam said to bring him back, and with Cyril crying in an
// alley the narrator cut away to a warehouse.
import { sentAfter, aloneOrder, cameToThem } from '../src/guidance/alone.js';
import { buildNow } from '../src/guidance/build.js';

const reply796 = 'Inji watches Cyril storm out. Zane snickers.\n\n"Inji has a point, Zane. Cyril\'s skills are invaluable in this situation. We need to find a way to bring him back and address his grievances before things escalate further." He pauses.';
const people = ['Inji Miyama', 'Zane', 'Adam Miller', 'Fran'];

describe('those sent after the player character', () => {
    it('the real line, and who it was said to', () => {
        const s = sentAfter([reply796, 'Enrique sneers at Cyril in the alley.'], { player: 'Cyril', people });
        expect(s.said).toContain('bring him back');
        expect(s.who).toEqual(['Inji Miyama', 'Zane']);
    });
    it('not when they are told to leave it', () => {
        expect(sentAfter(['Inji looks at Cyril. "Do not go after him."'], { player: 'Cyril', people })).toBeNull();
    });
    it('not a reply that has nothing to do with them', () => {
        expect(sentAfter(['"Find him," the guard said of the thief.'], { player: 'Cyril', people })).toBeNull();
    });
    it('across genres', () => {
        expect(sentAfter(['Kiri fled the hall. "Maelis, go after her," the Abbot said.'], { player: 'Kiri', people: ['Maelis'] }).who).toEqual(['Maelis']);
        expect(sentAfter(['"Track Vance down," Reyes said.'], { player: 'Vance', people: ['Reyes'] }).who).toEqual(['Reyes']);
    });
});

describe('who came to them', () => {
    const inji = { id: 'i', names: ['Inji Miyama', 'Inji'] };
    const fran = { id: 'f', names: ['Fran'] };
    const enrique = { id: 'e', names: ['Enrique Medina', 'Enrique'] };
    const people = [inji, fran, enrique];
    it('the real reply', () => {
        expect(cameToThem('As Cyril sobs against the alley wall, a sleek hoverbike materializes in front of him. Inji steps off, his figure silhouetted by the lights as he approaches Cyril cautiously. "Cyril, are you okay?" he asks.', people, 'Cyril')).toEqual(['i']);
    });
    it('not a cut-away, a voice or someone only spoken of', () => {
        expect(cameToThem('In a nearby abandoned warehouse, Fran paces back and forth. Enrique says Cyril is finished.', people, 'Cyril')).toEqual([]);
        expect(cameToThem("Enrique's voice echoes down the alley as Cyril listens.", people, 'Cyril')).toEqual([]);
        expect(cameToThem('Cyril thought about Inji and cried.', people, 'Cyril')).toEqual([]);
        expect(cameToThem('Fran paced the warehouse floor, far from anyone.', people, 'Cyril')).toEqual([]);
    });
    it('across genres', () => {
        expect(cameToThem('Maelis knelt in the snow beside Kiri and took her hand.', [{ id: 'm', names: ['Maelis'] }], 'Kiri')).toEqual(['m']);
    });
});

describe('the order', () => {
    it('stays with them when no one was sent', () => {
        const order = aloneOrder({ player: 'Cyril' });
        expect(order).toContain('The reply stays with Cyril');
        expect(order).toContain('no cutting away');
        expect(order).not.toContain('reaches');
    });
    it('makes the search the next thing', () => {
        const order = aloneOrder({ player: 'Cyril', sent: { said: 'We need to find a way to bring him back.', who: ['Inji Miyama', 'Zane'] } });
        expect(order).toContain('Inji Miyama and Zane were last heard on this');
        expect(order).toContain('reaches Cyril in this reply or the next');
    });
    it('goes in the note', () => {
        expect(buildNow({ cast: [{ name: 'Cyril', player: true }], aloneNow: 'Cyril is alone.' })).toContain('Cyril is alone.');
    });
});
