// Assassins Inc: "We snagged Tadam", then Tadam at the getaway car, nodding along.
import { captivesFrom, captivesLine } from '../src/guidance/captives.js';
import { buildNow } from '../src/guidance/build.js';
import { heldByOwnSide } from '../src/state/detained.js';

const tadam = { name: 'Tadam Chi', aliases: [] };
const delvin = { name: 'Delvin "Ice" Timmers', aliases: [] };
const post727 = '"Zane, lock him down, I\'ll find where the remaining agents are and we will head them off.  We can hand him to the police.  Enrique can get his lawyers involved after we\'re long gone."  He chuckled.';
const post737 = '"Put the collection down Delvin.  We snagged Tadam.  You guys are done."';
const post741 = 'He hated Enrique. "Tadam might have to hold up a bit. We need at least someone to face the music for anything you guys damaged."';
const post749 = '"We\'re in the clear Zane.  Drag Tadam out here and let\'s go home."';

describe('a prisoner in hand', () => {
    it('the real posts, with what is planned', () => {
        expect(captivesFrom([post727, post737, post741, post749], [tadam, delvin])).toEqual([{ name: 'Tadam Chi', plan: 'We can hand him to the police.' }]);
    });
    it('the latest word on where they go stands, however much later', () => {
        const post757 = '"If he\'s being kept by our crew then wouldn\'t we take him back to headquarters? they probably have a cell there, right?"';
        const got = captivesFrom([post727, post737, post741, ...Array(9).fill('He sat down.'), post757], [tadam]);
        expect(got[0].plan).toContain('headquarters');
    });
    it('holds however long ago, while no one lets them go', () => {
        expect(captivesFrom([post737, ...Array(30).fill('He sat down.')], [tadam])).toHaveLength(1);
    });
    it('ends when the player lets them go, or they escape', () => {
        expect(captivesFrom([post737, 'He sighed. "Let Tadam go."'], [tadam])).toEqual([]);
        expect(captivesFrom([post737, 'Tadam escaped through the vent.'], [tadam])).toEqual([]);
        expect(captivesFrom([post737, 'Cyril released Tadam at the curb.'], [tadam])).toEqual([]);
    });
    it('can be taken again after', () => {
        expect(captivesFrom([post737, 'Tadam escaped.', 'We caught Tadam again.'], [tadam])).toHaveLength(1);
    });
    it('not a figure of speech, a wish or a near thing', () => {
        for (const t of ["He caught Tadam's eye.", 'Cyril caught Tadam off guard.', 'If we had captured Tadam it would be over.', 'We almost nabbed Tadam.', 'We never caught Tadam.', 'We should capture Tadam.']) {
            expect(captivesFrom([t], [tadam])).toEqual([]);
        }
    });
    it('in so many words', () => {
        expect(captivesFrom(['Tadam is our prisoner now.'], [tadam])).toHaveLength(1);
    });
    it('across genres', () => {
        expect(captivesFrom(['We captured Maelis at the ford. We will ransom her to the Choir.'], [{ name: 'Maelis' }])).toEqual([{ name: 'Maelis', plan: 'We will ransom her to the Choir.' }]);
        expect(captivesFrom(['Vance had arrested Reyes on the bridge. "Reyes goes to the magistrate on Ceres."'], [{ name: 'Commander Reyes', aliases: ['Reyes'] }])[0].plan).toContain('magistrate');
        expect(captivesFrom(['Sam cuffed Dana.'], [{ name: 'Dana' }])).toEqual([{ name: 'Dana', plan: '' }]);
    });
});

describe('held by their own side', () => {
    const own = ['Cyril', 'Inji Miyama', 'Inji', 'Zane'];
    it('is not led away', () => {
        expect(heldByOwnSide("Inji's custody, being taken back to her apartment", own)).toBe(true);
    });
    it('the police or a rival are', () => {
        expect(heldByOwnSide('the city police, for the museum job', own)).toBe(false);
        expect(heldByOwnSide('the Pale Choir, in the crypt', ['Kiri'])).toBe(false);
        expect(heldByOwnSide('Officer Hale, at the precinct', own)).toBe(false);
    });
    it('not a name inside another word', () => {
        expect(heldByOwnSide('Zanetti, at the docks', own)).toBe(false);
    });
});

describe('what the narrator hears', () => {
    const cast = [{ name: 'Cyril', player: true, gender: 'm' }, { name: 'Tadam Chi', gender: 'm' }];
    const captives = [{ name: 'Tadam Chi', plan: 'We can hand him to the police.' }];
    it('in the note nearest the reply', () => {
        const note = buildNow({ cast, captives, playerPost: 'He sat down.' });
        expect(note).toContain("Tadam Chi is a prisoner of Cyril's side, not one of them (the latest said of what happens to them: We can hand him to the police)");
        expect(note).toContain("never in someone's home");
        expect(note).toContain('no part of their plans or celebrating');
        expect(note).toContain('nobody treats Tadam Chi as one of the team');
    });
    it('nothing when there is no one', () => {
        expect(captivesLine([])).toBe('');
        expect(buildNow({ cast, captives: [], playerPost: 'He sat down.' })).toBe('');
    });
});
