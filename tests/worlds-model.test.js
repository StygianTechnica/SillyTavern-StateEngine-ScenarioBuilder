import {
    buildWorldFile, checkWorldFile, objectCountOf, remapIds, libraryForCopy, metaForCopiedObjects, withoutStoryAdditions,
    normalizeWorlds, familyOf, playthroughsOf, startingPointsOf, familyNameOf, nextPlaythroughNumber, playthroughName,
    chatsOn, parseChatKey, deletedChatKey, storyNotBegun,
} from '../src/worlds/model.js';

const seExport = (objects = {}) => ({ format: 'state-engine-setting', version: 1, name: 'Eldermark', fields: {}, objects });

describe('world files', () => {
    it('round-trips through the check, and counts its objects', () => {
        const file = buildWorldFile({ name: 'Original', setting: seExport({ character: { chr_a: { id: 'chr_a' } }, location: { loc_b: { id: 'loc_b' } } }), library: { entries: {} } });
        expect(checkWorldFile(file)).toBe(file);
        expect(objectCountOf(file.setting)).toBe(2);
    });

    it('refuses other files and unknown versions with a clear message', () => {
        expect(() => checkWorldFile({ hello: 1 })).toThrow(/not a Scenario Builder world file/);
        expect(() => checkWorldFile({ format: 'scenario-builder-world', version: 9, setting: seExport() })).toThrow(/version 9/);
        expect(() => checkWorldFile({ format: 'scenario-builder-world', version: 1, setting: {} })).toThrow(/no State Engine setting/);
    });
});

describe('remapping ids', () => {
    const idMap = { chr_a: 'chr_x', loc_b: 'loc_y' };

    it('replaces ids in values and keys, at any depth, and leaves other text alone', () => {
        const doc = { entries: { chr_a: { parentId: null }, loc_b: { parentId: 'loc_b2' } }, relations: [{ from: 'chr_a', to: 'loc_b' }], playerId: 'chr_a', graph: { positions: { chr_a: { x: 1 } } }, note: 'chr_a is here' };
        const out = remapIds(doc, idMap);
        expect(Object.keys(out.entries)).toEqual(['chr_x', 'loc_y']);
        expect(out.relations[0]).toEqual({ from: 'chr_x', to: 'loc_y' });
        expect(out.playerId).toBe('chr_x');
        expect(out.graph.positions.chr_x).toEqual({ x: 1 });
        expect(out.note).toBe('chr_a is here');
        expect(out.entries.loc_y.parentId).toBe('loc_b2');
    });

    it('a whole copy leaves the import history behind', () => {
        const out = libraryForCopy({ entries: { chr_a: {} }, imports: [{ id: 'i1', created: ['chr_a'] }] }, idMap);
        expect(out.imports).toEqual([]);
        expect(out.entries.chr_x).toEqual({});
    });

    it('objects copied alone keep only what still makes sense in the other world', () => {
        const doc = {
            entries: { chr_a: { parentId: null, gmNotes: 'secret', patrons: ['chr_god'], enrichments: [{ id: 'e' }] }, loc_b: { parentId: 'loc_out' } },
            relations: [{ id: 'r1', from: 'chr_a', to: 'loc_b', kind: 'lives' }, { id: 'r2', from: 'chr_a', to: 'chr_other', kind: 'knows' }],
        };
        const { entries, relations } = metaForCopiedObjects(doc, idMap);
        expect(entries.chr_x).toMatchObject({ gmNotes: 'secret', patrons: [], enrichments: [] });
        expect(entries.loc_y.parentId).toBeNull();
        expect(relations).toEqual([{ id: '', from: 'chr_x', to: 'loc_y', kind: 'lives' }]);
    });
});

