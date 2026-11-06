// Assassins Inc's outline: the team raiding Enrique's own auction; Enrique
// "enraged by Cyril's interference" while he believes Cyril dead; "Enrique
// discovers Cyril" before the Bartin meeting that needed it kept; "Adam
// meets with Bartin" where the user asked Adam to arrange a meeting between
// Cyril and Bartin; a finale of loyalty to a family Cyril has only fought.
import { storyLogicLines, wishTurns, beatLabels, buildOutlineCheckPrompt, readOutlineCheck, applyOutlineCheck, newBeatsToCome, checkable } from '../src/planner/logic.js';
import { fitOutlinePrompt } from '../src/planner/fit.js';
import { buildOutlinePrompt } from '../src/planner/prompts.js';

const knowledge = [
    { kind: 'belief', status: 'held', text: 'Cyril is Dead', knownBy: [{ name: 'Cyril' }], heldBy: [{ name: 'Enrique Medina' }, { name: 'Bartin Medina' }, { name: 'Cyril' }, { name: 'the Medina Syndicate' }] },
    { kind: 'secret', status: 'kept', text: 'Enrique shot Cyril over his relationship with Bartin', knownBy: [{ name: 'Enrique Medina' }] },
    { kind: 'secret', status: 'revealed', text: 'an old one', knownBy: [] },
];
const wish = 'Zane is among the agents assigned to stop the art heist. There will be some bickering during the heist operation, but they will stop it in the end. Finally, Adam manages to arrange a meeting between Cyril and Bartin Medina.';

const outline = {
    premise: '',
    acts: [
        { title: 'The Job', beats: [
            { id: 'b1', text: 'Adam assigns Cyril and Inji to stop Enrique\'s operation.', status: 'active' },
            { id: '', text: 'The team infiltrates Enrique\'s fortress during the art auction.', status: 'pending' },
        ] },
        { title: 'Fallout', beats: [
            { id: '', text: 'Enrique, enraged by Cyril\'s interference, sets a trap.', status: 'pending' },
            { id: '', text: 'Enrique discovers Cyril and his team, leading to a standoff.', status: 'pending' },
            { id: 'u1', text: 'Adam meets with Bartin Medina.', status: 'pending' },
        ] },
        { title: 'The End', beats: [
            { id: '', text: 'Cyril must decide where his loyalties lie: White Cerberus or the Medinas.', status: 'pending' },
        ] },
    ],
};

describe("the story's logic", () => {
    const lines = storyLogicLines({ knowledge, settled: ['Enrique has only heard rumors that Cyril might be alive.'], jobs: "Whose job is whose: the art heist is Enrique's.", wish });

    it('says who believes what is not so - the one who knows left out of the believers', () => {
        expect(lines).toContain('- Enrique Medina, Bartin Medina and the Medina Syndicate believe "Cyril is Dead" - it is not so (Cyril knows the truth). Until a beat of its own shows them learning otherwise, they act as if it were true: no beat has them act on the truth.');
        expect(lines).toContain('- Only Enrique Medina knows: Enrique shot Cyril over his relationship with Bartin. No one else acts on it until a beat of its own reveals it.');
        expect(lines.join('\n')).not.toContain('an old one');
    });

    it('carries the settled, whose job is whose, and the user\'s turns one by one', () => {
        expect(lines).toContain('- Enrique has only heard rumors that Cyril might be alive.');
        expect(lines).toContain("Whose job is whose: the art heist is Enrique's.");
        expect(wishTurns(wish)).toHaveLength(3);
        expect(lines).toContain('3. Finally, Adam manages to arrange a meeting between Cyril and Bartin Medina.');
    });

    it('survives every trimming step of the outline prompt', () => {
        const input = { dossier: 'x '.repeat(6000), userName: 'Cyril', messages: [{ name: 'Cyril', text: 'y '.repeat(800), isUser: true }], shape: { label: 'Arc', blurb: 'b', lean: 'threat', acts: [{ title: 'A', share: 1, band: [1, 3] }] }, outline: null, storySoFar: 'z '.repeat(4000), logic: lines };
        const fitted = fitOutlinePrompt(input, 1500);
        expect(fitted.trimmed.length).toBeGreaterThan(3);
        expect(fitted.prompt).toContain('believe "Cyril is Dead"');
        expect(fitted.prompt).toContain('3. Finally, Adam manages to arrange a meeting');
        expect(buildOutlinePrompt({ ...input, logic: [] }).prompt).not.toContain("THE STORY'S LOGIC");
    });
});

