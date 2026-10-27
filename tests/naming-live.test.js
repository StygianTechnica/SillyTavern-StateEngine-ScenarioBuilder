import { plainWord, inventedName, swapInvented, applySwaps, poolLine, narratorPoolLine, prunePool, shortfall, normalizePool } from '../src/naming/live.js';
import { rollPool } from '../src/naming/engine.js';
import { CLICHE_NAMES } from '../src/naming/registry.js';
import { swapEventNames, buildEventPrompt } from '../src/events/generate.js';
import { swapMissionNames, buildMissionPrompt } from '../src/quests/missions.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';
import { buildGuidance } from '../src/guidance/build.js';

const POOL = { men: ['Vodri Skarheim', 'Orrin Maul'], women: ['Hessa Tarn', 'Ylva Brenna'], places: ['Skar Water', 'Hollin'] };
const pool = () => normalizePool(structuredClone(POOL));

describe('plain words and made-up ones', () => {
    it('reads English compounds as plain, and invented words as not', () => {
        for (const w of ['Ashfall', 'Stonewatch', 'Ironhold', 'Rook', 'Docks', 'Kingfisher']) expect(plainWord(w), w).toBe(true);
        for (const w of ['Skarnhold', 'Varyn', 'Elara', 'Zyrith', 'Kael']) expect(plainWord(w), w).toBe(false);
    });
});

describe('a name the model made up', () => {
    const opts = { allowedText: 'Brannoc waits by the gate. "Talk to Old Sefa," he says.', known: ['Vaskari Syndicate', 'Kael'] };

    it('is a person or place named with made-up words, titles kept apart', () => {
        expect(inventedName('Zyrith Morvane', 'character', opts)).toEqual({ title: '', words: ['Zyrith', 'Morvane'] });
        expect(inventedName('Captain Zyrith', 'character', opts)).toEqual({ title: 'Captain', words: ['Zyrith'] });
        expect(inventedName('Skarnhold', 'location', opts)).toEqual({ title: '', words: ['Skarnhold'] });
    });

    it('keeps descriptive names, plain-word places and anything the story has said', () => {
        expect(inventedName('The Eyepatched Man', 'character', opts)).toBeNull();
        expect(inventedName('Varyn Keep', 'location', opts)).toBeNull();
        expect(inventedName('The Rusty Anchor', 'location', opts)).toBeNull();
        expect(inventedName('Ashfall', 'location', opts)).toBeNull();
        expect(inventedName('Brannoc', 'character', opts)).toBeNull();
        expect(inventedName('Sefa Dunmore', 'character', opts)).toBeNull();
    });

    it('keeps names built from the world\'s own, groups taken for people, and other kinds', () => {
        expect(inventedName('Kaelen', 'character', opts)).toBeNull();
        expect(inventedName('Vaskaro', 'character', opts)).toBeNull();
        expect(inventedName('Morvane Syndicate', 'character', opts)).toBeNull();
        expect(inventedName('Zyrith', 'faction', opts)).toBeNull();
        expect(inventedName('Zyrith', 'lore', opts)).toBeNull();
    });

    it('swaps an overused name even when it reads as English', () => {
        expect(inventedName('Stormhold', 'location', opts)).not.toBeNull();
        expect(inventedName('Elara Voss', 'character', opts)).not.toBeNull();
    });
});

