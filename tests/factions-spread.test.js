// The planner reaches past the one faction every quest and rivalry names:
// rivalries spread over everyone in them, and the factions the story has
// hardly touched handed to the ideas, day and outline passes.
import { factionsOutOfPlay, frictionLines } from '../src/planner/model.js';
import { buildIdeasPrompt, buildDayPrompt } from '../src/planner/prompts.js';

const names = { omi: 'Omicron Innovations', wc: 'White Cerberus', cw: 'Chrome Wraiths', cr: 'The Council of Rinkawa', fo: 'Foundry Orbital', ms: 'Medina Syndicate', adam: 'Adam Miller' };
const nameOf = (id) => names[id] ?? '';
const factions = ['omi', 'wc', 'cw', 'cr', 'fo', 'ms'].map((id) => ({ id, name: names[id], description: `${names[id]} is a faction.` }));

describe('factions not yet in play', () => {
    const questTexts = ['Omicron Infiltration - uncover Omicron Innovations', 'Omicron Innovations family legacy', 'White Cerberus training', 'Prove worth to White Cerberus'];
    const chatText = 'Omicron Innovations made the implant. White Cerberus took him in. Omicron Innovations again. The Medina Syndicate once.';
    const relations = [
        { from: 'cw', to: 'omi', kind: 'serves' },
        { from: 'cw', to: 'wc', kind: 'rival' },
        { from: 'cr', to: 'adam', kind: 'potential asset' },
    ];

    it('the least used first, never the ones the story leans on', () => {
        const out = factionsOutOfPlay({ factions, questTexts, chatText, relations, nameOf });
        const got = out.map((f) => f.name);
        expect(got).not.toContain('Omicron Innovations');
        expect(got).not.toContain('White Cerberus');
        expect(got.slice(0, 3).sort()).toEqual(['Chrome Wraiths', 'Foundry Orbital', 'The Council of Rinkawa']);
    });

    it('with ties away from the most used faction first', () => {
        const wraiths = factionsOutOfPlay({ factions, questTexts, chatText, relations, nameOf }).find((f) => f.name === 'Chrome Wraiths');
        expect(wraiths.ties[0]).toBe('tied to White Cerberus (rival)');
        expect(wraiths.ties[1]).toBe('tied to Omicron Innovations (serves)');
    });

    it('a story that has used none of them yet hands over a few', () => {
        expect(factionsOutOfPlay({ factions, limit: 2 })).toHaveLength(2);
        expect(factionsOutOfPlay({ factions: [] })).toEqual([]);
    });
});

describe('rivalries spread over everyone in them', () => {
    it('one per faction before any faction twice', () => {
        const relations = [
            { from: 'omi', to: 'wc', kind: 'rival' }, { from: 'omi', to: 'cw', kind: 'enemy' }, { from: 'omi', to: 'fo', kind: 'rival' },
            { from: 'omi', to: 'cr', kind: 'enemy' }, { from: 'ms', to: 'cw', kind: 'rival' }, { from: 'cr', to: 'fo', kind: 'rival' },
        ];
        const lines = frictionLines({ relations, nameOf });
        expect(lines).toHaveLength(4);
        expect(lines.filter((l) => l.includes('Omicron')).length).toBeLessThanOrEqual(2);
        expect(lines.some((l) => l.includes('Medina Syndicate'))).toBe(true);
    });
});

describe('the passes are handed them', () => {
    const untouched = [{ name: 'The Council of Rinkawa', description: 'Hackers who expose megacorps.', ties: ['tied to Adam Miller (potential asset)'] }];

    it('the ideas pass must ground an idea in one', () => {
        const { prompt } = buildIdeasPrompt({ userName: 'Cyril', untouched });
        expect(prompt).toContain('FACTIONS NOT YET IN PLAY (the story has hardly touched them: ground at least one idea in one of these');
        expect(prompt).toContain('- The Council of Rinkawa: Hackers who expose megacorps. - tied to Adam Miller (potential asset)');
    });

    it('the day plan may have work come from one', () => {
        const { prompt } = buildDayPrompt({ userName: 'Cyril', messages: [], untouched });
        expect(prompt).toContain('work or an offer Cyril is given can come from them');
    });

    it('nothing when there are none', () => {
        expect(buildIdeasPrompt({ userName: 'Cyril', untouched: [] }).prompt).not.toContain('FACTIONS NOT YET IN PLAY');
    });
});
