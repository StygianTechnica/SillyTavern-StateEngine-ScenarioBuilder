import { STOCKS, REAL_CULTURES, listsFor } from '../src/naming/stocks/index.js';
import { icelandicPatronym, russianPatronymic, feminineSurname, composePerson } from '../src/naming/conventions.js';
import { resolveCulture, defaultCultureId, PRESETS } from '../src/naming/cultures.js';
import { planName, namePool } from '../src/naming/engine.js';
import { nameKindFor, nameInBrief, tiesInBrief, genderFrom } from '../src/naming/classify.js';
import { buildIndex, acceptable, recordName, spreadScore, CLICHE_NAMES, OFFER_RETURNS_AFTER } from '../src/naming/registry.js';
import { tooClose, fold } from '../src/naming/text.js';
import { applyShifts, rollShifts } from '../src/naming/mutate.js';
import { makeRng } from '../src/naming/random.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';
import { normalizeSettingDoc } from '../src/store/schema.js';

// Rolls n names in a row the way the runner does: each one recorded, the
// counter carried on.
function rollMany(n, req, { seed = 'seed-a', overview = {}, names = [] } = {}) {
    const naming = { seed, counter: 0, registry: [] };
    const out = [];
    for (let i = 0; i < n; i++) {
        const plan = planName(req, { naming, overview, names });
        naming.counter = plan.counter;
        if (plan.mode !== 'rolled') continue;
        naming.registry = recordName(naming.registry, { name: plan.name, state: 'u', counter: plan.counter });
        out.push(plan);
    }
    return out;
}

describe('the stocks', () => {
    it('every stock has given names for both genders, and every real culture resolves', () => {
        for (const st of Object.values(STOCKS)) {
            for (const era of st.eraNames) {
                const l = listsFor(st, era);
                expect(l.m.length, `${st.id} ${era} m`).toBeGreaterThan(25);
                expect(l.f.length, `${st.id} ${era} f`).toBeGreaterThan(25);
            }
        }
        for (const r of REAL_CULTURES) expect(resolveCulture(r.id, { seed: 's' })?.real, r.id).toBe(true);
        for (const p of PRESETS) expect(resolveCulture(`preset:${p.id}`, { seed: 's' })?.real, p.id).toBe(false);
    });

    it('keeps multi-word names whole and particles on the names that take them', () => {
        expect(STOCKS.dutch.eras.modern.family).toContain('van der Meer');
        expect(STOCKS.dutch.eras.modern.family).toContain('Bakker');
        expect(STOCKS.french.eras.modern.family.some((n) => n.includes('Le '))).toBe(true);
    });
});

describe('naming conventions', () => {
    it('builds Icelandic patronymics from the genitive', () => {
        expect(icelandicPatronym('Jón', 'm')).toBe('Jónsson');
        expect(icelandicPatronym('Sigurður', 'f')).toBe('Sigurðardóttir');
        expect(icelandicPatronym('Helgi', 'm')).toBe('Helgason');
        expect(icelandicPatronym('Ólafur', 'm')).toBe('Ólafsson');
        expect(icelandicPatronym('Þorsteinn', 'm')).toBe('Þorsteinsson');
        expect(icelandicPatronym('Magnús', 'm')).toBe('Magnússon');
        expect(icelandicPatronym('Magnús', 'f')).toBe('Magnúsdóttir');
        expect(icelandicPatronym('Pétur', 'm')).toBe('Pétursson');
    });

    it('builds Russian and Ukrainian patronymics and feminine surnames', () => {
        expect(russianPatronymic('Pyotr', 'm')).toBe('Petrovich');
        expect(russianPatronymic('Sergey', 'f')).toBe('Sergeyevna');
        expect(russianPatronymic('Ilya', 'm')).toBe('Ilyich');
        expect(russianPatronymic('Petro', 'f', { m: ['ovych', 'yovych'], f: ['ivna', 'yivna'] })).toBe('Petrivna');
        expect(feminineSurname('Ivanov', 'russian')).toBe('Ivanova');
        expect(feminineSurname('Dostoevsky', 'russian')).toBe('Dostoevskaya');
        expect(feminineSurname('Kowalski', 'slavic')).toBe('Kowalska');
        expect(feminineSurname('Komnenos', 'byzantine')).toBe('Komnene');
        expect(feminineSurname('Doukas', 'byzantine')).toBe('Doukaina');
        expect(feminineSurname('Palaiologos', 'byzantine')).toBe('Palaiologina');
    });

    it('orders the parts the way each tradition does', () => {
        expect(composePerson('family_first', 'm', { given: 'Hiroshi', family: 'Tanaka' }).name).toBe('Tanaka Hiroshi');
        expect(composePerson('spanish', 'f', { given: 'Lucía', family: 'García', family2: 'Morales' }).name).toBe('Lucía García Morales');
        expect(composePerson('patronym', 'm', { given: 'Owain', father: 'Gruffudd' }, { patronym: { m: '{given} ap {father}', f: '{given} ferch {father}' } }).name).toBe('Owain ap Gruffudd');
        expect(composePerson('patronym', 'm', { given: 'Harald', father: 'Sigurd' }, { patronym: { m: '{father}sson', f: '{father}sdottir' } }).name).toBe('Harald Sigurdsson');
        expect(composePerson('roman', 'f', { family: 'Caecilius', byname: 'Metellus' }).name).toBe('Caecilia Metella');
        expect(composePerson('arabic', 'm', { given: 'Yusuf', father: 'Harun', byname: 'al-Basri' }).name).toBe('Yusuf ibn Harun al-Basri');
    });
});

