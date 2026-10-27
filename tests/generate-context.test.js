import { neighboursOf, runtimeRefs, sidesOf } from '../src/generate/run.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';

// A location whose factions are set in the chat (State Engine's per-chat
// Factions field), among many neighbouring places.
const fortress = { id: 'loc_fortress', type: 'location', name: "Niamh's Fortress", runtime: { values: { factions: ['fac_redhaven'], conditions: '' } }, startValues: { factions: ['fac_wardens'] } };
const siblings = Array.from({ length: 20 }, (_, i) => ({ id: `loc_s${i}`, type: 'location', name: `Place ${i}` }));
const all = {
    location: [{ id: 'loc_wastes', type: 'location', name: 'The Wastes' }, fortress, ...siblings],
    faction: [
        { id: 'fac_redhaven', type: 'faction', name: 'Redhaven defenders', description: 'They hold the walls.' },
        { id: 'fac_wardens', type: 'faction', name: 'Silent Wardens' },
        { id: 'fac_ravagers', type: 'faction', name: 'Ravagers', base: { territory: 'loc_fortress' } },
    ],
};
const parents = Object.fromEntries([['loc_fortress', 'loc_wastes'], ...siblings.map((s) => [s.id, 'loc_wastes'])]);

describe('what generation sees around an entry', () => {
    it('reads the entries its chat state and starting values point at', () => {
        expect(runtimeRefs(fortress)).toEqual([{ field: 'factions', ids: ['fac_redhaven'] }, { field: 'factions', ids: ['fac_wardens'] }]);
    });

    it('puts direct ties - its factions, those that claim it - before the places around it', () => {
        const out = neighboursOf(fortress, all, parents, null);
        expect(out.slice(0, 3).map((n) => `${n.relation}: ${n.name}`)).toEqual(['Factions: Redhaven defenders', 'Factions: Silent Wardens', 'territory of: Ravagers']);
        expect(out[0].description).toBe('They hold the walls.');
        expect(out.findIndex((n) => n.relation === 'Nearby')).toBeGreaterThan(3);
    });
});

describe('the side a new member takes', () => {
    const world = {
        faction: [
            { id: 'fac_hand', type: 'faction', name: 'Iron Hand', aliases: ['the Hand'], description: 'Dockside enforcers.', base: { leader: 'chr_boss' } },
            { id: 'fac_guild', type: 'faction', name: 'Tide Guild' },
        ],
        character: [
            { id: 'chr_boss', type: 'character', name: 'Old Brann' },
            { id: 'chr_vane', type: 'character', name: 'Marcus Vane', base: { enemies: ['fac_hand'] } },
            { id: 'chr_ada', type: 'character', name: 'Ada', base: { faction: 'fac_hand' } },
        ],
    };
    const rivals = [{ id: 'r1', from: 'chr_vane', to: 'fac_hand', kind: 'rival', note: 'wants the docks', mutual: true }];

    it('finds the faction the idea names and how it stands with others', () => {
        const [side] = sidesOf(null, { brief: 'a young recruit of the Hand', all: world, relations: rivals });
        expect(side.name).toBe('Iron Hand');
        expect(side.ties.map((t) => t.line)).toEqual([
            'Iron Hand → Marcus Vane: rival - wants the docks',
            'Iron Hand → Old Brann: Leader',
            'Marcus Vane → Iron Hand: Enemies',
            'Ada → Iron Hand: Faction',
        ]);
    });

    it('finds it from the draft fields, or an existing member, but not an enemy field', () => {
        expect(sidesOf(null, { fields: { faction: 'fac_guild' }, all: world }).map((s) => s.name)).toEqual(['Tide Guild']);
        expect(sidesOf(world.character[2], { all: world }).map((s) => s.name)).toEqual(['Iron Hand']);
        expect(sidesOf(world.character[1], { all: world })).toEqual([]);
        expect(sidesOf(null, { brief: 'a handyman', all: world })).toEqual([]);
    });

    it('tells the model to keep its side\'s friends and enemies', () => {
        const { user } = buildGenerationPrompt({
            task: 'create', type: { id: 'character', label: 'Character', noun: 'character' }, fields: [], entry: { name: '', values: {} }, brief: 'a recruit of the Hand',
            relationNames: ['Marcus Vane', 'Old Brann'], sides: [{ name: 'Iron Hand', description: '', ties: ['Iron Hand → Marcus Vane: rival'] }],
        });
        expect(user).toContain('# Its side');
        expect(user).toContain('  - Iron Hand → Marcus Vane: rival');
        expect(user).toContain("never a friend, ally or confidant of its side's rival or enemy");
    });
});
