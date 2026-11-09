// Assassins Inc: Inji's hurt came out as nagging about the mission, he and
// Zane got on like best chums, and Zane, jealous by nature, minded nothing.
import { bondsOf, heartsNow, heartsSection, heartsFormat, squareUp, soothe, takeHearts, emptyHearts, addGrievance } from '../src/director/jealousy.js';
import { parseDirectorNote } from '../src/director/prompt.js';
import { buildNow } from '../src/guidance/build.js';

const present = [{ id: 'c', name: 'Cyril', player: true }, { id: 'i', name: 'Inji Miyama' }, { id: 'z', name: 'Zane' }];
const authored = [
    { from: 'z', to: 'i', kind: 'rival', note: 'compete lewdly over sexual conquests', mutual: true },
    { from: 'i', to: 'c', kind: 'lover', note: 'Slept together', mutual: true },
    { from: 'z', to: 'c', kind: 'attracted to', note: 'vigorous casual one-night-stand', mutual: true },
];
const bonds = bondsOf({ authored });
const hurt = { id: 'g', who: 'i', whoName: 'Inji Miyama', over: 'c', overName: 'Cyril', rival: 'z', rivalName: 'Zane', what: 'saw flirtation with Zane', kind: 'seen', strength: 2, day: 10, turn: 5, soothed: false, rivalEased: false };
const now = (o) => heartsNow({ present, bonds, day: 10, modeOf: () => '', ...o });

describe('who is bound to whom', () => {
    it('a rival is not a lover, whatever the note says', () => {
        expect(bonds.some((b) => b.who === 'z' && b.to === 'i')).toBe(false);
        expect(bonds.some((b) => b.who === 'z' && b.to === 'c')).toBe(true);
        const text = heartsSection({ present, bonds, userName: 'Cyril', nameOf: () => '' }).text;
        expect(text).not.toContain('in love with Zane');
        expect(text).toContain('Inji Miyama and Zane both want Cyril');
    });
    it('nor a story rival', () => {
        expect(bondsOf({ story: [{ fromId: 'a', toId: 'b', type: 'rival', polarity: 2, text: 'flirts to win' }] })).toEqual([]);
    });
    it('across genres', () => {
        expect(bondsOf({ authored: [{ from: 'a', to: 'b', kind: 'sworn enemy', note: 'seduced her sister', mutual: false }] })).toEqual([]);
        expect(bondsOf({ authored: [{ from: 'a', to: 'b', kind: 'betrothed', note: '', mutual: false }] })).toHaveLength(1);
    });
});

describe('filed the wrong way round', () => {
    const backwards = { who: 'z', over: 'i', overName: 'Inji', rival: 'c', rivalName: 'Cyril' };
    it('is put right', () => {
        expect(squareUp(backwards, bonds)).toMatchObject({ over: 'c', overName: 'Cyril', rival: 'i', rivalName: 'Inji' });
    });
    it('the right way stays', () => {
        expect(squareUp(hurt, bonds)).toBe(hurt);
    });
    it('and is mended where it lies when the director next reports', () => {
        const hearts = emptyHearts();
        addGrievance(hearts, { id: 'x', ...backwards, whoName: 'Zane', what: 'saw them kiss', kind: 'seen', strength: 2 });
        takeHearts(hearts, {}, { bonds });
        expect(hearts.grievances[0].over).toBe('c');
    });
    it('a new report is taken the right way', () => {
        const hearts = emptyHearts();
        const resolve = (n) => ({ Zane: 'z', Inji: 'i', Cyril: 'c' }[n] ?? null);
        takeHearts(hearts, { jealous: [{ who: 'Zane', over: 'Inji', rival: 'Cyril', what: 'saw them kiss', how: 'hurt' }] }, { resolve, nameOf: (id) => id, present: ['z', 'i', 'c'], bonds, playerId: 'c' });
        expect(hearts.grievances[0]).toMatchObject({ over: 'c', rival: 'i' });
    });
});

