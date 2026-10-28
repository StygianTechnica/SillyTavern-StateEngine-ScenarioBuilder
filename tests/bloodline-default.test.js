import { describe, it, expect } from 'vitest';
import { defaultLineage, lineageOf, normalizePopulation } from '../src/library/bloodlines.js';

const lore = (id, name, kind) => ({ id, type: 'lore', name, meta: { bloodline: { on: true, kind } } });
// Assassins Inc: mostly humans, some cyborgs and androids, a few others.
const bloodlines = [lore('lor_hum', 'Humans', 'human'), lore('lor_cyb', 'Cyborgs', 'changed'), lore('lor_and', 'Androids', 'made'), lore('lor_elf', 'High Elves', 'ancestry')];
const mix = [{ id: 'lor_and', share: 'some' }, { id: 'lor_hum', share: 'most' }, { id: 'lor_cyb', share: 'some' }, { id: 'lor_elf', share: 'rare' }];
const inji = { id: 'chr_inji', name: 'Inji Miyama', role: 'Elite Agent', description: 'Inji is lean and athletic, with close-cropped white hair.', meta: {} };

describe('the bloodline of anyone not set', () => {
    it('is the world\'s most common unless the user picks one', () => {
        expect(normalizePopulation({}).unset).toBe('most');
        expect(defaultLineage({ mix }, bloodlines)).toEqual(['lor_hum']);
        expect(defaultLineage({ mix, unset: 'lor_cyb' }, bloodlines)).toEqual(['lor_cyb']);
        expect(defaultLineage({ mix, unset: 'story' }, bloodlines)).toEqual([]);
        // A picked bloodline since removed: nothing, not a wrong one.
        expect(defaultLineage({ mix, unset: 'lor_gone' }, bloodlines)).toEqual([]);
        expect(defaultLineage({ mix: [] }, bloodlines)).toEqual([]);
    });

    it('fills in for a character with none set and none in their description', () => {
        expect(lineageOf(inji, bloodlines)).toMatchObject({ ids: [], defaulted: false });
        expect(lineageOf(inji, bloodlines, { population: { mix } })).toMatchObject({ ids: ['lor_hum'], defaulted: true, guessed: false });
        // Set on the sheet, or named in the description, wins.
        expect(lineageOf({ ...inji, meta: { lineage: { ids: ['lor_elf'] } } }, bloodlines, { population: { mix } }).ids).toEqual(['lor_elf']);
        expect(lineageOf({ ...inji, description: 'An android bodyguard with a cracked faceplate.' }, bloodlines, { population: { mix } })).toMatchObject({ ids: ['lor_and'], guessed: true, defaulted: false });
        expect(lineageOf(inji, bloodlines, { population: { mix, unset: 'story' } }).ids).toEqual([]);
    });
});