describe('the generator', () => {
    it('is the same for the same world and different for another', () => {
        const req = { typeId: 'character', brief: 'a man', cultureId: 'preset:dwarves' };
        const a = planName(req, { naming: { seed: 'one', counter: 3 }, names: [] });
        const b = planName(req, { naming: { seed: 'one', counter: 3 }, names: [] });
        const others = ['two', 'three', 'four'].map((seed) => planName(req, { naming: { seed, counter: 3 }, names: [] }).name);
        expect(a.name).toBe(b.name);
        expect(others.some((n) => n !== a.name)).toBe(true);
        expect(a.counter).toBe(4);
    });

    it('never hands out the same name twice, nor ones too close to tell apart', () => {
        for (const cultureId of ['preset:elves', 'preset:desert', 'preset:orcs', 'auto:blend']) {
            const rolled = rollMany(120, { typeId: 'character', brief: '', cultureId });
            const names = rolled.map((r) => r.name);
            expect(new Set(names.map(fold)).size, cultureId).toBe(names.length);
            for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) expect(tooClose(names[i], names[j]), `${names[i]} / ${names[j]}`).toBe(false);
        }
    });

    it('never makes the overused fantasy names', () => {
        const banned = new Set(CLICHE_NAMES.map(fold));
        const rolled = rollMany(150, { typeId: 'character', brief: '', cultureId: 'preset:fey' });
        for (const r of rolled) for (const word of r.name.split(/\s+/)) expect(banned.has(fold(word)), r.name).toBe(false);
    });

    it('gives real cultures real names from the stock', () => {
        const rolled = rollMany(40, { typeId: 'character', brief: 'a woman', cultureId: 'real:icelandic:modern' });
        const given = new Set(STOCKS.icelandic.eras.modern.f);
        for (const r of rolled) {
            const [first, last] = r.name.split(' ');
            expect(given.has(first), r.name).toBe(true);
            expect(last.endsWith('dóttir'), r.name).toBe(true);
        }
    });

    it('stays clear of names the setting already has', () => {
        const first = planName({ typeId: 'location', brief: 'a town', cultureId: 'preset:empire' }, { naming: { seed: 'x', counter: 0 }, names: [] });
        const again = planName({ typeId: 'location', brief: 'a town', cultureId: 'preset:empire' }, { naming: { seed: 'x', counter: 0 }, names: [first.name] });
        expect(again.name).not.toBe(first.name);
    });

    it('names descriptively from kits for the kinds that have a tradition', () => {
        const inn = planName({ typeId: 'location', brief: 'a tavern by the docks' }, { naming: { seed: 'k', counter: 0 }, overview: { worldType: 'fantasy' }, names: [] });
        expect(inn.mode).toBe('rolled');
        expect(inn.name.startsWith('The ') || inn.name.includes("'s")).toBe(true);
        const ship = planName({ typeId: 'item', brief: 'a pirate ship' }, { naming: { seed: 'k', counter: 0 }, names: [] });
        expect(ship.mode).toBe('rolled');
    });

    it('rolls nothing for what is named in plain words, and keeps a name the brief gives', () => {
        expect(planName({ typeId: 'location', brief: 'the cellar', hasParent: true }, { naming: { seed: 'k' }, names: [] }).mode).toBe('none');
        expect(planName({ typeId: 'item', brief: 'a cursed sword' }, { naming: { seed: 'k' }, names: [] }).mode).toBe('none');
        const given = planName({ typeId: 'location', brief: 'a tavern called "The Gilded Lily"' }, { naming: { seed: 'k' }, names: [] });
        expect(given).toMatchObject({ mode: 'given', name: 'The Gilded Lily' });
    });

    it('builds the name of something tied to an existing entry from that entry', () => {
        const world = { naming: { seed: 'g' }, names: ['Morvath'], entries: [{ name: 'Morvath', aliases: [], type: 'character' }, { name: 'Brassport', aliases: [], type: 'location' }] };
        const cult = planName({ typeId: 'faction', brief: 'the followers of Morvath' }, world);
        expect(cult.mode).toBe('derived');
        expect(cult.tie).toBe('Morvath');
        expect(cult.candidates.every((c) => c.includes('Morvath'))).toBe(true);
        const temple = planName({ typeId: 'location', brief: 'a temple to Morvath' }, world);
        expect(temple.candidates[0]).toBe('Temple of Morvath');
        expect(planName({ typeId: 'location', brief: 'a tavern in Brassport' }, world).candidates).toContain('The Brassport Arms');
    });

    it('rolls a small pool for other people and places a text mentions', () => {
        const pool = namePool({ naming: { seed: 'p', counter: 0 }, names: [] }, { cultureId: 'preset:northern' });
        expect(pool.people).toHaveLength(3);
        expect(pool.places).toHaveLength(2);
        expect(new Set([...pool.people, ...pool.places]).size).toBe(5);
    });
});

