import { stillWaiting, steppedAway, suspend, returnTo, restorePatch, waitingIds, withoutWaiting, suspendedText, SUSPEND_TURNS, SUSPEND_LIMIT } from '../src/director/suspended.js';
import { parseDirectorNote, buildDirectorPrompt, samePlaceName } from '../src/director/prompt.js';
import { bargainItem, sameBargain, fulfilledByReturn, sceneKnowledge, authoredKnowledge } from '../src/library/knowledge.js';
import { normalizeChatDoc } from '../src/store/schema.js';

// The God War chat: Maziel has Varyn's body, the others are bound in the
// graveyard, and Remus is pulled into a trial in an ethereal chamber.
const graveyard = {
    locationId: 'loc_grave', castIds: ['chr_remus', 'chr_maziel', 'chr_arin', 'chr_kael', 'chr_niamh'], creatureIds: [], creatureCounts: {}, indoor: false,
    sceneTitle: "Remus's Plea in the Graveyard", sceneSummary: 'Maziel drags Varyn\'s body through the graves while Arin, Kael and Niamh strain against his dark bonds.',
};
const names = { loc_grave: 'Belatorre Graveyard', chr_remus: 'Remus Watt', chr_maziel: 'Maziel', chr_arin: 'Arin', chr_kael: 'Kael', chr_niamh: 'Niamh', chr_varyn: 'Varyn Vance' };
const people = Object.entries(names).filter(([id]) => id.startsWith('chr_')).map(([id, name]) => ({ id, name }));

describe('a scene the story steps away from', () => {
    it('waits while the story is in a vision or another realm', () => {
        const list = suspend([], graveyard, { hanging: 'Remus begged Elyon to give Varyn back his life.', turn: 448 });
        expect(list).toHaveLength(1);
        expect(list[0].castIds).toContain('chr_maziel');
        // The same scene sent again after a revert waits once.
        expect(suspend(list, graveyard, { turn: 449 })).toHaveLength(1);
        expect(stillWaiting(list, 448 + SUSPEND_TURNS)).toHaveLength(1);
        expect(stillWaiting(list, 449 + SUSPEND_TURNS)).toHaveLength(0);
    });

    it('keeps only a few at once', () => {
        let list = [];
        for (let i = 0; i < SUSPEND_LIMIT + 2; i++) list = suspend(list, { ...graveyard, locationId: `loc_${i}` }, { turn: i });
        expect(list).toHaveLength(SUSPEND_LIMIT);
        expect(list.at(-1).locationId).toBe(`loc_${SUSPEND_LIMIT + 1}`);
    });

    it('steps away on AWAY, or a move into a new place the messages put beyond the veil', () => {
        const veil = 'A blinding flash of white light erupted and he felt himself being pulled through a veil that separated worlds.';
        expect(steppedAway({ away: 'Maziel still has Varyn' })).toBe(true);
        expect(steppedAway({ moved: true, newPlace: true, latestText: veil })).toBe(true);
        // Back from the vision to the graveyard, already in play: not away.
        expect(steppedAway({ moved: true, newPlace: false, latestText: 'The vision faded and he was back among the graves.' })).toBe(false);
        expect(steppedAway({ moved: true, newPlace: true, latestText: 'They rode north to the bridge.' })).toBe(false);
        expect(steppedAway({ moved: false, latestText: veil })).toBe(false);
    });

    it('comes back on BACK, or a MOVE to where the scene waits', () => {
        const list = suspend([], graveyard, { turn: 1 });
        const matchesPlace = (name, id) => samePlaceName(name, { name: names[id] });
        expect(returnTo(list, { back: 'the chamber fades' })?.locationId).toBe('loc_grave');
        expect(returnTo(list, { movePlace: 'the Belatorre Graveyard', matchesPlace })?.locationId).toBe('loc_grave');
        expect(returnTo(list, { movePlace: 'The Ethereal Chamber', matchesPlace })).toBeNull();
        expect(returnTo([], { back: 'yes' })).toBeNull();
    });

    it('is put back as it was, with the player and without the dead', () => {
        const entry = suspend([], { ...graveyard, castIds: ['chr_maziel', 'chr_arin', 'chr_varyn'] }, { turn: 1 })[0];
        const patch = restorePatch(entry, { playerId: 'chr_remus', dead: ['chr_varyn'] });
        expect(patch.locationId).toBe('loc_grave');
        expect(patch.castIds).toEqual(['chr_remus', 'chr_maziel', 'chr_arin']);
        expect(patch.indoor).toBe(false);
    });

    it('keeps those waiting out of the detour', () => {
        const list = suspend([], graveyard, { turn: 1 });
        const waiting = waitingIds(list, ['chr_remus']);
        expect([...waiting].sort()).toEqual(['chr_arin', 'chr_kael', 'chr_maziel', 'chr_niamh']);
        expect(withoutWaiting(['Arin', 'Kael', 'The Keeper'], people, waiting)).toEqual(['The Keeper']);
        expect(withoutWaiting(['Arin'], people, new Set())).toEqual(['Arin']);
    });

    it('is put before the director, with BACK and the rule for those waiting', () => {
        const list = suspend([], graveyard, { hanging: 'Remus begged Elyon to give Varyn back his life.', turn: 1 });
        const text = suspendedText(list, (id) => names[id] ?? '');
        expect(text).toContain("\"Remus's Plea in the Graveyard\" at Belatorre Graveyard");
        expect(text).toContain('There: Remus Watt, Maziel, Arin, Kael, Niamh.');
        expect(text).toContain('Left hanging: Remus begged Elyon to give Varyn back his life.');
        const { prompt } = buildDirectorPrompt({ cast: [{ name: 'Remus Watt', player: true }], suspendedText: text });
        expect(prompt).toContain('WAITING WHERE THE STORY LEFT OFF');
        expect(prompt).toContain('BACK | <how the story returns');
        expect(prompt).toContain('no ENTERS for them');
        // With nothing waiting: AWAY is offered, BACK is not.
        const plain = buildDirectorPrompt({ cast: [{ name: 'Remus Watt', player: true }] }).prompt;
        expect(plain).toContain('AWAY | <what is left hanging');
        expect(plain).not.toContain('BACK |');
        expect(plain).not.toContain('WAITING WHERE');
    });

    it('is kept in the chat document', () => {
        const doc = normalizeChatDoc({ suspended: suspend([], graveyard, { turn: 3 }) });
        expect(doc.suspended[0].sceneTitle).toBe("Remus's Plea in the Graveyard");
        expect(normalizeChatDoc({}).suspended).toEqual([]);
    });
});

