import { describe, it, expect } from 'vitest';
import {
    HUMANS, normalizeBloodline, normalizeLineage, normalizeMix, normalizePopulation, normalizePlacePopulation,
    singularOf, wordsOf, choicesOf, humansOf, mixAt, mixFor, rollBloodline, mixText, isPlainMix,
    whoIsAboutLine, onlyRule, guessLineage, lineageOf, lineageLabel, bloodlineBrief, visualFor,
} from '../src/library/bloodlines.js';
import { BLOODLINE_PRESETS, fromPreset, presetGroups } from '../src/library/bloodline-presets.js';
import { normalizeSettingDoc, normalizeEntryMeta } from '../src/store/schema.js';
import { buildGuidance, buildCast } from '../src/guidance/build.js';
import { buildImagePrompt } from '../src/images/prompt.js';

const line = (id, name, bloodline) => ({ id, type: 'lore', name, meta: { bloodline: { on: true, ...bloodline } } });
const elves = line('elf1', 'Elves', { kind: 'ancestry', look: 'tall, pointed ears', here: 'old money in the arcologies', canMix: true, visual: { known: 'well', features: 'pointed ears, luminous eyes', dress: 'tailored suits', tags: 'elf, pointed ears' } });
const vaskari = line('vas1', 'The Vaskari', { kind: 'species', singular: 'Vaskari', plural: 'Vaskari', adjective: 'Vaskari', visual: { known: 'not', body: 'four-armed', skin: 'slate-grey scales', features: 'three amber eyes in a row', negative: 'human face' } });
const androids = line('and1', 'Androids', { kind: 'made' });
const all = [elves, vaskari, androids];
const byId = Object.fromEntries(choicesOf(all).map((b) => [b.id, b]));

describe('bloodline words', () => {
    it('makes a singular from a plural', () => {
        expect(singularOf('Elves')).toBe('elf');
        expect(singularOf('Dwarves')).toBe('dwarf');
        expect(singularOf('Wood Elves')).toBe('wood elf');
        expect(singularOf('Greys')).toBe('grey');
        expect(singularOf('Androids')).toBe('android');
        expect(singularOf('Merfolk')).toBe('merfolk');
    });
    it('reads an entry\'s words, its own first', () => {
        expect(wordsOf(elves)).toEqual({ name: 'Elves', singular: 'elf', plural: 'elves', adjective: 'elven' });
        expect(wordsOf(line('g', 'Greys', { plural: 'Greys', singular: 'Grey' })).plural).toBe('Greys');
        expect(wordsOf(line('v', 'The Vaskari', {}))).toMatchObject({ singular: 'Vaskari', plural: 'Vaskari' });
        expect(wordsOf(vaskari).singular).toBe('Vaskari');
        expect(wordsOf({ id: HUMANS }).plural).toBe('humans');
    });
    it('adds the implicit humans unless the world has its own', () => {
        expect(choicesOf(all)[0].id).toBe(HUMANS);
        const own = line('hum1', 'Humans', { kind: 'human' });
        expect(humansOf([own, elves]).id).toBe('hum1');
        expect(choicesOf([own, elves]).some((b) => b.id === HUMANS)).toBe(false);
    });
});

describe('normalizing', () => {
    it('keeps a bloodline block to its shape', () => {
        const b = normalizeBloodline({ on: true, kind: 'robot', traits: ['a', 'a', 7], visual: { known: 'maybe' } });
        expect(b.on).toBe(true);
        expect(b.kind).toBe('');
        expect(b.traits).toEqual(['a']);
        expect(b.visual.known).toBe('');
        expect(normalizeBloodline(null).on).toBe(false);
    });
    it('keeps at most two bloodlines for a character', () => {
        expect(normalizeLineage({ ids: ['a', 'b', 'c'], note: 'x' })).toEqual({ ids: ['a', 'b'], note: 'x' });
    });
    it('drops bad mix rows and repeats', () => {
        expect(normalizeMix([{ id: 'a', share: 'most' }, { id: 'a', share: 'few' }, { id: 'b', share: 'lots' }, null])).toEqual([{ id: 'a', share: 'most' }]);
    });
    it('a place mix adjusts by default', () => {
        expect(normalizePlacePopulation({ mix: [] }).mode).toBe('adjust');
        expect(normalizePlacePopulation({ mode: 'replace' }).mode).toBe('replace');
    });
    it('is stored with the setting and its entries', () => {
        const doc = normalizeSettingDoc({ overview: { population: { mix: [{ id: HUMANS, share: 'most' }], only: true } }, entries: { x: { lineage: { ids: ['elf1'] }, bloodline: { on: true } } } });
        expect(doc.overview.population).toEqual({ mix: [{ id: HUMANS, share: 'most' }], notes: '', only: true });
        expect(doc.entries.x.lineage.ids).toEqual(['elf1']);
        expect(doc.entries.x.bloodline.on).toBe(true);
        expect(normalizeEntryMeta({}).population).toEqual({ mode: 'adjust', mix: [], notes: '' });
        expect(normalizeSettingDoc({}).overview.population).toEqual({ mix: [], notes: '', only: false });
    });
});

