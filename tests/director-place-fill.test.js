// Assassins Inc: the director added "The Medina Syndicate's warehouse" with
// one line - "A heavily guarded storage facility for their illegal
// operations" - under the whole of Arcadia City, and the background fill,
// finding only the Region field empty, poured the real description into it:
// "The seedy underbelly of the Arcadia City nightlife district, near
// Lodestar Neon Mile..."
import { chooseParent } from '../src/generate/place-parent.js';
import { foldRegion, isDroppedField } from '../src/library/fields.js';
import { thinDescription } from '../src/generate/enrich.js';

const LINE = 'A heavily guarded storage facility for their illegal operations';
const REGION = 'The seedy underbelly of the Arcadia City nightlife district, near Lodestar Neon Mile. The warehouse stands as a dark sentinel amidst the neon-lit alleys.';

const map = (places) => {
    const parents = {};
    const locations = places.map(([id, name, description, parent]) => {
        if (parent) parents[id] = parent;
        return { id, name, description };
    });
    return { locations, parents };
};

describe('a place has no Region field any more', () => {
    it('is dropped from what is shown and filled', () => {
        expect(isDroppedField('location', 'region')).toBe(true);
        expect(isDroppedField('faction', 'goals')).toBe(false);
        expect(isDroppedField('character', 'region')).toBe(false);
    });

    it('old Region text goes into the description, once', () => {
        expect(foldRegion(LINE, REGION)).toBe(`${LINE}. ${REGION}`);
        expect(foldRegion('', REGION)).toBe(REGION);
        expect(foldRegion(`${LINE}. ${REGION}`, REGION)).toBe(`${LINE}. ${REGION}`);
        expect(foldRegion(LINE, '')).toBe(LINE);
    });
});

describe("the story's one-line description is a seed", () => {
    it('one short line is thin; a written description is not', () => {
        expect(thinDescription(LINE)).toBe(true);
        expect(thinDescription('A smoky jazz club.')).toBe(true);
        expect(thinDescription('')).toBe(false);
        expect(thinDescription('A smoky jazz club. Its back room hides a casino. The owner pays the Syndicate.')).toBe(false);
        expect(thinDescription('x'.repeat(200))).toBe(false);
    });
});

describe('a place the director adds goes in its district', () => {
    const arcadia = map([
        ['city', 'Arcadia City', 'A sprawling neon megacity.'],
        ['night', 'The Nightlife District', 'Clubs, bars and casinos all night.', 'city'],
        ['mile', 'Lodestar Neon Mile', 'The brightest strip of the nightlife district.', 'night'],
        ['docks', 'Bearville Docks', 'The harbour district, cargo ships and container yards.', 'city'],
        ['hq', 'White Cerberus HQ', 'The agency\'s headquarters.', 'city'],
    ]);

    it('named once it is written', () => {
        expect(chooseParent({ brief: "The Medina Syndicate's warehouse", description: `${LINE}. ${REGION}`, ...arcadia })).toEqual({ id: 'mile', why: 'named' });
    });

    it('else where its kind fits (cyberpunk, fantasy)', () => {
        expect(chooseParent({ brief: 'a smugglers\' container yard', description: LINE, ...arcadia })).toEqual({ id: 'docks', why: 'fits' });
        const kingsport = map([
            ['k', 'Kingsport', 'A walled port city.'],
            ['h', 'Harbour Ward', 'The harbour, where the ships come in.', 'k'],
        ]);
        expect(chooseParent({ brief: 'a dockside tavern full of pirates', ...kingsport })).toEqual({ id: 'h', why: 'fits' });
    });
});
