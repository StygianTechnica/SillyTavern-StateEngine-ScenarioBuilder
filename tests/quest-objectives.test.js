import { describe, it, expect } from 'vitest';
import { objectiveCore, sameObjective, mergeObjectives, tidyObjectives, foreignStepTest } from '../src/quests/model.js';

const maren = 'Confront High Seer Maren about her suspicions regarding Elyon\'s influence on Remus';

describe('matching reworded objectives', () => {
    it('reads past notes and dash tails', () => {
        expect(objectiveCore(`${maren} (Maren explaining the visions and implications to Lila)`)).toBe(maren);
        expect(objectiveCore('[Highly classified] figure out Remus\'s plan to leave Enclave undetected')).toBe('figure out Remus\'s plan to leave Enclave undetected');
        expect(objectiveCore('Secure an Alliance with Niamh - Meet with Niamh first.')).toBe('Secure an Alliance with Niamh');
        expect(objectiveCore('Investigate the ancient debt.')).toBe('Investigate the ancient debt');
    });

    it('matches small rewordings on their distinctive words', () => {
        expect(sameObjective(maren, `${maren} (Maren explained the visions and implications to Lila)`)).toBe(true);
        expect(sameObjective(maren, 'Confront High Seer Maren about Elyon\'s influence on Remus')).toBe(true);
        expect(sameObjective('Figure out Remus\'s plan to leave undetected', 'Figure out Remus\'s highly classified plan to leave Enclave undetected')).toBe(true);
        expect(sameObjective('Figure out Remus\'s plan to leave undetected', 'Figure out Remus\'s plan to leave undetected (Highly classified)')).toBe(true);
        expect(sameObjective('Determine how Remus\'s departure will affect this debt', 'Understand how Remus\'s departure will affect this debt considering his new path')).toBe(true);
    });

    it('keeps different objectives apart', () => {
        expect(sameObjective('Prepare for a confrontation with the dark knight', 'Prepare for a confrontation with the Death God\'s minions on the way to Liston\'s walls')).toBe(false);
        expect(sameObjective('Trade with Graxx once alliance is secured', 'Trade with Graxx at the old windmill')).toBe(false);
        expect(sameObjective('Uncover the terms of Remus\'s agreement with Elyon', 'Understand the nature and implications of this agreement between gods')).toBe(false);
        expect(sameObjective('Find the key', 'Find the map')).toBe(false);
    });
});

describe('merging Archivist steps', () => {
    it('updates the matching objective instead of adding a reworded copy', () => {
        const merged = mergeObjectives(
            [{ text: maren, status: 'pending' }, { text: 'Figure out Remus\'s plan to leave undetected', status: 'pending' }],
            [{ text: 'Confront High Seer Maren about Elyon\'s influence on Remus (Maren explained visions)', status: 'done' }, { text: '[Highly classified] figure out Remus\'s plan to leave Enclave undetected', status: 'pending' }],
        );
        expect(merged).toEqual([{ text: maren, status: 'done' }, { text: 'Figure out Remus\'s plan to leave undetected', status: 'pending' }]);
    });

    it('leaves the user\'s objectives alone and never reopens a done one on a rewording', () => {
        const merged = mergeObjectives(
            [{ text: 'Sneak out of the Enclave', status: 'pending', byUser: true }, { text: 'Gather belongings and sneak out', status: 'done' }],
            [{ text: 'Sneak out of the Enclave (quietly)', status: 'done' }, { text: 'Gather belongings and sneak out quietly', status: 'pending' }],
        );
        expect(merged).toEqual([{ text: 'Sneak out of the Enclave', status: 'pending', byUser: true }, { text: 'Gather belongings and sneak out', status: 'done' }]);
        // Word for word, Archivist's status still wins.
        expect(mergeObjectives([{ text: 'Gather belongings', status: 'done' }], [{ text: 'Gather belongings', status: 'pending' }])[0].status).toBe('pending');
    });

    it('leaves out steps that belong to another quest', () => {
        const foreign = (t) => /Graxx/.test(t);
        const merged = mergeObjectives([], [{ text: 'Find the debt', status: 'pending' }, { text: 'Trade with Graxx', status: 'pending' }], { foreign });
        expect(merged.map((o) => o.text)).toEqual(['Find the debt']);
    });
});

