// How a quest ends: written from its objectives, read back, checked after
// each reply - and a met end sets its status, under the user's own choice.
import { buildEndsPrompt, readEnds, buildEndCheckPrompt, readEndCheck } from '../src/quests/ends.js';
import { effectiveStatus } from '../src/quests/model.js';

const quest = { name: 'Retrieve the cache', description: 'Elyon\'s relics, hidden near a ruined temple.', objectives: ['Travel to the ruined temple of Elyon', { text: 'Find the cache', status: 'pending' }] };

describe('writing how a quest ends', () => {
    it('asks from the objectives, for two lines', () => {
        const p = buildEndsPrompt(quest);
        expect(p.user).toContain('1. Travel to the ruined temple of Elyon');
        expect(p.user).toContain('2. Find the cache');
        expect(p.user).toMatch(/DONE: <sentence>\nFAILS: <sentence>/);
    });

    it('reads the two lines, tolerating labels and markup', () => {
        expect(readEnds('DONE: Remus holds the relics.\nFAILS: The cache is destroyed.')).toEqual({ completion: 'Remus holds the relics.', abandon: 'The cache is destroyed.' });
        expect(readEnds('**Done** - the relics are recovered\nFailed: Morvath takes them')).toEqual({ completion: 'the relics are recovered', abandon: 'Morvath takes them' });
        expect(readEnds('Completes when: they find it')).toEqual({ completion: 'they find it', abandon: '' });
        expect(readEnds('I think the quest is about relics.')).toBeNull();
    });
});

describe('checking the ends after a reply', () => {
    const quests = [{ name: 'Retrieve the cache', completion: 'Remus holds the relics', abandon: 'the cache is destroyed' }, { name: 'Defend Redhaven', completion: 'the undead retreat' }];

    it('lists each quest with its ends and the reply', () => {
        const p = buildEndCheckPrompt(quests, { reply: 'The skeletons fled into the dark.', userText: 'Remus raised his sword.' });
        expect(p.user).toContain('1. Retrieve the cache\n   done when: Remus holds the relics\n   fails when: the cache is destroyed');
        expect(p.user).toContain('2. Defend Redhaven\n   done when: the undead retreat');
        expect(p.user).toContain('The skeletons fled into the dark.');
    });

    it('reads the verdicts, leaving open ones out', () => {
        expect(readEndCheck('1 | open\n2 | done', 2)).toEqual([{ index: 1, verdict: 'done' }]);
        expect(readEndCheck('1: failed\n2) completed\n3 | done', 2)).toEqual([{ index: 0, verdict: 'failed' }, { index: 1, verdict: 'done' }]);
        expect(readEndCheck('1 | open\n2 | open', 2)).toEqual([]);
        expect(readEndCheck('No quest ended.', 2)).toBeNull();
    });
});

describe('an ended quest', () => {
    it('takes its end over the story and Archivist, but not over the user', () => {
        expect(effectiveStatus({ runtime: 'Active', ended: 'Completed' })).toMatchObject({ status: 'Completed', from: 'ends' });
        expect(effectiveStatus({ runtime: 'Active', ended: 'Failed', thread: { status: 'active' } })).toMatchObject({ status: 'Failed' });
        expect(effectiveStatus({ override: 'Active', runtime: 'Active', ended: 'Completed' })).toMatchObject({ status: 'Active', from: 'user' });
        expect(effectiveStatus({ runtime: 'Active' })).toMatchObject({ status: 'Active', from: 'story' });
    });
});
