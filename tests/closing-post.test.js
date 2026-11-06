// Assassins Inc: Cyril "asked directions to the gun range so he could
// practice for awhile then disappeared to do just that. After some firing
// practice he was able to familiarize himself with the guns..." The scene
// stayed in the Armory, the narrator cut back to Miller's planning, the
// summary took the cutaway for the scene, and "DUE TODAY | ..." reached the
// narrator.
import { cutAway, detectDrift } from '../src/validate/drift.js';
import { closesOut, nextThingLine } from '../src/guidance/wrapped.js';
import { buildNow } from '../src/guidance/build.js';
import { headingAlong } from '../src/library/routes.js';
import { parseDirectorNote } from '../src/director/prompt.js';

const post = 'He took his time to suit up and asked directions to the gun range so he could practice for awhile then disappeared to do just that.  After some firing practice he was able to familiarize himself with the guns and calibrate his implant to perfectly respond to the aim and recoil needed for each one.  He was elated.';
const objects = new Map([
    ['cyril', { id: 'cyril', type: 'character', name: 'Cyril' }],
    ['zara', { id: 'zara', type: 'character', name: 'Technician Zara' }],
    ['adam', { id: 'adam', type: 'character', name: 'Adam Miller' }],
    ['vex', { id: 'vex', type: 'character', name: 'Vex' }],
    ['doc', { id: 'doc', type: 'character', name: 'Doc' }],
]);

describe('a cutaway is not the scene', () => {
    const away = 'Miller reviews entry point options for the museum heist with Vex, Doc and Galice.';
    it('reads who a summary is about', () => {
        expect(cutAway(away, objects, ['cyril', 'zara'])).toBe(true);
        expect(cutAway('Zara hands Cyril his pistols.', objects, ['cyril', 'zara'])).toBe(false);
        expect(cutAway('A guard bursts in shouting.', objects, ['cyril'])).toBe(false);
        expect(cutAway(away, objects, ['cyril', 'adam'])).toBe(false);
    });
    it('keeps the summary and title when the reply cuts away', () => {
        const canonical = { locationId: 'arm', castIds: ['cyril', 'zara'], sceneSummary: 'Zara prepares pistols for Cyril.', sceneTitle: 'Gearing Up', weather: [], creatureIds: [] };
        const observed = { location: 'arm', cast: ['cyril', 'zara'], weather: [], temperature: '', indoor: null, title: 'Heist Planning', creatures: [], summary: away };
        expect(detectDrift({ canonical, observed, objects }).map((x) => x.field)).toEqual([]);
        const here = { ...observed, summary: 'Cyril tests the pistols on the range while Zara watches.' };
        expect(detectDrift({ canonical, observed: here, objects }).map((x) => x.field).sort()).toEqual(['summary', 'title']);
    });
});

describe('a post that closes out what the player was doing', () => {
    it('is read, across genres', () => {
        expect(closesOut(post)).toBe(true);
        // The post after it, which the hand-back missed.
        expect(closesOut('Cyril spent several hours at the gun range making absolutely sure he was good.  It felt good to flex his finesse with a handgun.  His skill was impressive, almost perfect.')).toBe(true);
        expect(closesOut('Aria spent the afternoon mending her armor by the fire. When she was done, she leaned back.')).toBe(true);
        expect(closesOut('Rook worked the reactor console for hours until he was satisfied.')).toBe(true);
        expect(closesOut('Cyril picked up the pistol. "What about this one?"')).toBe(false);
        expect(closesOut('He walked over to the rack and looked at the guns.')).toBe(false);
    });
    it('asks the narrator for the next thing, with what is set next', () => {
        const line = nextThingLine({ player: 'Cyril', lead: 'the art heist at the Arcadia Museum, tonight.' });
        expect(line).toContain('bring them the next thing to answer');
        expect(line).toContain('(the art heist at the Arcadia Museum, tonight)');
        expect(line).toContain('end back with Cyril');
        expect(buildNow({ nextThing: line, cast: [{ name: 'Cyril', player: true }] })).toContain("Cyril's post closes out");
        expect(buildNow({ nextThing: line, next: 'Adam briefs the team.', cast: [{ name: 'Cyril', player: true }] })).not.toContain('closes out');
    });
});

