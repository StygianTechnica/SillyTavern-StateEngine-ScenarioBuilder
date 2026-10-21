import { normalizeGiver, normalizeMission, nextDifficulty, buildMissionPrompt, readMission, offerText, missionToFollow, offerCondition } from '../src/quests/missions.js';
import { normalizeQuestMeta } from '../src/quests/model.js';
import { normalizeEntryMeta } from '../src/store/schema.js';
import { buildGuidance } from '../src/guidance/build.js';

const guild = normalizeGiver({ on: true, trade: 'marks to kill for pay', clients: 'nobles settling scores', reward: 'coin by the job' });

describe('a mission giver', () => {
    it('is kept on the entry, off by default', () => {
        expect(normalizeGiver(null)).toMatchObject({ on: false, auto: true, team: false, difficulty: '' });
        expect(normalizeEntryMeta({ giver: { on: true, trade: 'heists' } }).giver).toMatchObject({ on: true, trade: 'heists' });
    });

    it('starts its missions easy and makes them harder with its record', () => {
        expect(nextDifficulty(guild, [])).toBe('easy');
        const done = (n) => Array.from({ length: n }, () => ({ status: 'Completed' }));
        expect(nextDifficulty(guild, done(2))).toBe('moderate');
        expect(nextDifficulty(guild, done(4))).toBe('hard');
        expect(nextDifficulty(guild, [...done(4), { status: 'Failed' }])).toBe('moderate');
        expect(nextDifficulty(guild, done(20))).toBe('deadly');
        expect(nextDifficulty({ ...guild, difficultyMode: 'fixed', difficulty: 'hard' }, [])).toBe('hard');
    });

    it('offers the next one only once its last has ended, and only once per ending', () => {
        expect(missionToFollow(guild, [])).toBe(null);
        expect(missionToFollow(guild, [{ id: 'q1', status: 'Active' }])).toBe(null);
        expect(missionToFollow(guild, [{ id: 'q1', status: 'Completed' }])).toEqual({ id: 'q1', status: 'Completed' });
        expect(missionToFollow({ ...guild, lastFollowed: 'q1' }, [{ id: 'q1', status: 'Completed' }])).toBe(null);
        expect(missionToFollow({ ...guild, auto: false }, [{ id: 'q1', status: 'Failed' }])).toBe(null);
    });
});

describe('writing a mission', () => {
    it('asks for the five parts, sized to the difficulty, with the setting to draw on', () => {
        const { user } = buildMissionPrompt({
            giver: { name: 'The Quiet Hand', type: 'faction', trade: guild.trade, clients: guild.clients, reward: guild.reward },
            taker: { name: 'Remus', description: 'A disgraced paladin.' },
            group: ['Varyn'],
            difficulty: 'hard',
            candidates: [{ name: 'Lord Aldric', type: 'character', description: 'A greedy noble.' }],
            past: [{ name: 'The Tanner\'s Debt', status: 'Completed' }],
            request: 'something in the docks',
        });
        for (const part of ['marks to kill for pay', 'With their group: Varyn', 'hard - dangerous', 'Lord Aldric', 'The Tanner\'s Debt (completed)', 'something in the docks', 'CLIENT:', 'TARGET:', 'REWARD:', 'OBJECTIVES:']) expect(user).toContain(part);
        expect(buildMissionPrompt({ giver: { name: 'X' }, canonOnly: true }).user).toContain('never invent new ones');
    });

    it('reads the answer, objectives on one line or as a list', () => {
        const m = readMission('**NAME:** The Silent Ledger\nCLIENT: Lord Aldric\nTARGET: Merchant Voss\nTASK: Take the ledger from Voss before he testifies.\nREWARD: 200 gold\nOBJECTIVES: Find Voss; Get into his house; Take the ledger\nDONE WHEN: the ledger is in Aldric\'s hands\nFAILS WHEN: Voss testifies');
        expect(m).toEqual({ name: 'The Silent Ledger', client: 'Lord Aldric', target: 'Merchant Voss', task: 'Take the ledger from Voss before he testifies.', reward: '200 gold', objectives: ['Find Voss', 'Get into his house', 'Take the ledger'], completion: 'the ledger is in Aldric\'s hands', abandon: 'Voss testifies' });
        expect(readMission('NAME: A\nTASK: B\nOBJECTIVES:\n- one\n- two\n1. three').objectives).toEqual(['one', 'two', 'three']);
        expect(readMission('Just a story.')).toBe(null);
    });

    it('is offered by its giver in the story, and can be turned down', () => {
        expect(offerText({ name: 'The Silent Ledger', task: 'Take the ledger from Voss.', reward: '200 gold.' }, { giverName: 'The Quiet Hand', takerName: 'Remus' }))
            .toBe('The Quiet Hand has a job to offer Remus: "The Silent Ledger" - Take the ledger from Voss, paying 200 gold. The Quiet Hand offers it the next time they meet (or at once, if they are together now); it can be turned down.');
    });
});