describe('what kind of name is needed', () => {
    it('reads the kind from the brief', () => {
        expect(nameKindFor('location', 'a tavern by the river')).toMatchObject({ kind: 'building', subtype: 'inn' });
        expect(nameKindFor('location', 'a forest near the town')).toMatchObject({ kind: 'feature', feature: 'forest' });
        expect(nameKindFor('location', 'a town in the forest')).toMatchObject({ kind: 'settlement' });
        expect(nameKindFor('faction', 'a noble house')).toMatchObject({ kind: 'house' });
        expect(nameKindFor('faction', 'a band of sellswords')).toMatchObject({ kind: 'faction', subtype: 'company' });
        expect(nameKindFor('item', 'a naval frigate')).toMatchObject({ kind: 'ship', subtype: 'naval' });
        expect(nameKindFor('quest', 'find the ledger')).toBeNull();
    });

    it('reads a gender, a given name and ties', () => {
        expect(genderFrom('the old priestess of the temple')).toBe('f');
        expect(genderFrom('a blacksmith and his apprentice')).toBe('m');
        expect(genderFrom('a blacksmith')).toBe('');
        expect(nameInBrief('an inn named The Salted Eel near the docks')).toBe('The Salted Eel');
        expect(tiesInBrief('priests of Morvath', [{ name: 'Morvath' }, { name: 'Moravia' }]).map((t) => t.name)).toEqual(['Morvath']);
    });
});

describe('the world default', () => {
    it('picks a real culture for a real-world premise, an invented one otherwise', () => {
        expect(defaultCultureId({ worldType: 'modern', premise: 'A detective in Reykjavik' })).toBe('real:icelandic:modern');
        expect(defaultCultureId({ worldType: 'historical', era: 'victorian' })).toBe('real:english:victorian');
        expect(defaultCultureId({ worldType: 'cosmic_horror', era: '1920s' })).toBe('real:american:1920s');
        expect(defaultCultureId({ worldType: 'fantasy', premise: 'Desert city-states ruled by sultans' })).toBe('preset:desert');
        expect(defaultCultureId({ worldType: 'science_fiction' })).toBe('auto:blend');
        expect(defaultCultureId({}, { defaultCulture: 'preset:elves' })).toBe('preset:elves');
        expect(defaultCultureId({ worldType: 'fantasy' }, { seed: 'a' })).toMatch(/^preset:/);
    });
});

