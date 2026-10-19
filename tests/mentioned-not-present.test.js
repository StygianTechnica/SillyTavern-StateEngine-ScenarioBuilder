// Someone named only as someone's is mentioned, not present: "He looked to
// Graxx's two" brought Graxx back into a scene he had been left out of.
import { namedOnlyAsOwner } from '../src/validate/drift.js';
import { OBSERVED_VARIABLES } from '../src/preset/blueprint.js';

describe('named only as someone\'s', () => {
    it('is a mention, not a presence', () => {
        expect(namedOnlyAsOwner(['Graxx'], "He looked to Graxx's two who hadn't said much during the journey and then to Varyn.")).toBe(true);
        expect(namedOnlyAsOwner(['Niamh'], 'They followed Niamh’s orders to the letter.')).toBe(true);
    });

    it('is a presence when they are named as themselves, or their voice or eyes are there', () => {
        expect(namedOnlyAsOwner(['Graxx'], "Graxx's men waited. Graxx nodded to them.")).toBe(false);
        expect(namedOnlyAsOwner(['Graxx'], "Graxx's voice boomed across the hall.")).toBe(false);
        expect(namedOnlyAsOwner(['Graxx'], "Graxx's eyes narrowed.")).toBe(false);
    });

    it('is no evidence when they are not named at all', () => {
        expect(namedOnlyAsOwner(['Graxx'], 'Arin scouted ahead.')).toBe(false);
        expect(namedOnlyAsOwner(['Graxx'], "Graxxon's banner flew.")).toBe(false);
    });

    it("State Engine's reading is told the same", () => {
        const text = OBSERVED_VARIABLES.find(([n]) => n === 'scene_characters')[1].prompted.instructions;
        expect(text).toContain('named as someone else\'s ("Graxx\'s two", "Niamh\'s orders") - is not present');
    });
});