describe('a mission as a quest', () => {
    it('keeps its parts in the quest metadata', () => {
        const meta = normalizeQuestMeta({ type: 'mission', mission: { giverId: 'fac_1', giverName: 'The Quiet Hand', client: 'Lord Aldric', difficulty: 'hard', reward: '200 gold' } });
        expect(meta.type).toBe('mission');
        expect(meta.mission).toMatchObject({ giverId: 'fac_1', client: 'Lord Aldric', difficulty: 'hard', reward: '200 gold' });
        expect(normalizeMission({ client: 'no giver' })).toBe(null);
    });

    it('tells the narrator who it is from and what it pays', () => {
        const built = buildGuidance({ quests: [{ name: 'The Silent Ledger', type: 'mission', priority: 'high', description: 'Take the ledger from Voss.', mission: { giver: 'The Quiet Hand', difficulty: 'hard', reward: '200 gold' } }], budget: 2000 });
        expect(built.text).toContain('A hard job from The Quiet Hand, paying 200 gold.');
    });
});

describe('difficulty modes and when a giver offers', () => {
    it('keeps an older giver with a set difficulty fixed', () => {
        expect(normalizeGiver({ on: true, difficulty: 'hard' })).toMatchObject({ difficultyMode: 'fixed', difficulty: 'hard', offer: 'meet' });
    });

    it('picks a random difficulty, mostly from the middle', () => {
        const random = { ...guild, difficultyMode: 'random' };
        expect(nextDifficulty(random, [], { random: () => 0 })).toBe('trivial');
        expect(nextDifficulty(random, [], { random: () => 0.5 })).toBe('moderate');
        expect(nextDifficulty(random, [], { random: () => 0.99 })).toBe('deadly');
    });

    it('follows the tension the story wants, and grows when there is no story shape', () => {
        const story = { ...guild, difficultyMode: 'story' };
        expect(nextDifficulty(story, [], { tension: 1.2 })).toBe('trivial');
        expect(nextDifficulty(story, [], { tension: 3.6 })).toBe('hard');
        expect(nextDifficulty(story, [], { tension: 4.8 })).toBe('deadly');
        expect(nextDifficulty(story, [], { tension: null })).toBe('easy');
    });

    it('waits for the condition it is given, or for being asked', () => {
        expect(offerCondition({ offer: 'meet' })).toBe('');
        expect(offerCondition({ offer: 'asked' }, { giverName: 'Guildmaster Orren', takerName: 'Remus' })).toBe('Remus asks Guildmaster Orren for work or a new job');
        expect(offerCondition({ offer: 'when', offerWhen: 'Remus is at the guild hall during working hours' })).toBe('Remus is at the guild hall during working hours');
        expect(offerCondition({ offer: 'when', offerWhen: '' })).toBe('');
    });

    it('offers it at once when the condition fires', () => {
        expect(offerText({ name: 'The Silent Ledger', task: 'Take the ledger.', reward: '200 gold' }, { giverName: 'Orren', takerName: 'Remus', now: true }))
            .toBe('Orren offers Remus a job: "The Silent Ledger" - Take the ledger, paying 200 gold. It can be turned down.');
    });
});
