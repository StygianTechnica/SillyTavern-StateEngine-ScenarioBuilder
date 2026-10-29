import { relevantLore, namedIn, planLore, loreUpdate, involvedIds, lorePassages } from '../src/library/lore.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';

// As stored in the God War chat's library: a long name, aliases joined
// with commas.
const elyon = { id: 'lor_e', name: 'Elyon, the Sovereign of Dawn', aliases: ['Elyon, Sovereign of Dawn, Lord of Radiant Retribution', "God of Light, Warriors' Champion"], related_entity_ids: [] };
const pact = { id: 'lor_p', name: 'The Old Pact', related_entity_ids: ['chr_remus'] };
const fall = { id: 'lor_f', name: 'The Fall of Varn', related_entity_ids: ['chr_maren'] };

describe('lore relevance', () => {
    it('finds a lore entry by the first part of a long name', () => {
        const out = relevantLore([elyon, pact], { recentText: 'Remus knelt. "Elyon has not forgotten you," the priest said.' });
        expect(out.map((x) => x.entry.id)).toEqual(['lor_e']);
        expect(out[0].why).toContain('"Elyon" was just mentioned');
    });

    it('matches whole words only, possessives included', () => {
        expect(namedIn("Elyon's light fades.", 'Elyon')).toBe(true);
        expect(namedIn('Elyonna waved.', 'Elyon')).toBe(false);
    });

    it('catches a proper-noun word of the name', () => {
        expect(relevantLore([fall], { recentText: 'They spoke of Varn in whispers.' })[0].entry.id).toBe('lor_f');
        expect(relevantLore([fall], { recentText: 'the fall was long' })).toEqual([]);
    });

    // From the God War chat: neither was in the scene.
    const cerys = { id: 'lor_c', name: 'Cerys, the Silent Chronicler', aliases: ['Cerys'], related_entity_ids: [] };
    const compact = { id: 'lor_g', name: 'The Graveborn Compact', aliases: ['Graveborn Pact', 'Unspoken Law of Death'], related_entity_ids: [] };

    it('does not take a word of an epithet that is part of another name', () => {
        expect(relevantLore([cerys], { recentText: '"I was raised among the Silent Wardens," Remus said.' })).toEqual([]);
        expect(relevantLore([cerys], { recentText: 'Cerys wrote it down.' })[0].entry.id).toBe('lor_c');
        expect(relevantLore([cerys], { recentText: 'They asked the Silent Chronicler.' })[0].entry.id).toBe('lor_c');
    });

    it('needs the words of a name together, not scattered over the messages', () => {
        const scattered = 'He let the unspoken implication hang in the air. "I have death\'s eye on me." Death knights rode by.';
        expect(relevantLore([compact], { recentText: scattered })).toEqual([]);
        expect(relevantLore([compact], { recentText: 'They obey the unspoken law of death here.' })[0].entry.id).toBe('lor_g');
        expect(relevantLore([compact], { recentText: 'The compact of the Graveborn binds them.' })[0].entry.id).toBe('lor_g');
    });

    it('takes a one-word name only when it is used as a name', () => {
        // "God of Light" leaves only "light", which a lower-case use isn't.
        expect(relevantLore([elyon], { recentText: 'The light faded from the hall.' })).toEqual([]);
        expect(relevantLore([fall], { recentText: 'Then Varn burned.' })[0].entry.id).toBe('lor_f');
        expect(relevantLore([fall], { recentText: 'They bowed to Lord Varn.' })[0].entry.id).toBe('lor_f');
        expect(relevantLore([fall], { recentText: 'The Varn Guard marched.' })).toEqual([]);
    });

    it('finds lore tied to someone the chat names, and to the scene', () => {
        const out = relevantLore([pact, fall], { recentText: 'Maren frowned.', sceneIds: ['chr_remus'], mentioned: [{ id: 'chr_maren', names: ['Maren'] }] });
        expect(out.map((x) => x.entry.id)).toEqual(['lor_f', 'lor_p']);
        expect(out[0].why).toContain('tied to Maren, just mentioned');
    });

    it('puts what was named ahead of what is merely tied to the scene, within the cap', () => {
        const tied = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, name: `Tied ${i}`, related_entity_ids: ['loc_here'] }));
        const out = relevantLore([...tied, elyon], { recentText: 'Elyon.', sceneIds: ['loc_here'] }, 8);
        expect(out).toHaveLength(8);
        expect(out[0].entry.id).toBe('lor_e');
    });
});

