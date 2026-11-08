// Assassins Inc, the museum: Inji and Zane "joined" Cyril because he radioed
// them; the game master's MOVEs between the Museum and the Surveillance Room
// inside it left Zane and then Tadam "behind", though no one had gone anywhere.
import { reachedAfar } from '../src/guidance/afar.js';
import { sameGround, goesThere } from '../src/director/going-along.js';

const inji = ['Inji Miyama', 'Inji'];
const zane = ['Zane'];

describe('reached only from a distance', () => {
    it('the radio call from the storage rooms', () => {
        const post = 'Cyril took cover then activated his communications to Inji and Zane. "They\'re in the surveillance room." He figured that would be sufficient.';
        expect(reachedAfar(inji, { post, player: 'Cyril' })).toBe(true);
        expect(reachedAfar(zane, { post, player: 'Cyril' })).toBe(true);
    });
    it('hearing the player over a link, in the reply', () => {
        const reply = "*Inji and Zane receive Cyril's warning on their comms devices, their expressions turning grim.*";
        expect(reachedAfar(inji, { reply, player: 'Cyril' })).toBe(true);
    });
    it('sought on the cameras; the one in the room is not', () => {
        const post = 'Cyril had told Inji to go for the alcove. "Zane, lock him down." He went to the console and promptly used his implant to take over the surveillance feed and pinpoint the rest of the invading crew (and hopefully Inji as well).';
        expect(reachedAfar(inji, { post, player: 'Cyril' })).toBe(true);
        expect(reachedAfar(zane, { post, player: 'Cyril' })).toBe(false);
    });
    it('not someone with the player, or just wearing a radio', () => {
        for (const reply of ['Zane tapped his earpiece and frowned.', 'Zane walked in, his comms still on and calling for Cyril.']) {
            expect(reachedAfar(zane, { reply, player: 'Cyril' })).toBe(false);
        }
        expect(reachedAfar(zane, { post: 'Zane spoke over his comms to the others.', player: 'Cyril' })).toBe(false);
        expect(reachedAfar(zane, { post: 'He checked the monitor with Zane.', player: 'Cyril' })).toBe(false);
        expect(reachedAfar(zane, { post: 'Cyril looked at Zane and shrugged.', player: 'Cyril' })).toBe(false);
    });
    it('across genres', () => {
        expect(reachedAfar(['Maelis'], { post: 'Kiri peered into the scrying mirror, seeking Maelis.', player: 'Kiri' })).toBe(true);
        expect(reachedAfar(['Maelis'], { post: 'Kiri spoke to Maelis through the sending stone.', player: 'Kiri' })).toBe(true);
        expect(reachedAfar(['Reyes'], { post: 'The captain radioed Reyes in engineering.', player: 'Vance' })).toBe(true);
        expect(reachedAfar(['Dana'], { post: 'He phoned Dana from the diner.', player: 'Sam' })).toBe(true);
    });
});

describe('a move on the same ground', () => {
    const parents = { room: 'museum', vault: 'room', museum: 'city', park: 'city' };
    it('out, in or neither', () => {
        expect(sameGround(parents, 'room', 'museum')).toBe('out');
        expect(sameGround(parents, 'vault', 'city')).toBe('out');
        expect(sameGround(parents, 'museum', 'room')).toBe('in');
        expect(sameGround(parents, 'museum', 'park')).toBe('');
        expect(sameGround({ a: 'b', b: 'a' }, 'a', 'c')).toBe('');
    });
    it('crossing the room goes nowhere', () => {
        const names = ["Saint Aora's Museum"];
        expect(goesThere('He went to the console and used his implant.', names)).toBe(false);
        expect(goesThere('"I\'ll head them off," he said. He sat down.', names)).toBe(false);
    });
    it('leaving, or naming the place, does', () => {
        expect(goesThere('Cyril left the surveillance room.', ['the Museum'])).toBe(true);
        expect(goesThere('He ran out into the hall.', [])).toBe(true);
        expect(goesThere('Remus climbed to the graveyard.', [])).toBe(true);
        expect(goesThere('He crossed the Great Hall.', ['Great Hall'])).toBe(true);
    });
});
