import { vi, describe, it, expect } from 'vitest';
import { normalizeSettingDoc } from '../src/store/schema.js';

// State Engine's review has detected "Vex" in the reply but not confirmed her yet.
const confirmed = [{ id: 'chr_cyril', name: 'Cyril Moriarty', scope: 'setting', confirmed: true }];
const detected = { id: 'chr_vex', name: 'Vex', aliases: ['The Snake'], scope: 'chat', confirmed: false };
vi.mock('../src/api/objects.js', () => ({
    listObjectTypes: async () => [{ id: 'character', scope: 'world' }],
    listObjects: async (_chatId, _type, options = {}) => (options.settingId ? confirmed : [detected, ...confirmed]),
}));
vi.mock('../src/store/setting-store.js', () => ({
    getSettingDoc: () => normalizeSettingDoc({}),
    updateSettingDoc: () => {},
    getEntryMeta: () => ({}),
}));

const { findSimilar } = await import('../src/library/library.js');

describe('finding a name the setting already has', () => {
    it('counts what the review has detected but not confirmed, when asked', async () => {
        expect(await findSimilar('c', 's', 'character', 'Vex')).toEqual([]);
        expect((await findSimilar('c', 's', 'character', 'Vex', { pending: true })).map((e) => e.id)).toEqual(['chr_vex']);
        expect((await findSimilar('c', 's', 'character', 'the snake', { pending: true })).map((e) => e.id)).toEqual(['chr_vex']);
        expect((await findSimilar('c', 's', 'character', 'Cyril Moriarty', { pending: true })).map((e) => e.id)).toEqual(['chr_cyril']);
    });
});
