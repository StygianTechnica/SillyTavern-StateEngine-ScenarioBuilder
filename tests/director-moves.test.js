// The director's MOVE lines and creatures: a description written as a
// place is cleaned or refused, a room's longer name finds the room, and
// creatures the situation names join the scene.
import { cleanPlaceName, looksLikePlaceName, creatureNamedIn, matchPlace, parseDirectorNote, parentForNewPlace, placeNamedIn } from '../src/director/prompt.js';

describe('MOVE places', () => {
    it('strips the lead-ins and tags the model adds', () => {
        expect(cleanPlaceName("Inside Niamh's fortress gate, indoors")).toBe("Niamh's fortress gate");
        expect(cleanPlaceName("Still inside Niamh's fortress gate chamber, indoors")).toBe("Niamh's fortress gate chamber");
        expect(cleanPlaceName('Back to the Great Hall (outdoors)')).toBe('the Great Hall');
        expect(cleanPlaceName('The Junkyard')).toBe('The Junkyard');
        expect(parseDirectorNote("Briefing.\nMOVE | Inside Niamh's fortress gate, indoors | none | indoors").move.place).toBe("Niamh's fortress gate");
    });

    it('refuses a sentence as a new place name', () => {
        expect(looksLikePlaceName("Remus leans against a pole inside Niamh's fortress gate", ['Remus'])).toBe(false);
        expect(looksLikePlaceName('Where the old road ends', [])).toBe(false);
        expect(looksLikePlaceName('the market, by the well', [])).toBe(false);
        expect(looksLikePlaceName("Remus's tent", ['Remus'])).toBe(false);
        expect(looksLikePlaceName('The Junkyard', ['Remus'])).toBe(true);
        expect(looksLikePlaceName('Ruined temple of the north', ['Remus'])).toBe(true);
    });

    it('finds a known place inside a longer name, the longest match first', () => {
        const places = [{ id: 'loc_fort', name: "Niamh's Fortress" }, { id: 'loc_gate', name: "Niamh's fortress gate" }, { id: 'loc_hall', name: 'Great Hall' }];
        expect(matchPlace("Niamh's fortress gate chamber", places)?.id).toBe('loc_gate');
        expect(matchPlace("the walls of Niamh's Fortress", places)?.id).toBe('loc_fort');
        expect(matchPlace('Graveyard by the ruined temple', places)).toBeNull();
    });
});

describe('creatures the scene names', () => {
    it('matches every distinctive word, word stems allowed', () => {
        expect(creatureNamedIn('Skeletal warriors surge at the breach', { name: 'Skeleton Warriors' })).toBe(true);
        expect(creatureNamedIn('A lone zombie lurches out of the dark', { name: 'zombies' })).toBe(true);
        expect(creatureNamedIn('The bone host presses on', { name: 'Skeleton Warriors', aliases: ['Bone Host'] })).toBe(true);
        expect(creatureNamedIn('The warriors rest by the fire', { name: 'Skeleton Warriors' })).toBe(false);
        expect(creatureNamedIn('', { name: 'zombies' })).toBe(false);
    });
});

describe('where the director puts what it adds', () => {
    const chain = [
        { id: 'loc_quarters', names: ["Niamh's quarters indoors", "Niamh's quarters"] },
        { id: 'loc_fort', names: ["Niamh's Fortress"] },
        { id: 'loc_world', names: ['Alvarand'] },
    ];

    it('puts a new place inside where the scene is only when it says it is part of it', () => {
        expect(parentForNewPlace({ name: 'War room', description: "A cramped chamber off Niamh's quarters." }, chain)).toBe('loc_quarters');
        expect(parentForNewPlace({ name: 'East tower', description: "The tallest tower of Niamh's Fortress." }, chain)).toBe('loc_fort');
        expect(parentForNewPlace({ name: 'Cache chamber', description: 'A sealed vault beneath the ruined temple to the northeast.' }, chain)).toBe('loc_world');
        expect(parentForNewPlace({ name: 'Somewhere' }, [])).toBeNull();
    });

    it('puts a new item where its own words say, when that place is known', () => {
        const places = [{ id: 'loc_grave', name: 'Graveyard of the ruined temple', aliases: ['the old graveyard'] }, { id: 'loc_temple', name: 'Ruined temple' }];
        expect(placeNamedIn({ name: "Cache of Elyon's relics", description: 'Buried in the old graveyard near the ruined temple.' }, places)).toBe('loc_grave');
        expect(placeNamedIn({ name: 'Relics', description: 'Hidden somewhere in the north.' }, places)).toBeNull();
    });
});
