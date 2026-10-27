import { buildNamingRulesPrompt, readNamingRules, readLanguages, readReal, proposalToDef, describeProposal, learnedNames, learnInto, MAX_PROPOSED } from '../src/naming/premise.js';
import { planName } from '../src/naming/engine.js';
import { fold } from '../src/naming/text.js';

function roll(n, req, naming) {
    const out = [];
    let counter = 0;
    for (let i = 0; i < n; i++) {
        const r = planName(req, { naming: { ...naming, counter }, overview: {}, names: out });
        counter = r.counter;
        if (r.mode === 'rolled') out.push(r.name);
    }
    return out;
}

const CYBERPUNK = `Here are the cultures for your world:

**CULTURE:** Arcadians
**WHO:** the megacity's mixed-up citizens; names are short and brand-like
**BASED ON:** English 3, Japanese 2, Spanish 1
**DISTANCE:** 1
**FAMILY NAMES:** same
**PLACES:** descriptive English
**USED BY:** Arcadia City, Omicron Innovations
**DEFAULT:** yes

**CULTURE:** Sidhe
**WHO:** elves who awakened in 2031 and kept their old names
**BASED ON:** Elves
**DISTANCE:** 2 - clearly changed
**FAMILY NAMES:** houses named for places
**PLACES:** own tongue
**USED BY:** The Elven Quarter and House Sunborn, Neo-Avalon Spire
**DEFAULT:** no`;

describe('naming rules from the premise: the prompt', () => {
    it('gives the world, the lists to choose from and the format, and asks for no names', () => {
        const { system, prompt } = buildNamingRulesPrompt({
            overview: { premise: 'A cyberpunk megacity where elves awakened.', worldType: 'science_fiction', era: '2070s' },
            places: [{ name: 'Arcadia City', description: 'a sprawling megacity' }],
            factions: [{ name: 'Omicron Innovations', description: 'a megacorp' }],
            names: ['Kiri Ashvale'],
            cultures: ['Old Arcadians'],
        });
        expect(system).toMatch(/never write example names/);
        expect(prompt).toMatch(/Premise: A cyberpunk megacity/);
        expect(prompt).toMatch(/Kind of world: science fiction/);
        expect(prompt).toMatch(/- Arcadia City: a sprawling megacity/);
        expect(prompt).toMatch(/- Omicron Innovations/);
        expect(prompt).toMatch(/Names already in it: Kiri Ashvale/);
        expect(prompt).toMatch(/do not repeat them\): Old Arcadians/);
        expect(prompt).toMatch(/Old Norse/);
        expect(prompt).toMatch(/Icelandic \(modern/);
        expect(prompt).toMatch(/Elves; Dwarves/);
        expect(prompt).toMatch(/CULTURE:/);
        expect(prompt).toMatch(/USED BY:/);
    });

    it('in a canon-only world, says the cultures must sound like its names', () => {
        const { prompt } = buildNamingRulesPrompt({ overview: { premise: 'x' }, names: ['Aelar'], canonOnly: true });
        expect(prompt).toMatch(/canon - the cultures must sound like these/);
    });

    it('passes on the user\'s wish', () => {
        expect(buildNamingRulesPrompt({ overview: { premise: 'x' }, wish: 'corporate names are Japanese' }).prompt).toMatch(/The user asks: corporate names are Japanese/);
    });
});

