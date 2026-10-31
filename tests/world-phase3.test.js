import { describe, it, expect } from 'vitest';
import { emptyWorld, applyWorld, normalizeWorld, publicLines, LEVEL_LIMITS } from '../src/world/model.js';
import {
    applySituations, applyChanges, answerPending, settleChanges, undoChange, canonizePlace, uncanonize, applyConditions,
    noteContact, visitOf, worldHereSection, lastingLines, endSituation, openSituations,
} from '../src/world/situations.js';
import { worldPart, readWorld } from '../src/world/prompts.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';
import { whoCouldTurnUp } from '../src/director/whereabouts.js';

let n = 0;
const newId = (p) => `${p}_${(++n).toString(36)}`;

const ids = { 'ines moriarty': 'ines', enrique: 'enrique', 'aldous moriarty': 'aldous', 'medina syndicate': 'medina', 'the tidecourt': 'tide', 'player': 'pc' };
const names = { ines: 'Ines Moriarty', enrique: 'Enrique', aldous: 'Aldous Moriarty', medina: 'Medina Syndicate', tide: 'The Tidecourt', swan: 'The Gilded Swan', docks: 'The Docks', hall: 'Syndicate Hall', pc: 'Remus' };
const places = { 'the gilded swan': 'swan', 'the docks': 'docks', 'syndicate hall': 'hall' };
const resolve = (name) => ids[String(name).toLowerCase()] ?? null;
const placeOf = (name) => places[String(name).toLowerCase()] ?? '';
const nameOf = (id) => names[id] ?? '';
const factions = new Set(['medina', 'tide']);
const ctx = (over = {}) => ({
    day: 10, resolve, placeOf, nameOf, newId, present: [], placeIds: [], playerId: 'pc',
    isPerson: (id) => !factions.has(id), isFaction: (id) => factions.has(id), mayKill: (id) => id !== 'aldous', places: 'on', deaths: 'ask', ...over,
});

describe('the world meanwhile, phase 3 - situations', () => {
    it('begins a situation only where the level has room, and moves its stage only forward', () => {
        const w = emptyWorld();
        const feud = { kind: 'schism', name: 'The Syndicate divided', sides: [{ name: 'Moriartys', who: ['Ines Moriarty', 'Aldous Moriarty'], wants: 'Enrique to answer' }, { name: 'Enrique\'s men', who: ['Enrique'] }], stage: 'brewing', where: ['Syndicate Hall'], headline: 'The leaders no longer sit at one table', truth: 'Enrique tried to kill Cyril' };
        expect(applySituations(w, [feud], { day: 5, resolve, placeOf, max: 0, newId }).started).toBe(0);
        const out = applySituations(w, [feud], { day: 5, resolve, placeOf, max: 1, newId });
        expect(out.started).toBe(1);
        const s = openSituations(w)[0];
        expect(s).toMatchObject({ kind: 'schism', stage: 'brewing', where: ['hall'], startedDay: 5 });
        expect(s.ties).toEqual(expect.arrayContaining(['ines', 'aldous', 'enrique']));
        // A second one waits for room.
        expect(applySituations(w, [{ kind: 'crisis', name: 'Plague', sides: [] }], { day: 5, resolve, placeOf, max: 1, newId }).started).toBe(0);
        applySituations(w, [{ id: s.id, stage: 'open' }], { day: 6, resolve, placeOf, max: 1 });
        expect(s.stage).toBe('open');
        applySituations(w, [{ id: s.id, stage: 'brewing' }], { day: 7, resolve, placeOf, max: 1 });
        expect(s.stage).toBe('open');
    });

    it('lets no trouble begin or open while the story is calm', () => {
        const w = emptyWorld();
        expect(applySituations(w, [{ kind: 'conflict', name: 'Dock war', sides: [{ name: 'A', who: ['Enrique'] }] }], { day: 1, resolve, placeOf, max: 2, calm: true, newId }).started).toBe(0);
        expect(applySituations(w, [{ kind: 'accord', name: 'Peace talks', sides: [{ name: 'A', who: ['Enrique'] }] }], { day: 1, resolve, placeOf, max: 2, calm: true, newId }).started).toBe(1);
        applySituations(w, [{ kind: 'conflict', name: 'Dock war', sides: [{ name: 'A', who: ['Enrique'] }] }], { day: 1, resolve, placeOf, max: 2, newId });
        const war = w.situations.find((x) => x.name === 'Dock war');
        applySituations(w, [{ id: war.id, stage: 'open' }], { day: 2, resolve, placeOf, max: 2, calm: true });
        expect(war.stage).toBe('brewing');
    });

    it('ends with its stances, and the user can end one', () => {
        const w = emptyWorld();
        applySituations(w, [{ kind: 'conflict', name: 'Tide war', sides: [{ name: 'Syndicate', who: ['Medina Syndicate'] }] }], { day: 1, resolve, placeOf, max: 1, newId });
        const s = w.situations[0];
        applyChanges(w, [{ kind: 'stance', target: 'Medina Syndicate', with: 'The Tidecourt', stance: 'at war' }], ctx({ situationId: s.id }));
        expect(w.overlays.stances).toHaveLength(1);
        applySituations(w, [{ id: s.id, stage: 'over' }], { day: 9, resolve, placeOf, max: 1 });
        expect(s.endedDay).toBe(9);
        expect(w.overlays.stances).toHaveLength(0);
        expect(endSituation(w, s.id)).toBe(false);
    });
});

