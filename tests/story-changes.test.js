import { changeIn, changesFrom, addChanges, normalizeChanges, openChanges, buildChangePrompt, readChangeAnswer, FIRST_LOOK } from '../src/state/changes-model.js';
import { noticeText } from '../src/ui/status-model.js';

const docks = { id: 'loc_docks', type: 'location', name: 'The Docks', aliases: [] };
const graxx = { id: 'chr_graxx', type: 'character', name: 'Graxx', aliases: [] };
const blade = { id: 'itm_blade', type: 'item', name: 'Duskfang', aliases: [] };
const mem = (id, text, entity_ids = []) => ({ id, text, entity_ids });

describe('changeIn', () => {
    it('finds a change of the thing\'s own kind, near its name', () => {
        expect(changeIn('The docks burned through the night after the riot.', docks)).toContain('docks burned');
        expect(changeIn('Graxx lost an eye to the Pit-Wolf.', graxx)).toContain('lost an eye');
        expect(changeIn('Duskfang shattered against the warden\'s shield.', blade)).toContain('shattered');
    });

    it('not a change of another kind, nor one only threatened', () => {
        // Graxx burned the docks: the docks changed, not Graxx.
        expect(changeIn('Graxx burned the docks.', graxx)).toBe('');
        expect(changeIn('The cult threatened to burn the docks.', docks)).toBe('');
        expect(changeIn('If the riot spreads the docks could burn.', docks)).toBe('');
        expect(changeIn('The docks were busy at dawn.', docks)).toBe('');
    });
});

describe('changesFrom', () => {
    const entries = [docks, graxx, blade];

    it('groups new changes by object, and remembers what it read', () => {
        const memories = [
            mem('m1', 'The docks burned in the riot.', ['loc_docks']),
            mem('m2', 'By morning the docks lay in ruins, the warehouses gone.', ['loc_docks']),
            mem('m3', 'Graxx was scarred across the face by the Pit-Wolf.', ['chr_graxx']),
        ];
        const { found, seen } = changesFrom(memories, { entries });
        expect(found.map((f) => [f.name, f.texts.length])).toEqual([['The Docks', 2], ['Graxx', 1]]);
        expect(seen).toEqual(['m1', 'm2', 'm3']);
        expect(changesFrom(memories, { entries, seen }).found).toEqual([]);
    });

    it('takes only the latest memories on a chat\'s first look', () => {
        const old = Array.from({ length: FIRST_LOOK + 5 }, (_, i) => mem(`o${i}`, i === 0 ? 'The docks burned.' : 'A quiet day.'));
        const { found, seen } = changesFrom(old, { entries, first: true });
        expect(found).toEqual([]);
        expect(seen).toHaveLength(FIRST_LOOK + 5);
    });

    it('needs the memory to be about the thing, or to name it', () => {
        expect(changesFrom([mem('x', 'The docks burned.', ['chr_graxx'])], { entries }).found).toHaveLength(1);
    });
});

describe('the list in Review', () => {
    it('adds to an open suggestion for the same object', () => {
        let c = addChanges(normalizeChanges(null), [{ objectId: 'loc_docks', name: 'The Docks', type: 'location', texts: ['a'], keys: ['m1'] }], { newId: () => 'c1' });
        c = addChanges(c, [{ objectId: 'loc_docks', name: 'The Docks', type: 'location', texts: ['b'], keys: ['m2'] }], { newId: () => 'c2' });
        expect(c.suggestions).toHaveLength(1);
        expect(c.suggestions[0].texts).toEqual(['a', 'b']);
        expect(openChanges({ changes: c })).toHaveLength(1);
        expect(noticeText({ adopted: [], drift: [], candidates: [], changes: c })).toContain('1 thing the story changed');
    });
});

describe('writing how it is now', () => {
    it('asks for the description as it is, from what the story did', () => {
        const p = buildChangePrompt({ name: 'The Docks', type: 'location', description: 'Busy wharves.', changes: ['The docks burned in the riot.'] });
        expect(p.user).toContain('Busy wharves.');
        expect(p.user).toContain('- The docks burned in the riot.');
        expect(p.user).toContain('never invent');
        expect(readChangeAnswer('Current description: Blackened piers jut into the harbour.')).toBe('Blackened piers jut into the harbour.');
        expect(readChangeAnswer('ok')).toBe('');
    });
});