describe('naming rules from the premise: reading the answer', () => {
    it('reads a cyberpunk world with markdown: languages, a preset, users, the default', () => {
        const [a, s] = readNamingRules(CYBERPUNK);
        expect(a).toMatchObject({ name: 'Arcadians', distance: 1, places: 'kit', isDefault: true, users: ['Arcadia City', 'Omicron Innovations'] });
        expect(a.basis).toEqual({ kind: 'languages', seeds: [{ language: 'english', weight: 3 }, { language: 'japanese', weight: 2 }, { language: 'spanish', weight: 1 }] });
        expect(s).toMatchObject({ name: 'Sidhe', basis: { kind: 'preset', id: 'elves' }, distance: 2, family: { mode: 'places' }, places: 'native', isDefault: false });
        expect(s.users).toEqual(['The Elven Quarter', 'House Sunborn', 'Neo-Avalon Spire']);
    });

    it('reads a real-world Iceland', () => {
        const [p] = readNamingRules('CULTURE: Icelanders\nWHO: Reykjavik today\nBASED ON: Icelandic, modern\nDISTANCE: 0\nUSED BY: Reykjavik\nDEFAULT: yes');
        expect(p.basis).toEqual({ kind: 'real', id: 'real:icelandic:modern' });
        const def = proposalToDef(p, { seed: 's' });
        expect(def).toMatchObject({ kind: 'real', realId: 'real:icelandic:modern', name: 'Icelanders', notes: 'Reykjavik today' });
        expect(describeProposal(p)).toMatch(/real names: Icelandic \(modern\)/);
    });

    it('reads a historical period as a real culture', () => {
        expect(readReal('Old Norse, medieval')).toBe('real:old_norse:medieval');
        expect(readReal('real English, Victorian')).toBe('real:english:victorian');
        // A blend, or one seed with no period, is grown, not real.
        expect(readReal('Old Norse 3, German 1')).toBe('');
        expect(readReal('Finnish')).toBe('');
    });

    it('reads a fantasy world in plain lines, lower-case keys and bullets', () => {
        const raw = '- culture: Vaskari\n- who: harsh mountain clans\n- based on: Old Norse 3, Scottish Gaelic 1\n- distance: strong\n- family names: German 2\n- places: either\n- used by: none\n\nCulture - Plainsfolk\nBased on - Old kingdom (feudal)\nDefault - yes';
        const [v, pf] = readNamingRules(raw);
        expect(v.basis.seeds).toEqual([{ language: 'old_norse', weight: 3 }, { language: 'scottish_gaelic', weight: 1 }]);
        expect(v).toMatchObject({ distance: 2, family: { mode: 'languages', seeds: [{ language: 'german', weight: 2 }] }, places: 'both', users: [] });
        expect(pf).toMatchObject({ name: 'Plainsfolk', basis: { kind: 'preset', id: 'old_kingdom' }, isDefault: true });
        expect(v.isDefault).toBe(false);
    });

    it('reads a science-fiction alien tongue', () => {
        const [p] = readNamingRules('CULTURE: The Hive\nWHO: an insect hive mind\nBASED ON: alien tongue\nSOUNDS: consonants: k:3 x:2 tz; vowels: i:3 e; syllables: 1-2');
        expect(p.basis.kind).toBe('sound');
        expect(p.sounds).toMatchObject({ consonants: 'k:3 x:2 tz', vowels: 'i:3 e', syllables: [1, 2] });
        const def = proposalToDef(p, { seed: 's' });
        expect(def.kind).toBe('sound');
        expect(def.sound.consonants).toBe('k:3 x:2 tz');
    });

    it('drops languages not on the list and falls back when none is left', () => {
        expect(readLanguages('Klingon 3, Welsh 1, Elvish 2')).toEqual([{ language: 'welsh', weight: 1 }]);
        const [p] = readNamingRules('CULTURE: Strangers\nBASED ON: Klingon 3');
        const def = proposalToDef(p, { seed: 's' });
        expect(def.kind).toBe('invented');
        expect(def.seeds.length).toBeGreaterThan(0);
    });

    it('reads "Old Norse" as Old Norse, not as some other language inside it, in the order written', () => {
        expect(readLanguages('Old English 2, English 1').map((x) => x.language)).toEqual(['old_english', 'english']);
        expect(readLanguages('Japanese, Old Norse, Latin')).toEqual([{ language: 'japanese', weight: 3 }, { language: 'old_norse', weight: 2 }, { language: 'latin', weight: 1 }]);
    });

    it('keeps one default, skips cultures the world has, and stops at the most it may propose', () => {
        const many = Array.from({ length: 9 }, (_, i) => `CULTURE: People ${i}\nBASED ON: Welsh\nDEFAULT: yes`).join('\n\n');
        const out = readNamingRules(many, { existing: ['People 0'] });
        expect(out).toHaveLength(MAX_PROPOSED);
        expect(out[0].name).toBe('People 1');
        expect(out.filter((p) => p.isDefault)).toHaveLength(1);
        expect(readNamingRules('CULTURE: A\nBASED ON: Welsh\n\nCULTURE: B\nBASED ON: Welsh').map((p) => p.isDefault)).toEqual([true, false]);
    });

    it('reads nothing from an answer without the format', () => {
        expect(readNamingRules('I think the elves should be Welsh-like.')).toEqual([]);
        expect(readNamingRules('')).toEqual([]);
    });
});