describe('the registry', () => {
    it('lets an offered name come back after a while, a turned-down one never', () => {
        let reg = recordName([], { name: 'Vodri', state: 'o', counter: 1 });
        reg = recordName(reg, { name: 'Hessa', state: 'd', counter: 1 });
        expect(acceptable('Vodri', buildIndex({ registry: reg, counter: 5 }))).toBe(false);
        expect(acceptable('Vodri', buildIndex({ registry: reg, counter: 1 + OFFER_RETURNS_AFTER }))).toBe(true);
        expect(acceptable('Hessa', buildIndex({ registry: reg, counter: 1 + OFFER_RETURNS_AFTER }))).toBe(false);
        // A used name stays used when it is offered again.
        reg = recordName(reg, { name: 'Orrin', state: 'u', counter: 2 });
        reg = recordName(reg, { name: 'Orrin', state: 'o', counter: 3 });
        expect(reg.find((r) => r.n === 'Orrin').s).toBe('u');
    });

    it('scores names whose pieces are already common higher', () => {
        const index = buildIndex({ names: ['Vodmund', 'Vodric', 'Skarvod Tarn'] });
        expect(spreadScore('Vodmar', index)).toBeGreaterThan(spreadScore('Hessa', index));
    });

    it('lets a real town have two of a common name, not an invented one', () => {
        expect(acceptable('Jónas', buildIndex({ names: ['Jón'], real: true }))).toBe(true);
        expect(acceptable('Kaelen', buildIndex({ names: ['Kaelis'] }))).toBe(false);
    });

    it('is kept in the setting document', () => {
        const doc = normalizeSettingDoc({ naming: { seed: 's1', counter: 4, registry: [{ n: 'Vodri', s: 'u', i: 2 }, { s: 'o' }], cultures: { vaskari: { name: 'Vaskari', seeds: [] } } } });
        expect(doc.naming).toMatchObject({ seed: 's1', counter: 4, cliches: true, defaultCulture: '' });
        expect(doc.naming.registry).toEqual([{ n: 'Vodri', k: '', c: '', s: 'u', i: 2 }]);
        expect(doc.naming.cultures.vaskari.id).toBe('vaskari');
        expect(normalizeSettingDoc({}).naming.registry).toEqual([]);
    });
});

describe('mutation', () => {
    it('rolls shifts that do not undo each other, and applies them the same way every time', () => {
        const shifts = rollShifts(makeRng('m'), 3);
        expect(shifts.length).toBeGreaterThanOrEqual(5);
        expect(shifts.includes('v-w') && shifts.includes('w-v')).toBe(false);
        expect(applyShifts('thorvald', ['th-d', 'v-w'])).toBe('dorwald');
    });
});

describe('the generation prompt and names', () => {
    const type = { id: 'character', label: 'Character', noun: 'character' };
    const fields = [{ name: 'role', label: 'Role', kind: 'text' }];

    it('tells the model a decided name instead of asking for one', () => {
        const { user, keys } = buildGenerationPrompt({ task: 'create', type, fields, fixedName: 'Vodri Skarheim', nameMeaning: 'iron hill' });
        expect(keys).not.toContain('name');
        expect(user).toContain('Its name is "Vodri Skarheim"');
        expect(user).toContain('iron hill');
        expect(user).not.toContain('"name":');
    });

    it('asks for a name built from what it is tied to', () => {
        const { user, keys } = buildGenerationPrompt({ task: 'create', type: { id: 'faction', label: 'Faction', noun: 'faction' }, fields, nameFrom: { tie: 'Morvath', candidates: ['Children of Morvath', "Morvath's Hand"] } });
        expect(keys).toContain('name');
        expect(user).toContain('Name it from Morvath');
        expect(user).toContain('"Children of Morvath"');
    });

    it('gives the model names for anyone else the text mentions, and the names to avoid', () => {
        const { user } = buildGenerationPrompt({ task: 'fill', type, fields, entry: { name: 'Hessa', values: {} }, namePool: { people: ['Orrin Maul'], places: ['Skar Water'] }, avoidNames: ['Elara'] });
        expect(user).toContain('people - Orrin Maul');
        expect(user).toContain('places - Skar Water');
        expect(user).toContain('Never use these overused names: Elara');
    });
});
