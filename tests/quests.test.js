import {
    isQuestThread, statusFromThread, typeFromThread, objectivesFromThread, mergeObjectives, effectiveStatus,
    questProgress, currentObjective, questPriority, sortQuests, normalizeQuestMeta,
} from '../src/quests/model.js';

const thread = {
    id: 't4', kind: 'quest seed', title: 'Recover the ledger', text: 'Tobin wants the ledger back.', status: 'active',
    entity: null, involved: [{ id: 'chr_t', name: 'Tobin' }], goal: 'Get the ledger',
    steps: [{ text: 'Find who took it', status: 'done' }, { text: 'Break into the vault', status: 'active' }, { text: 'Bribe the guard', status: 'skipped' }],
};

describe('quests from Archivist threads', () => {
    it('recognises quest material', () => {
        expect(isQuestThread(thread)).toBe(true);
        expect(isQuestThread({ kind: 'personal goal' })).toBe(true);
        expect(isQuestThread({ kind: 'unresolved thread', entity: { type: 'quest' } })).toBe(true);
        expect(isQuestThread({ kind: 'unresolved thread' })).toBe(false);
    });

    it('maps status, type and objectives', () => {
        expect([statusFromThread('active'), statusFromThread('resolved'), statusFromThread('abandoned'), statusFromThread('open')]).toEqual(['Active', 'Completed', 'Abandoned', 'Not started']);
        expect([typeFromThread({ kind: 'main quest' }), typeFromThread({ kind: 'personal goal' }), typeFromThread(thread)]).toEqual(['main', 'personal', 'side']);
        expect(objectivesFromThread(thread)).toEqual([
            { text: 'Find who took it', status: 'done' }, { text: 'Break into the vault', status: 'pending' }, { text: 'Bribe the guard', status: 'optional' },
        ]);
        expect(objectivesFromThread({ goal: 'Escape', status: 'open' })).toEqual([{ text: 'Escape', status: 'pending' }]);
    });

    it('keeps objectives in step with the plan, respecting the user\'s own', () => {
        const merged = mergeObjectives(
            [{ text: 'Find who took it', status: 'pending' }, { text: 'Break into the vault', status: 'failed', byUser: true }, { text: 'Tell Mira', status: 'pending' }],
            objectivesFromThread(thread),
        );
        expect(merged.map((o) => [o.text, o.status])).toEqual([
            ['Find who took it', 'done'], ['Break into the vault', 'failed'], ['Tell Mira', 'pending'], ['Bribe the guard', 'optional'],
        ]);
    });
});

describe('status, progress and priority', () => {
    it('takes the user, then the story, then Archivist', () => {
        expect(effectiveStatus({ override: 'Failed', runtime: 'Active', thread })).toEqual({ status: 'Failed', from: 'user', conflict: '' });
        expect(effectiveStatus({ runtime: 'Active', thread: { status: 'resolved' } })).toEqual({ status: 'Active', from: 'story', conflict: 'Completed' });
        expect(effectiveStatus({ runtime: 'Not started', thread })).toEqual({ status: 'Active', from: 'archivist', conflict: '' });
        expect(effectiveStatus({})).toEqual({ status: 'Not started', from: 'none', conflict: '' });
    });

    it('measures progress over required objectives', () => {
        const objectives = objectivesFromThread(thread);
        expect(questProgress(objectives)).toEqual({ done: 1, total: 2, ratio: 0.5 });
        expect(currentObjective(objectives).text).toBe('Break into the vault');
    });

    it('scores priority from base, type, status and the scene', () => {
        expect(questPriority({ base: 'medium', type: 'main', status: 'Active' }).level).toBe('high');
        expect(questPriority({ base: 'low', type: 'side', status: 'Not started' }).level).toBe('low');
        const near = questPriority({ base: 'medium', type: 'side', status: 'Not started', involved: ['chr_t'], present: ['chr_t'] });
        expect(near.level).toBe('medium');
        expect(near.reasons[0]).toContain('in the scene');
        expect(questPriority({ status: 'Completed' }).level).toBe('low');
    });

    it('sorts a board: active first, then priority', () => {
        const q = (name, status, score) => ({ name, status, priority: { score } });
        expect(sortQuests([q('C', 'Completed', 0), q('B', 'Active', 4), q('A', 'Active', 9), q('D', 'Not started', 7)]).map((x) => x.name)).toEqual(['A', 'B', 'D', 'C']);
    });

    it('normalizes stored quest metadata', () => {
        expect(normalizeQuestMeta({ type: 'epic', priority: 'urgent', objectives: [{ text: ' Go ', status: 'weird' }, {}] }))
            .toEqual({ type: '', priority: 'medium', status: '', objectives: [{ text: 'Go', status: 'pending' }], removed: [], completion: '', abandon: '', threadId: '', ended: '', endsTried: false, mission: null });
    });
});