describe('who lives where', () => {
    const world = { mix: [{ id: HUMANS, share: 'most' }, { id: 'elf1', share: 'rare' }], notes: 'elves keep apart', only: false };
    const parents = { quarter: 'city', city: 'planet', colony: 'planet' };
    const meta = {
        city: { population: { mix: [{ id: 'and1', share: 'common' }] } },
        quarter: { population: { mix: [{ id: 'elf1', share: 'most' }, { id: HUMANS, share: 'some' }], notes: 'the Elven Quarter' } },
        colony: { population: { mode: 'replace', mix: [{ id: 'and1', share: 'most' }] } },
        guild: { members: { mix: [{ id: 'vas1', share: 'most' }] } },
    };
    it('inherits the world\'s mix where no place sets one', () => {
        expect(mixAt(world, parents, meta, 'planet')).toEqual({ mix: world.mix, notes: 'elves keep apart', only: false, from: '' });
    });
    it('adjusts down the tree', () => {
        expect(mixAt(world, parents, meta, 'city').mix).toEqual([{ id: HUMANS, share: 'most' }, { id: 'elf1', share: 'rare' }, { id: 'and1', share: 'common' }]);
        const q = mixAt(world, parents, meta, 'quarter');
        expect(q.mix).toEqual([{ id: HUMANS, share: 'some' }, { id: 'elf1', share: 'most' }, { id: 'and1', share: 'common' }]);
        expect(q.notes).toBe('the Elven Quarter');
        expect(q.from).toBe('quarter');
    });
    it('replaces when told to', () => {
        expect(mixAt(world, parents, meta, 'colony').mix).toEqual([{ id: 'and1', share: 'most' }]);
    });
    it('a faction\'s members win over the place', () => {
        expect(mixFor({ world, parents, metaById: meta, placeId: 'quarter', factionId: 'guild' }).mix).toEqual([{ id: 'vas1', share: 'most' }]);
        expect(mixFor({ world, parents, metaById: meta, placeId: 'colony', factionId: 'nobody' }).mix).toEqual([{ id: 'and1', share: 'most' }]);
    });
    it('rolls by weight, never a unique or absent one', () => {
        const mix = [{ id: 'a', share: 'most' }, { id: 'b', share: 'rare' }, { id: 'u', share: 'unique' }, { id: 'n', share: 'none' }];
        expect(rollBloodline(mix, () => 0)).toBe('a');
        expect(rollBloodline(mix, () => 0.999)).toBe('b');
        const seen = new Set(Array.from({ length: 200 }, (_, i) => rollBloodline(mix, () => i / 200)));
        expect([...seen].sort()).toEqual(['a', 'b']);
        expect(rollBloodline([], () => 0.5)).toBe('');
    });
    it('says a mix in words, most common first', () => {
        expect(mixText([{ id: 'elf1', share: 'few' }, { id: HUMANS, share: 'most' }, { id: 'and1', share: 'common' }], byId)).toBe('mostly humans; many androids; a few elves');
    });
    it('says nothing for humans alone, and names those never met here', () => {
        expect(isPlainMix([{ id: HUMANS, share: 'most' }], byId)).toBe(true);
        expect(whoIsAboutLine({ mix: [{ id: HUMANS, share: 'most' }] }, byId)).toBe('');
        expect(whoIsAboutLine({ mix: [{ id: HUMANS, share: 'most' }, { id: 'elf1', share: 'none' }] }, byId)).toBe('No elves are found here.');
        expect(whoIsAboutLine({ mix: [{ id: HUMANS, share: 'most' }, { id: 'elf1', share: 'some' }], notes: 'they own the towers' }, byId)).toBe('Who is about here: mostly humans; some elves. they own the towers.');
    });
    it('the only rule names the world\'s bloodlines', () => {
        expect(onlyRule({ mix: [{ id: HUMANS, share: 'most' }, { id: 'elf1', share: 'few' }], only: true }, byId)).toMatch(/^The only peoples in this world are humans and elves\. Never introduce/);
        expect(onlyRule({ mix: [{ id: HUMANS, share: 'most' }], only: false }, byId)).toBe('');
    });
});

