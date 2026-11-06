// Stepping out of a place is setting out. Assassins Inc: "Cyril stepped out
// into the street outside the Signal Box" - the director's briefing was all
// Cyril's own doing, so nothing was left of it, and the scene stayed in the
// Common Room as the team left for the museum.
import { headingAlong } from '../src/library/routes.js';

const ways = [{ id: 'sb', names: ['The Signal Box'] }, { id: 'arm', names: ['The Armory'] }];

describe('stepping out', () => {
    it('is setting out, and outside a place is around it', () => {
        expect(headingAlong('Cyril stepped out into the street outside the Signal Box. It was cool outside.', ways)).toMatchObject({ id: 'sb', outside: true });
        expect(headingAlong('Mara slipped out of the tavern and into the Old Market.', [{ id: 'mk', names: ['Old Market'] }])).toMatchObject({ id: 'mk' });
        expect(headingAlong('Okafor exited the airlock onto Deck Four.', [{ id: 'd4', names: ['Deck Four'] }])).toMatchObject({ id: 'd4' });
        expect(headingAlong('Detective Hale walked out to Granite Plaza.', [{ id: 'gp', names: ['Granite Plaza'] }]).outside).toBeUndefined();
    });
    it('not a plan to', () => {
        expect(headingAlong('We will step outside the Signal Box later.', ways)).toBeNull();
        expect(headingAlong('Cyril looked at the Signal Box from his window.', ways)).toBeNull();
    });
});
