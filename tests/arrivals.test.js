// Someone brought into the scene stays brought in: the narrator is told
// plainly they arrive, a "back" to the room the story is already in drops
// no one, and undoing a reply leaves the scene where the player's own
// message put it.
import { buildGuidance, guidanceParts } from '../src/guidance/build.js';
import { returnTo, returnsHere } from '../src/director/suspended.js';
import { namesPlace } from '../src/state/revert.js';

describe('the narrator is told who arrives', () => {
    it('in the part on where this reply should go', () => {
        const built = buildGuidance({ location: { path: ['Common Room'] }, arriving: ['Adam Miller'], budget: 2000 });
        expect(built.text).toContain('Adam Miller comes into the scene in this reply');
        expect(guidanceParts(built).guidance_direction).toContain('Adam Miller comes into the scene');
    });

    it('several at once', () => {
        const built = buildGuidance({ location: { path: ['Common Room'] }, arriving: ['Adam Miller', 'Inji Miyama'], budget: 2000 });
        expect(built.text).toContain('Adam Miller and Inji Miyama come into the scene in this reply');
    });

    it('nothing when no one arrives', () => {
        const built = buildGuidance({ location: { path: ['Common Room'] }, arriving: [], budget: 2000 });
        expect(built.text).not.toContain('into the scene in this reply');
    });
});

describe('"back" to where the story already is', () => {
    const waiting = [{ locationId: 'loc_common', castIds: ['chr_cyril', 'chr_doc', 'chr_galice'], creatureIds: [], creatureCounts: {}, indoor: true, sceneTitle: 'Cyril\'s Defiance', sceneSummary: '', hanging: '', turn: 250, at: '' }];

    it('is a return to here: nothing is put back, no one dropped', () => {
        const top = returnTo(waiting, { back: 'nothing left hanging' });
        expect(returnsHere(top, 'loc_common')).toBe(true);
    });

    it('a return from somewhere else still puts the scene back', () => {
        const top = returnTo(waiting, { back: 'the vision ends' });
        expect(returnsHere(top, 'loc_dream')).toBe(false);
    });
});

describe("the player's own message names the place", () => {
    const names = ['Common Room in White Cerberus Headquarters'];

    it('by all but one of the words of a long name', () => {
        expect(namesPlace('Since it was early morning, Cyril went straight to the White Cerberus common room, looking for breakfast.', names)).toBe(true);
    });

    it('by its name or an alias whole', () => {
        expect(namesPlace("Cyril headed back to Zane's Shack.", ["Zane's Shack"])).toBe(true);
        expect(namesPlace('He went to the gym.', ['Training Area', 'gym'])).toBe(true);
    });

    it('not by a word or two in passing', () => {
        expect(namesPlace('Cyril thought of the common good of White Cerberus.', names)).toBe(false);
        expect(namesPlace('Cyril stayed where he was.', names)).toBe(false);
    });
});
