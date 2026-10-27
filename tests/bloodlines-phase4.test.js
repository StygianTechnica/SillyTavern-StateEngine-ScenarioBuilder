import { describe, it, expect } from 'vitest';
import {
    HUMANS, normalizePopulation, normalizePlacePopulation, viewsAt, seenHereLine, populationBriefLine,
    ageIn, ageReading, ageLine, lifespanLine, lineageLabel, lineageVisual, lineageBriefLine, namesOfLineage, visualFor,
} from '../src/library/bloodlines.js';
import { fromPreset } from '../src/library/bloodline-presets.js';
import { buildGuidance, buildCast } from '../src/guidance/build.js';
import { buildImagePrompt } from '../src/images/prompt.js';
import { familyNameIn, planName } from '../src/naming/engine.js';

const ov = { premise: 'Neo-Arcadia 2077: elves awakened in 2031.', worldType: 'science_fiction' };
const make = (id) => { const m = fromPreset(id, ov); return { id, type: 'lore', name: m.name, meta: { bloodline: m.bloodline } }; };
const elves = make('high_elves');
const orcs = make('orcs');
const humans = make('humans');
const byId = { high_elves: elves, orcs, humans };

describe('lifespans in ages', () => {
    it('reads an age from a character\'s text', () => {
        expect(ageIn('A 312-year-old elven fixer.')).toBe(312);
        expect(ageIn('She is 41 years old and tired.')).toBe(41);
        expect(ageIn('Age: 27')).toBe(27);
        expect(ageIn('Old money, older grudges.')).toBe(null);
    });
    it('reads an age by the span of their kind', () => {
        expect(ageReading(312, 'long')).toMatchObject({ stage: 'in the prime of life' });
        expect(ageReading(312, 'long').looks).toBeLessThan(45);
        expect(ageReading(700, 'long').stage).toBe('old');
        expect(ageReading(40, 'short').stage).toBe('old');
        expect(ageReading(40, 'human').stage).toBe('in the prime of life');
        expect(ageReading(900, 'ageless')).toEqual({ age: 900, stage: 'ageless', looks: 30 });
        // A half-elf ages between their parents.
        expect(ageReading(120, 'long+human').stage).toBe('in the prime of life');
        expect(ageReading(120, 'human').stage).toBe('very old');
    });
    it('a lifespan note that says how old one looks wins', () => {
        expect(ageReading(300, 'long', 'a 300-year-old looks 30')).toEqual({ age: 300, stage: 'in the prime of life', looks: 30 });
    });
    it('says it for the narrator only when it matters', () => {
        expect(ageLine(312, { lifespan: 'long', singular: 'elf' })).toMatch(/^312 years old - in the prime of life for an elf, looks about \d+$/);
        expect(ageLine(40, { lifespan: 'human' })).toBe('');
        expect(ageLine(null, { lifespan: 'long' })).toBe('');
    });
    it('tells a writer what age fits', () => {
        expect(lifespanLine(elves)).toMatch(/^High elves live for centuries: one of 250 is in the prime of life and looks about \d+\. Give an age that fits\.$/);
        expect(lifespanLine(humans)).toBe('');
        expect(lineageBriefLine(['high_elves'], byId)).toContain('High elves live for centuries');
    });
    it('puts the age in the cast line', () => {
        const text = buildCast({ cast: [{ name: 'Aelith', bloodline: 'high elf', age: '312 years old - in the prime of life for a high elf, looks about 39' }] });
        expect(text).toContain('- Aelith (high elf): 312 years old - in the prime of life for a high elf, looks about 39.');
    });
    it('draws a long-lived one as old as they look', () => {
        const entry = { id: 'c', type: 'character', name: 'Aelith', role: 'fixer', description: 'A 312-year-old elven fixer with silver hair and a scar.' };
        const { prompt } = buildImagePrompt({ entry, bloodline: visualFor(elves), options: { provider: 'stable_diffusion' } });
        expect(prompt).toMatch(/looks about \d+/);
        expect(prompt).not.toMatch(/312/);
    });
});