describe('tidying objectives that piled up', () => {
    it('collapses near-duplicates, keeping done ones done and the plain wording', () => {
        const tidy = tidyObjectives([
            { text: `${maren} (Maren explaining the visions and implications to Lila)`, status: 'pending' },
            { text: 'Investigate the ancient debt between Ethloe and Elyon that binds Remus', status: 'pending' },
            { text: 'Investigate the ancient debt between Ethloe and Elyon that binds Remus.', status: 'pending', from: 'archivist' },
            { text: maren, status: 'pending', from: 'archivist' },
            { text: 'Investigate the ancient debt between Ethloe and Elyon that binds Remus (Considering his new path)', status: 'pending', from: 'archivist' },
            { text: 'Confront High Seer Maren about Elyon\'s influence on Remus (Maren explained visions and implications)', status: 'done', from: 'archivist' },
        ]);
        expect(tidy).toEqual([
            { text: maren, status: 'done' },
            { text: 'Investigate the ancient debt between Ethloe and Elyon that binds Remus', status: 'pending' },
        ]);
    });

    it('keeps the user\'s own objectives as they are', () => {
        const mine = { text: 'Confront Maren about Elyon\'s influence on Remus, alone', status: 'failed', byUser: true };
        const tidy = tidyObjectives([{ text: 'Confront Maren about Elyon\'s influence on Remus', status: 'done' }, mine, { text: 'Travel to the temple', status: 'pending', byUser: true }]);
        expect(tidy).toEqual([mine, { text: 'Travel to the temple', status: 'pending', byUser: true }]);
    });

    it('drops pending steps of other quests but keeps done ones and the user\'s', () => {
        const foreign = () => true;
        const tidy = tidyObjectives([
            { text: 'Prepare the setting for intimacy.', status: 'pending', from: 'archivist' },
            { text: 'Prepare for a confrontation with the dark knight', status: 'done', from: 'archivist' },
            { text: 'Travel to the temple', status: 'pending', byUser: true },
        ], { foreign });
        expect(tidy.map((o) => o.text)).toEqual(['Prepare for a confrontation with the dark knight', 'Travel to the temple']);
    });

    it('is stable', () => {
        const once = tidyObjectives([{ text: maren, status: 'pending' }, { text: `${maren} (again)`, status: 'done' }, { text: 'Other thing to do', status: 'pending' }]);
        expect(tidyObjectives(once)).toEqual(once);
    });
});

describe('steps copied from other threads', () => {
    const own = ['Remus\'s Departure Consequences', 'Explore and deal with the effects of Remus leaving the Enclave.',
        'Maintain Enclave Balance after Remus\'s Departure', 'Maintain Enclave balance',
        'Figure out Remus\'s plan to leave undetected, confront High Seer Maren about Elyon\'s influence, and decide on dealing with Ethloe\'s debt.'];
    const others = [
        ['Secure an Alliance with Niamh and Trade with Graxx', 'Secure an alliance and trade', 'Meet with Niamh then trade with Graxx at the old windmill.', 'Meet with Niamh and secure her assistance for your cause', 'Niamh', 'Graxx'],
        ['Prepare for a Confrontation with the Death God\'s Minions', 'Sprint toward Liston\'s walls', 'Sprint toward Liston\'s walls and prepare to face zombies.', 'Prepare for a confrontation with the dark knight', 'Remus Watt'],
        ['Prepare Intimacy with Varyn Vance', 'Prepare setting for intimacy', 'Take it slowly.', 'Prepare the setting for intimacy', 'Remus Watt', 'Varyn Vance'],
        ['Aftermath of the Battle in Liston', 'Survive and regroup', 'Decide on next steps after facing zombies in Liston.', 'Remus Watt'],
    ];
    const foreign = foreignStepTest(own, others);

    it('spots another thread\'s title, step or retelling', () => {
        expect(foreign('Secure an Alliance with Niamh and Trade with Graxx - Meet with Niamh to secure her assistance.')).toBe(true);
        expect(foreign('Secure an Alliance with Niamh and Trade with Graxx')).toBe(true);
        expect(foreign('Prepare the setting for intimacy.')).toBe(true);
        expect(foreign('Survive and regroup.')).toBe(true);
        expect(foreign('Remus is heading to Liston\'s walls and expects to face zombies there.')).toBe(true);
        expect(foreign('Meet with Niamh and secure her assistance.')).toBe(true);
    });

    it('keeps the thread\'s own steps', () => {
        expect(foreign('Figure out Remus\'s plan to leave undetected')).toBe(false);
        expect(foreign(maren)).toBe(false);
        expect(foreign('Investigate the ancient debt between Ethloe and Elyon that binds Remus')).toBe(false);
        expect(foreign('Decide whether and how to pursue a deal with Elyon\'s followers, considering Remus\'s fate')).toBe(false);
    });

    it('does not count a thread\'s own title as another\'s', () => {
        const test = foreignStepTest(['Sprint toward Liston\'s walls'], [['Sprint toward Liston\'s walls', 'Run']]);
        expect(test('Sprint toward Liston\'s walls')).toBe(false);
    });
});
