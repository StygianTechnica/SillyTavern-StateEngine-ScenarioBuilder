import { parseDirectorNote, relevance, dossierText, buildDirectorPrompt, alsoRelevant, newKind, echoes, withoutPlayerActions } from '../src/director/prompt.js';
import { factionsAtPlay, renamePlan } from '../src/director/run.js';

const known = [
    { id: 'chr_remus', name: 'Remus Watt', aliases: [] },
    { id: 'fac_wardens', name: 'Silent Wardens', aliases: [] },
    { id: 'loc_fortress', name: "Niamh's Fortress", aliases: [] },
];
const quests = [{ name: "Elyon's Claim on Remus" }];

describe('what the director may create', () => {
    it('reads every kind, with what it is tied to', () => {
        const parsed = parseDirectorNote([
            'The dead press the gate.',
            'NEW creature | Ash Ghouls | burned dead that hunt by smell | Niamh\'s Fortress',
            'NEW faction | The Pale Choir | Morvath\'s priests | Silent Wardens',
        ].join('\n'));
        expect(parsed.created).toEqual([
            { kind: 'creature', name: 'Ash Ghouls', description: 'burned dead that hunt by smell', here: true, why: "Niamh's Fortress" },
            { kind: 'faction', name: 'The Pale Choir', description: "Morvath's priests", here: true, why: 'Silent Wardens' },
        ]);
    });

    it('reads a character\'s place and tie, or a tie alone', () => {
        expect(parseDirectorNote('x\nNEW character | Bren | a scout | nearby | Silent Wardens').created[0]).toMatchObject({ here: false, why: 'Silent Wardens' });
        expect(parseDirectorNote('x\nNEW character | Bren | a scout | here').created[0]).toMatchObject({ here: true, why: '' });
        expect(parseDirectorNote('x\nNEW lore | The Sundering | the night the gods fell | Elyon\'s Claim on Remus').created[0]).toMatchObject({ kind: 'lore', why: "Elyon's Claim on Remus" });
    });

    it('takes what the chat brought up, or what grows out of the setting - never something at random', () => {
        const ctx = { recentText: 'The ash ghouls are coming over the wall!', quests, known };
        expect(relevance({ kind: 'creature', name: 'Ash Ghouls', why: '' }, ctx).ok).toBe(true);
        expect(relevance({ kind: 'faction', name: 'The Pale Choir', why: 'rivals of the Silent Wardens' }, ctx)).toEqual({ ok: true, tiedIds: ['fac_wardens'] });
        expect(relevance({ kind: 'lore', name: 'The Sundering', why: "Elyon's Claim on Remus" }, ctx).ok).toBe(true);
        expect(relevance({ kind: 'event', name: 'Festival of Lanterns', why: 'it seemed fun' }, ctx)).toEqual({ ok: false, tiedIds: [] });
        expect(relevance({ kind: 'location', name: 'Glass Tower', why: '' }, ctx).ok).toBe(false);
    });

    it('keeps items to plot points', () => {
        expect(relevance({ kind: 'item', name: 'Silver Bell', why: 'pretty' }, { recentText: 'a bell rings', quests, known }).ok).toBe(false);
        expect(relevance({ kind: 'item', name: 'Seal of Elyon', why: "Elyon's Claim on Remus" }, { quests, known }).ok).toBe(true);
    });

    it('offers every kind in the prompt, and asks for a tie', () => {
        const { prompt } = buildDirectorPrompt({ allowCreate: true, cast: [{ name: 'Remus', player: true }] });
        for (const kind of ['location', 'character', 'creature', 'faction', 'lore', 'event', 'item']) expect(prompt).toContain(`NEW ${kind} |`);
        expect(prompt).toContain('Never add something at random');
    });
});