describe('the director\'s AWAY, BACK and BARGAIN lines', () => {
    it('reads them and keeps them out of the briefing', () => {
        const raw = [
            'SCENE | The Trial of Souls',
            'MOVE | The Ethereal Chamber | none | indoors',
            'AWAY | Maziel is carrying Varyn\'s body off while Arin, Kael and Niamh are bound.',
            'BARGAIN | Elyon | Varyn\'s life given back | Remus passes the trials of the souls',
            '',
            'The keeper waits among the orbs. Next: the first orb drifts close.',
        ].join('\n');
        const p = parseDirectorNote(raw);
        expect(p.away).toBe('Maziel is carrying Varyn\'s body off while Arin, Kael and Niamh are bound.');
        expect(p.back).toBe('');
        expect(p.bargains).toEqual([{ by: 'Elyon', what: 'Varyn\'s life given back', price: 'Remus passes the trials of the souls' }]);
        expect(p.note).not.toMatch(/AWAY|BARGAIN/);
    });

    it('takes a bare BACK, and ignores placeholders', () => {
        expect(parseDirectorNote('BACK\nThe graves again.').back).toBe('the story returns');
        expect(parseDirectorNote('BACK | the light fades\nText.').back).toBe('the light fades');
        expect(parseDirectorNote('AWAY | <what is left hanging where the story was>\nText.').away).toBe('');
        expect(parseDirectorNote('BARGAIN | <who promises> | <what is promised> | <the price or condition>\nText.').bargains).toEqual([]);
    });
});

describe('a bargain', () => {
    const item = bargainItem({ what: 'Varyn Vance\'s life given back', price: 'Remus passes the trials.' }, { byIds: ['chr_elyon'], toIds: ['chr_remus'] });

    it('is a pending oath sworn by the one who promises', () => {
        expect(item).toEqual({ kind: 'oath', text: 'Varyn Vance\'s life given back - the price: Remus passes the trials', knownBy: [], madeBy: ['chr_elyon'], madeTo: ['chr_remus'], status: 'pending' });
        const knowledge = authoredKnowledge([{ ...item, id: 'k1' }], (id) => ({ chr_elyon: 'Elyon', chr_remus: 'Remus Watt' })[id] ?? '');
        const { rules } = sceneKnowledge(knowledge, [{ id: 'chr_remus', name: 'Remus Watt', player: true }]);
        expect(rules[0]).toContain('Elyon swore to Remus Watt: Varyn Vance\'s life given back - the price: Remus passes the trials');
    });

    it('is not kept twice when the director rewords it', () => {
        const again = bargainItem({ what: 'Varyn\'s life given back to him' }, { byIds: ['chr_elyon'] });
        expect(sameBargain([{ ...item, id: 'k1' }], again)).toBe(true);
        expect(sameBargain([{ ...item, id: 'k1', status: 'kept' }], again)).toBe(false);
        expect(sameBargain([{ ...item, id: 'k1' }], bargainItem({ what: 'A blessing on the bridge' }, { byIds: ['chr_elyon'] }))).toBe(false);
    });

    it('is fulfilled when the one it promised back returns', () => {
        expect(fulfilledByReturn([{ ...item, id: 'k1' }], 'Varyn Vance')).toHaveLength(1);
        expect(fulfilledByReturn([{ ...item, id: 'k1' }], 'Niamh')).toHaveLength(0);
    });
});
