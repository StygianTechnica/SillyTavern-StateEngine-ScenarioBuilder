// Assassins Inc: Cyril said he was being ganged up on and told Vex to butt
// out; Vex said "Inji's right, Cyril" three replies running.
import { pileOn } from '../src/guidance/pushback.js';
import { buildNow } from '../src/guidance/build.js';

const cyril = { name: 'Cyril', player: true };
const inji = { name: 'Inji Miyama', relations: ['Toward Cyril: lover (Slept together).'] };
const vex = { name: 'Vex', relations: ['Toward Cyril: lover; concerned, friendly.'] };
const zane = { name: 'Zane', relations: ['Toward Cyril: attracted to (one-night-stand).', 'Toward Inji Miyama: rival.'] };
const cast = [cyril, inji, vex, zane];
const backing = [
    '"Inji\'s right, Cyril. We have to consider the worst-case scenario," Vex said. Zane nodded.',
    '"Inji\'s right, Cyril. We need to find a balance," Vex said.',
];
const run = (o) => pileOn({ player: 'Cyril', cast, ...o });

describe('everyone against the player character', () => {
    it('the player says so', () => {
        const order = run({ posts: ['All of them were siding against him like a demented hive brain.'] });
        expect(order).toContain('Cyril feels ganged up on');
        expect(order).toContain('no one backs another against Cyril');
    });
    it('replies backing one another, with no word from the player', () => {
        expect(run({ posts: ['He scowled.'], replies: backing })).toContain('ganged up on');
    });
    it('one reply agreeing is not a pile-on', () => {
        expect(run({ posts: ['He scowled.'], replies: [backing[0]] })).toBe('');
    });
    it('backing the player character is not one', () => {
        expect(run({ posts: ['He scowled.'], replies: [...backing, '"Cyril\'s right, you know," Zane said.'] })).toBe('');
    });
    it('needs someone to do the piling', () => {
        expect(pileOn({ player: 'Cyril', cast: [cyril, inji], posts: ['You are ganging up on me.'] })).toBe('');
    });
    it('the one who breaks ranks is warm to them and not the voice being backed', () => {
        expect(run({ posts: ['They were ganging up on him.'], replies: backing })).toContain('Zane breaks from the others');
    });
    it('never someone against them', () => {
        const foes = [cyril, { name: 'Gant', relations: ['Toward Cyril: sworn enemy.'] }, { name: 'Moss', relations: ['Toward Cyril: hates him.'] }];
        const order = pileOn({ player: 'Cyril', cast: foes, posts: ['You are all against me.'] });
        expect(order).toContain('ganged up on');
        expect(order).not.toContain('breaks from the others');
    });
    it('reaches the note', () => {
        expect(buildNow({ cast: [cyril], pileOn: 'Cyril feels ganged up on.' })).toContain('Cyril feels ganged up on.');
    });
    it('across genres', () => {
        const party = [{ name: 'Kiri', player: true }, { name: 'Maelis', relations: ['Toward Kiri: sworn friend.'] }, { name: 'Brother Oswin' }];
        expect(pileOn({ player: 'Kiri', cast: party, posts: ['"You two are teaming up on me."', 'Why are you closing ranks?'] })).toContain('Maelis breaks from the others');
        const crew = [{ name: 'Dana', player: true }, { name: 'Vance' }, { name: 'Ito' }];
        expect(pileOn({ player: 'Dana', cast: crew, posts: ['Dana sighed.'], replies: ['"Vance has a point, Dana."', '"I agree with Vance."'] })).toContain('Dana feels ganged up on');
    });
});

describe('told to stay out of it', () => {
    it('the real posts', () => {
        expect(run({ posts: ['Cyril glowered at Vex. "Why don\'t you go somewhere else for awhile."'], ending: true })).toBe('Cyril told Vex to stay out of it: Vex goes, or says nothing more to Cyril in this reply.');
        expect(run({ posts: ['Cyril\'s eyes flashed warning at Vex. "I said I didn\'t want to talk to you right now. Butt out or I\'m done." He turned his attention back to Inji.'], ending: true })).toContain('told Vex to stay out');
    });
    it('holds for the next post, until spoken to again', () => {
        const told = 'Cyril glared at Vex. "Butt out."';
        expect(run({ posts: [told, 'He scowled at Inji.'], ending: true })).toContain('told Vex');
        expect(run({ posts: [told, '"Vex, hand me that," he said.'], ending: true })).toBe('');
        expect(run({ posts: [told, 'He scowled.', 'He sat down.'], ending: true })).toBe('');
    });
    it('no one named, no one told', () => {
        expect(run({ posts: ['"Leave me alone."'], ending: true })).toBe('');
    });
    it('is not picked to break ranks', () => {
        const order = pileOn({ player: 'Cyril', cast: [cyril, vex, zane], posts: ['Cyril glared at Zane. "Butt out. You are all ganging up on me."'] });
        expect(order).toContain('told Zane');
        expect(order).toContain('Vex breaks from the others');
    });
    it('across genres', () => {
        expect(pileOn({ player: 'Kiri', cast: [{ name: 'Kiri', player: true }, { name: 'Maelis' }], posts: ['Kiri rounded on Maelis. "Stay out of this."'] })).toContain('told Maelis to stay out');
    });
});
