import { describe, it, expect } from 'vitest';
import { questStory, buildEndsPrompt, readEnds, readEndCheck, quotedFrom, backedVerdicts, questsToCheck } from '../src/quests/ends.js';

// Assassins Inc: endings written from the name alone ("the ancestral crypt
// collapses in an earthquake") and quests failed on events that never
// happened.
const chat = [
    { name: 'Cyril', is_user: true, mes: 'Cyril sat down across from Riven.' },
    { name: 'Narrator', mes: 'Riven accused Cyril of being complicit with Omicron Innovations because of the Moriarty name.' },
    { is_system: true, mes: 'system note' },
    { name: 'Cyril', is_user: true, mes: '"I was dead when they took me," Cyril said.' },
    { name: 'Narrator', mes: 'Riven frowned, unconvinced.' },
    { name: 'Narrator', mes: 'Galice pulled up the Omicron intake records.' },
    { name: 'Narrator', mes: 'Much later, Doc ran the scans.' },
    { name: 'Narrator', mes: 'The records showed Cyril was declared dead two days before Omicron took him.' },
];

describe('questStory', () => {
    it('gives the messages where the thread began, then its latest', () => {
        const s = questStory(chat, { from: 1, to: 7 });
        expect(s).toContain('Cyril: Cyril sat down');
        expect(s).toContain('complicit with Omicron');
        expect(s).toContain('declared dead two days before');
        expect(s).not.toContain('system note');
        expect(s).toContain('…');
    });
    it('falls back to the latest messages without a range', () => {
        expect(questStory(chat, null)).toContain('declared dead');
        expect(questStory([], null)).toBe('');
    });
    it('stays within its length', () => {
        const long = Array.from({ length: 10 }, () => ({ name: 'N', mes: 'word '.repeat(800) }));
        expect(questStory(long, { from: 0, to: 9 }, { max: 2000 }).length).toBeLessThanOrEqual(2000);
    });
});

describe('writing ends from the story', () => {
    it('puts the story in the prompt and lets a quest have no way to fail', () => {
        const p = buildEndsPrompt({ name: 'Address Cyril\'s Complicity Suspicions', objectives: [] }, { story: questStory(chat, { from: 1, to: 7 }), progress: 'Riven is unconvinced' });
        expect(p.user).toContain('# Where it came from in the story');
        expect(p.user).toContain('complicit with Omicron');
        expect(p.user).toContain('Where it stands: Riven is unconvinced');
        expect(p.user).toContain('FAILS: none');
        expect(p.user).toMatch(/follow the story/);
    });
    it('reads "none" as no failure', () => {
        expect(readEnds('DONE: Riven accepts Cyril was dead.\nFAILS: none')).toEqual({ completion: 'Riven accepts Cyril was dead.', abandon: '' });
        expect(readEnds('DONE: x happens.\nFAILS: This quest cannot be abandoned.')).toEqual({ completion: 'x happens.', abandon: '' });
        expect(readEnds('DONE: x happens.\nFAILS: N/A')).toEqual({ completion: 'x happens.', abandon: '' });
    });
});

describe('verdicts need the story\'s words', () => {
    const reply = 'Riven stared at the records. "You were dead," he said quietly. "I was wrong about you, Moriarty." He offered his hand.';
    it('reads the quote after the verdict', () => {
        expect(readEndCheck('1 | done | "I was wrong about you, Moriarty."\n2 | open', 2)).toEqual([{ index: 0, verdict: 'done', quote: 'I was wrong about you, Moriarty.' }]);
    });
    it('finds a quote in the reply, despite case and punctuation', () => {
        expect(quotedFrom('i was wrong about you moriarty', reply)).toBe(true);
        expect(quotedFrom('Riven stared at the records and he offered his hand', reply)).toBe(false);
        expect(quotedFrom('he said quietly', reply)).toBe(false); // too short to tell
    });
    it('keeps only the verdicts the reply shows', () => {
        const { kept, dropped } = backedVerdicts([
            { index: 0, verdict: 'done', quote: 'I was wrong about you, Moriarty.' },
            { index: 1, verdict: 'failed', quote: 'The ancestral crypt collapses in an earthquake' },
            { index: 2, verdict: 'failed', quote: '' },
        ], { reply });
        expect(kept.map((v) => v.index)).toEqual([0]);
        expect(dropped.map((v) => v.index)).toEqual([1, 2]);
    });
});

describe('which quests are checked', () => {
    it('checks open quests with conditions, not only active ones', () => {
        const qs = [
            { name: 'a', status: 'Not started', completion: 'the truth is revealed', priority: { score: 3 } },
            { name: 'b', status: 'Active', completion: 'done', priority: { score: 2 } },
            { name: 'c', status: 'Completed', completion: 'done' },
            { name: 'd', status: 'Active', completion: '', abandon: '' },
            { name: 'e', status: 'Active', completion: 'x', dormant: true },
        ];
        expect(questsToCheck(qs).map((q) => q.name)).toEqual(['b', 'a']);
    });
});