describe('lore from Archivist', () => {
    const world = { id: 'w5', kind: 'lore', name: 'The Old Pact', text: 'An oath sworn at the gate.', entity: null, involved: [{ id: 'chr_remus', type: 'character' }] };

    it('creates a new entry with the people involved', () => {
        expect(planLore(world, { lore: [] })).toEqual({ action: 'create', data: { name: 'The Old Pact', description: 'An oath sworn at the gate.', related_entity_ids: ['chr_remus'] } });
    });

    it('links by name, by link, or by the entity Archivist names', () => {
        expect(planLore(world, { lore: [pact] })).toEqual({ action: 'link', id: 'lor_p' });
        expect(planLore({ ...world, name: 'Elyon' }, { lore: [elyon] })).toEqual({ action: 'link', id: 'lor_e' });
        expect(planLore({ ...world, name: 'Other' }, { lore: [pact], links: { w5: 'lor_p' } })).toEqual({ action: 'link', id: 'lor_p' });
        expect(planLore({ ...world, name: 'Other', entity: { id: 'lor_e', type: 'lore' } }, { lore: [elyon] })).toEqual({ action: 'link', id: 'lor_e' });
    });

    it('does not make again what was deleted, dismissed or rejected', () => {
        expect(planLore(world, { lore: [], links: { w5: 'gone' } })).toEqual({ action: 'dismiss' });
        expect(planLore(world, { lore: [], dismissed: new Set(['w5']) })).toEqual({ action: 'skip' });
        expect(planLore(world, { lore: [], rejected: (n) => n === 'The Old Pact' })).toEqual({ action: 'skip' });
    });

    it('follows Archivist\'s text only while nobody has edited the description', () => {
        const entry = { id: 'lor_p', description: 'An oath.', related_entity_ids: [] };
        expect(loreUpdate(entry, world, 'An oath.')).toEqual({ patch: { description: 'An oath sworn at the gate.', related_entity_ids: ['chr_remus'] }, synced: 'An oath sworn at the gate.' });
        expect(loreUpdate({ ...entry, description: 'My own words.' }, world, 'An oath.').patch.description).toBeUndefined();
    });

    it('never links lore to itself as involved', () => {
        expect(involvedIds({ entity: { id: 'lor_x', type: 'lore' }, involved: [{ id: 'chr_a', type: 'character' }] })).toEqual(['chr_a']);
    });
});

describe('lore written from the story', () => {
    const lore = { id: 'lore', noun: 'lore entry', label: 'Lore', plural: 'Lore' };
    // The player character is in every message: their name says nothing.
    const cyberpunk = [
        { name: 'Cyril', text: 'Cyril walks into the armory.' },
        { name: 'Narrator', text: 'Vex hands Cyril a pistol and talks about the weather over the seawall.' },
        { name: 'Narrator', text: 'Riven blocks the door. "Your family legacy is tied to Omicron Innovations," he spits at Cyril.\n\nThe lights hum.' },
        { name: 'Cyril', text: 'Cyril shrugs and checks the gear.' },
        { name: 'Narrator', text: 'Riven still suspects Cyril of dealings with Omicron.' },
    ];
    it('finds the passages that bring it up, in story order, skipping words every message has', () => {
        const out = lorePassages(cyberpunk, { name: "Cyril's Complicity with Omicron Innovations", description: 'Riven suspects Cyril of dealings with Omicron Innovations due to his family legacy.' });
        expect(out.split('\n\n')[0]).toMatch(/^Narrator: Riven blocks the door/);
        expect(out).toContain('Riven still suspects');
        expect(out).not.toContain('The lights hum');
        expect(out).not.toContain('weather');
    });
    it('works the same in other worlds, and gives nothing when the chat never brings it up', () => {
        const fantasy = [
            { name: 'Remus', text: 'Remus kneels at the shrine.' },
            { name: 'Narrator', text: 'The priest whispers that the Ember Covenant was broken the night the old king died.' },
            { name: 'Narrator', text: 'Snow falls on the pass.' },
        ];
        expect(lorePassages(fantasy, { name: 'The Ember Covenant', description: 'An old oath between the crown and the fire priests.' })).toMatch(/^Narrator: The priest whispers/);
        const scifi = [{ name: 'Narrator', text: 'The freighter docks at Ceres.' }, { name: 'Narrator', text: 'Ops logs show the Halvorsen Drift anomaly again; the crew calls it the ghost signal.' }];
        expect(lorePassages(scifi, { name: 'The Halvorsen Drift', aliases: ['the ghost signal'], description: '' })).toContain('ghost signal');
        const realWorld = [{ name: 'Narrator', text: 'Detroit, 1967. The diner is quiet.' }];
        expect(lorePassages(realWorld, { name: 'The Packard Plant Fire', description: 'A fire nobody admits to starting.' })).toBe('');
        expect(lorePassages([], { name: 'Anything' })).toBe('');
    });
    it('tells the model lore is knowledge, not a person, and to keep to the story', () => {
        const fields = [{ name: 'category', label: 'Category', kind: 'text' }];
        const { user } = buildGenerationPrompt({ task: 'fill', type: lore, entry: { name: "Cyril's Complicity", values: {} }, fields, loreStory: 'Narrator: Riven blocks the door.' });
        expect(user).toContain('# Where the story brings it up');
        expect(user).toContain('never the names, nicknames or titles of the people it concerns');
        expect(user).toContain('a suspicion stays a suspicion');
        const none = buildGenerationPrompt({ task: 'fill', type: lore, entry: { name: 'The Ember Covenant', values: {} }, fields }).user;
        expect(none).toContain('This is lore');
        expect(none).not.toContain('Where the story brings it up');
        const other = buildGenerationPrompt({ task: 'fill', type: { id: 'faction', noun: 'faction' }, entry: { name: 'White Cerberus', values: {} }, fields }).user;
        expect(other).not.toContain('This is lore');
    });
});