describe('sore at someone here', () => {
    it('says what it is, as what it is', () => {
        const line = now({ grievances: [hurt] });
        expect(line).toContain('Inji Miyama is sore at Cyril - saw flirtation with Zane - and it comes out in this reply');
        expect(line).toContain('does not pass it off as a complaint about work');
    });
    it('once said, is not said again', () => {
        const line = now({ grievances: [hurt], replies: ['"Were you flirting with Zane?" Inji asked.'] });
        expect(line).toContain('It has been said');
        expect(line).not.toContain('comes out in this reply');
    });
    it('a mention outside speech has not said it', () => {
        expect(now({ grievances: [hurt], replies: ['Inji glanced at Zane.'] })).toContain('comes out in this reply');
    });
    it('waits when something else is going on', () => {
        const line = now({ grievances: [hurt], busy: true });
        expect(line).toContain('never as a complaint about work');
        expect(line).not.toContain('comes out in this reply');
    });
    it('a sting does not need having out', () => {
        expect(now({ grievances: [{ ...hurt, strength: 1 }] })).not.toContain('comes out in this reply');
    });
    it('nothing once mended, or gone, or only heard of', () => {
        const eased = { ...hurt, soothed: true, rivalEased: true };
        expect(now({ grievances: [eased] })).toBe('');
        expect(now({ grievances: [{ ...hurt, day: 1 }] })).toBe('');
        expect(now({ grievances: [{ ...hurt, kind: 'word' }] })).toBe('');
        expect(heartsNow({ present: present.slice(0, 2), bonds, day: 10, grievances: [{ ...hurt, over: 'z', overName: 'Zane', rival: '' }] })).toBe('');
    });
    it('not if jealousy is off', () => {
        expect(now({ grievances: [hurt], globalOn: false })).toBe('');
        expect(now({ grievances: [hurt], modeOf: () => 'never' })).toBe('');
    });
    it('reaches the note', () => {
        expect(buildNow({ cast: [present[0]], heartsNow: 'Inji Miyama is sore at Cyril.' })).toContain('Inji Miyama is sore at Cyril.');
    });
});

describe('two after the same one', () => {
    it('someone jealous by nature minds without having to be shown', () => {
        const line = now({ modeOf: (id) => (id === 'z' ? 'jealous' : '') });
        expect(line).toBe('Zane wants Cyril and resents Inji Miyama for it: it shows in every exchange between them - digs and score-keeping, no easy agreement, nothing chummy.');
    });
    it('both, once it has been seen', () => {
        const line = now({ grievances: [{ ...hurt, soothed: true }], modeOf: (id) => (id === 'z' ? 'jealous' : '') });
        expect(line).toContain('Inji Miyama and Zane both want Cyril and dislike each other for it');
    });
    it('nothing seen, no one prone: no grudge', () => {
        expect(now({})).toBe('');
    });
    it('making up with the lover does not end it with the rival', () => {
        const hearts = { grievances: [{ ...hurt }] };
        soothe(hearts, 'i', { overId: 'c' });
        expect(hearts.grievances[0]).toMatchObject({ soothed: true, rivalEased: false });
        expect(now({ grievances: hearts.grievances })).toContain('resents Zane');
    });
    it('making up with the rival does', () => {
        const hearts = { grievances: [{ ...hurt, soothed: true }] };
        soothe(hearts, 'i', { overId: 'z' });
        expect(hearts.grievances[0].rivalEased).toBe(true);
        expect(now({ grievances: hearts.grievances })).toBe('');
    });
    it('the director hears it too', () => {
        const text = heartsSection({ present, bonds, grievances: [{ ...hurt, soothed: true }], day: 10, userName: 'Cyril', nameOf: () => '' }).text;
        expect(text).toContain('has made peace with Cyril but not with Zane');
    });
    it('across genres', () => {
        const party = [{ id: 'k', name: 'Kiri', player: true }, { id: 'm', name: 'Maelis' }, { id: 'o', name: 'Oswin' }];
        const ties = bondsOf({ authored: [{ from: 'm', to: 'k', kind: 'betrothed', mutual: false }, { from: 'o', to: 'k', kind: 'in love', mutual: false }] });
        expect(heartsNow({ present: party, bonds: ties, modeOf: (id) => (id === 'o' ? 'jealous' : '') })).toContain('Oswin wants Kiri and resents Maelis');
        const station = [{ id: 'd', name: 'Dana', player: true }, { id: 'v', name: 'Vance' }];
        const single = bondsOf({ authored: [{ from: 'v', to: 'd', kind: 'spouse', mutual: false }] });
        expect(heartsNow({ present: station, bonds: single, day: 2, grievances: [{ who: 'v', over: 'd', rival: '', rivalName: 'Ito', what: 'saw the message from Ito', kind: 'seen', strength: 3, day: 2, turn: 1 }] })).toContain('Vance is sore at Dana');
    });
});

describe('the report line', () => {
    it('asks who they made it up with', () => {
        expect(heartsFormat({ soothed: true }).join('\n')).toContain('SOOTHED | <who> | <the one they made it up with> | <how');
    });
    it('reads both shapes', () => {
        expect(parseDirectorNote('A scene.\nSOOTHED | Inji | Cyril | a long talk').soothed).toEqual([{ who: 'Inji', with: 'Cyril', how: 'a long talk' }]);
        expect(parseDirectorNote('A scene.\nSOOTHED | Inji | a long talk').soothed).toEqual([{ who: 'Inji', how: 'a long talk' }]);
    });
});
