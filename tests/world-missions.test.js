// The world meanwhile handing a giver's job to the player character:
// Medina sniffing around Cyril; White Cerberus wants to know what they know,
// and Adam Miller, who gives its missions, sends Cyril to find out.
import { worldPart } from '../src/world/prompts.js';
import { stirOf, LEVEL_LIMITS } from '../src/world/model.js';
import { roomForMission, hookGiver, givesText, normalizeGiver, buildMissionPrompt } from '../src/quests/missions.js';

const adam = normalizeGiver({ on: true, trade: 'Agents of White Cerberus usually take on missions in pairs.', team: true, offer: 'asked' });

describe('a giver in the world pass', () => {
    const part = (people) => worldPart({
        ripples: [{ id: 'r1', text: 'Medina Syndicate enforcers were seen in Bearville asking about Cyril.' }],
        stakeholders: people, day: 5, userName: 'Cyril', limits: stirOf(LEVEL_LIMITS.lively, {}),
    });

    it('is marked, and may send the player character on a job', () => {
        const text = part([
            { name: 'White Cerberus', type: 'faction', why: ['Cyril is one of theirs'], gives: givesText(adam, { via: 'Adam Miller' }) },
            { name: 'Medina Syndicate', type: 'faction', why: ['hunts Cyril'] },
        ]).text;
        expect(text).toContain('- White Cerberus (faction) - Cyril is one of theirs. Adam Miller, one of theirs, gives missions (Agents of White Cerberus usually take on missions in pairs.)');
        expect(text).toContain('Someone marked "gives missions" who has Cyril on their side may answer what happened by sending Cyril on a job');
        expect(text).toMatch(/never one against Cyril/);
    });

    it('says nothing of it when no one there gives missions', () => {
        expect(part([{ name: 'Medina Syndicate', type: 'faction', why: ['hunts Cyril'] }]).text).not.toContain('gives missions');
    });

    it('a giver alone is marked plainly', () => {
        expect(givesText(adam)).toBe('gives missions (Agents of White Cerberus usually take on missions in pairs.)');
        expect(givesText({ ...adam, on: false })).toBe('');
    });
});

describe('a world hook becoming a mission', () => {
    const givers = new Set(['adam']);
    const members = { wc: ['adam', 'vex', 'inji'], medina: ['tiago'] };
    const find = (ids) => hookGiver(ids, { isGiver: (id) => givers.has(id), membersOf: (id) => members[id] ?? [] });

    it('goes to the giver behind it, or the giver inside the faction behind it', () => {
        expect(find(['adam'])).toBe('adam');
        expect(find(['wc'])).toBe('adam');
        expect(find(['vex', 'wc'])).toBe('adam');
    });

    it('a hook no giver is behind stays a quest idea', () => {
        expect(find(['medina'])).toBe('');
        expect(find([])).toBe('');
    });

    it('only with room: nothing of theirs under way, their board not full', () => {
        expect(roomForMission(adam, [])).toBe(true);
        expect(roomForMission(adam, [{ status: 'Completed' }])).toBe(true);
        expect(roomForMission(adam, [{ status: 'Active' }])).toBe(false);
        expect(roomForMission(adam, [{ status: 'Not started' }])).toBe(false);
        expect(roomForMission({ ...adam, board: 3 }, [{ status: 'Not started' }])).toBe(true);
        expect(roomForMission({ ...adam, on: false }, [])).toBe(false);
    });

    it('the mission is written to answer what the world turned up', () => {
        const { user } = buildMissionPrompt({
            giver: { name: 'Adam Miller', type: 'character', trade: adam.trade },
            taker: { name: 'Cyril' }, difficulty: 'moderate',
            occasion: 'White Cerberus: learn why Medina is hunting Cyril - What Medina Knows: find out what the Syndicate has on Cyril.',
        });
        expect(user).toContain('# Why this job comes up now\nWhite Cerberus: learn why Medina is hunting Cyril - What Medina Knows: find out what the Syndicate has on Cyril.');
        expect(user.indexOf('# Why this job comes up now')).toBeLessThan(user.indexOf('# Your task'));
    });
});