describe('the swap', () => {
    it('gives a woman a woman\'s name, a place a place\'s, and keeps the rest', () => {
        const created = [
            { kind: 'character', name: 'Zyrith Morvane', description: 'A smuggler queen who runs the docks; she trusts no one.' },
            { kind: 'location', name: 'Skarnhold', description: 'A ruined watchtower above the pass.' },
            { kind: 'character', name: 'The Eyepatched Man', description: 'a stranger', unnamed: true },
            { kind: 'faction', name: 'The Morvane Pact', description: 'smugglers' },
        ];
        const out = swapInvented(created, pool(), { allowedText: '', known: [] });
        expect(out.created.map((c) => c.name)).toEqual(['Hessa Tarn', 'Skar Water', 'The Eyepatched Man', 'The Morvane Pact']);
        expect(out.used).toEqual(['Hessa Tarn', 'Skar Water']);
        expect(out.pool.women).toEqual(['Ylva Brenna']);
        expect(out.created[0].swappedFrom).toBe('Zyrith Morvane');
    });

    it('counts a pool name the model took as used, and swaps nothing then', () => {
        const out = swapInvented([{ kind: 'character', name: 'Orrin Maul', description: 'a ferryman' }], pool());
        expect(out.swaps).toEqual([]);
        expect(out.used).toEqual(['Orrin Maul']);
        expect(out.pool.men).toEqual(['Vodri Skarheim']);
    });

    it('changes the briefing to match: the whole name, each part and its possessive', () => {
        const { swaps } = swapInvented([{ kind: 'character', name: 'Zyrith Morvane', description: 'he keeps the ledger' }], pool());
        const note = 'Zyrith Morvane steps out of the crowd. Zyrith\'s ledger is under his arm; Morvane has been waiting. Zyrithian silk hangs behind him.';
        expect(applySwaps(note, swaps)).toBe('Vodri Skarheim steps out of the crowd. Vodri\'s ledger is under his arm; Skarheim has been waiting. Zyrithian silk hangs behind him.');
    });

    it('calls someone with a patronymic or an epithet by the first word', () => {
        const p = { men: ['Imanini, son of Ashvattha'], women: ['Mahi the Tall'], places: [] };
        const a = swapInvented([{ kind: 'character', name: 'Zyrith Morvane', description: 'he pilots the shuttle' }], p);
        expect(applySwaps('Zyrith Morvane waves. Morvane grins.', a.swaps)).toBe('Imanini, son of Ashvattha waves. Imanini grins.');
        const b = swapInvented([{ kind: 'character', name: 'Ulvane', description: 'she keeps the bar' }], p);
        expect(applySwaps('Ulvane\'s bar is empty.', b.swaps)).toBe('Mahi the Tall\'s bar is empty.');
    });

    it('keeps the title in front of the new name', () => {
        const out = swapInvented([{ kind: 'character', name: 'Captain Zyrith', description: 'the harbour master, a man of few words' }], pool());
        expect(out.created[0].name).toBe('Captain Vodri Skarheim');
        expect(applySwaps('Captain Zyrith nods. "Zyrith," he says.', out.swaps)).toBe('Captain Vodri Skarheim nods. "Vodri," he says.');
    });

    it('names a place for what it is when it can be rolled, and by its whole name', () => {
        const rollPlace = (c) => (/nightclub/.test(c.description) ? 'The Kingfisher Club' : '');
        const out = swapInvented([{ kind: 'location', name: 'Zyrex', description: 'A nightclub under the overpass.' }], pool(), { rollPlace });
        expect(out.created[0].name).toBe('The Kingfisher Club');
        expect(out.used).toEqual([]);
        expect(applySwaps('They head to Zyrex. Zyrex\'s doors are open.', out.swaps)).toBe('They head to The Kingfisher Club. The Kingfisher Club\'s doors are open.');
    });

    it('leaves a name alone when the pool has run dry', () => {
        const out = swapInvented([{ kind: 'location', name: 'Skarnhold', description: '' }], { men: [], women: [], places: [] });
        expect(out.created[0].name).toBe('Skarnhold');
        expect(out.swaps).toEqual([]);
    });
});

