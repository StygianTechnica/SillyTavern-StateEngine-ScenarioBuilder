// A new place left to find its own spot goes in the place it is part of:
// one its idea names, a district for its kind, else the city at the top.
import { chooseParent } from '../src/generate/place-parent.js';
import { purposeOfKind } from '../src/generate/fit-place.js';

const map = (places) => {
    const parents = {};
    const locations = places.map(([id, name, description, parent]) => {
        if (parent) parents[id] = parent;
        return { id, name, description };
    });
    return { locations, parents };
};

const arcadia = map([
    ['city', 'Arcadia City', 'A sprawling neon megacity.'],
    ['neon', 'The Neon Mile', 'The nightlife district: clubs, bars and casinos all night.', 'city'],
    ['docks', 'Bearville Docks', 'The harbour district, cargo ships and container yards.', 'city'],
    ['sig', 'The Signal Box', 'A bar in the Neon Mile.', 'neon'],
]);

describe('where a new place goes', () => {
    it('goes in a place its idea names - the most specific one', () => {
        expect(chooseParent({ brief: 'a back room of The Signal Box', ...arcadia })).toEqual({ id: 'sig', why: 'named' });
        expect(chooseParent({ brief: 'a noodle stand on the neon mile', ...arcadia })).toEqual({ id: 'neon', why: 'named' });
        expect(chooseParent({ brief: 'a warehouse', description: 'It stands at the edge of Bearville Docks.', ...arcadia })).toEqual({ id: 'docks', why: 'named' });
    });

    it('goes in a district for its kind (cyberpunk)', () => {
        expect(purposeOfKind('a jazz club with a secret back door')).toBe('pleasure');
        expect(chooseParent({ brief: 'a jazz club with a secret back door', ...arcadia })).toEqual({ id: 'neon', why: 'fits' });
        expect(chooseParent({ brief: 'a container yard run by smugglers', ...arcadia })).toEqual({ id: 'docks', why: 'fits' });
    });

    it('goes in the city when no district fits, or for a surprise', () => {
        expect(chooseParent({ brief: 'a hacker\'s apartment', ...arcadia })).toEqual({ id: 'city', why: 'top' });
        expect(chooseParent({ brief: '', ...arcadia })).toEqual({ id: 'city', why: 'top' });
    });

    it('works the same in a fantasy city', () => {
        const city = map([
            ['k', 'Kingsport', 'A walled port city of the old kingdom.'],
            ['t', 'Temple Quarter', 'The holy district, shrines and monasteries.', 'k'],
            ['h', 'Harbour Ward', 'The harbour, where the ships come in.', 'k'],
        ]);
        expect(chooseParent({ brief: 'a shrine to a forgotten sea god', ...city })).toEqual({ id: 't', why: 'fits' });
        expect(chooseParent({ brief: 'a dockside tavern full of pirates', ...city })).toEqual({ id: 'h', why: 'fits' });
        expect(chooseParent({ brief: 'a wizard\'s tower', ...city })).toEqual({ id: 'k', why: 'top' });
    });

    it('works in a real-world city', () => {
        const london = map([
            ['l', 'London', 'The capital.'],
            ['soho', 'Soho', 'The entertainment district, bars, theatres and clubs.', 'l'],
            ['city', 'The City', 'The financial district, banks and offices.', 'l'],
        ]);
        expect(chooseParent({ brief: 'a members-only cocktail bar', ...london }).id).toBe('soho');
        expect(chooseParent({ brief: 'an investment bank on its last legs', ...london }).id).toBe('city');
    });

    // Not every map is a city of districts: a kingdom of provinces and
    // towns, a country of cities.
    describe('follows how the map is laid out', () => {
        const realm = map([
            ['valdria', 'Kingdom of Valdria', 'An old kingdom of river valleys.'],
            ['ost', 'Ostmark Province', 'The eastern march.', 'valdria'],
            ['bren', 'Brennhold', 'A walled trading town on the river.', 'ost'],
            ['tan', "Tanners' Ward", 'The industrial ward: tanneries, warehouses and workshops.', 'bren'],
            ['inn', 'The Gilded Goose', 'An inn by the gate.', 'bren'],
            ['wes', 'Westfold Province', 'The western hills.', 'valdria'],
            ['cael', 'Caelmoor', 'A mining town.', 'wes'],
            ['pit', 'The Pit Ward', 'The industrial ward of Caelmoor, all forges and warehouses.', 'cael'],
        ]);

        it("a building goes in the town the scene is in, or its district - not the kingdom (fantasy)", () => {
            expect(chooseParent({ brief: "a smugglers' warehouse", sceneId: 'inn', ...realm })).toEqual({ id: 'tan', why: 'fits' });
            expect(chooseParent({ brief: 'a wizard\'s tower', sceneId: 'inn', ...realm })).toEqual({ id: 'bren', why: 'top' });
            // Two towns have a ward for it: the scene's town decides, and
            // without a scene it is not guessed.
            expect(chooseParent({ brief: "a smugglers' warehouse", sceneId: 'cael', ...realm })).toEqual({ id: 'pit', why: 'fits' });
            expect(chooseParent({ brief: "a smugglers' warehouse", ...realm })).toEqual({ id: 'valdria', why: 'top' });
        });

        it('a town goes in the province the scene is in', () => {
            expect(chooseParent({ brief: 'a fishing village', sceneId: 'inn', ...realm })).toEqual({ id: 'ost', why: 'top' });
        });

        it('a city in a country (real world)', () => {
            const japan = map([
                ['jp', 'Japan', 'An island nation.'],
                ['tokyo', 'Tokyo', 'The capital city.', 'jp'],
                ['kabuki', 'Kabukicho', 'The red-light district: bars, clubs and hostess clubs.', 'tokyo'],
                ['osaka', 'Osaka', 'A port city.', 'jp'],
            ]);
            expect(chooseParent({ brief: 'a jazz club', sceneId: 'osaka', ...japan })).toEqual({ id: 'osaka', why: 'top' });
            expect(chooseParent({ brief: 'a jazz club', sceneId: 'tokyo', ...japan })).toEqual({ id: 'kabuki', why: 'fits' });
            expect(chooseParent({ brief: 'a ramen shop', sceneId: 'kabuki', ...japan })).toEqual({ id: 'tokyo', why: 'top' });
        });
    });

    it('with several tops, uses the one the story is in (sci-fi), else leaves it', () => {
        const space = map([
            ['s', 'Halcyon Station', 'An orbital station.'],
            ['r', 'Ring Market', 'The market ring: stalls and traders.', 's'],
            ['p', 'Planet Vex', 'A desert world below.'],
            ['camp', 'Dune Camp', 'A camp.', 'p'],
        ]);
        expect(chooseParent({ brief: 'a pawn shop', sceneId: 'r', ...space })).toEqual({ id: 'r', why: 'fits' });
        expect(chooseParent({ brief: 'a crashed shuttle', sceneId: 'camp', ...space })).toEqual({ id: 'p', why: 'top' });
        expect(chooseParent({ brief: 'a crashed shuttle', ...space })).toBe(null);
        expect(chooseParent({ brief: 'anything', locations: [] })).toBe(null);
    });
});