describe('the dossier', () => {
    it('carries the factions at play, the lore, events and earlier scenes', () => {
        const text = dossierText({
            factions: [{ name: 'Silent Wardens', description: 'Seers of the enclave.', goals: 'keep the balance', members: ['Maren'] }],
            lore: [{ name: 'Elyon, the Sovereign of Dawn', description: 'God of light.' }],
            eventObjects: [{ name: 'The Siege', description: 'The dead mass below the wall.', when: 'tonight' }],
            events: ['Harvest Moon (in 3 days)'],
            scenes: [{ name: 'The debt comes due', description: 'Remus learns of the pact.' }],
        });
        expect(text).toContain('FACTIONS AT PLAY');
        expect(text).toContain('- Silent Wardens: Seers of the enclave; wants: keep the balance; here: Maren');
        expect(text).toContain('LORE THAT MATTERS HERE');
        expect(text).toContain('- The Siege: The dead mass below the wall. (tonight)');
        expect(text).toContain('- Harvest Moon (in 3 days)');
        expect(text).toContain('EARLIER SCENES IN THIS CHAT');
    });

    it('finds the factions of the people present and of the place', () => {
        const factions = [
            { id: 'fac_wardens', name: 'Silent Wardens', base: { members: ['chr_maren'] } },
            { id: 'fac_ravagers', name: 'Ravagers', base: { members: [] } },
            { id: 'fac_legion', name: 'Undead Legion', base: { territory: 'loc_wastes' } },
            { id: 'fac_far', name: 'Far Kingdom', base: {} },
        ];
        const out = factionsAtPlay(factions, {
            cast: [{ id: 'chr_maren', name: 'Maren' }, { id: 'chr_graxx', name: 'Graxx' }],
            placeIds: ['loc_hall', 'loc_wastes'],
            runtimeOf: (id) => (id === 'chr_graxx' ? ['fac_ravagers'] : []),
        });
        expect(out.map((f) => `${f.name}:${f.members.join('+')}:${f.why}`)).toEqual(['Silent Wardens:Maren:', 'Ravagers:Graxx:', 'Undead Legion::holds or is tied to this place']);
    });
});

describe('everything that bears on the moment', () => {
    const entries = [
        { id: 'itm_seal', type: 'item', name: 'Seal of Elyon', description: 'A sunburst seal.' },
        { id: 'loc_temple', type: 'location', name: 'Temple of the Forgotten Dawn', aliases: ["Elyon's Abandoned Shrine"], description: 'An overgrown temple.' },
        { id: 'itm_map', type: 'item', name: 'Maps of the Fortress', base: { location: 'loc_hall' } },
        { id: 'fac_wardens', type: 'faction', name: 'Silent Wardens' },
        { id: 'itm_far', type: 'item', name: 'Far Relic' },
    ];
    it('takes entries of any type named in the chat or tied to the scene, named first, leaving out what is covered', () => {
        const out = alsoRelevant(entries, {
            recentText: "They spoke of Elyon's Abandoned Shrine and the Silent Wardens.",
            sceneIds: ['loc_hall', 'chr_remus'],
            covered: new Set(['silent wardens']),
            typeLabel: (t) => t[0].toUpperCase() + t.slice(1),
        });
        expect(out).toEqual([
            { name: 'Temple of the Forgotten Dawn', type: 'Location', description: 'An overgrown temple.', why: 'named in the chat' },
            { name: 'Maps of the Fortress', type: 'Item', description: '', why: 'tied to this place or someone here' },
        ]);
    });
    it('are folded into the narrative, and quests and scenes can be added too', () => {
        const { prompt } = buildDirectorPrompt({ allowCreate: true, relevant: [{ name: 'Seal of Elyon', type: 'Item', description: 'A sunburst seal.' }] });
        expect(prompt).toContain('ALSO RELEVANT');
        expect(prompt).toContain('- Seal of Elyon (item): A sunburst seal');
        expect(prompt).toContain('fold each into the narrative in a few words');
        expect(prompt).toContain('NEW quest |');
        expect(newKind('Mission')).toBe('quest');
        expect(newKind('scenes')).toBe('scene');
        expect(parseDirectorNote('x\nNEW quest | Return the Seal | bring it to the shrine | Seal of Elyon').created[0]).toMatchObject({ kind: 'quest', why: 'Seal of Elyon' });
    });
});