describe('the outline is checked before it is kept', () => {
    it('labels every beat and marks what may not change', () => {
        expect(beatLabels(outline).map((x) => x.label)).toEqual(['1.1', '1.2', '2.1', '2.2', '2.3', '3.1']);
        const { prompt } = buildOutlineCheckPrompt({ userName: 'Cyril', logic: ['WHO KNOWS WHAT'], outline, lockedIds: ['u1'], writing: false });
        expect(prompt).toContain('- [1.1] Adam assigns Cyril and Inji to stop Enrique\'s operation. [fixed: active]');
        expect(prompt).toContain('- [2.3] Adam meets with Bartin Medina. [fixed: pending, the user\'s]');
        expect(prompt).toContain('- [2.1] Enrique, enraged by Cyril\'s interference, sets a trap.');
        expect(prompt).toContain('never Adam meeting them himself');
        // Newly written: the active beat is the model's own and may be fixed.
        expect(checkable(outline.acts[0].beats[0], { writing: true })).toBe(true);
    });

    it('applies fixes and drops to beats still to come only', () => {
        const check = readOutlineCheck({
            fixes: [
                { beat: '1.2', problem: 'the auction is Enrique\'s own', text: 'The team infiltrates the art gallery during the auction, with Zane creating a diversion.' },
                { beat: '[2.1]', problem: 'Enrique believes Cyril dead', text: 'Enrique, enraged by White Cerberus\'s interference, sets a trap for its agents.' },
                { beat: '2.3', text: 'Adam arranges a meeting between Cyril and Bartin.' },
                { beat: '1.1', text: 'something else' },
                { beat: '3.1', text: 'Cyril decides to confront Bartin.' },
            ],
            drops: [{ beat: '2.2', why: 'spoils the Bartin meeting' }, { beat: '9.9' }],
        });
        const playerLed = (t) => /^Cyril (?:decides|confronts)/.test(t);
        const { outline: fixed, changed } = applyOutlineCheck(outline, check, { lockedIds: ['u1'], playerLed });
        const texts = beatLabels(fixed).map((x) => x.beat.text);
        expect(texts).toContain('The team infiltrates the art gallery during the auction, with Zane creating a diversion.');
        expect(texts).toContain('Enrique, enraged by White Cerberus\'s interference, sets a trap for its agents.');
        expect(texts).not.toContain('Enrique discovers Cyril and his team, leading to a standoff.');
        // The user's beat, the active one and a beat for the player stay.
        expect(texts).toContain('Adam meets with Bartin Medina.');
        expect(texts).toContain('Adam assigns Cyril and Inji to stop Enrique\'s operation.');
        expect(texts).toContain('Cyril must decide where his loyalties lie: White Cerberus or the Medinas.');
        expect(changed).toHaveLength(3);
        // The original is untouched.
        expect(outline.acts[0].beats[1].text).toBe('The team infiltrates Enrique\'s fortress during the art auction.');
    });

    it('never empties an act', () => {
        const { outline: fixed } = applyOutlineCheck(outline, { fixes: [], drops: [{ label: '3.1' }] });
        expect(fixed.acts[2].beats).toHaveLength(1);
    });

    it('a review that changed no beat to come is not checked', () => {
        expect(newBeatsToCome(outline, beatLabels(outline).map((x) => x.beat))).toBe(0);
        expect(newBeatsToCome(outline, [])).toBe(5);
    });

    it('works for other genres (fantasy, sci-fi)', () => {
        const fantasy = storyLogicLines({ knowledge: [{ kind: 'belief', status: 'held', text: 'the heir drowned at sea', everyone: true, knownBy: [{ name: 'Aria' }], heldBy: [] }], wish: 'The queen sends Aria to the northern keep. Aria finds the lost crown there.' });
        expect(fantasy[1]).toContain('most people believe "the heir drowned at sea"');
        expect(fantasy).toContain('2. Aria finds the lost crown there.');
        const scifi = storyLogicLines({ knowledge: [{ kind: 'secret', status: 'kept', text: 'the station AI is sentient', knownBy: [{ name: 'Dr. Osei' }, { name: 'Rook' }] }] });
        expect(scifi[1]).toBe('- Only Dr. Osei and Rook know: the station AI is sentient. No one else acts on it until a beat of its own reveals it.');
        expect(storyLogicLines({})).toEqual([]);
    });
});
