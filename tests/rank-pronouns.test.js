// Assassins Inc: with Adam Miller away, the narrator gave his lines to
// Galice - "Galice stepped forward, his voice firm but measured... You and
// Cyril will be leading the infiltration team" - and Archivist wrote down
// "Galice assigns roles for the operation".
import { pronounSlips, commandSlips, pronounText } from '../src/guidance/canon.js';

const galice = { id: 'gal', name: 'Galice Buckar', aliases: ['Galice'], gender: 'f', factionIds: ['wc'] };
const inji = { id: 'inj', name: 'Inji Miyama', aliases: ['Inji'], gender: 'm', factionIds: ['wc'] };
const cyril = { id: 'cyr', name: 'Cyril', aliases: [], gender: 'm', player: true, factionIds: ['wc'] };
const others = ['Galice Buckar', 'Inji Miyama', 'Cyril', 'Adam Miller', 'Zane', 'Doc'];
const leaders = new Map([['wc', [{ id: 'adam', name: 'Adam Miller' }]]]);
const reply662 = `Galice stepped forward, his voice firm but measured. "Alright, let's put our differences aside for now and focus on the task at hand. We have an operation to execute, and I expect everyone to carry out their roles with professionalism and dedication."

He turned to Inji, his eyes piercing. "You and Cyril will be leading the infiltration team."`;

describe('the wrong pronouns', () => {
    it('his for her, before anyone else is named', () => {
        expect(pronounSlips([galice, inji, cyril], reply662, { others })).toEqual([{ name: 'Galice Buckar', gender: 'f' }]);
        expect(pronounSlips([galice, inji], 'Galice turned to Inji and took his hand.', { others })).toEqual([]);
        expect(pronounSlips([{ name: 'Ser Brannoc', aliases: ['Brannoc'], gender: 'm' }], 'Brannoc drew her sword.', { others: [] })).toEqual([{ name: 'Ser Brannoc', gender: 'm' }]);
        expect(pronounSlips([galice], '"His plan is good," Galice said.', { others })).toEqual([]);
    });
});

describe('the absent leader\'s orders', () => {
    it('given by someone here, in the reply or Archivist\'s notes', () => {
        expect(commandSlips([galice, inji, cyril], leaders, [reply662])).toEqual([{ name: 'Galice Buckar', leader: 'Adam Miller', faction: 'wc' }]);
        expect(commandSlips([galice, inji], leaders, ['- Galice assigns roles for the operation (witnessed by Inji Miyama)'])).toHaveLength(1);
        // The leader here, or one who leads it: no slip.
        expect(commandSlips([galice, { id: 'adam', name: 'Adam Miller', aliases: ['Adam'], factionIds: ['wc'] }], leaders, [reply662])).toEqual([]);
        expect(commandSlips([inji], leaders, ['Inji pointed at the map. "I\'ll take point here."'])).toEqual([]);
        // Across genres: a knight giving the absent Lord Commander's orders.
        const squire = { id: 'sq', name: 'Ser Tam', aliases: ['Tam'], factionIds: ['watch'] };
        expect(commandSlips([squire], new Map([['watch', [{ id: 'lc', name: 'Lord Commander Hale' }]]]), ['Ser Tam took command of the wall that night.'])).toHaveLength(1);
    });
    it('put right in the note', () => {
        const text = pronounText([{ name: 'Galice Buckar', gender: 'f' }], [{ name: 'Galice Buckar', leader: 'Adam Miller' }]);
        expect(text).toContain('Correction: Galice Buckar is a woman - she, her.');
        expect(text).toContain('Galice Buckar does not give the orders - Adam Miller does, and Adam Miller is not here.');
    });
});
