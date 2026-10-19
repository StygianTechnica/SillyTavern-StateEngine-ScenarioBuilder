import { buildGuidance } from '../src/guidance/build.js';
import { isPlaceholder, parseDirectorNote } from '../src/director/prompt.js';

describe('placeholder place names', () => {
    it('reads template words for a place as placeholders', () => {
        for (const v of ['Place name', 'place name', '[Place name]', 'Place_Name', 'place-name', 'Location name', 'name of the place', '<the place the scene is in now>']) {
            expect(isPlaceholder(v)).toBe(true);
        }
        for (const v of ['The Bleakfast', 'Placid Lake', 'Namesake Inn', 'The Place']) expect(isPlaceholder(v)).toBe(false);
    });

    it('never moves the scene to a placeholder place', () => {
        for (const v of ['Place name', '[Place name]', 'place_name']) {
            expect(parseDirectorNote(`The scene shifts.\nMOVE | ${v} | none | indoors`).move).toBeNull();
        }
        expect(parseDirectorNote('MOVE | The Bleakfast | none | indoors').move.place).toBe('The Bleakfast');
    });

    it('leaves a placeholder-named place or route out of the ways on', () => {
        const g = buildGuidance({
            location: {
                path: ["Niamh's Fortress", 'Gate'],
                places: [{ name: 'The Bleakfast', description: 'A night of feasting' }, { name: 'Place name', description: 'A ruined cathedral' }],
                routes: [{ name: 'Place name', travel: '1 minute', note: 'guessed - edit if wrong' }, { name: 'The Crypt', travel: '10 minutes', note: '' }],
                partOf: { name: "Niamh's Fortress" },
            },
            budget: 2000,
        });
        expect(g.text).toContain('From here one can go to');
        expect(g.text).toContain('The Bleakfast');
        expect(g.text).toContain('The Crypt');
        expect(g.text).not.toMatch(/Place name/i);
    });
});
