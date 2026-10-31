import { lastSeen, placesNear, whoCouldTurnUp, belongingHere } from '../src/director/whereabouts.js';
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

    it('keeps the side of those out of the scene', () => {
        const text = dossierText({
            cast: [{ name: 'Cyril', player: true }],
            nearby: [{ name: 'Riven', role: 'a hacker', sides: ['White Cerberus'], why: 'seen earlier in this story' }],
            elsewhere: [{ name: 'Graxx', sides: ['Ravagers', 'Iron Hand'], lastAt: 'Great Hall' }, { name: 'Maren', sides: [] }],
        });
        expect(text).toContain('- Riven (a hacker), of White Cerberus - seen earlier in this story');
        expect(text).toContain('Graxx, of Ravagers and Iron Hand (last at Great Hall)');
        expect(text).toContain('; Maren');
    });
});

describe('those who belong where the scene is', () => {
    // City > Bearville > The Signal Box > Common Room; Bearville > Safehouse
    const tree = { bearville: 'city', box: 'bearville', common: 'box', safehouse: 'bearville' };
    const names = { city: 'Arcadia City', bearville: 'Bearville', box: 'The Signal Box', common: 'Common Room', safehouse: 'Safehouse' };
    const people = [{ id: 'adam', name: 'Adam Miller', role: 'Office Chief' }, { id: 'vex', name: 'Vex' }, { id: 'galice', name: 'Galice' }, { id: 'tiago', name: 'Tiago' }, { id: 'larry', name: 'Larry' }];
    const factions = [{ id: 'wc', name: 'White Cerberus' }];
    const relations = [
        { from: 'adam', to: 'wc', kind: 'leads' },
        { from: 'box', to: 'wc', kind: 'occupant' },
        { from: 'box', to: 'adam', kind: 'leader' },
        { from: 'tiago', to: 'box', kind: 'rival and target' },
        { from: 'city', to: 'larry', kind: 'resident' },
    ];
    const memberships = new Map([['adam', ['wc']], ['vex', ['wc']], ['galice', ['wc']]]);
    const at = (placeId) => belongingHere({ placeIds: [placeId, ...(tree[placeId] ? [tree[placeId], tree[tree[placeId]]] : [])], parents: tree, characters: people, factions, relations, memberships, placeName: (id) => names[id] ?? '' });

    it('puts the leader of the faction based there first, then its other members', () => {
        expect(at('common')).toEqual([
            { id: 'adam', why: 'leads White Cerberus, based at The Signal Box' },
            { id: 'vex', why: 'of White Cerberus, based at The Signal Box' },
            { id: 'galice', why: 'of White Cerberus, based at The Signal Box' },
        ]);
    });

    it('ties no one by a rival tie, by the top of the tree, or outside the place', () => {
        expect(at('safehouse')).toEqual([]);
        expect(at('common').map((b) => b.id)).not.toContain('tiago');
        expect(at('common').map((b) => b.id)).not.toContain('larry');
    });

    it('takes a faction based there by its own record, and a person tied to the place', () => {
        const out = belongingHere({ placeIds: ['box'], parents: tree, characters: people, factions: [{ id: 'wc', name: 'White Cerberus', base: { headquarters: 'box' } }], relations: [{ from: 'galice', to: 'box', kind: 'works at' }], memberships: new Map([['vex', ['wc']]]), placeName: (id) => names[id] });
        expect(out).toEqual([{ id: 'galice', why: 'tied to The Signal Box (works at)' }, { id: 'vex', why: 'of White Cerberus, based at The Signal Box' }]);
    });

    it('lets someone at home here turn up though never seen, unless just left far away', () => {
        const belongs = [{ id: 'adam', why: 'leads White Cerberus, based at The Signal Box' }];
        const never = whoCouldTurnUp({ characters: people, castIds: ['vex'], locationId: 'common', parents: tree, history: [], current: { locationId: 'common', castIds: ['vex'] }, belongs });
        expect(never.near).toEqual([{ id: 'adam', name: 'Adam Miller', role: 'Office Chief', why: 'leads White Cerberus, based at The Signal Box' }]);
        const left = [{ before: { locationId: 'safehouse', castIds: ['adam'] }, after: { castIds: [] } }, { before: { locationId: 'safehouse' }, after: { locationId: 'common', castIds: ['vex'] } }];
        const farOff = { ...tree, safehouse: 'elsewhere', elsewhere: 'far' };
        const away = whoCouldTurnUp({ characters: people, castIds: ['vex'], locationId: 'common', parents: farOff, history: left, current: { locationId: 'common', castIds: ['vex'] }, belongs });
        expect(away.near).toEqual([]);
        expect(away.elsewhere.map((c) => c.id)).toEqual(['adam']);
    });
});