describe('the pool', () => {
    const worlds = {
        cyberpunk: { worldType: 'science_fiction', tone: 'gritty, noir', premise: 'A cyberpunk megacity run by corporations.', tech: { level: 'tl9' } },
        'real world': { worldType: 'modern', premise: 'A murder mystery in modern Reykjavik, Iceland.' },
        fantasy: { worldType: 'fantasy', tone: 'heroic', premise: 'Kingdoms of men and elves at the edge of a long war.' },
        'sci-fi': { worldType: 'science_fiction', premise: 'A generation ship far from Earth, its crew born aboard.' },
    };
    for (const [genre, overview] of Object.entries(worlds)) {
        it(`rolls men, women and places for a ${genre} world, none of them clichés or repeats`, () => {
            const world = { naming: { seed: `live-${genre}` }, overview, names: ['Vodri Skarheim'] };
            const p = rollPool(world, { men: 2, women: 2, places: 2 });
            expect(p.men).toHaveLength(2);
            expect(p.women).toHaveLength(2);
            expect(p.places.length).toBeGreaterThanOrEqual(1);
            const all = [...p.men, ...p.women, ...p.places];
            expect(new Set(all).size).toBe(all.length);
            for (const n of all) expect(CLICHE_NAMES, n).not.toContain(n.split(' ')[0]);
            expect(all).not.toContain('Vodri Skarheim');
            expect(p.counter).toBeGreaterThan(0);
            // A swap draws from it and the text follows.
            const out = swapInvented([{ kind: 'character', name: 'Elara Voss', description: 'she runs the bar' }], p);
            expect(out.created[0].name).toBe(p.women[0]);
        });
    }

    it('tops up only what was used, and drops names the world has taken', () => {
        const { pool: left, gone } = prunePool(POOL, ['Hessa Tarn', 'Hollin', 'Somebody Else']);
        expect(gone).toEqual(['Hessa Tarn', 'Hollin']);
        expect(shortfall(left)).toEqual({ men: 0, women: 1, places: 1 });
    });

    it('reads as one line for a prompt, and one for the narrator', () => {
        expect(poolLine(POOL)).toMatch(/^Names for anyone or anywhere new that needs a name: people - Hessa Tarn, Vodri Skarheim, Ylva Brenna, Orrin Maul; places - Skar Water, Hollin\. Use these rather than making up a name/);
        expect(narratorPoolLine(POOL)).toMatch(/^\[If someone or somewhere new needs a name, use one of these: Hessa Tarn, Vodri Skarheim/);
        expect(poolLine({})).toBe('');
        expect(narratorPoolLine(null)).toBe('');
    });
});

describe('in the director, events, missions and the narrator', () => {
    it('the director is handed the pool only when it may add things', () => {
        const base = { cast: [{ name: 'Remus', player: true }], location: { path: ['Redhaven'] }, messages: [], namePoolLine: poolLine(POOL) };
        expect(buildDirectorPrompt({ ...base, allowCreate: true }).prompt).toContain('people - Hessa Tarn');
        expect(buildDirectorPrompt({ ...base, allowCreate: true, canonOnly: true }).prompt).not.toContain('Hessa Tarn');
        expect(buildDirectorPrompt({ ...base, allowCreate: false }).prompt).not.toContain('Hessa Tarn');
    });

    it('a tournament\'s invented entrants take pool names; listed ones stay', () => {
        const prompt = buildEventPrompt({ kind: 'tournament', candidates: [{ name: 'Brannoc', type: 'character' }], pool: POOL });
        expect(prompt.user).toContain('- Names for anyone or anywhere new');
        expect(buildEventPrompt({ kind: 'tournament', pool: POOL, canonOnly: true }).user).not.toContain('Hessa Tarn');
        const form = { kind: 'tournament', name: 'The Midsummer Lists', intro: 'Zyrith Morvane rides in first, then Brannoc.', close: 'The crowd roars.', prize: 'a purse', entrants: 'Zyrith Morvane | strong\nBrannoc | standard\nThe Masked Knight | deadly' };
        const out = swapEventNames(form, pool(), { allowedText: prompt.user, known: ['Brannoc'] });
        expect(out.form.entrants).toBe('Vodri Skarheim | strong\nBrannoc | standard\nThe Masked Knight | deadly');
        expect(out.form.intro).toBe('Vodri Skarheim rides in first, then Brannoc.');
        expect(out.used).toEqual(['Vodri Skarheim']);
        // A crawl's rooms are the model's to name.
        expect(swapEventNames({ kind: 'crawl', rooms: [] }, pool()).swaps).toEqual([]);
    });

    it('a job\'s invented client takes a pool name, and a target spoken of as a person', () => {
        expect(buildMissionPrompt({ giver: { name: 'Mags' }, pool: POOL }).user).toContain('- Names for anyone or anywhere new');
        const m = { name: 'Zyrith\'s Debt', client: 'Zyrith Morvane', target: 'Ulvane Drask', task: 'Find Ulvane Drask before she leaves the city and bring her to Zyrith.', reward: '200 crowns', objectives: ['Ask about Ulvane at the docks', 'Bring her in'], completion: 'Ulvane is handed over', abandon: 'Ulvane escapes' };
        const out = swapMissionNames(m, pool(), { allowedText: '', known: [] });
        expect(out.mission.client).toBe('Vodri Skarheim');
        expect(out.mission.target).toBe('Hessa Tarn');
        expect(out.mission.name).toBe('Vodri\'s Debt');
        expect(out.mission.task).toBe('Find Hessa Tarn before she leaves the city and bring her to Vodri.');
        expect(out.mission.objectives[0]).toBe('Ask about Hessa at the docks');
        // A place for a target is left alone.
        const place = swapMissionNames({ ...m, client: 'Brannoc', target: 'Skarnhold', task: 'Burn the granary at Skarnhold.' }, pool(), { allowedText: 'Brannoc' });
        expect(place.swaps).toEqual([]);
    });

    it('the narrator gets its line only when given one', () => {
        const names = narratorPoolLine(POOL);
        const withNames = buildGuidance({ names, budget: 4000 });
        expect(withNames.sections.some((s) => s.key === 'names' && s.text.includes('Hessa Tarn'))).toBe(true);
        expect(buildGuidance({ budget: 4000 }).sections.some((s) => s.key === 'names' && s.text)).toBe(false);
    });
});