describe('a clean copy', () => {
    it('leaves out what the story and the director added', () => {
        const setting = seExport({ character: { chr_a: {}, chr_b: {}, chr_c: {} } });
        const doc = { entries: { chr_b: { origin: 'story' }, chr_c: { origin: 'director' }, chr_a: { origin: 'user' } } };
        const { setting: out, left } = withoutStoryAdditions(setting, doc);
        expect(Object.keys(out.objects.character)).toEqual(['chr_a']);
        expect(left).toBe(2);
        expect(Object.keys(setting.objects.character)).toHaveLength(3);
    });
});

describe('families and playthroughs', () => {
    const settings = [{ id: 'set_root', name: 'Eldermark' }, { id: 'set_p2', name: 'Eldermark - Playthrough 2' }, { id: 'set_other', name: 'Elsewhere' }];
    const worlds = normalizeWorlds({
        startingPoints: {
            wp_1: { id: 'wp_1', family: 'set_root', familyName: 'Eldermark', name: 'Original', savedAt: '2026-10-01T00:00:00Z', fileName: 'f1.json', objectCount: 3 },
            wp_bad: { id: 'wp_bad' },
        },
        playthroughs: { set_p2: { family: 'set_root', familyName: 'Eldermark', number: 2 } },
    });

    it('normalizes, dropping broken records', () => {
        expect(Object.keys(worlds.startingPoints)).toEqual(['wp_1']);
    });

    it('knows each world\'s family, in order', () => {
        expect(familyOf(worlds, 'set_p2')).toBe('set_root');
        expect(familyOf(worlds, 'set_other')).toBe('set_other');
        expect(playthroughsOf(worlds, 'set_root', settings).map((p) => [p.setting.id, p.number])).toEqual([['set_root', 1], ['set_p2', 2]]);
        expect(startingPointsOf(worlds, 'set_root').map((p) => p.id)).toEqual(['wp_1']);
        expect(startingPointsOf(worlds, 'set_other')).toEqual([]);
    });

    it('keeps the family\'s name after the world it began with is gone', () => {
        expect(familyNameOf(worlds, 'set_root', settings)).toBe('Eldermark');
        expect(familyNameOf(worlds, 'set_root', settings.filter((s) => s.id !== 'set_root'))).toBe('Eldermark');
    });

    it('numbers the next playthrough', () => {
        expect(nextPlaythroughNumber(worlds, 'set_root')).toBe(3);
        expect(nextPlaythroughNumber(worlds, 'set_other')).toBe(2);
        expect(playthroughName('Eldermark', 3)).toBe('Eldermark - Playthrough 3');
    });
});

describe('chats', () => {
    const chats = { 'char:a.png:One': { settingId: 'set_1' }, 'group:g1:Two': { settingId: 'set_1' }, 'char:b.png:One': { settingId: 'set_2' } };

    it('lists a world\'s chats and reads their keys', () => {
        expect(chatsOn(chats, 'set_1')).toEqual(['char:a.png:One', 'group:g1:Two']);
        expect(parseChatKey('char:a.png:My chat: part 2')).toEqual({ kind: 'char', owner: 'a.png', chatId: 'My chat: part 2' });
        expect(parseChatKey('nonsense')).toBeNull();
    });

    it('finds which stored chat was deleted - never a guess between two', () => {
        const keys = Object.keys(chats);
        expect(deletedChatKey(keys, 'One', { kind: 'char', owner: 'b.png' })).toBe('char:b.png:One');
        expect(deletedChatKey(keys, 'One', { kind: 'char', owner: 'c.png' })).toBeNull();
        expect(deletedChatKey(keys, 'Two', { kind: 'group', owner: '' })).toBe('group:g1:Two');
    });

    it('tells when the story has not begun', () => {
        expect(storyNotBegun([])).toBe(true);
        expect(storyNotBegun([{ is_user: false, mes: 'Greetings' }])).toBe(true);
        expect(storyNotBegun([{ is_user: false }, { is_user: true }])).toBe(true);
        expect(storyNotBegun([{ is_user: true }, { is_user: false }])).toBe(false);
    });
});
