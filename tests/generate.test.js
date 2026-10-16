import { buildGenerationPrompt, parseGenerationResponse, extractJson, mergeGenerated } from '../src/generate/prompt.js';
import { randomFor, eraGroups, splitList, joinList, describeMagic, describeTech, normalizeMagic, techForEra } from '../src/library/world-options.js';
import { normalizeSettingDoc } from '../src/store/schema.js';

const type = { id: 'character', label: 'Character', noun: 'character' };
const fields = [
    { name: 'role', label: 'Role', kind: 'text' },
    { name: 'personality', label: 'Personality', kind: 'longtext' },
    { name: 'mood', label: 'Mood', kind: 'enum', values: ['Calm', 'Angry'] },
    { name: 'faction', label: 'Faction', kind: 'ref', refType: 'faction' },
    { name: 'traits', label: 'Traits', kind: 'list' },
];
const overview = { premise: 'A drowned port city.', tone: 'gritty', era: 'age of sail', worldType: 'fantasy' };

describe('generation prompts', () => {
    it('asks only for the empty fields when filling', () => {
        const { user, keys } = buildGenerationPrompt({ task: 'fill', type, fields, entry: { name: 'Mira', values: { description: 'An innkeeper.', role: 'innkeeper' } }, overview });
        expect(keys).toEqual(['aliases', 'personality', 'mood', 'faction', 'traits']);
        expect(user).toContain('Description (description): An innkeeper.');
        expect(user).toContain('Premise: A drowned port city.');
        expect(user).not.toMatch(/- "role"/);
    });

    it('builds on existing text when enriching one field', () => {
        const { user, keys } = buildGenerationPrompt({ task: 'field', targetField: 'description', type, fields, entry: { name: 'Mira', values: { description: 'An innkeeper.' } } });
        expect(keys).toEqual(['description']);
        expect(user).toContain('keep everything it already says');
    });

    it('creates from nothing, avoiding existing names', () => {
        const { user, keys } = buildGenerationPrompt({ task: 'create', type, fields, similarNames: ['Mira', 'Tobin'], refNames: { faction: ['The Ledger Guild'] }, parentName: 'Veylan' });
        expect(keys[0]).toBe('name');
        expect(user).toContain('Surprise the user');
        expect(user).toContain('do not reuse their names: Mira, Tobin');
        expect(user).toContain('"The Ledger Guild"');
        expect(user).toContain('located inside Veylan');
    });

    it('uses a brief, memories and neighbours', () => {
        const { user } = buildGenerationPrompt({ task: 'create', type, fields, brief: 'a smuggler with a conscience', memories: ['She hid the boy in the cellar.'], neighbours: [{ relation: 'Inside', type: 'location', name: 'Veylan', description: 'A port.' }] });
        expect(user).toContain('a smuggler with a conscience');
        expect(user).toContain('She hid the boy in the cellar.');
        expect(user).toContain('- Inside: Veylan (location) - A port.');
    });
});

describe('parsing answers', () => {
    const lookup = (t, n) => (t === 'faction' && n.toLowerCase() === 'the ledger guild' ? 'fac_1' : null);

    it('finds JSON among chatter and fences', () => {
        expect(extractJson('Sure!\n```json\n{"a": "b {x}", "c": [1,2,],}\n```')).toEqual({ a: 'b {x}', c: [1, 2] });
        expect(extractJson('no json')).toBeNull();
    });

    it('fits values to the fields and drops what does not fit', () => {
        const keys = ['name', 'description', 'mood', 'faction', 'traits', 'role'];
        const { values, dropped, error } = parseGenerationResponse('{"name":"Kess","description":"A smuggler.","mood":"angry","faction":"the ledger guild","traits":"wry, loyal","role":"","made_up":1}', { fields, keys, refLookup: lookup });
        expect(error).toBeNull();
        expect(values).toEqual({ name: 'Kess', description: 'A smuggler.', mood: 'Angry', faction: 'fac_1', traits: ['wry', 'loyal'] });
        expect(dropped).toEqual(['made_up']);
    });

    it('reports unknown references and enum values', () => {
        const { dropped } = parseGenerationResponse('{"mood":"Ecstatic","faction":"Nobody"}', { fields, keys: ['mood', 'faction'], refLookup: lookup });
        expect(dropped).toEqual(['mood: Ecstatic', 'faction: Nobody']);
    });

    it('fails clearly on a non-answer', () => {
        expect(parseGenerationResponse('I cannot do that.', { fields, keys: ['role'] }).error).toMatch(/JSON/);
    });

    it('never overwrites content when filling', () => {
        expect(mergeGenerated({ role: 'innkeeper', personality: '' }, { role: 'pirate', personality: 'wry' }, 'fill')).toEqual({ role: 'innkeeper', personality: 'wry' });
        expect(mergeGenerated({ role: 'innkeeper' }, { role: 'innkeeper of the docks' }, 'field')).toEqual({ role: 'innkeeper of the docks' });
    });
});

