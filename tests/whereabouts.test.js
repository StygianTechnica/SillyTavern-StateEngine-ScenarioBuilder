import { lastSeen, placesNear, whoCouldTurnUp } from '../src/director/whereabouts.js';
import { dossierText } from '../src/director/prompt.js';

// Alvarand (the land) > Redhaven > Great Hall; Alvarand > Belatorre > Graveyard > Crypt
const parents = { redhaven: 'alvarand', hall: 'redhaven', belatorre: 'alvarand', graveyard: 'belatorre', crypt: 'graveyard' };
const characters = [{ id: 'remus', name: 'Remus' }, { id: 'varyn', name: 'Varyn' }, { id: 'graxx', name: 'Graxx', role: 'warlord' }, { id: 'arin', name: 'Arin' }, { id: 'maren', name: 'Maren' }];
const history = [
    { before: { locationId: 'hall', castIds: ['remus', 'varyn', 'graxx'] }, after: { castIds: ['remus', 'varyn'] } },
    { before: { locationId: 'hall' }, after: { locationId: 'graveyard' } },
    { before: { castIds: ['remus', 'varyn'] }, after: { castIds: ['remus', 'varyn', 'arin'] } },
    { before: { castIds: ['remus', 'varyn', 'arin'] }, after: { castIds: ['remus', 'varyn'] } },
    { before: { locationId: 'graveyard' }, after: { locationId: 'crypt' } },
];
const current = { locationId: 'crypt', castIds: ['remus', 'varyn'] };

describe('where people were last', () => {
    it('is read from the scene history', () => {
        const seen = lastSeen(history, current);
        expect(seen.get('graxx')).toEqual({ locationId: 'hall', index: 0 });
        expect(seen.get('arin').locationId).toBe('graveyard');
        expect(seen.get('varyn').locationId).toBe('crypt');
    });

    it('is near when it is the same building, site or town - not the same land', () => {
        expect(placesNear('graveyard', 'crypt', parents)).toBe(true);
        expect(placesNear('hall', 'crypt', parents)).toBe(false);
        expect(placesNear('', 'crypt', parents)).toBe(false);
    });
});

describe('who could turn up', () => {
    const run = (extra = {}) => whoCouldTurnUp({ characters, castIds: current.castIds, locationId: 'crypt', parents, history, current, inPlay: ['graxx', 'arin'], tiesOf: (id) => (id === 'varyn' ? [{ otherId: 'maren', kind: 'sister' }] : []), ...extra });

    it('is only someone seen near here not long ago; Graxx, left in Redhaven, is elsewhere', () => {
        const { near, elsewhere } = run();
        expect(near.map((c) => c.name)).toEqual(['Arin']);
        expect(elsewhere.map((c) => [c.name, c.lastAt, c.why])).toEqual([['Graxx', 'hall', 'left behind elsewhere'], ['Maren', '', 'tied to someone here (sister)']]);
    });

    it('counts someone seen long ago as elsewhere, wherever it was', () => {
        expect(run({ recent: 1 }).near.map((c) => c.name)).toEqual([]);
    });

    it('rules no one out when the scene has no place yet', () => {
        expect(run({ locationId: '' }).near.map((c) => c.name)).toEqual(['Graxx', 'Arin', 'Maren']);
    });

    it('tells the director they cannot turn up', () => {
        const text = dossierText({ cast: [{ name: 'Remus', player: true }], nearby: [{ name: 'Arin', why: 'seen earlier in this story' }], elsewhere: [{ name: 'Graxx', lastAt: 'Great Hall' }] });
        expect(text).toContain('OTHERS WHO COULD TURN UP (not here now)\n- Arin - seen earlier in this story');
        expect(text).toContain('they cannot turn up in this scene');
        expect(text).toContain('- Graxx (last at Great Hall)');
    });
});
