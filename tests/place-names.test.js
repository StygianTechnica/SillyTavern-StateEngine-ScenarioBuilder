// A new place the story names as a whole sentence is cut down to the
// place, and a known place's other wordings are that place.
import { placeNameFrom, samePlaceName } from '../src/director/prompt.js';

describe('a place named in a sentence', () => {
    it('keeps just the place', () => {
        expect(placeNameFrom('Remus is in the infirmary now, resting from his injuries', ['Remus'])).toBe('Infirmary');
        expect(placeNameFrom('The party waits at the fortress infirmary while Niamh tends them', ['Remus'])).toBe('Fortress infirmary');
        expect(placeNameFrom("Remus stands on the walls of Niamh's Fortress", ['Remus'])).toBe("Walls of Niamh's Fortress");
        expect(placeNameFrom('Graxx leads them into the Great Hall', ['Remus'])).toBe('Great Hall');
    });

    it('leaves a short name as it is, only cleaned', () => {
        expect(placeNameFrom('The Junkyard', ['Remus'])).toBe('The Junkyard');
        expect(placeNameFrom('Inside the infirmary, indoors', ['Remus'])).toBe('Infirmary');
    });

    it('gives nothing when no place can be read', () => {
        expect(placeNameFrom('Remus is resting from his injuries', ['Remus'])).toBe('');
        expect(placeNameFrom('', ['Remus'])).toBe('');
    });
});

describe('the same place in other words', () => {
    const wall = { name: 'Wall', aliases: ["Redhaven's fortress walls"] };
    it('matches "the", plurals and possessives', () => {
        expect(samePlaceName('the walls', wall)).toBe(true);
        expect(samePlaceName("Redhaven's fortress wall", wall)).toBe(true);
        expect(samePlaceName("niamh's fortress", { name: "Niamh's Fortress" })).toBe(true);
    });
    it('never a longer or different name', () => {
        expect(samePlaceName('the wall breach', wall)).toBe(false);
        expect(samePlaceName("Niamh's fortress infirmary", { name: "Niamh's Fortress" })).toBe(false);
    });
});

describe('the place in the mouthful the story sent', () => {
    it('keeps only the place from the first clause', () => {
        expect(placeNameFrom('Remus remains in the infirmary; the others move to plan the temple expedition outside', ['Remus'])).toBe('Infirmary');
    });
});
