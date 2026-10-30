import { neighboursOf, runtimeRefs, sidesOf, tiedSides, playerTie } from '../src/generate/run.js';
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

describe('the side of those it is tied to', () => {
    // Cyberpunk: Galice is one of White Cerberus (its members field); her
    // protégée, tied to her, has no side of her own.
    const city = {
        faction: [
            { id: 'fac_wc', type: 'faction', name: 'White Cerberus', description: 'Rebels against Omicron.', base: { members: ['chr_galice'], enemies: ['fac_omicron'] } },
            { id: 'fac_omicron', type: 'faction', name: 'Omicron Innovations' },
        ],
        character: [
            { id: 'chr_galice', type: 'character', name: 'Galice Buckar', role: 'Lead Cyberdeck Developer for White Cerberus', description: 'Petite, dark hair.' },
            { id: 'chr_mari', type: 'character', name: 'Mari Owe', related_entity_ids: ['chr_galice'] },
            { id: 'chr_kat', type: 'character', name: 'Kathar Pott', related_entity_ids: ['chr_galice'], base: { faction: 'fac_omicron' } },
        ],
    };

    it('takes the factions of the people it is tied to, with whom it comes through', () => {
        const [side] = tiedSides(city.character[1], { all: city });
        expect(side).toMatchObject({ name: 'White Cerberus', through: 'Galice Buckar' });
        expect(side.ties.map((t) => t.line)).toContain('White Cerberus → Omicron Innovations: Enemies');
        // Its own side, where it has one, is what counts (sidesOf).
        expect(sidesOf(city.character[2], { all: city }).map((s) => s.name)).toEqual(['Omicron Innovations']);
        expect(tiedSides({ id: 'chr_x', type: 'character', name: 'Loner' }, { all: city })).toEqual([]);
    });

    it('works for a fantasy apprentice tied by a link field too', () => {
        const realm = {
            faction: [{ id: 'fac_order', type: 'faction', name: 'Order of the Lantern', base: { leader: 'chr_maren' } }],
            character: [
                { id: 'chr_maren', type: 'character', name: 'High Seer Maren' },
                { id: 'chr_pip', type: 'character', name: 'Pip', base: { mentor: 'chr_maren' } },
            ],
        };
        expect(tiedSides(realm.character[1], { all: realm }).map((s) => `${s.name} via ${s.through}`)).toEqual(['Order of the Lantern via High Seer Maren']);
    });

    it('shows a tied person\'s role, and tells the model to stand where they stand', () => {
        const out = neighboursOf(city.character[1], city, {}, null);
        expect(out[0]).toMatchObject({ name: 'Galice Buckar', description: 'Lead Cyberdeck Developer for White Cerberus - Petite, dark hair.' });
        const { user } = buildGenerationPrompt({
            task: 'fill', type: { id: 'character', label: 'Character', noun: 'character' }, fields: [], entry: { name: 'Mari Owe', values: {} },
            sides: [{ name: 'White Cerberus', description: '', ties: [], through: 'Galice Buckar' }],
        });
        expect(user).toContain('- White Cerberus (faction), which Galice Buckar is one of');
        expect(user).toContain('# Its side (through Galice Buckar, whom it is tied to');
        expect(user).toContain('works where they work');
    });
});

describe('new people and the player character', () => {
    const character = { id: 'character', label: 'Character', noun: 'character' };
    const world = {
        character: [
            { id: 'chr_pc', type: 'character', name: 'Cyril' },
            { id: 'chr_galice', type: 'character', name: 'Galice Buckar' },
            { id: 'chr_mari', type: 'character', name: 'Mari Owe', related_entity_ids: ['chr_galice'] },
            { id: 'chr_brother', type: 'character', name: 'Tiago', base: { sibling: 'chr_pc' } },
        ],
    };
    it('knows whether an entry is already tied to the player character', () => {
        expect(playerTie(world.character[2], { all: world, playerId: 'chr_pc' })).toEqual({ id: 'chr_pc', name: 'Cyril', tied: false });
        expect(playerTie(world.character[3], { all: world, playerId: 'chr_pc' }).tied).toBe(true);
        expect(playerTie(world.character[2], { all: world, playerId: 'chr_pc', relations: [{ id: 'r', from: 'chr_mari', to: 'chr_pc', kind: 'friend' }] }).tied).toBe(true);
        expect(playerTie(world.character[0], { all: world, playerId: 'chr_pc' })).toBeNull();
        expect(playerTie(world.character[2], { all: world, playerId: '' })).toBeNull();
    });
    it('tells the model a new person is met through the others, in any world', () => {
        for (const name of ['Cyril', 'Remus', 'Captain Ihara', 'Dana Ruiz']) {
            const { user } = buildGenerationPrompt({ task: 'fill', type: character, fields: [], entry: { name: 'Mari Owe', values: {} }, player: { name, tied: false } });
            expect(user).toContain(`${name} is the player character`);
            expect(user).toContain('Tie it to the other people and groups');
        }
        const tied = buildGenerationPrompt({ task: 'fill', type: character, fields: [], entry: { name: 'Tiago', values: {} }, player: { name: 'Cyril', tied: true } }).user;
        expect(tied).not.toContain('is the player character');
        const lore = buildGenerationPrompt({ task: 'fill', type: { id: 'lore', noun: 'lore entry' }, fields: [], entry: { name: 'x', values: {} }, player: { name: 'Cyril', tied: false } }).user;
        expect(lore).not.toContain('is the player character');
    });
});