describe('people the story describes but has not named', () => {
    const recent = 'A tall man with thick eyebrows and a weirdly twisted smile. Another with crooked teeth and an eyepatch. The third was heavyset.';
    it('are added under a descriptive name, marked unnamed', () => {
        const c = parseDirectorNote('x\nNEW character | The Eyepatched Man | crooked teeth, an eyepatch | here | unnamed').created[0];
        expect(c).toMatchObject({ kind: 'character', name: 'The Eyepatched Man', here: true, why: '', provisional: true });
        expect(relevance(c, { recentText: recent, quests: [], known: [] }).ok).toBe(true);
        expect(relevance({ ...c, name: 'The Hooded Woman' }, { recentText: recent, quests: [], known: [] }).ok).toBe(false);
        expect(echoes('The Heavyset Man', recent)).toBe(true);
    });
    it('are listed as having no name yet, and renamed only to a name the chat gives', () => {
        expect(dossierText({ cast: [{ name: 'The Eyepatched Man', provisional: true }] })).toContain('- The Eyepatched Man (no name yet - known by this description)');
        expect(parseDirectorNote('x\nRENAME | The Eyepatched Man | Korrin').renames).toEqual([{ from: 'The Eyepatched Man', to: 'Korrin' }]);
        const characters = [{ id: 'chr_e', name: 'The Eyepatched Man', aliases: [] }, { id: 'chr_g', name: 'Graxx' }];
        const provisional = (id) => id === 'chr_e';
        expect(renamePlan([{ from: 'The Eyepatched Man', to: 'Korrin' }], characters, provisional, '"Korrin, sit down," Graxx barked.'))
            .toEqual([{ id: 'chr_e', from: 'The Eyepatched Man', to: 'Korrin', aliases: ['The Eyepatched Man'] }]);
        // A name the chat has not given, or someone already named, is left alone.
        expect(renamePlan([{ from: 'The Eyepatched Man', to: 'Bartholomew' }], characters, provisional, 'Graxx barked.')).toEqual([]);
        expect(renamePlan([{ from: 'Graxx', to: 'Korrin' }], characters, provisional, 'Korrin')).toEqual([]);
    });
});

describe('the director and agendas', () => {
    it('asks for the people present to act on their own aims, and for off-screen plans', () => {
        const { system, prompt } = buildDirectorPrompt({ cast: [{ name: 'Remus', player: true }, { name: 'Graxx' }], overview: { gmStyle: 'Keep danger real.' } });
        expect(prompt).toContain('at least one of them takes the initiative');
        expect(prompt).toContain('what they are doing about it off-screen');
        expect(prompt).toContain('driven by what the other characters want');
        expect(system).toContain('How the user wants this story run - follow it: Keep danger real.');
    });
});

describe("the player character's own actions in the briefing", () => {
    const names = ['Remus Watt', 'Remus'];
    const briefing = [
        "As the relentless undead horde claws at the fortress's stone barrier below, Graxx fixes his piercing gaze on Remus Watt, his voice low and even as he speaks. Remus tightens his grip on his crossbow, but maintains a neutral expression, not wishing to antagonize Graxx further.",
        "As the heavy rain continues to lash against the fortress walls, Remus's thoughts drift uneasily to Graxx's imposing form. Varyn and Remus hold the gate. The fat Ravager watches Remus with unsettling interest.",
        'Next: Graxx names his price.',
    ].join('\n\n');
    it('are taken out; what others do to him stays', () => {
        const out = withoutPlayerActions(briefing, names);
        expect(out).toContain('Graxx fixes his piercing gaze on Remus Watt');
        expect(out).toContain('The fat Ravager watches Remus with unsettling interest.');
        expect(out).toContain('Next: Graxx names his price.');
        expect(out).not.toContain('tightens his grip');
        expect(out).not.toContain('thoughts drift');
        expect(out).not.toContain('hold the gate');
        expect(out.split('\n\n')).toHaveLength(3);
    });
    it('changes nothing without a player character', () => {
        expect(withoutPlayerActions(briefing, [])).toBe(briefing);
    });
    it('are ruled out in the prompt, whose example no longer has him act', () => {
        const { system, prompt } = buildDirectorPrompt({ cast: [{ name: 'Remus', player: true }] });
        expect(system).toContain('Remus is never the subject of your sentences');
        expect(prompt).not.toMatch(/SITUATION \| Remus/);
    });
});