describe('naming rules from the premise: proposals into cultures', () => {
    it('makes working cultures whose names come from the generator, not the model', () => {
        const [a, s] = readNamingRules(CYBERPUNK);
        const da = proposalToDef(a, { seed: 'w', ids: [] });
        const ds = proposalToDef(s, { seed: 'w', ids: [da.id] });
        expect(ds.id).not.toBe(da.id);
        expect(da).toMatchObject({ kind: 'invented', name: 'Arcadians', mutation: 1, style: { feature: 'kit' } });
        expect(da.shifts.length).toBeGreaterThan(0);
        expect(ds).toMatchObject({ kind: 'invented', mutation: 2, family: { from: 'places' }, style: { feature: 'native' } });
        expect(ds.seeds.map((x) => x.language)).toEqual(['finnish', 'welsh', 'icelandic']);
        const naming = { seed: 'w', cultures: { [da.id]: da, [ds.id]: ds } };
        const people = roll(12, { typeId: 'character', brief: 'a woman', cultureId: ds.id }, naming);
        expect(people.length).toBeGreaterThan(8);
        expect(new Set(people.map(fold)).size).toBe(people.length);
        // Nothing the model wrote is a name.
        for (const n of people) expect(CYBERPUNK).not.toContain(n);
    });

    it('describes a proposal in words', () => {
        const [a, s] = readNamingRules(CYBERPUNK);
        expect(describeProposal(a)).toBe('grown from English ×3, Japanese ×2, Spanish; a little changed; descriptive English for the land');
        expect(describeProposal(s)).toBe('like the Elves preset; clearly changed; houses named for places; the land named in its own tongue');
    });
});

describe('learning from the world\'s names', () => {
    const entries = [
        { id: 'p1', type: 'location', name: 'Valdrheim' },
        { id: 'p2', type: 'location', name: 'The Iron Market of Skarn' },
        { id: 'p3', type: 'location', name: 'Lowtown' },
        { id: 'f1', type: 'faction', name: 'House Thornvald' },
        { id: 'c1', type: 'character', name: 'Ragna Eiriksdottir', fields: { location: 'p2' } },
        { id: 'c2', type: 'character', name: 'Bjorn Hale', fields: { faction: 'f1' } },
        { id: 'c3', type: 'character', name: 'Mira Lowe', fields: { location: 'p3' } },
    ];
    const parents = { p2: 'p1' };

    it('takes the names under a culture\'s places and factions, people by name, places by their distinctive words', () => {
        const names = learnedNames(['p1', 'f1'], entries, parents);
        expect(names).toEqual(expect.arrayContaining(['Valdrheim', 'Skarn', 'Thornvald', 'Ragna', 'Eiriksdottir', 'Bjorn', 'Hale']));
        expect(names).not.toContain('Iron');
        expect(names).not.toContain('Market');
        expect(names).not.toContain('House');
        expect(names).not.toContain('Mira');
    });

    it('adds them to a grown culture as examples, never to a real one', () => {
        const def = { kind: 'invented', learned: ['Hrafn'], learnedWeight: 2 };
        expect(learnInto(def, ['Valdrheim', 'Hrafn'])).toMatchObject({ learned: ['Hrafn', 'Valdrheim'], learnedWeight: 3 });
        const real = { kind: 'real', realId: 'real:icelandic:modern' };
        expect(learnInto(real, ['Valdrheim'])).toBe(real);
    });
});