describe('world options', () => {
    it('rolls values constrained by what is set', () => {
        const zero = () => 0;
        expect(randomFor('era', { worldType: 'science_fiction' }, zero)).toBe('near future');
        expect(randomFor('magic.presence', { worldType: 'fantasy' }, zero)).toBe('lost');
        expect(randomFor('magic.presence', { worldType: 'historical' }, zero)).toBe('none');
        expect(randomFor('tech.level', { era: 'victorian' }, zero)).toBe('tl5');
        expect(randomFor('magic.kinds', { magic: { absent: ['divine'] } }, zero)).toEqual(['arcane']);
        expect(splitList(randomFor('tone', {}, zero))).toHaveLength(2);
    });

    it('orders era groups by world type and joins lists', () => {
        expect(eraGroups('modern')[0].key).toBe('modern');
        expect(joinList(['dark', ' dark', 'heroic'])).toBe('dark, heroic');
    });
});

describe('magic and technology', () => {
    it('states what exists and, as hard limits, what does not', () => {
        const { lines, limits } = describeMagic({ presence: 'rare', power: 'worldbreaking', kinds: ['divine'], absent: ['arcane'], notes: 'Granted by gods at war.' });
        expect(lines[0]).toBe('Magic - kinds that exist: divine; how widespread: rare; how strong it gets: world-breaking.');
        expect(lines[1]).toBe('How magic works: Granted by gods at war.');
        expect(limits.join(' ')).toContain('The only magic that exists is: divine');
        expect(limits.join(' ')).toContain('do NOT exist in this world: arcane');
    });

    it('turns restriction rules into hard limits, with their meaning', () => {
        const { limits } = describeMagic({ presence: 'uncommon', restrictions: ['Ritual required', 'Social limits', 'only on the full moon'] });
        const rules = limits.find((l) => l.startsWith('Magic obeys these rules'));
        expect(rules).toContain('ritual required (no spell can be cast without a ritual');
        expect(rules).toContain('social limits (only a privileged group');
        expect(rules).toContain('only on the full moon');
    });

    it('forbids magic entirely when there is none', () => {
        expect(describeMagic({ presence: 'none' }).limits[0]).toContain('NO magic of any kind');
    });

    it('describes technology and how it is understood', () => {
        const { lines, limits } = describeTech({ level: 'tl5', flavors: ['steampunk'], spread: 'imported', absent: ['gunpowder'] });
        expect(lines[0]).toBe('Technology - level: TL5 Industrial Revolution (mass production, steam power, the telegraph); flavour: steampunk; spread: adopted from outside - used, not understood.');
        expect(limits[0]).toBe('Technology stays at TL5 Industrial Revolution: nothing from a later tech level beyond the imported or relic technology described.');
        expect(limits.join(' ')).toContain('gunpowder');
        expect(techForEra('Age of Sail')).toBe('tl4');
        expect(techForEra('present day')).toBe('tl8');
    });

    it('moves older tech levels onto the TL scale', async () => {
        const { normalizeTech } = await import('../src/library/world-options.js');
        expect(normalizeTech({ level: 'gunpowder' }).level).toBe('tl4');
        expect(normalizeTech({ level: 'information' }).level).toBe('tl8');
        expect(normalizeTech({ level: 'tl12' }).level).toBe('tl12');
    });

    it('migrates the old single magic/technology level', () => {
        expect(normalizeMagic(undefined, 'high')).toMatchObject({ presence: 'common', power: 'mighty' });
        const doc = normalizeSettingDoc({ overview: { premise: 'x', magicLevel: 'none' } });
        expect(doc.overview.magic.presence).toBe('none');
        expect('magicLevel' in doc.overview).toBe(false);
    });
});

describe('world limits in prompts and guidance', () => {
    const godWar = { premise: 'Gods at war.', magic: { presence: 'rare', kinds: ['divine'], absent: ['arcane'] }, tech: { level: 'tl3', absent: ['gunpowder'] } };

    it('states hard limits in every generation prompt', () => {
        const { user } = buildGenerationPrompt({ task: 'create', type, fields, overview: godWar });
        expect(user).toContain('# Hard limits - never break these');
        expect(user).toContain('do NOT exist in this world: arcane');
        expect(user).toContain('gunpowder');
    });

    it('keeps the limits in the guidance even when the overview is shortened', async () => {
        const { buildGuidance } = await import('../src/guidance/build.js');
        const full = buildGuidance({ overview: godWar, budget: 2000 }).text;
        expect(full).toContain('World limits:');
        expect(full).toContain('arcane');
        const tight = buildGuidance({ overview: { ...godWar, premise: 'x'.repeat(900), rules: 'y'.repeat(900) }, location: { path: ['Keep'] }, budget: 160 });
        expect(tight.sections.find((s) => s.key === 'overview').mode).toBe('compact');
        expect(tight.text).toContain('arcane');
    });
});
