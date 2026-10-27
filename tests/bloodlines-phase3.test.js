import { describe, it, expect } from 'vitest';
import {
    premiseBloodlinesSection, splitPremiseAnswer, readPremiseBloodlines, presetFor, describeBloodlineProposal,
    buildRewritePrompt, readRewrite, buildLookPrompt, readLook, looksLikeBloodline, importedBloodline, storyKind, storyBloodline,
} from '../src/library/bloodline-prompts.js';
import { buildNamingRulesPrompt, readNamingRules } from '../src/naming/premise.js';
import { parseClassify } from '../src/import/lorebook.js';
import { normalizeSettingDoc } from '../src/store/schema.js';

const line = (id, name, bloodline) => ({ id, type: 'lore', name, meta: { bloodline: { on: true, ...bloodline } } });
const elves = line('elf1', 'Elves', { kind: 'ancestry', look: 'tall, pointed ears', here: 'old money' });

const ANSWER = `CULTURE: Arcadian
WHO: the city's own people
BASED ON: Japanese 2, English 1
DISTANCE: 1
FAMILY NAMES: same
PLACES: either
USED BY: Arcadia City
DEFAULT: yes

CULTURE: Sylvan
WHO: the elves' old tongue
BASED ON: Elves
DISTANCE: 2
FAMILY NAMES: places
PLACES: own tongue
USED BY: none
DEFAULT: no

THE BLOODLINES

**BLOODLINE:** Humans
ONE: human
KIND: human
PRESET: humans
LOOK: none
HERE: most of the city, from the arcologies to the Sprawl
SHARE: most
NAMES: Arcadian
KNOWN: well

- BLOODLINE: High Elves
- ONE: high elf
- KIND: ancestry
- PRESET: High Elves
- LOOK: tall and ageless, ears often surgically clipped to pass
- HERE: awakened in 2031; old money in the corporate towers
- SHARE: few
- NAMES: Sylvan
- KNOWN: well

BLOODLINE: The Vaskari
ONE: Vaskari
KIND: species
PRESET: none
LOOK: four-armed, slate-scaled
HERE: refugees who run the night markets
SHARE: rare
NAMES: local
KNOWN: not
BODY: four-armed, upright
SKIN: slate-grey scales
FEATURES: three amber eyes in a row; feathered crest

ONLY THESE: yes`;

describe('the premise call: bloodlines with the cultures', () => {
    it('asks for bloodlines in the same prompt', () => {
        const { prompt } = buildNamingRulesPrompt({ overview: { premise: 'Elves in a cyberpunk megacity.' }, bloodlines: premiseBloodlinesSection({ existing: ['Dwarves'] }) });
        expect(prompt).toContain('THE BLOODLINES');
        expect(prompt).toContain('BLOODLINE: its name, plural');
        expect(prompt).toContain('Bloodlines it already has (do not repeat them): Dwarves');
        expect(prompt).toContain('ONLY THESE: yes');
        expect(buildNamingRulesPrompt({ overview: { premise: 'x' } }).prompt).not.toContain('THE BLOODLINES');
    });
    it('splits the answer so the cultures are read as before', () => {
        const { cultures, bloodlines } = splitPremiseAnswer(ANSWER);
        expect(cultures).toContain('CULTURE: Sylvan');
        expect(cultures).not.toContain('BLOODLINE');
        expect(bloodlines.startsWith('THE BLOODLINES')).toBe(true);
        const read = readNamingRules(cultures);
        expect(read.map((c) => c.name)).toEqual(['Arcadian', 'Sylvan']);
        expect(splitPremiseAnswer('CULTURE: A').bloodlines).toBe('');
    });
    it('reads the bloodlines, forgivingly', () => {
        const { proposals, only } = readPremiseBloodlines(ANSWER, { existing: [] });
        expect(only).toBe(true);
        expect(proposals.map((p) => p.name)).toEqual(['Humans', 'High Elves', 'The Vaskari']);
        expect(proposals[0]).toMatchObject({ kind: 'human', preset: 'humans', look: '', share: 'most', names: 'Arcadian', known: 'well' });
        expect(proposals[1]).toMatchObject({ one: 'high elf', preset: 'high_elves', share: 'few', names: 'Sylvan' });
        expect(proposals[2]).toMatchObject({ one: 'Vaskari', kind: 'species', preset: '', names: 'local', known: 'not', body: 'four-armed, upright', features: 'three amber eyes in a row; feathered crest' });
    });
    it('skips bloodlines the world has', () => {
        expect(readPremiseBloodlines(ANSWER, { existing: ['high elves'] }).proposals.map((p) => p.name)).toEqual(['Humans', 'The Vaskari']);
    });
    it('says nothing of "only" when the answer does not', () => {
        expect(readPremiseBloodlines('BLOODLINE: Orcs\nSHARE: some').only).toBe(null);
    });
    it('finds the preset by its line or the name', () => {
        expect(presetFor('Dwarves', 'The Deep Folk')).toBe('dwarves');
        expect(presetFor('none', 'Wood Elves')).toBe('wood_elves');
        expect(presetFor('none', 'The Vaskari')).toBe('');
        expect(presetFor('a kind of android', '')).toBe('androids');
    });
    it('describes a proposal for its card', () => {
        const p = readPremiseBloodlines(ANSWER).proposals;
        expect(describeBloodlineProposal(p[1])).toBe('ancestry · from the High Elves preset · a few · names: Sylvan');
        expect(describeBloodlineProposal(p[2])).toBe('species · invented · rare · names: where they live');
    });
});

