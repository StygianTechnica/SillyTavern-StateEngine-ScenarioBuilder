// Assassins Inc, the surveillance room: Zane held Tadam at gunpoint while Cyril
// took the cameras, then Cyril sprinted out the door. Zane and Tadam came along
// in the cast, and Tadam turned up in the exhibit hall, "calculating the risk".
import { leavesHere, leftBehind, goesThere, namesPlace } from '../src/director/going-along.js';

const zane = { id: 'z', names: ['Zane'] };
const tadam = { id: 't', names: ['Tadam Chi', 'Tadam'] };
const people = [zane, tadam];
const playerNames = ['Cyril'];
const post729 = '"Shit."  Cyril muttered.  He held his communicator to his mouth and gave Inji instructions to get to Delvin.  "I\'ll back you up."  He added, turning and then sprinting out the door.  Delvin might have thought he\'d won, but the game wasn\'t over yet."  \n\nHe readied his gun and sprinted.';

describe('the player character running out', () => {
    it('the real post leaves both behind, and goes somewhere', () => {
        expect(leavesHere(post729, { playerNames, people })).toBe(true);
        expect(leftBehind(post729, { playerNames, people })).toEqual(['z', 't']);
        expect(goesThere(post729, [])).toBe(true);
    });
    it('across genres', () => {
        expect(leftBehind('Kiri stormed out of the inn.', { playerNames: ['Kiri'], people: [{ id: 'm', names: ['Maelis'] }] })).toEqual(['m']);
        expect(leftBehind('Vance left the bridge without a word.', { playerNames: ['Vance'], people: [{ id: 'r', names: ['Reyes'] }] })).toEqual(['r']);
        expect(leftBehind('He walked out of the diner.', { playerNames: ['Sam'], people: [{ id: 'd', names: ['Dana'] }] })).toEqual(['d']);
    });
    it('keeps those who go with them', () => {
        expect(leftBehind('Cyril sprinted out the door with Zane at his heels.', { playerNames, people })).toEqual(['t']);
        expect(leftBehind('Cyril and Zane ran out of the room.', { playerNames, people })).toEqual(['t']);
        expect(leftBehind('They ran out of the room.', { playerNames, people })).toEqual([]);
    });
    it('someone told to stay stays, named or not', () => {
        expect(leftBehind('He told Zane to stay and ran out the door.', { playerNames, people })).toEqual(['z', 't']);
    });
    it('is not going anywhere', () => {
        for (const t of [
            'He stepped out of the shadows.',
            'Cyril ran out of ammo.',
            'Cyril flinched as the alarm went off.',
            'He left the door open and sat down.',
            'He went to the console and used his implant.',
            'He watched as Zane walked out.',
            'Cyril saw Zane run off.',
            'Tadam bolted out the door.',
            '"I\'m walking out of here," he said. He sat down.',
        ]) {
            expect(leavesHere(t, { playerNames, people })).toBe(false);
            expect(leftBehind(t, { playerNames, people })).toEqual([]);
        }
    });
});

describe('naming the place', () => {
    it('is told apart from just going', () => {
        expect(namesPlace('He ran out to the Grand Gallery.', ['Grand Gallery'])).toBe(true);
        expect(namesPlace(post729, ['Surveillance Room'])).toBe(false);
    });
});
