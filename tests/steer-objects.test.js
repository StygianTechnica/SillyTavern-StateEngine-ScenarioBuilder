import { buildSteerObjectsPrompt, readSteerObjects } from '../src/planner/prompts.js';

const steer = 'Remus and Varyn reach Ashfall, the city under the volcano. Lord Maziel, a fallen paladin with a silver mask, hunts them for the Pale Choir. The final clash is in the Sunken Temple beneath Ashfall.';

describe('the people and places a steer names', () => {
    it('asks for them with the user\'s words and the known names', () => {
        const { prompt, system } = buildSteerObjectsPrompt({ steer, known: ['Varyn'], userName: 'Remus' });
        expect(prompt).toContain(steer);
        expect(prompt).toContain('ALREADY IN THE WORLD');
        expect(prompt).toContain('Varyn');
        expect(system).toContain('Remus is the player character');
    });

    it('keeps the new ones the user wrote, with their details', () => {
        const json = {
            people: [
                { name: 'Lord Maziel', role: 'antagonist', details: 'A fallen paladin with a silver mask who hunts them for the Pale Choir.' },
                { name: 'Varyn', role: 'ally', details: 'known' },
                { name: 'Remus', role: 'protagonist', details: 'the player' },
                { name: 'Seraphine', role: 'other', details: 'invented' },
            ],
            places: [
                { name: 'Ashfall', inside: '', details: 'The city under the volcano.' },
                { name: 'The Sunken Temple', inside: 'Ashfall', details: 'Beneath Ashfall; the final clash.' },
            ],
            groups: [{ name: 'The Pale Choir', details: 'Maziel hunts for them.' }],
        };
        const out = readSteerObjects(json, { steer, userName: 'Remus', isKnown: (n) => n === 'Varyn' });
        expect(out.map((o) => [o.type, o.name, o.role, o.inside])).toEqual([
            ['character', 'Lord Maziel', 'antagonist', ''],
            ['location', 'Ashfall', '', ''],
            ['location', 'The Sunken Temple', '', 'Ashfall'],
            ['faction', 'The Pale Choir', '', ''],
        ]);
        expect(out[0].details).toContain('silver mask');
    });

    it('nothing from nothing', () => {
        expect(readSteerObjects(null, { steer })).toEqual([]);
        expect(readSteerObjects({ people: [] }, { steer })).toEqual([]);
    });
});
