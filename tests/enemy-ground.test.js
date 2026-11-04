// Assassins Inc: Tiago Moriarty, second of the Medina Syndicate, walked into
// White Cerberus's training center (Nov 3, taken out by hand) and then its
// gym (Nov 4) - the Signal Box is White Cerberus's, and the two are enemies.
// The relations below are the setting's own.
import { enemyGround, whoCouldTurnUp, lastSeen, belongingHere } from '../src/director/whereabouts.js';
import { libraryMemberships } from '../src/library/faction-sync.js';
import { dossierText } from '../src/director/prompt.js';


const parents = { gym: 'signal', training: 'signal', signal: 'city', safehouse: 'city', city: 'world' };
const factions = [
    { id: 'wc', name: 'White Cerberus' },
    { id: 'medina', name: 'Medina Syndicate', members: ['tiago'] },
    { id: 'omicron', name: 'Omicron Innovations' },
];
const characters = [
    { id: 'cyril', name: 'Cyril Moriarty' },
    { id: 'adam', name: 'Adam Miller' },
    { id: 'kael', name: 'Instructor Kael' },
    { id: 'tiago', name: 'Tiago Moriarty', role: 'High-ranking member of the Medina Syndicate' },
    { id: 'riven', name: 'Riven' },
    { id: 'vendor', name: 'Noodle Vendor' },
];
const relations = [
    { from: 'signal', to: 'wc', kind: 'occupant' },
    { from: 'wc', to: 'medina', kind: 'enemy' },
    { from: 'wc', to: 'omicron', kind: 'distrusts' },
    { from: 'medina', to: 'omicron', kind: 'ally' },
    { from: 'medina', to: 'safehouse', kind: 'owns' },
    { from: 'adam', to: 'wc', kind: 'leads' },
    { from: 'kael', to: 'wc', kind: 'member of' },
    { from: 'riven', to: 'wc', kind: 'member of' },
    { from: 'tiago', to: 'medina', kind: 'organization & employer' },
    { from: 'tiago', to: 'adam', kind: 'rival & enemy' },
];
const memberships = libraryMemberships(factions, relations);
const at = (place, extra = {}) => ({ placeIds: [place, ...pathUp(place)], parents, characters, factions, relations, memberships, placeName: (id) => ({ signal: 'The Signal Box', safehouse: 'Medina Syndicate Safehouse' })[id] ?? '', ...extra });
function pathUp(id) {
    const out = [];
    for (let p = parents[id]; p; p = parents[p]) out.push(p);
    return out;
}

describe('enemy ground', () => {
    it('keeps Tiago out of the Signal Box, and no one of White Cerberus', () => {
        const g = enemyGround(at('gym'));
        expect(g.holders).toEqual([{ id: 'wc', name: 'White Cerberus' }]);
        expect(g.leaders).toEqual(['adam']);
        expect([...g.barred.keys()]).toEqual(['tiago']);
        expect(g.barred.get('tiago')).toMatchObject({ sides: ['Medina Syndicate'], against: ['wc'] });
        expect(g.barred.get('tiago').why).toBe('of Medina Syndicate, against White Cerberus, whose ground The Signal Box is');
    });

    it('a merely distrusted side, or someone of no side, is not barred', () => {
        expect(enemyGround(at('gym')).barred.has('vendor')).toBe(false);
        const omicronMan = [...characters, { id: 'exec', name: 'Omicron Exec' }];
        const rel = [...relations, { from: 'exec', to: 'omicron', kind: 'member of' }];
        expect(enemyGround(at('gym', { characters: omicronMan, relations: rel, memberships: libraryMemberships(factions, rel) })).barred.has('exec')).toBe(false);
    });

    it('works the other way: White Cerberus cannot walk into a Medina safehouse', () => {
        const g = enemyGround(at('safehouse'));
        expect(g.holders.map((h) => h.name)).toEqual(['Medina Syndicate']);
        expect([...g.barred.keys()].sort()).toEqual(['adam', 'kael', 'riven']);
    });

    it('their own tie to the place lets them in - a prisoner held there', () => {
        const rel = [...relations, { from: 'tiago', to: 'signal', kind: 'prisoner held in' }];
        expect(enemyGround(at('gym', { relations: rel })).barred.has('tiago')).toBe(false);
    });

    it('no one holds open ground', () => {
        expect(enemyGround(at('city')).barred.size).toBe(0);
    });

    it('belonging here still finds the holders', () => {
        expect(belongingHere(at('gym')).map((b) => b.id)).toEqual(['adam', 'kael', 'riven']);
    });
});

describe('who could turn up, on enemy ground', () => {
    // Nov 3: walked into the training center by the game master (#100),
    // taken out by hand (#107).
    const history = [
        { source: 'director', before: { castIds: ['cyril', 'adam'], locationId: 'training' }, after: { castIds: ['cyril', 'adam', 'tiago'] } },
        { source: 'user', before: { castIds: ['cyril', 'adam', 'tiago'] }, after: { castIds: ['cyril', 'adam'] } },
    ];

    it('the player taking someone out means they were never rightly there', () => {
        expect(lastSeen(history).get('tiago')).toMatchObject({ locationId: '', removed: true });
        expect(lastSeen(history).get('adam')).toMatchObject({ locationId: 'training' });
    });

    it('a hand-removed visit no longer counts as nearby', () => {
        const { near, elsewhere } = whoCouldTurnUp({ characters, castIds: ['cyril'], locationId: 'gym', parents, history, inPlay: ['tiago'] });
        expect(near.map((c) => c.id)).not.toContain('tiago');
        expect(elsewhere.find((c) => c.id === 'tiago')?.why).toBe('taken out of the scene by the player');
    });

    it('barred whatever else would bring them - a past visit, a tie, coming looking', () => {
        const barred = enemyGround(at('gym')).barred;
        const leftAlone = history.slice(0, 1);
        const { near, elsewhere, barred: kept } = whoCouldTurnUp({ characters, castIds: ['cyril'], locationId: 'gym', parents, history: leftAlone, inPlay: ['tiago'], arrived: ['tiago'], barred });
        expect(near.map((c) => c.id)).not.toContain('tiago');
        expect(elsewhere.map((c) => c.id)).not.toContain('tiago');
        expect(kept).toEqual([{ id: 'tiago', name: 'Tiago Moriarty', role: 'High-ranking member of the Medina Syndicate', why: barred.get('tiago').why }]);
    });
});

describe('the game master is told', () => {
    it('ENEMY GROUND, with what to show instead', () => {
        const text = dossierText({ barred: [{ name: 'Tiago Moriarty', role: 'second of the Medina Syndicate', why: 'of Medina Syndicate, against White Cerberus, whose ground The Signal Box is' }], ground: { place: 'The Signal Box', holders: ['White Cerberus'], leaders: ['Adam Miller'] } });
        expect(text).toContain('ENEMY GROUND (The Signal Box is held by White Cerberus; these are against them and cannot be inside it - never ENTERS here)');
        expect(text).toContain('- Tiago Moriarty (second of the Medina Syndicate) - of Medina Syndicate, against White Cerberus');
        expect(text).toContain('word of them comes in and reaches Adam Miller');
    });
});
