// The scene pointing at objects that no longer exist, and names that can't
// be found: the scene falls back, and no id ever reaches the model or the
// review queue.
import { missingPatch, idsToCheck } from '../src/state/missing.js';
import { correctionText, describeItem, scrubIds, UNKNOWN_PLACE, UNKNOWN_ONE } from '../src/validate/drift.js';
import { buildGuidance } from '../src/guidance/build.js';

const GONE = 'loc_822af7b3-25fb-444b-9a16-700219e82f1c';
const alive = new Set(['loc_wall', 'loc_fort', 'chr_niamh', 'chr_remus', 'crt_skel']);
const exists = (id) => alive.has(id);

describe('a scene pointing at something deleted', () => {
    it('falls back to the last place in the history that still exists', () => {
        const history = [
            { before: { locationId: 'loc_fort' }, after: { locationId: 'loc_wall' } },
            { before: { castIds: [] }, after: { castIds: ['chr_niamh'] } },
            { before: { locationId: 'loc_wall' }, after: { locationId: GONE } },
        ];
        const { patch, gone } = missingPatch({ locationId: GONE, castIds: ['chr_niamh'], creatureIds: [] }, history, exists);
        expect(patch).toEqual({ locationId: 'loc_wall' });
        expect(gone.locationId).toBe(GONE);
    });

    it('goes to no place when nothing in the history still exists', () => {
        const { patch } = missingPatch({ locationId: GONE, castIds: [], creatureIds: [] }, [{ before: { locationId: 'loc_also_gone' }, after: { locationId: GONE } }], exists);
        expect(patch).toEqual({ locationId: '' });
    });

    it('takes people and creatures who no longer exist out of the scene', () => {
        const { patch, gone } = missingPatch({ locationId: 'loc_wall', castIds: ['chr_niamh', 'chr_gone'], creatureIds: ['crt_skel', 'crt_gone'] }, [], exists);
        expect(patch).toEqual({ castIds: ['chr_niamh'], creatureIds: ['crt_skel'] });
        expect(gone).toEqual({ locationId: '', castIds: ['chr_gone'], creatureIds: ['crt_gone'] });
    });

    it('changes nothing when everything is there', () => {
        expect(missingPatch({ locationId: 'loc_wall', castIds: ['chr_remus'], creatureIds: [] }, [], exists).patch).toEqual({});
        expect(missingPatch({}, null, exists).patch).toEqual({});
    });

    it('checks the scene\'s ids and every place the history has held', () => {
        expect(idsToCheck({ locationId: GONE, castIds: ['chr_niamh'], creatureIds: ['crt_skel'] }, [{ before: { locationId: 'loc_fort' }, after: { locationId: GONE } }]).sort())
            .toEqual(['chr_niamh', 'crt_skel', 'loc_fort', GONE].sort());
    });
});

describe('names that can\'t be found', () => {
    it('leave correction lines out rather than show an id', () => {
        const nameOf = (id) => ({ chr_niamh: 'Niamh', loc_wall: 'Wall' })[id] ?? '';
        expect(correctionText({ field: 'location', canonical: GONE, observed: GONE }, { nameOf })).toBe('');
        expect(correctionText({ field: 'location', canonical: 'loc_wall', observed: GONE }, { nameOf })).toBe('The scene is still at Wall.');
        expect(correctionText({ field: 'cast', op: 'add', objectId: 'chr_gone' }, { nameOf })).toBe('');
        expect(correctionText({ field: 'cast', op: 'remove', objectId: 'chr_niamh' }, { nameOf })).toBe('Niamh is still present in this scene.');
        expect(correctionText({ field: 'creatures', canonical: ['crt_gone'] }, { nameOf })).toBe('');
        expect(correctionText({ field: 'location', canonical: GONE })).toBe('');
    });

    it('read as words in the review queue', () => {
        expect(describeItem({ field: 'location', canonical: GONE, observed: 'loc_wall', reason: 'moved' }, (id) => (id === 'loc_wall' ? 'Wall' : '')))
            .toBe(`Location: ${UNKNOWN_PLACE} → Wall (moved)`);
        expect(describeItem({ field: 'cast', op: 'remove', objectId: 'chr_gone' })).toBe(`Characters present: ${UNKNOWN_ONE} left`);
    });

    it('are scrubbed from text stored before', () => {
        expect(scrubIds(`"${GONE}" is new to the setting`)).toBe(`"${UNKNOWN_PLACE}" is new to the setting`);
        expect(scrubIds('Characters: chr_820eafaa-0928-4b03-b388-b726a7afbeca joined')).toBe(`Characters: ${UNKNOWN_ONE} joined`);
        expect(scrubIds('Nothing to scrub here')).toBe('Nothing to scrub here');
    });

    it('never reach the guidance in an old correction line', () => {
        const built = buildGuidance({ corrections: [`The scene is still at ${GONE}, not ${GONE}.`, 'It is cold.'], budget: 2000 });
        expect(built.text).not.toContain(GONE);
        expect(built.text).toContain('It is cold.');
    });
});
