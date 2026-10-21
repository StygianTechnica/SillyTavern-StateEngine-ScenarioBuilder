import { contextualPlace, nearPlaces, placeWords, suggestParents } from '../src/library/place-context.js';

const places = [
    { id: 'road', name: 'The King\'s Road' },
    { id: 'roadside', name: 'Roadside Ruins', aliases: ['the old waystation'] },
    { id: 'cellar', name: 'Collapsed Cellar' },
    { id: 'temple', name: 'Temple Ruins of Belatorre' },
    { id: 'belatorre', name: 'Belatorre' },
    { id: 'graveyard', name: 'Belatorre Graveyard' },
    { id: 'structure', name: 'Concrete Structure', description: 'A storage building in Belatorre Graveyard.' },
];
const parents = { roadside: 'road', cellar: 'roadside', temple: 'belatorre', graveyard: 'belatorre' };

describe('a place read in context', () => {
    it('takes "the ruins" as the ruins the story is at, not the ones it is heading for', () => {
        const meant = contextualPlace({ observedId: 'temple', currentId: 'roadside', places, parents, recentText: 'They made camp among the ruins and waited for dawn.' });
        expect(meant).toEqual({ id: 'roadside', why: '"ruin" here is Roadside Ruins, not Temple Ruins of Belatorre' });
    });

    it('lets the scene go when the story names what only the far place has', () => {
        expect(contextualPlace({ observedId: 'temple', currentId: 'roadside', places, parents, recentText: 'At last they reached the temple ruins.' })).toBe(null);
        expect(contextualPlace({ observedId: 'temple', currentId: 'roadside', places, parents, recentText: 'The ruins of Belatorre rose ahead.' })).toBe(null);
    });

    it('lets a move within the place stand, and leaves alone what the story never said', () => {
        expect(contextualPlace({ observedId: 'cellar', currentId: 'roadside', places, parents, recentText: 'down into the ruins' })).toBe(null);
        expect(contextualPlace({ observedId: 'temple', currentId: 'roadside', places, parents, recentText: 'They rode on all day.' })).toBe(null);
    });

    it('knows what is near without travelling', () => {
        expect(nearPlaces('roadside', { places, parents })).toEqual(['roadside', 'road', 'cellar']);
        expect([...placeWords("Belatorre's old Ruins")]).toEqual(['belatorre', 'ruin']);
    });
});

describe('a parent for a place', () => {
    it('suggests the place its description names, then where the scene came from', () => {
        const history = [{ before: { locationId: 'graveyard' }, after: { locationId: 'structure' } }];
        expect(suggestParents(places.find((p) => p.id === 'structure'), { places, parents, history })).toEqual([
            { id: 'graveyard', why: 'its description names Belatorre Graveyard' },
            { id: 'belatorre', why: 'its description names Belatorre' },
        ]);
    });

    it('never suggests a place inside it', () => {
        expect(suggestParents({ id: 'roadside', name: 'Roadside Ruins', description: 'Above the Collapsed Cellar.' }, { places, parents: { cellar: 'roadside' } })).toEqual([]);
    });
});
