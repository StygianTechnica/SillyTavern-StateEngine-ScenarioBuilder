// Detained: jailed or held for a time, not dead (src/state/detained.js).
import {
    normalizeDetained, detainedIds, isDetained, withoutDetained, detainedFrom, detainedByName, detainedText,
    soundsHeld, rescuerOf, dueToLeave, outOfCustody, freeInDoc, FREE_AFTER_DAYS,
} from '../src/state/detained.js';
import { startRescue, emptyWorld } from '../src/world/model.js';
import { parseDirectorNote, buildDirectorPrompt } from '../src/director/prompt.js';
import { buildGuidance } from '../src/guidance/build.js';

const delvin = { id: 'd', name: 'Delvin "Ice" Timmers', how: 'the city police, for the museum job', source: 'director', reply: 40, day: 10, freeDay: 15, freedBy: 'Medina Syndicate', schemeId: 's1', wasHere: 'castIds' };
const maelis = { id: 'm', name: 'Maelis', how: 'the Baron, in the dungeon under Redhaven', source: 'user', reply: null, day: 10, freeDay: null };

describe('the record', () => {
    it('is made safe, one each', () => {
        const list = normalizeDetained([delvin, { ...delvin, name: 'twice' }, { name: 'no id' }, 'junk', { id: 'x', source: 'odd', freeDay: 'soon', wasHere: 'creatureIds' }]);
        expect(list.map((d) => d.id)).toEqual(['d', 'x']);
        expect(list[1]).toMatchObject({ source: 'director', freeDay: null, wasHere: '', reply: null });
        expect(normalizeDetained(undefined)).toEqual([]);
    });
    it('answers who is held', () => {
        const doc = { detained: [delvin] };
        expect(isDetained(doc, 'd')).toBe(true);
        expect(isDetained(doc, 'm')).toBe(false);
        expect(withoutDetained(['c', 'd'], detainedIds(doc))).toEqual(['c']);
        expect(detainedByName([delvin], 'delvin "ice" timmers')).toBe(delvin);
    });
    it('a reply taken back takes only its own', () => {
        expect(detainedFrom([delvin, maelis], 40)).toEqual([delvin]);
        expect(detainedFrom([delvin], 41)).toEqual([]);
    });
});

describe('what the model is told', () => {
    const doc = { detained: [delvin, maelis], dead: [] };
    it('only those the latest messages mention', () => {
        expect(detainedText(doc, { recentText: 'Word was that Delvin had a lawyer.' })).toBe('Delvin "Ice" Timmers (held: the city police, for the museum job).');
        expect(detainedText(doc, { recentText: 'The market was quiet.' })).toBe('');
    });
    it('not the dead', () => {
        expect(detainedText({ ...doc, dead: [{ id: 'd' }] }, { recentText: 'Delvin' })).toBe('');
    });
    it('the narrator gets it in the existing section, unchanged without it', () => {
        const held = buildGuidance({ detained: 'Maelis (held: the Baron).', sections: ['dead'] });
        const none = buildGuidance({ dead: 'Varyn (slain).' });
        expect(JSON.stringify(held)).toContain('Held and not free to act');
        expect(JSON.stringify(none)).not.toContain('Held and not free to act');
        expect(JSON.stringify(none)).toContain('Dead and gone in this story');
    });
});

describe('what counts as custody', () => {
    it('across genres', () => {
        for (const how of ['arrested by the city police', 'thrown in the Baron\'s dungeon', 'confined to the brig of the Meridian', 'locked up by the town watch', 'taken captive by the Pale Choir']) expect(soundsHeld(how)).toBe(true);
    });
    it('not a moment in a scene, or nothing at all', () => {
        for (const how of ['held at gunpoint by Zane', 'at knifepoint', 'kept at bay', 'went home', '']) expect(soundsHeld(how)).toBe(false);
    });
});

describe('who works to free them', () => {
    const medina = { id: 'f1', name: 'Medina Syndicate' };
    const cerberus = { id: 'f2', name: 'White Cerberus', aliases: ['the Cerberus'] };
    it('their faction', () => {
        expect(rescuerOf([medina], 'the city police')).toBe(medina);
    });
    it('not the one holding them', () => {
        expect(rescuerOf([medina, cerberus], 'the Medina Syndicate, for skimming')).toBe(cerberus);
        expect(rescuerOf([cerberus], 'in a cell of the Cerberus')).toBeNull();
    });
    it('no one without a faction', () => {
        expect(rescuerOf([], 'the guards')).toBeNull();
    });
});