describe('the world meanwhile, phase 3 - changes', () => {
    it('changes a place, never the one the scene is in, and lets a fading one go', () => {
        const w = emptyWorld();
        const out = applyChanges(w, [{ kind: 'place', target: 'The Gilded Swan', text: 'Burned - blackened timbers, watchmen posted', days: 5 }, { kind: 'place', target: 'The Docks', text: 'Shuttered' }], ctx({ placeIds: ['docks'] }));
        expect(out.applied).toHaveLength(1);
        expect(w.overlays.places.swan).toMatchObject({ since: 10, until: 15 });
        expect(w.overlays.places.docks).toBeUndefined();
        settleChanges(w, 15);
        expect(w.overlays.places.swan).toBeUndefined();
    });

    it('asks first when the user said so, and applies what they allow', () => {
        const w = emptyWorld();
        applyChanges(w, [{ kind: 'place', target: 'The Gilded Swan', text: 'Robbed', days: 3 }], ctx({ places: 'ask' }));
        expect(w.overlays.places.swan).toBeUndefined();
        expect(w.pending).toHaveLength(1);
        const p = answerPending(w, w.pending[0].id, true);
        expect(p.kind).toBe('place');
        expect(w.overlays.places.swan).toMatchObject({ text: 'Robbed', until: 13 });
        applyChanges(w, [{ kind: 'place', target: 'The Docks', text: 'Under guard' }], ctx({ places: 'off' }));
        expect(w.pending).toHaveLength(0);
    });

    it('moves people off scene and says how they are - never someone here or the player character', () => {
        const w = emptyWorld();
        const out = applyChanges(w, [
            { kind: 'whereabouts', target: 'Ines Moriarty', where: 'The Docks' },
            { kind: 'state', target: 'Enrique', text: 'in hiding' },
            { kind: 'state', target: 'Aldous Moriarty', text: 'wounded' },
            { kind: 'state', target: 'Player', text: 'framed' },
            { kind: 'state', target: 'Medina Syndicate', text: 'nervous' },
        ], ctx({ present: ['aldous'] }));
        expect(out.applied).toHaveLength(2);
        expect(w.overlays.people.ines).toMatchObject({ locationId: 'docks', where: 'The Docks' });
        expect(w.overlays.people.enrique.state).toBe('in hiding');
        expect(w.overlays.people.aldous).toBeUndefined();
        expect(w.overlays.people.pc).toBeUndefined();
    });

    it('lets a death off scene happen only as the rules allow', () => {
        const ask = emptyWorld();
        applyChanges(ask, [{ kind: 'death', target: 'Enrique', text: 'found in the harbour' }], ctx());
        expect(ask.pending[0]).toMatchObject({ kind: 'death', targetId: 'enrique' });
        const allow = emptyWorld();
        const out = applyChanges(allow, [{ kind: 'death', target: 'Enrique', text: 'found in the harbour' }, { kind: 'death', target: 'Aldous Moriarty' }, { kind: 'death', target: 'Player' }], ctx({ deaths: 'allow' }));
        expect(out.extras).toEqual([{ way: 'death', id: 'enrique', name: 'Enrique', how: 'found in the harbour' }]);
        const never = emptyWorld();
        expect(applyChanges(never, [{ kind: 'death', target: 'Enrique' }], ctx({ deaths: 'never' })).extras).toHaveLength(0);
        expect(never.pending).toHaveLength(0);
    });

    it('splits a faction - a proposal for the breakaway, none in a canon-only setting', () => {
        const w = emptyWorld();
        const out = applyChanges(w, [{ kind: 'split', target: 'Medina Syndicate', name: 'The Moriarty Compact', text: 'The Moriartys walked out' }], ctx());
        expect(w.conditions.medina.standing).toBe('split');
        expect(out.extras[0]).toMatchObject({ way: 'split', name: 'The Moriarty Compact' });
        expect(applyChanges(emptyWorld(), [{ kind: 'split', target: 'Medina Syndicate', name: 'X' }], ctx({ canonOnly: true })).extras).toHaveLength(0);
    });

    it('makes a change part of the setting, and undoes it', () => {
        const w = emptyWorld();
        applyChanges(w, [{ kind: 'place', target: 'The Gilded Swan', text: 'A burned-out shell' }], ctx());
        const made = canonizePlace(w, 'swan', 'A busy tavern by the river.', { newId });
        expect(made.description).toBe('A busy tavern by the river.\n\nA burned-out shell.');
        expect(w.overlays.places.swan).toBeUndefined();
        const r = uncanonize(w, made.record.id, 12);
        expect(r.before).toBe('A busy tavern by the river.');
        expect(w.overlays.places.swan.text).toBe('A burned-out shell');
        expect(undoChange(w, 'place', 'swan')).toBe(true);
        expect(w.overlays.places.swan).toBeUndefined();
    });
});

