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

// Assassins Inc: Inji's current description said his body "now hosts Cyril
// Moriarty's consciousness" - a change that was Cyril's, not his.
describe('a change that is someone else\'s', () => {
    const inji = { id: 'in', type: 'character', name: 'Inji Miyama', aliases: ['Inji'] };
    const others = ['Cyril', 'Cyril Moriarty', 'Vex', 'Inji Miyama', 'Inji'];
    it('is not theirs', () => {
        expect(changeIn('Inji freed Cyril from the cell.', inji, { others })).toBe('');
        expect(changeIn('Inji watched as Cyril was transformed into a machine.', inji, { others })).toBe('');
        expect(changeIn('Inji, beside Cyril, was branded.', inji, { others })).toBe('');
    });
    it('is still theirs when it is', () => {
        expect(changeIn('Inji was scarred by the blast.', inji, { others })).toContain('scarred');
        expect(changeIn('Vex scarred Inji across the cheek.', inji, { others })).toContain('scarred');
        const found = changesFrom([{ id: 'm1', text: 'Inji freed Cyril.', entity_ids: ['in', 'cy'] }], { entries: [inji, { id: 'cy', type: 'character', name: 'Cyril', aliases: ['Cyril Moriarty'] }] }).found;
        expect(found.map((f) => f.name)).toEqual(['Cyril']);
    });
    it('the rewrite keeps to them, and to their pronoun', () => {
        const p = buildChangePrompt({ name: 'Inji Miyama', type: 'character', description: 'Lean and wiry.', changes: ['Inji was scarred.'], pronoun: 'he' });
        expect(p.user).toMatch(/what happened to anyone else, or what the setting says of others, is not part of it/);
        expect(p.user).toMatch(/Inji Miyama is a man: he, him, his\./);
    });
});

// Assassins Inc: one memory about Cyril's implant was offered - and, with
// auto, written - 40 times in a day: the chat had more memories than were
// kept as read, and a change turned down came back.
describe('a change offered once', () => {
    const implant = { id: 'imp', type: 'item', name: "Cyril's implant", aliases: [] };
    const memories = [{ id: 'm_old', text: "Galice broke through the encrypted code block from Cyril's implant." }, ...Array.from({ length: 1200 }, (_, i) => ({ id: `m${i}`, text: 'Vex lit a cigarette.' }))];
    it('every memory is read once, however many there are', () => {
        const first = changesFrom(memories, { entries: [implant], seen: [], first: false });
        expect(first.found).toHaveLength(1);
        expect(changesFrom(memories, { entries: [implant], seen: first.seen }).found).toEqual([]);
    });
    it('turned down or used, it never comes back', () => {
        const found = changesFrom(memories.slice(0, 1), { entries: [implant] }).found;
        let list = addChanges(normalizeChanges({}), found, { newId: () => 'c1' });
        list.suggestions[0].status = 'dismissed';
        list = addChanges(list, found, { newId: () => 'c2' });
        expect(list.suggestions.map((s) => s.id)).toEqual(['c1']);
        expect(list.done).toEqual(['m_old']);
        // Even once the old suggestion is gone from the list.
        expect(addChanges({ ...list, suggestions: [] }, found, { newId: () => 'c3' }).suggestions).toEqual([]);
    });
});

// A story change is added to the description, never in its place: Inji's
// whole look was lost to "his body now hosts Cyril's consciousness".
import { describedNow } from '../src/state/narrative.js';
describe('a change added to the description', () => {
    it('keeps the description', () => {
        expect(describedNow('Lean and wiry, white hair, a crooked nose.', 'A fresh scar runs along his jaw.'))
            .toBe('Lean and wiry, white hair, a crooked nose. Now, in this story (this holds where it differs): A fresh scar runs along his jaw.');
        expect(describedNow('Dense green woods.', '')).toBe('Dense green woods.');
        expect(describedNow('', 'Burned to stumps.')).toBe('Burned to stumps.');
    });
    it('the note says only what changed, and what lasts', () => {
        const p = buildChangePrompt({ name: 'Vex', type: 'character', description: 'Emerald eyes.', changes: ['Vex was scarred.'], pronoun: 'she' });
        expect(p.user).toMatch(/do not repeat it or sum it up/);
        expect(p.user).toMatch(/A passing mood, a moment or a scene is not a change/);
    });
});