describe('mixed heritage', () => {
    it('is labelled the way people say it', () => {
        expect(lineageLabel(['high_elves', 'humans'], byId)).toBe('half high elf');
        expect(lineageLabel(['orcs', HUMANS], { orcs })).toBe('half-orc');
        expect(lineageLabel(['high_elves', 'orcs'], byId)).toBe('half high elf, half orc');
    });
    it('is drawn as one: the other parent\'s mark, softened, and never "no human"', () => {
        const half = lineageVisual(['orcs', 'humans'], byId);
        expect(half.lead).toBe('half-orc');
        expect(half.details[0]).toMatch(/^subtly /);
        expect(half.negative).not.toContain('human');
        expect(half.lifespan).toBe('short+human');
        const both = lineageVisual(['high_elves', 'orcs'], byId);
        expect(both.details.filter((d) => d.startsWith('subtly '))).toHaveLength(2);
        expect(lineageVisual(['high_elves'], byId).lead).toBe('high elf');
        expect(lineageVisual(['humans'], byId)).toBe(null);
    });
    it('a writer is told of both parents', () => {
        const line = lineageBriefLine(['high_elves', 'humans'], byId);
        expect(line).toMatch(/^They are a half high elf\./);
        expect(line).toContain('something of each parent');
        expect(line).toContain('more slowly than a human');
    });
    it('takes the given name from one parent and the family name from the other', () => {
        const a = { id: 'a', meta: { bloodline: { on: true, kind: 'ancestry', culture: 'preset:elves', naming: 'own' } } };
        const b = { id: 'b', meta: { bloodline: { on: true, kind: 'ancestry', culture: 'preset:dwarves', naming: 'own' } } };
        expect(namesOfLineage(['a', 'b'], { a, b }, () => 0.1)).toEqual({ given: 'preset:elves', family: 'preset:dwarves', split: true });
        expect(namesOfLineage(['a', 'b'], { a, b }, () => 0.9)).toEqual({ given: 'preset:dwarves', family: 'preset:elves', split: true });
        // A local parent: the place's names for their side.
        const c = { id: 'c', meta: { bloodline: { on: true, kind: 'human', culture: '', naming: '' } } };
        expect(namesOfLineage(['a', 'c'], { a, c }, () => 0.1)).toEqual({ given: 'preset:elves', family: '', split: true });
        expect(namesOfLineage(['a'], { a }, () => 0.1)).toEqual({ given: 'preset:elves', family: '', split: false });
    });
    it('rolls a family name in a culture, and the name keeps it', () => {
        const world = { naming: { seed: 's', counter: 3 }, overview: { worldType: 'fantasy' }, names: [] };
        const family = familyNameIn('real:english', world);
        expect(family).toMatch(/^\p{Lu}/u);
        const plan = planName({ typeId: 'character', brief: 'a man', cultureId: 'real:japanese', family }, world);
        expect(plan.mode).toBe('rolled');
        expect(plan.name).toContain(family);
    });
});

describe('how bloodlines are seen, per place', () => {
    it('is stored with the world and each place', () => {
        expect(normalizePopulation({ views: [{ id: 'high_elves', standing: 'revered', note: 'old money' }, { id: 'x', standing: 'adored' }, { id: 'high_elves', standing: 'feared' }] }).views)
            .toEqual([{ id: 'high_elves', standing: 'revered', note: 'old money' }]);
        expect(normalizePlacePopulation({}).views).toEqual([]);
    });
    it('the nearest place that says something of a bloodline wins', () => {
        const world = { views: [{ id: 'high_elves', standing: 'revered' }, { id: 'orcs', standing: 'scorned' }] };
        const meta = { sprawl: { population: { views: [{ id: 'high_elves', standing: 'distrusted', note: 'the Purge' }] } } };
        const v = viewsAt(world, { sprawl: 'city' }, meta, 'sprawl');
        expect(v).toEqual([{ id: 'high_elves', standing: 'distrusted', note: 'the Purge', from: 'sprawl' }, { id: 'orcs', standing: 'scorned', note: '', from: '' }]);
        expect(viewsAt(world, { sprawl: 'city' }, meta, 'city')[0].standing).toBe('revered');
    });
    it('tells the narrator of those here only', () => {
        const views = [{ id: 'high_elves', standing: 'distrusted', note: 'the Purge.' }, { id: 'orcs', standing: 'feared', note: '' }];
        expect(seenHereLine(views, byId, [{ name: 'Kael', ids: ['high_elves', 'humans'] }, { name: 'Mira', ids: ['high_elves'] }]))
            .toBe('High elves are distrusted here (the Purge) - the locals treat Kael and Mira accordingly.');
        expect(seenHereLine(views, byId, [{ name: 'Joe', ids: ['humans'] }])).toBe('');
        expect(seenHereLine(views, byId)).toBe('High elves are distrusted here (the Purge). Orcs are feared here.');
        expect(populationBriefLine({ mix: [] }, byId, null, views)).toBe('How they are seen there: High elves are distrusted here (the Purge). Orcs are feared here.');
    });
    it('goes into the location section', () => {
        const { text } = buildGuidance({ location: { path: ['The Sprawl'], seenHere: 'High elves are distrusted here (the Purge) - the locals treat Kael accordingly.' }, budget: 2000 });
        expect(text).toContain('High elves are distrusted here (the Purge) - the locals treat Kael accordingly.');
    });
});
