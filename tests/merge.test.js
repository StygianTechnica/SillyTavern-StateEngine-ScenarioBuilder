import { mergeSettingDoc, mergeChatDoc, aliasesToAdd, duplicateScore } from '../src/library/merge.js';

function settingDoc() {
    return {
        entries: {
            loc_keep: { parentId: 'loc_city', gmNotes: 'Mine.', tags: ['fort'], pinned: false, origin: 'user', quest: { objectives: [] } },
            loc_dup: { parentId: 'loc_region', gmNotes: 'From the story.', tags: ['fort', 'ruin'], pinned: true, origin: 'story', climate: 'arid', provisional: false, quest: { objectives: [{ text: 'x', status: 'pending' }] } },
            loc_room: { parentId: 'loc_dup' },
            loc_hall: { parentId: 'loc_dup' },
            loc_city: { parentId: null },
            loc_region: { parentId: null },
        },
        groups: [{ id: 'g', name: 'Forts', entryIds: ['loc_dup', 'loc_keep'] }],
        tracked: ['loc_dup', 'loc_keep'],
        relations: [
            { id: 'r1', from: 'chr_a', to: 'loc_dup', kind: 'knows', mutual: true },
            { id: 'r2', from: 'chr_a', to: 'loc_keep', kind: 'knows', mutual: true },
            { id: 'r3', from: 'loc_dup', to: 'loc_keep', kind: 'ally' },
            { id: 'r4', from: 'chr_b', to: 'loc_dup', kind: 'rival' },
        ],
        routes: [
            { id: 't1', from: 'loc_dup', to: 'loc_city', travel: '1 day' },
            { id: 't2', from: 'loc_city', to: 'loc_keep', travel: '2 days' },
            { id: 't3', from: 'loc_dup', to: 'loc_keep', travel: 'next door' },
            { id: 't4', from: 'loc_dup', to: 'loc_port', travel: '3 days' },
        ],
        knowledge: [{ id: 'k', kind: 'secret', text: 's', knownBy: ['loc_dup', 'loc_keep'], madeBy: [], madeTo: ['loc_dup'] }],
        graph: { positions: { loc_dup: { x: 1, y: 2 } }, map: { loc_dup: { x: 5, y: 5 }, loc_keep: { x: 9, y: 9 } } },
        playerId: '',
    };
}

describe('merging in the setting document', () => {
    it('keeps the kept entry\'s own metadata and takes what it lacks', () => {
        const doc = settingDoc();
        mergeSettingDoc(doc, 'loc_dup', 'loc_keep');
        const m = doc.entries.loc_keep;
        expect(m.parentId).toBe('loc_city');
        expect(m.gmNotes).toBe('Mine.\n\nFrom the story.');
        expect(m.tags).toEqual(['fort', 'ruin']);
        expect(m.pinned).toBe(true);
        expect(m.origin).toBe('user');
        expect(m.climate).toBe('arid');
        expect(m.quest.objectives).toEqual([{ text: 'x', status: 'pending' }]);
        expect(doc.entries.loc_dup).toBeUndefined();
    });

    it('moves places inside the duplicate into the kept one', () => {
        const doc = settingDoc();
        const moved = mergeSettingDoc(doc, 'loc_dup', 'loc_keep');
        expect(doc.entries.loc_room.parentId).toBe('loc_keep');
        expect(doc.entries.loc_hall.parentId).toBe('loc_keep');
        expect(moved).toContain('places inside');
    });

    it('never makes a place its own ancestor when the kept one was inside the duplicate', () => {
        const doc = settingDoc();
        doc.entries.loc_keep.parentId = 'loc_room';
        mergeSettingDoc(doc, 'loc_dup', 'loc_keep');
        // loc_room held the kept place: it goes up to where the duplicate was.
        expect(doc.entries.loc_room.parentId).toBe('loc_region');
        expect(doc.entries.loc_keep.parentId).toBe('loc_room');
        expect(doc.entries.loc_hall.parentId).toBe('loc_keep');
        const directly = settingDoc();
        directly.entries.loc_keep.parentId = 'loc_dup';
        mergeSettingDoc(directly, 'loc_dup', 'loc_keep');
        expect(directly.entries.loc_keep.parentId).toBe('loc_region');
    });

    it('takes the duplicate\'s place in the tree when the kept one has none', () => {
        const doc = settingDoc();
        doc.entries.loc_keep.parentId = null;
        mergeSettingDoc(doc, 'loc_dup', 'loc_keep');
        expect(doc.entries.loc_keep.parentId).toBe('loc_region');
    });

    it('rewrites groups, tracking, relations, routes, secrets and positions without self-links or repeats', () => {
        const doc = settingDoc();
        doc.playerId = 'loc_dup';
        mergeSettingDoc(doc, 'loc_dup', 'loc_keep');
        expect(doc.groups[0].entryIds).toEqual(['loc_keep']);
        expect(doc.tracked).toEqual(['loc_keep']);
        expect(doc.relations.map((r) => r.id)).toEqual(['r1', 'r4']);
        expect(doc.relations[1]).toMatchObject({ from: 'chr_b', to: 'loc_keep' });
        expect(doc.routes.map((r) => r.id)).toEqual(['t1', 't4']);
        expect(doc.routes[0]).toMatchObject({ from: 'loc_keep', to: 'loc_city' });
        expect(doc.knowledge[0]).toMatchObject({ knownBy: ['loc_keep'], madeTo: ['loc_keep'] });
        expect(doc.graph.positions).toEqual({ loc_keep: { x: 1, y: 2 } });
        expect(doc.graph.map).toEqual({ loc_keep: { x: 9, y: 9 } });
        expect(doc.playerId).toBe('loc_keep');
    });

    it('does nothing for an entry merged into itself', () => {
        const doc = settingDoc();
        expect(mergeSettingDoc(doc, 'loc_keep', 'loc_keep')).toEqual([]);
        expect(doc.entries.loc_keep.gmNotes).toBe('Mine.');
    });
});