describe('the world meanwhile, phase 3 - checking in', () => {
    it('keeps a faction condition, moving its date only on a real change', () => {
        const w = emptyWorld();
        const log = applyConditions(w, [{ name: 'Medina Syndicate', standing: 'divided', leadership: 'Enrique holds the council', mood: 'tense' }], { day: 4, resolve, nameOf, isFaction: (id) => factions.has(id) });
        expect(log).toHaveLength(1);
        applyConditions(w, [{ name: 'Medina Syndicate', standing: 'divided', leadership: 'Enrique holds the council', mood: 'tense' }], { day: 8, resolve, nameOf });
        expect(w.conditions.medina.since).toBe(4);
        expect(applyConditions(w, [{ name: 'Enrique', standing: 'broken' }], { day: 8, resolve, nameOf, isFaction: (id) => factions.has(id) })).toHaveLength(0);
    });

    it('tells a new visit from a long one', () => {
        const w = emptyWorld();
        noteContact(w, ['medina'], { day: 2, turn: 3 });
        noteContact(w, ['medina'], { day: 2, turn: 4 });
        expect(visitOf(w, 'medina', 5)).toEqual({ prevDay: null, fresh: true });
        // Forty days and many replies later, back again.
        expect(visitOf(w, 'medina', 60)).toEqual({ prevDay: 2, fresh: true });
        noteContact(w, ['medina'], { day: 42, turn: 60 });
        expect(visitOf(w, 'medina', 61)).toEqual({ prevDay: 2, fresh: true });
        expect(visitOf(w, 'medina', 70)).toEqual({ prevDay: 42, fresh: true });
        noteContact(w, ['medina'], { day: 42, turn: 61 });
        noteContact(w, ['medina'], { day: 42, turn: 63 });
        noteContact(w, ['medina'], { day: 42, turn: 64 });
        expect(visitOf(w, 'medina', 65).fresh).toBe(false);
    });

    it('shows the place, the situation and what has become of a faction since the last visit', () => {
        const w = emptyWorld();
        noteContact(w, ['medina', 'hall'], { day: 2, turn: 3 });
        applyChanges(w, [{ kind: 'place', target: 'Syndicate Hall', text: 'Half the chairs empty; Moriarty men keep to one end' }], ctx({ day: 30 }));
        applySituations(w, [{ kind: 'schism', name: 'The Syndicate divided', sides: [{ name: 'Moriartys', who: ['Ines Moriarty'] }], where: ['Syndicate Hall'], headline: 'The leaders no longer sit at one table', effects: ['both sides\' men on the corners'] }], { day: 30, resolve, placeOf, max: 1, newId });
        applyConditions(w, [{ name: 'Medina Syndicate', standing: 'divided', mood: 'every stranger a spy' }], { day: 31, resolve, nameOf, isFaction: (id) => factions.has(id) });
        w.log.push({ day: 35, text: 'The warehouse on Salt Street burned.', schemeId: '', situationId: '', ties: ['medina'], veiled: true });
        const text = worldHereSection(w, { day: 42, turn: 50, placeIds: ['hall'], present: ['pc'], touched: [{ id: 'medina', name: 'the Medina Syndicate' }], nameOf });
        expect(text).toMatch(/^THE WORLD HERE NOW/);
        expect(text).toMatch(/Syndicate Hall has changed \(12 days ago\): Half the chairs empty/);
        expect(text).toMatch(/In the air: The Syndicate divided, brewing - what people say: "The leaders no longer sit at one table"/);
        expect(text).toMatch(/last with the Medina Syndicate \(40 days ago\): now divided; mood: every stranger a spy\. since then: The warehouse on Salt Street burned/);
        // Nothing changed since: nothing told.
        const quiet = emptyWorld();
        noteContact(quiet, ['tide'], { day: 2, turn: 3 });
        expect(worldHereSection(quiet, { day: 42, turn: 50, touched: [{ id: 'tide', name: 'the Tidecourt' }] })).toBe('');
    });

    it('lists what lasts for the passes, and headlines for /sb-world', () => {
        const w = emptyWorld();
        applySituations(w, [{ kind: 'accord', name: 'Halvren talks', sides: [{ name: 'Syndicate', who: ['Medina Syndicate'] }], headline: 'Peace talks open in Halvren' }], { day: 1, resolve, placeOf, max: 1, newId });
        expect(lastingLines(w)[0]).toMatch(/Halvren talks \(accord, brewing\)/);
        expect(publicLines(w, 1).some((t) => /Peace talks/.test(t))).toBe(false);
        applySituations(w, [{ id: w.situations[0].id, stage: 'open' }], { day: 2, resolve, placeOf, max: 1 });
        expect(publicLines(w, 2)).toContain('In the news: Halvren talks: Peace talks open in Halvren.');
    });
});

