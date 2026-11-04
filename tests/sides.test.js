// Assassins Inc: Dr. Adrigo Tole, of Omicron Innovations, at White
// Cerberus's safehouse with Vex and Inji; White Cerberus distrusts Omicron.
// The narrator had him speak of "our recent dealings" for White Cerberus.
import { sidesApart, sidesText } from '../src/guidance/sides.js';
import { buildCast, buildNow } from '../src/guidance/build.js';

const names = { wc: 'White Cerberus', omicron: 'Omicron Innovations', medina: 'Medina Syndicate' };
const nameOf = (id) => names[id] ?? '';
const relations = [
    { from: 'wc', to: 'omicron', kind: 'distrusts' },
    { from: 'medina', to: 'omicron', kind: 'ally' },
];
const scene = [
    { name: 'Cyril', player: true, factionIds: ['wc'] },
    { name: 'Vex', factionIds: ['wc'] },
    { name: 'Inji Miyama', factionIds: ['wc'] },
    { name: 'Doctor Adrigo Tole', factionIds: ['omicron'] },
];

describe('whose side someone here is on', () => {
    it('names the outsider, and the distrust between the sides', () => {
        const sides = sidesApart(scene, relations, nameOf);
        expect(sides).toEqual([{ name: 'Doctor Adrigo Tole', of: 'Omicron Innovations', apart: 'White Cerberus', why: 'White Cerberus distrusts Omicron Innovations' }]);
        expect(sidesText(sides)).toBe('Doctor Adrigo Tole is of Omicron Innovations, not of White Cerberus (White Cerberus distrusts Omicron Innovations): Doctor Adrigo Tole works for Omicron Innovations and their own aims, never for White Cerberus\'s benefit, and never speaks as one of White Cerberus.');
    });

    it('says nothing between allies, or when everyone is of one side', () => {
        expect(sidesApart([{ name: 'Enrique', factionIds: ['medina'] }, { name: 'Tole', factionIds: ['omicron'] }], relations, nameOf)).toEqual([]);
        expect(sidesApart(scene.slice(0, 3), relations, nameOf)).toEqual([]);
        expect(sidesApart([...scene.slice(0, 3), { name: 'Stranger' }], relations, nameOf)).toEqual([]);
    });

    it('reaches the narrator in the cast, and in the chat', () => {
        const sides = sidesText(sidesApart(scene, relations, nameOf));
        const cast = buildCast({ cast: [{ name: 'Cyril', player: true }, { name: 'Doctor Adrigo Tole', role: 'Lead Cybernetics Researcher at Omicron Innovations', factions: ['Omicron Innovations'] }], sides });
        expect(cast).toContain('- Doctor Adrigo Tole: Lead Cybernetics Researcher at Omicron Innovations. Of Omicron Innovations.');
        expect(cast).toContain('Sides: Doctor Adrigo Tole is of Omicron Innovations, not of White Cerberus');
        expect(buildNow({ sides, cast: [{ name: 'Cyril', player: true }] })).toContain('never for White Cerberus\'s benefit');
    });
});