describe('merging in a chat document', () => {
    it('moves the scene, cast, links and lists to the kept entry', () => {
        const d = {
            canonical: { locationId: 'chr_dup', castIds: ['chr_dup', 'chr_keep', 'chr_x'], creatureIds: ['chr_dup'] },
            inPlay: ['chr_dup', 'chr_keep'],
            questsSeen: ['chr_dup'],
            narrative: { chr_dup: { text: 'scarred' } },
            questLinks: { t1: 'chr_dup' },
            loreLinks: { w1: 'chr_keep' },
            adopted: [{ id: 'a', objectId: 'chr_dup' }, { id: 'b', objectId: 'chr_other' }],
            candidates: [{ id: 'c', objectId: 'chr_dup' }],
            held: [{ field: 'cast', objectId: 'chr_dup', until: 3 }],
            director: { created: [{ id: 'chr_dup' }, { id: 'loc_y' }] },
            factionsWritten: { chr_dup: ['fac_a'], chr_keep: ['fac_b'] },
        };
        mergeChatDoc(d, 'chr_dup', 'chr_keep');
        expect(d.canonical).toEqual({ locationId: 'chr_keep', castIds: ['chr_keep', 'chr_x'], creatureIds: ['chr_keep'] });
        expect(d.inPlay).toEqual(['chr_keep']);
        expect(d.questsSeen).toEqual(['chr_keep']);
        expect(d.narrative).toEqual({ chr_keep: { text: 'scarred' } });
        expect(d.questLinks.t1).toBe('chr_keep');
        expect(d.adopted.map((a) => a.id)).toEqual(['b']);
        expect(d.candidates).toEqual([]);
        expect(d.held[0].objectId).toBe('chr_keep');
        expect(d.director.created).toEqual([{ id: 'loc_y' }]);
        expect(d.factionsWritten).toEqual({ chr_keep: ['fac_a', 'fac_b'] });
    });

    it('keeps the kept entry\'s own current description', () => {
        const d = { canonical: {}, narrative: { chr_dup: { text: 'old' }, chr_keep: { text: 'mine' } } };
        mergeChatDoc(d, 'chr_dup', 'chr_keep');
        expect(d.narrative).toEqual({ chr_keep: { text: 'mine' } });
    });
});

describe('aliases across types', () => {
    it('adds the duplicate\'s names the kept entry does not already answer to', () => {
        const keep = { name: 'The Bleakfast', aliases: ['Night of the Flesh Feast'] };
        const dup = { name: 'The Bleakfast', aliases: ['Graveyards of Bones', 'night of the flesh feast', 'Feast of the Forgotten'] };
        expect(aliasesToAdd(keep, dup)).toEqual(['Graveyards of Bones', 'Feast of the Forgotten']);
        expect(aliasesToAdd({ name: 'A', base: { aliases: [] } }, { name: 'B' })).toEqual(['B']);
    });
});

describe('likely duplicates', () => {
    it('scores the same name, a name inside another, and a shared distinctive word', () => {
        const fort = { name: "Niamh's Fortress", aliases: ['The Keep'] };
        expect(duplicateScore(fort, { name: 'niamhs fortress' })).toBe(3);
        expect(duplicateScore(fort, { name: 'Keep', aliases: [] })).toBe(3);
        expect(duplicateScore(fort, { name: "Niamh's Fortress Gate" })).toBe(2);
        expect(duplicateScore(fort, { name: 'The Fortress of Ash' })).toBe(1);
        expect(duplicateScore(fort, { name: 'Great Hall' })).toBe(0);
        expect(duplicateScore({ name: '' }, fort)).toBe(0);
    });
});
