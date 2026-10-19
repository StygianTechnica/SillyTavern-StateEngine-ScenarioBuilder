// An objective the user removed stays removed: Archivist's next compile
// (rewording it or not) never puts it back.
import { mergeObjectives, normalizeQuestMeta } from '../src/quests/model.js';

const steps = [
    { text: 'Rest and plan their approach to the cache', status: 'pending' },
    { text: "Get to the old temple requires navigating Redhaven's politics and alliances", status: 'pending' },
    { text: 'Offer aid to retrieve the mysterious cache (Proposed by Niamh as an option)', status: 'pending' },
];

describe('removed objectives', () => {
    it('are not added back from the thread, reworded or not', () => {
        const removed = [
            "Rest and plan their approach to the cache when they reach Niamh's stronghold",
            "Getting to the old temple requires navigating Redhaven's politics and alliances",
            'Offering aid to retrieve the mysterious cache',
        ];
        const mine = [{ text: 'Travel to the ruined temple of Elyon', status: 'pending', byUser: true }];
        expect(mergeObjectives(mine, steps, { removed })).toEqual(mine);
    });

    it('leave the other steps alone', () => {
        const out = mergeObjectives([], steps, { removed: ['Offering aid to retrieve the mysterious cache'] });
        expect(out.map((o) => o.text)).toEqual(steps.slice(0, 2).map((s) => s.text));
    });

    it('are kept in the quest meta', () => {
        expect(normalizeQuestMeta({ removed: ['  Offer aid  ', '', 3] }).removed).toEqual(['Offer aid', '3']);
        expect(normalizeQuestMeta({}).removed).toEqual([]);
    });
});
