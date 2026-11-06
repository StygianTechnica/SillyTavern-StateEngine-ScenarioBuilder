// A person the story brings in takes the one side the story gives them.
// Assassins Inc: Victor Reyes, "part of Enrique's crew back in the day",
// came out working for Omicron Innovations - the one company the premise
// names, tied to most of the world's people.
import { storySide } from '../src/generate/run.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';

const world = {
    faction: [
        { id: 'fac_omicron', type: 'faction', name: 'Omicron Innovations', aliases: ['Omicron'] },
        { id: 'fac_medina', type: 'faction', name: 'Medina Syndicate', aliases: ['The Family'], members: ['chr_enrique'] },
        { id: 'fac_cerberus', type: 'faction', name: 'White Cerberus', members: ['chr_zane', 'chr_adam'] },
    ],
    character: [
        { id: 'chr_victor', type: 'character', name: 'Victor Reyes', aliases: ["Enrique's Ghost"] },
        { id: 'chr_enrique', type: 'character', name: 'Enrique Medina' },
        { id: 'chr_zane', type: 'character', name: 'Zane' },
        { id: 'chr_adam', type: 'character', name: 'Adam Miller' },
    ],
};
const relations = [
    { id: 'r1', from: 'fac_medina', to: 'fac_omicron', kind: 'ally', note: 'Omicron provides the syndicate with weapons.', mutual: true },
    { id: 'r2', from: 'fac_cerberus', to: 'fac_medina', kind: 'rival', note: '', mutual: true },
];
const passage = 'Zane continued, "This guy, Victor Reyes - he was part of Enrique\'s crew back in the day, but apparently had some kind of falling out. Anyway, I found records showing that Reyes has been hired by several high-end art galleries recently, including the one we\'re targeting tonight."';

describe('the side the story gives someone it brought in', () => {
    it('is the side of the one whose crew they were - not the speaker\'s', () => {
        const side = storySide(world.character[0], passage, { all: world, relations });
        expect(side.name).toBe('Medina Syndicate');
        expect(side.from).toContain("part of Enrique's crew");
        // Its allies and enemies come with it.
        expect(side.ties.map((t) => t.line).join(' ')).toMatch(/Omicron/);
        expect(side.ties.map((t) => t.line).join(' ')).toMatch(/White Cerberus/);
    });
    it('a faction named beside them', () => {
        expect(storySide(world.character[0], 'Victor Reyes used to run jobs for the Medina Syndicate.', { all: world, relations })?.name).toBe('Medina Syndicate');
    });
    it('none when the story ties them to no one', () => {
        expect(storySide(world.character[0], 'Victor Reyes stood at the bar, nursing a drink.', { all: world, relations })).toBeNull();
        expect(storySide(world.character[0], 'Zane mentioned a man at the bar.', { all: world, relations })).toBeNull();
    });
    it('across genres', () => {
        const fantasy = {
            faction: [{ id: 'f_hand', type: 'faction', name: 'Iron Hand', members: ['c_brann'] }, { id: 'f_crown', type: 'faction', name: 'The Crown' }],
            character: [{ id: 'c_tess', type: 'character', name: 'Tess Marlow' }, { id: 'c_brann', type: 'character', name: 'Old Brann' }],
        };
        expect(storySide(fantasy.character[0], 'Tess Marlow is one of Brann\'s enforcers on the docks.', { all: fantasy })?.name).toBe('Iron Hand');
        const scifi = {
            faction: [{ id: 'f_fleet', type: 'faction', name: 'Terran Fleet' }, { id: 'f_syn', type: 'faction', name: 'Helix Consortium' }],
            character: [{ id: 'c_oka', type: 'character', name: 'Lt. Okafor' }],
        };
        expect(storySide(scifi.character[0], 'Lt. Okafor served with the Terran Fleet for a decade.', { all: scifi })?.name).toBe('Terran Fleet');
        // Named against a side is not being of it.
        const real = {
            faction: [{ id: 'f_fbi', type: 'faction', name: 'FBI' }, { id: 'f_mob', type: 'faction', name: 'Gambino Family' }],
            character: [{ id: 'c_sal', type: 'character', name: 'Sal Russo' }],
        };
        expect(storySide(real.character[0], 'Sal Russo works for the Gambino Family. The FBI is hunting Sal Russo.', { all: real })?.name).toBe('Gambino Family');
    });
});

describe('the fill keeps to that side', () => {
    it('tells the model it belongs there and nowhere else', () => {
        const side = storySide(world.character[0], passage, { all: world, relations });
        const prompt = buildGenerationPrompt({
            task: 'fill', type: { id: 'character', noun: 'character', label: 'Character' }, fields: [{ name: 'role', label: 'Role', kind: 'text' }],
            entry: { name: 'Victor Reyes', values: {} }, person: true,
            sides: [{ name: side.name, description: '', ties: side.ties.map((t) => t.line), from: side.from }],
        });
        const text = JSON.stringify(prompt);
        expect(text).toContain('the story ties it to Medina Syndicate');
        expect(text).toContain('to no other group');
        expect(text).toContain('Tie it to no other faction or company, however large it looms in the setting');
    });
});