describe('coming out', () => {
    it('when the date comes, not before', () => {
        expect(dueToLeave([delvin], [], 14).out).toEqual([]);
        expect(dueToLeave([delvin], [], 15).out).toEqual([delvin]);
        expect(dueToLeave([delvin], [], null).out).toEqual([]);
    });
    it('at once when the scheme is done', () => {
        expect(dueToLeave([delvin], [{ id: 's1', status: 'done' }], 11).out).toEqual([delvin]);
    });
    it('no one working on it: no date', () => {
        for (const status of ['dropped', 'failed']) expect(dueToLeave([delvin], [{ id: 's1', status }], 99)).toEqual({ out: [], stopped: ['d'] });
    });
    it('a paused scheme holds the date back; an open one does not', () => {
        expect(dueToLeave([delvin], [{ id: 's1', status: 'under way', held: true }], 99).out).toEqual([]);
        expect(dueToLeave([delvin], [{ id: 's1', status: 'under way' }], 15).out).toEqual([delvin]);
    });
    it('without a faction only the story or the user frees them', () => {
        expect(dueToLeave([maelis], [], 9999)).toEqual({ out: [], stopped: [] });
    });
    it('says who got them out', () => {
        expect(outOfCustody(delvin)).toBe('Delvin "Ice" Timmers is out of custody, thanks to Medina Syndicate.');
        expect(outOfCustody({ name: 'Rook', freedBy: '' })).toBe('Rook is out of custody.');
    });
});

describe('the scheme to free them', () => {
    let n = 0;
    const rescue = (world, personId = 'd', person = 'Delvin') => startRescue(world, { factionId: 'f1', factionName: 'Medina Syndicate', personId, person, how: 'the police', day: 10, at: 'now', newId: () => `s${++n}` });
    it('is an ordinary scheme that remembers who it frees', () => {
        const world = emptyWorld();
        const s = rescue(world);
        expect(s).toMatchObject({ who: ['f1'], aim: 'Get Delvin out of custody', nextDay: 12, visibility: 'rumoured', status: 'under way', frees: 'd', done: 0 });
        expect(s.steps).toHaveLength(3);
    });
    it('one per person', () => {
        const world = emptyWorld();
        expect(rescue(world).id).toBe(rescue(world).id);
        rescue(world, 'r', 'Reyes');
        expect(world.schemes).toHaveLength(2);
    });
    it('ends when they are freed, or goes if it never happened', () => {
        const world = emptyWorld();
        rescue(world);
        const doc = { detained: [delvin], gm: { world } };
        freeInDoc(doc, ['d']);
        expect(doc.detained).toEqual([]);
        expect(world.schemes[0].status).toBe('done');
        const other = emptyWorld();
        rescue(other);
        const undone = { detained: [delvin], gm: { world: other } };
        freeInDoc(undone, ['d'], { forget: true });
        expect(other.schemes).toEqual([]);
    });
    it('has the time it was promised', () => {
        expect(FREE_AFTER_DAYS).toBe(5);
    });
});

describe('the game master', () => {
    it('reads the lines, as a small model bends them', () => {
        const p = parseDirectorNote('The cuffs click.\nDETAINED | Delvin | the city police, for the museum job\n**RELEASED** | Maelis | bailed out by her uncle\nDETAINED | none | nothing');
        expect(p.detentions).toEqual([{ name: 'Delvin', how: 'the city police, for the museum job' }]);
        expect(p.releases).toEqual([{ name: 'Maelis', how: 'bailed out by her uncle' }]);
        expect(p.note).not.toContain('DETAINED');
    });
    it('is asked for RELEASED only when someone is held', () => {
        expect(JSON.stringify(buildDirectorPrompt({ userName: 'Cyril', messages: [] }))).toContain('DETAINED | <name>');
        expect(JSON.stringify(buildDirectorPrompt({ userName: 'Cyril', messages: [] }))).not.toContain('RELEASED | <name>');
        expect(JSON.stringify(buildDirectorPrompt({ userName: 'Cyril', messages: [], detainedText: 'Maelis (held: the Baron).' }))).toContain('RELEASED | <name>');
    });
});