describe('the world meanwhile, phase 3 - the pass', () => {
    it('asks for changes, situations and conditions, and reads them back', () => {
        const part = worldPart({ ripples: [{ id: 'r1', text: 'Cyril seen' }], stakeholders: [], schemes: [], day: 3, limits: { ...LEVEL_LIMITS.lively, press: '' }, userName: 'Remus', ownPass: true, lasting: ['- Medina Syndicate: strained.'], situationsOpen: 0, changes: { places: 'off', deaths: 'never' } });
        expect(part.text).toMatch(/How the world stands/);
        expect(part.text).toMatch(/a situation may begin \(at most one\)/);
        expect(part.text).not.toMatch(/a death off scene/);
        expect(part.shape).toMatch(/"kind":"whereabouts\|state\|stance\|split"/);
        expect(part.shape).toMatch(/"situations":\[/);
        const quiet = worldPart({ ripples: [{ id: 'r1', text: 'x' }], day: 3, limits: LEVEL_LIMITS.quiet });
        expect(quiet.shape).not.toMatch(/"situations"/);
        expect(quiet.shape).toMatch(/"factions"/);
        const read = readWorld({ schemes: [{ id: 's_1', changes: [{ kind: 'place', target: 'The Gilded Swan', text: 'burned', days: '4' }, { kind: 'nonsense', target: 'x' }] }], situations: [{ kind: 'Schism', name: 'Divided', stage: 'Open', sides: [{ name: 'A', who: ['Ines Moriarty'] }] }], factions: [{ name: 'Medina Syndicate', standing: 'Divided' }] });
        expect(read.schemes[0].changes).toEqual([{ kind: 'place', target: 'The Gilded Swan', text: 'burned', where: '', with: '', stance: '', name: '', days: 4 }]);
        expect(read.situations[0]).toMatchObject({ kind: 'schism', stage: 'open' });
        expect(read.factions[0].standing).toBe('divided');
        expect(readWorld({ situations: [{ id: 'sit_1', stage: 'over' }] })).toMatchObject({ schemes: [] });
    });

    it('applies a whole answer: a scheme\'s changes logged with its people, a situation, a condition', () => {
        const w = emptyWorld();
        w.schemes.push({ id: 's_a', who: ['enrique'], names: ['Enrique'], aim: 'keep him dead', motive: '', from: '', steps: ['a', 'b', 'c'], done: 0, nextDay: 10, aboutPlayer: 'none', visibility: 'hidden', status: 'under way', startedDay: 1, held: false, heard: false, at: '' });
        const answer = {
            schemes: [{ id: 's_a', who: [], aim: '', steps: [], done: 1, inDays: 2, status: '', log: 'Enrique\'s men torched the Swan.', surface: null, changes: [{ kind: 'place', target: 'The Gilded Swan', text: 'burned' }] }],
            situations: [{ kind: 'conflict', name: 'Dock war', sides: [{ name: 'Enrique', who: ['Enrique'] }] }],
            factions: [{ name: 'Medina Syndicate', standing: 'at war' }],
        };
        const out = applyWorld(w, answer, { day: 10, resolve, nameOf, placeOf, limits: LEVEL_LIMITS.lively, ids: ['enrique'], newId, changes: ctx() });
        expect(out).toMatchObject({ moved: 1, changed: 1, situations: 1 });
        expect(w.overlays.places.swan.text).toBe('burned');
        expect(w.log.find((l) => /Swan: burned/.test(l.text))).toMatchObject({ ties: ['enrique'], veiled: true });
        expect(w.conditions.medina.standing).toBe('at war');
        // Survives the trip through settings.json.
        expect(normalizeWorld(JSON.parse(JSON.stringify(w)))).toEqual(w);
    });
});

describe('the director and the world, phase 3', () => {
    it('puts someone the world moved where they went, with how they are now', () => {
        const characters = [{ id: 'ines', name: 'Ines Moriarty' }, { id: 'enrique', name: 'Enrique' }];
        const parents = { docks: 'city', hall: 'city', city: 'world', far: 'world' };
        const out = whoCouldTurnUp({ characters, castIds: ['pc'], locationId: 'docks', parents, inPlay: ['ines', 'enrique'], moved: { ines: { locationId: 'hall', state: '' }, enrique: { locationId: 'far', state: 'in hiding' } } });
        expect(out.near.map((c) => c.id)).toEqual(['ines']);
        expect(out.elsewhere[0]).toMatchObject({ id: 'enrique', lastAt: 'far' });
        expect(out.elsewhere[0].why).toMatch(/now in hiding/);
    });

    it('reads THE WORLD HERE NOW in the plan', () => {
        const { prompt } = buildDirectorPrompt({ cast: [{ id: 'pc', name: 'Remus', player: true }], gmPlan: 'THE WORLD HERE NOW (private - ...)\n- The Gilded Swan has changed (today): burned.' });
        expect(prompt).toMatch(/THE WORLD HERE NOW/);
    });
});