describe('heading for a kind of place', () => {
    it('reads "disappeared to" and "asked directions to", and a reason is not a plan', () => {
        expect(headingAlong(post, [{ id: 'r', names: ['The Training Range'] }])).toMatchObject({ id: 'r', byKind: true });
        expect(headingAlong('She asked for directions to the infirmary and limped off.', [{ id: 'i', names: ['Deck Four Medbay'] }, { id: 'h', names: ['Hangar Bay'] }])).toBeNull();
        expect(headingAlong('She went off to the mess hall.', [{ id: 'm', names: ['Officers\' Mess'] }])).toMatchObject({ id: 'm' });
    });
    it('only when one place is of that kind', () => {
        expect(headingAlong(post, [{ id: 'a', names: ['North Range'] }, { id: 'b', names: ['South Range'] }])).toBeNull();
        expect(headingAlong(post, [{ id: 'a', names: ['Training Area'] }])).toBeNull();
        expect(headingAlong('He would go to the gun range later.', [{ id: 'r', names: ['The Range'] }])).toBeNull();
    });
});

describe('a section of the prompt echoed in the note', () => {
    it('never reaches the narrator', () => {
        const note = parseDirectorNote('SCENE | Gearing Up\nZara wraps up her checks while Cyril handles his arsenal.\n\nDUE TODAY | Infiltrate and disrupt Enrique\'s operation.\nSET FOR LATER: the heist');
        expect(note.note).toContain('Zara wraps up');
        expect(note.note).not.toContain('DUE TODAY');
        expect(note.note).not.toContain('SET FOR LATER');
    });
});

import { shownArriving } from '../src/director/departures.js';
describe('someone the briefing has arriving is in the scene', () => {
    const note = 'As he finished up and started to head back, Zane suddenly appeared on the scene, having arrived to discuss tonight\'s mission plans.\n\nOutside the gun range, the base buzzed. Doc paced around, while Vex came in to check the screens back at HQ.';
    it('reads plain arrivals where the scene is, not ones elsewhere', () => {
        expect(shownArriving(['Zane'], note)).toBe(true);
        expect(shownArriving(['Vex'], note)).toBe(false);
        expect(shownArriving(['Doc'], note)).toBe(false);
        expect(shownArriving(['Mira'], 'Mira might arrive by nightfall.')).toBe(false);
        expect(shownArriving(['Captain Hale'], 'The airlock hissed and Captain Hale stepped in.')).toBe(true);
    });
});

import { formatLineAsMeant } from '../src/director/prompt.js';
describe('format lines a small model bent', () => {
    // The director's note after a swipe, as it reached the narrator.
    const note = [
        'Galice sat quietly, reviewing intel files on Enrique Medina\'s operation.',
        '',
        'New ENTERS:',
        'ENTERES | Zane | armed and in tactical attire, arrives at the training room where Cyril is setting up his gear | tied to Adam Miller\'s summons',
        '',
        'AWAY: None',
        'SETTLED: The focus remains on stopping Enrique\'s heist tonight.',
        'BARGAIN: None',
        'SET: None',
        'FIGHT: None',
        'DIES: None',
    ].join('\n');
    it('reads them as meant, and none reaches the narrator', () => {
        const parsed = parseDirectorNote(note);
        expect(parsed.enters).toEqual(['Zane']);
        expect(parsed.settled).toEqual(['The focus remains on stopping Enrique\'s heist tonight.']);
        expect(parsed.note).toContain('Galice sat quietly');
        for (const junk of ['ENTERES', 'New ENTERS', 'AWAY', 'SETTLED', 'BARGAIN', 'FIGHT', 'DIES']) expect(parsed.note).not.toContain(junk);
    });
    it('leaves prose and a bare BACK alone', () => {
        expect(formatLineAsMeant('BACK')).toBe('BACK');
        expect(formatLineAsMeant('BACK:')).toBe('BACK');
        expect(formatLineAsMeant('Now the rain falls on the keep.')).toBe('Now the rain falls on the keep.');
        expect(formatLineAsMeant('Set: the table was laid for three.')).toBe('Set: the table was laid for three.');
    });
});