describe('the sheet calls', () => {
    it('rewrites for this world', () => {
        const { user } = buildRewritePrompt({ entry: { ...elves, description: 'Forest folk with bows.' }, overview: { premise: 'A cyberpunk megacity, 2077.', worldType: 'science_fiction' } });
        expect(user).toContain('Premise: A cyberpunk megacity, 2077.');
        expect(user).toContain('THE BLOODLINE: Elves (one of them: elf)');
        expect(user).toContain('As described so far: Forest folk with bows.');
        expect(user).toMatch(/DESCRIPTION:.*\nLOOK:.*\nHERE:.*\nDRESS:/);
        const r = readRewrite('**Description:** Elves run the towers.\nLOOK: tall, clipped ears\nHERE: boardrooms\nDRESS: none');
        expect(r).toEqual({ values: { description: 'Elves run the towers.', look: 'tall, clipped ears', here: 'boardrooms', dress: '' }, error: '' });
        expect(readRewrite('Sure!').error).toBeTruthy();
    });
    it('describes how they look - only the text in a canon world', () => {
        expect(buildLookPrompt({ entry: elves, canon: true }).user).toContain('Use ONLY what the text above says');
        expect(buildLookPrompt({ entry: elves }).user).not.toContain('Use ONLY');
        const r = readLook('KNOWN: partly\nBODY: humanoid\nSKIN: pale\nFEATURES: pointed ears, silver eyes\nDRESS: none\nTAGS: elf, pointed ears\nNEVER: human ears\nVARIETY: by house');
        expect(r.values).toEqual({ known: 'partly', body: 'humanoid', skin: 'pale', features: 'pointed ears, silver eyes', dress: '', tags: 'elf, pointed ears', negative: 'human ears', variety: 'by house' });
        expect(readLook('KNOWN: well').error).toBeTruthy();
    });
});

describe('the lorebook', () => {
    it('reads an entry as a bloodline by its title or opening', () => {
        expect(looksLikeBloodline({ title: 'Elves', content: 'Long-lived.' })).toBe(true);
        expect(looksLikeBloodline({ title: 'The Elves of Arcadia', content: '' })).toBe(true);
        expect(looksLikeBloodline({ title: 'Dwarves of the Deep', content: '' })).toBe(true);
        expect(looksLikeBloodline({ title: 'The Vaskari', content: 'The Vaskari are a four-armed species from the deep desert.' })).toBe(true);
        expect(looksLikeBloodline({ title: 'The Vaskari', content: 'The Vaskari are a mercenary company.' })).toBe(false);
        expect(looksLikeBloodline({ title: 'The Fall of Varn', content: 'Varn burned.' })).toBe(false);
    });
    it('the classifier has a bloodline kind, kept as lore', () => {
        expect(parseClassify('bloodline | The Vaskari', { title: 'The Vaskari', keys: [] })).toEqual({ type: 'lore', name: 'The Vaskari', bloodline: true });
        expect(parseClassify('race | Elves', { title: '', keys: ['elves'] })).toMatchObject({ type: 'lore', bloodline: true });
        expect(parseClassify('lore | The Fall', { title: 'The Fall', keys: [] })).toEqual({ type: 'lore', name: 'The Fall' });
    });
    it('marks with only the words its name gives', () => {
        const b = importedBloodline('The Elves of Arcadia');
        expect(b).toMatchObject({ on: true, plural: 'elves', singular: 'elf', look: '', here: '', kind: '' });
        expect(importedBloodline('The Vaskari')).toMatchObject({ plural: 'Vaskari', singular: 'Vaskari' });
    });
});

describe('the story', () => {
    it('finds a kind the world lacks in a character taken in', () => {
        expect(storyKind({ role: 'bouncer', description: 'A troll bouncer at the Neon Mile. He hates elves.' }, [elves])).toBe('troll');
        expect(storyKind({ description: 'An elven fixer.' }, [elves])).toBe('');
        expect(storyKind({ description: 'A fixer. Rumour says she fought a troll once.' }, [elves])).toBe('');
        // The first kind named is the one meant.
        expect(storyKind({ description: 'A kobold trapper who sells to the elves.' }, [elves])).toBe('kobold');
        expect(storyKind({ description: 'An elf who hunts kobolds.' }, [elves])).toBe('');
        expect(storyKind({ description: 'A half-elf smuggler.' }, [elves], ['half-elf'])).toBe('');
    });
    it('makes a bloodline from the word', () => {
        expect(storyBloodline('troll')).toMatchObject({ name: 'Trolls', bloodline: { on: true, singular: 'troll', plural: 'trolls' } });
        expect(storyBloodline('dwarf').name).toBe('Dwarves');
        expect(storyBloodline('lizardfolk').name).toBe('Lizardfolk');
    });
    it('keeps the kinds heard with the setting', () => {
        const doc = normalizeSettingDoc({ bloodlinesHeard: [{ word: 'Troll', ids: ['c1', 'c1'], status: 'pending' }, { word: '' }, { word: 'ogre', status: 'dismissed' }] });
        expect(doc.bloodlinesHeard).toEqual([{ word: 'troll', ids: ['c1'], status: 'pending', at: '' }, { word: 'ogre', ids: [], status: 'dismissed', at: '' }]);
        expect(normalizeSettingDoc({}).bloodlinesHeard).toEqual([]);
    });
});
