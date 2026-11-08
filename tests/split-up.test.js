// The group splitting up - and the story not pulling the player character
// back to the others. The museum: Inji said to split up, Cyril headed for
// the storage rooms, and a BACK put him beside Inji and Zane in the
// corridors while he was still searching the storage rooms.
import { suspend, returnTo, wentBack, splitsUp, saysNothingHangs, waitingIds, rejoined, splitAt, splitText, suspendedText, outOfWorld } from '../src/director/suspended.js';
import { MOVING } from '../src/director/going-along.js';
import { parseDirectorNote, buildDirectorPrompt } from '../src/director/prompt.js';

const names = { cor: 'Museum corridors', sto: 'Storage room corridors', cyr: 'Cyril', inj: 'Inji Miyama', zan: 'Zane' };
const nameOf = (id) => names[id] ?? '';
const corridors = { locationId: 'cor', castIds: ['cyr', 'inj', 'zan'], sceneTitle: 'Tracking Thugs at Museum', sceneSummary: 'Zane and Inji split up to cover more ground.' };

describe('an AWAY that says nothing', () => {
    it('is no AWAY', () => {
        for (const t of ['Nothing left hanging', 'Nothing is left hanging.', 'None', 'nobody waits']) expect(saysNothingHangs(t)).toBe(true);
        expect(saysNothingHangs('Varyn lies bound in the graveyard')).toBe(false);
        expect(parseDirectorNote('Cyril searches on.\nAWAY | Nothing left hanging.').away).toBe('');
    });
});

describe('splitting up', () => {
    it('is read in the latest messages, across genres', () => {
        expect(splitsUp('"We should split up to cover more ground," Inji said.')).toBe(true);
        expect(splitsUp('"You take the east tower, I\'ll search the crypt," Aldric told Mira.')).toBe(true);
        expect(splitsUp('Commander Vex ordered the squad to fan out across the derelict deck.')).toBe(true);
        expect(splitsUp('"Wait here and keep the car running."')).toBe(true);
        expect(splitsUp('Cyril headed for the storage rooms, gun at the ready.')).toBe(false);
    });
    const list = suspend([], { ...corridors, castIds: ['inj', 'zan'] }, { hanging: 'Inji and Zane sweep the galleries', turn: 770, split: true });
    it('keeps those who stayed where they are, apart from detours', () => {
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ split: true, locationId: 'cor', castIds: ['inj', 'zan'] });
        expect([...waitingIds(list, ['cyr'])]).toEqual(['inj', 'zan']);
        expect([...waitingIds(list, ['cyr'], { splits: false })]).toEqual([]);
        expect(suspendedText(list, nameOf)).toBe('');
        expect(splitText(list, nameOf)).toBe('- Inji Miyama, Zane are at Museum corridors (Inji and Zane sweep the galleries).');
    });
    it('is never gone back to by BACK', () => {
        expect(returnTo(list, { back: 'the story returns' })).toBe(null);
    });
    it('is met again where they wait, one by one when the story brings them', () => {
        expect(splitAt(list, 'cor')?.castIds).toEqual(['inj', 'zan']);
        expect(splitAt(list, 'sto')).toBe(null);
        const one = rejoined(list, ['zan']);
        expect(one[0].castIds).toEqual(['inj']);
        expect(rejoined(one, ['inj'])).toEqual([]);
    });
    it('a second split at the same place is those left there now', () => {
        const again = suspend(list, { ...corridors, castIds: ['inj'] }, { turn: 771, split: true });
        expect(again).toHaveLength(1);
        expect(again[0].castIds).toEqual(['inj']);
    });
    it('the director hears where they are', () => {
        const { prompt, system } = buildDirectorPrompt({ cast: [{ name: 'Cyril', player: true }], splitText: splitText(list, nameOf), recent: [] });
        const all = `${system}\n${prompt}`;
        expect(all).toContain('ELSEWHERE SINCE THE GROUP SPLIT');
        expect(all).toContain('- Inji Miyama, Zane are at Museum corridors');
        expect(all).toContain('never bring Cyril back to them');
    });
});

describe('back from a step away in the same world', () => {
    // Older chats: the corridors put on hold by an AWAY with nothing hanging.
    const list = suspend([], corridors, { hanging: 'Zane and Inji split up to cover more ground', turn: 770 });
    const goesBack = (text) => () => wentBack(text, { placeNames: ['Museum corridors'], waitingNames: ['Inji', 'Zane'], playerNames: ['Cyril'], moving: MOVING });
    it('is in the same world', () => expect(outOfWorld(list[0])).toBe(false));
    it('not while the player character searches on', () => {
        const post = 'Cyril wasted no time. He neutralized the one operative he encountered at the storage room. He continued his search of the storage rooms to make sure he got them all.';
        expect(returnTo(list, { back: 'the story returns', goesBack: goesBack(post) })).toBe(null);
    });
    it('when they go back', () => {
        expect(returnTo(list, { back: 'x', goesBack: goesBack('Cyril headed back to find Inji and Zane.') })).not.toBe(null);
        expect(returnTo(list, { back: 'x', goesBack: goesBack('He made his way to the Museum corridors.') })).not.toBe(null);
        expect(returnTo(list, { back: 'x', goesBack: goesBack('Cyril rejoined the others.') })).not.toBe(null);
    });
    it('leaning back is not going back', () => {
        expect(wentBack('Cyril leaned back against the crates and listened.', { playerNames: ['Cyril'], moving: MOVING })).toBe(false);
    });
    it('a vision ends by itself', () => {
        const vision = suspend([], { locationId: 'grave', castIds: ['remus', 'varyn'] }, { hanging: 'Varyn bound in the graveyard', turn: 5, otherworld: true });
        expect(returnTo(vision, { back: 'Remus wakes', goesBack: () => false })).not.toBe(null);
    });
});
