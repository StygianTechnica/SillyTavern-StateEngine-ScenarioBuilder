// The volume's steer reaches every outline and beat pass - a review, or a
// regenerate after a beat has played out, not only the volume's first
// outline (reviews without it drifted back to Redhaven).
import { buildOutlinePrompt, buildBeatPrompt } from '../src/planner/prompts.js';
import { shapeOf } from '../src/planner/shapes.js';

const steer = "The heroes travel to Elyon's ruined temple; the cache is a trap; Maziel attacks as they leave.";
const outline = { premise: 'p', themes: [], seeds: [], acts: [{ id: 'a1', title: 'Departure', beats: [{ id: 'b1', text: 'They set out.', status: 'done', ties: [] }, { id: 'b2', text: 'Skirmishes on the road.', status: 'active', ties: [] }] }] };
const shape = shapeOf('adventure-serial');

describe("the volume's steer", () => {
    it('is in a review of the outline', () => {
        const { prompt } = buildOutlinePrompt({ shape, outline, steer, messages: [] });
        expect(prompt).toContain('WHERE THE USER WANTS THIS VOLUME TO GO');
        expect(prompt).toContain(steer);
    });

    it('is not repeated as a wish when it is the same text', () => {
        const { prompt } = buildOutlinePrompt({ shape, outline, steer, wish: steer, messages: [] });
        expect(prompt).not.toContain('WHAT THE USER WANTS FROM THIS OUTLINE');
    });

    it('is in a beat rewrite', () => {
        const { prompt } = buildBeatPrompt({ shape, outline, beatId: 'b2', steer, messages: [] });
        expect(prompt).toContain(steer);
    });
});
