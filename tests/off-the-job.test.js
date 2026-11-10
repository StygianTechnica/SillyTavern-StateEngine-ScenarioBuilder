// Assassins Inc: the Medina Syndicate came for Inji's quarters with Cyril and
// Inji in bed there, and its crew had Tadam Chi on it - in White Cerberus's
// custody since he was processed at headquarters.
import { offTheJob, isOff, dropUnavailable } from '../src/ops/available.js';
import { lockedAway, heldByOwnSide, soundsHeld } from '../src/state/detained.js';
import { privateMoment } from '../src/director/whereabouts.js';

describe('who cannot go on a job', () => {
    const off = offTheJob({ detained: [{ id: 't', name: 'Tadam Chi' }], dead: [{ id: 'g', name: 'Graxx' }], captives: [{ name: 'Delvin Timmers' }] });
    it('the held, the dead and prisoners', () => {
        expect(isOff({ name: 'Tadam Chi', objectId: 't' }, off)).toBe(true);
        expect(isOff({ name: 'Graxx', objectId: 'g' }, off)).toBe(true);
        expect(isOff({ name: 'Delvin Timmers', objectId: 'd' }, off)).toBe(true);
        expect(isOff({ name: 'Ice', aliases: ['Delvin Timmers'] }, off)).toBe(true);
        expect(isOff({ name: 'Jiang Ead', objectId: 'j' }, off)).toBe(false);
    });
    it('are taken off a plan', () => {
        const plan = { leader: { name: 'Nichiro', objectId: 'n' }, crew: [{ name: 'Tadam Chi', objectId: 't' }, { name: 'Jiang Ead', objectId: 'j' }] };
        expect(dropUnavailable(plan, off).crew.map((c) => c.name)).toEqual(['Jiang Ead']);
    });
    it('a held leader hands the job on', () => {
        const plan = { leader: { name: 'Tadam Chi', objectId: 't', where: 'the van' }, crew: [{ name: 'Jiang Ead', objectId: 'j' }, { name: 'Yiranza', objectId: 'y' }] };
        const out = dropUnavailable(plan, off);
        expect(out.leader).toMatchObject({ name: 'Jiang Ead', objectId: 'j', where: 'the van' });
        expect(out.crew.map((c) => c.name)).toEqual(['Yiranza']);
    });
    it('across genres', () => {
        const dungeon = offTheJob({ detained: [{ id: 'm', name: 'Morvath' }] });
        expect(dropUnavailable({ leader: { name: 'Ash' }, crew: [{ name: 'Morvath', objectId: 'm' }] }, dungeon).crew).toEqual([]);
    });
});

describe('locked away by their own side', () => {
    it('is detention', () => {
        for (const how of ['processed into White Cerberus custody at headquarters', 'locked in a cell at the base', 'handed him over to security', 'thrown in the brig']) {
            expect(lockedAway(how)).toBe(true);
            expect(soundsHeld(how)).toBe(true);
        }
    });
    it('a prisoner in the back of the car is not', () => {
        expect(lockedAway("in Inji's custody in the back of their car")).toBe(false);
        expect(heldByOwnSide("in Inji's custody in the back of their car", ['Inji'])).toBe(true);
    });
});

describe('no job on top of a private moment', () => {
    it('the real scene', () => {
        const recent = ['He ran a finger along Inji\'s lower lip.', 'He captures Cyril\'s finger between his lips.', 'I want to hear you talk dirty.'];
        expect(privateMoment({ people: 2, recent })).toBe(true);
    });
});