describe('a character\'s bloodline', () => {
    it('is guessed from the role and the first sentence', () => {
        expect(guessLineage({ role: 'fixer', description: 'An elven fixer with a chrome arm. She hates androids.' }, all)).toEqual(['elf1']);
        expect(guessLineage({ role: 'Vaskari trader' }, all)).toEqual(['vas1']);
        expect(guessLineage({ description: 'A half-elf smuggler.' }, all)).toEqual(['elf1']);
        expect(guessLineage({ description: 'A smuggler. Rumoured to be part elf.' }, all)).toEqual([]);
        expect(guessLineage({ description: 'A selfish man.' }, all)).toEqual([]);
    });
    it('is the sheet\'s when set, else the guess', () => {
        const ch = { id: 'c', type: 'character', description: 'An android courier.', meta: {} };
        expect(lineageOf(ch, all)).toEqual({ ids: ['and1'], note: '', guessed: true });
        expect(lineageOf({ ...ch, meta: { lineage: { ids: ['elf1'], note: 'raised human' } } }, all)).toEqual({ ids: ['elf1'], note: 'raised human', guessed: false });
        expect(lineageOf({ ...ch, meta: { lineage: { ids: ['gone'] } } }, all).ids).toEqual(['and1']);
    });
    it('labels one or two', () => {
        expect(lineageLabel(['elf1'], byId)).toBe('elf');
        expect(lineageLabel(['elf1', HUMANS], byId)).toBe('half elf, half human');
        expect(lineageLabel([], byId)).toBe('');
    });
    it('has a short form for prompts', () => {
        expect(bloodlineBrief(elves)).toBe('Elves: tall, pointed ears. How they live here: old money in the arcologies.');
        expect(bloodlineBrief(androids)).toBe('');
    });
});

describe('presets', () => {
    it('every preset makes a bloodline', () => {
        for (const p of BLOODLINE_PRESETS) {
            const made = fromPreset(p.id, {});
            expect(made.bloodline.on, p.id).toBe(true);
            expect(made.name, p.id).toBeTruthy();
            expect(made.description, p.id).toBeTruthy();
        }
    });
    it('bends to the age', () => {
        const old = fromPreset('high_elves', { worldType: 'fantasy' });
        const late = fromPreset('high_elves', { worldType: 'science_fiction' });
        expect(old.bloodline.here).toMatch(/white stone/);
        expect(late.bloodline.here).toMatch(/boardrooms/);
        expect(late.bloodline.visual.dress).toMatch(/modern/);
        expect(old.bloodline.culture).toBe('preset:elves');
        expect(old.bloodline.naming).toBe('own');
    });
    it('offers the world\'s own group first', () => {
        expect(presetGroups('science_fiction')[0].key).toBe('scifi');
        expect(presetGroups('urban_fantasy')[0].key).toBe('modern');
        expect(presetGroups('')[0].key).toBe('fantasy');
    });
});

describe('the guidance', () => {
    it('puts the bloodline beside the name, and its look after the cast', () => {
        const cast = buildCast({ cast: [{ name: 'Kiri', bloodline: 'elf', role: 'fixer', lineageNote: 'had her ears clipped' }, { name: 'Ana', bloodline: 'human', role: 'courier', player: true }], bloodlines: { present: ['Elves: tall, pointed ears; old money.'] } });
        expect(cast).toContain('- Kiri (elf): Fixer. Had her ears clipped.');
        expect(cast).toContain('- Ana (human, courier): the player character');
        expect(cast).toContain('Bloodlines present - Elves: tall, pointed ears; old money.');
    });
    it('says who is about, and keeps the only rule with the limits', () => {
        const { text } = buildGuidance({
            location: { path: ['Arcadia'], whoIsAbout: 'Who is about here: mostly humans; some elves.' },
            bloodlines: { only: 'The only peoples in this world are humans and elves.' },
            budget: 2000,
        });
        expect(text).toContain('Who is about here: mostly humans; some elves.');
        expect(text).toContain('Never break the world\'s limits. The only peoples in this world are humans and elves.');
    });
});

describe('image prompts', () => {
    const character = (description) => ({ id: 'c', type: 'character', name: 'Kiri', description, role: 'fixer' });
    it('leads with a well-known bloodline\'s word', () => {
        const { prompt } = buildImagePrompt({ entry: character('Short dark hair.'), bloodline: visualFor(elves), options: { provider: 'stable_diffusion' } });
        expect(prompt).toMatch(/^portrait of an elf fixer, pointed ears, tailored suits/);
    });
    it('spells out an invented one, and keeps a human out', () => {
        const { prompt, negative } = buildImagePrompt({ entry: character('Short dark hair.'), bloodline: visualFor(vaskari), options: { provider: 'stable_diffusion' } });
        expect(prompt).toMatch(/^portrait of a Vaskari fixer, four-armed, slate-grey scales, three amber eyes in a row/);
        expect(negative).toContain('human face');
        expect(negative).toMatch(/\bhuman\b/);
        const mj = buildImagePrompt({ entry: character('Short dark hair.'), bloodline: visualFor(vaskari), options: { provider: 'midjourney' } });
        expect(mj.prompt).toMatch(/--no [^-]*human face/);
    });
    it('draws a bloodline\'s own picture as one of them', () => {
        const { prompt } = buildImagePrompt({ entry: vaskari, bloodline: visualFor(vaskari), options: { provider: 'stable_diffusion' } });
        expect(prompt).toMatch(/^full-body character design of a Vaskari, four-armed/);
    });
    it('has nothing to draw for humans', () => {
        expect(visualFor({ id: HUMANS })).toBe(null);
        expect(visualFor(line('h', 'Humans', { kind: 'human' }))).toBe(null);
    });
});
