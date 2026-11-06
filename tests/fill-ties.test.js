// A person the story or the director brought in is tied in when filled.
// Assassins Inc: Lena, made by the director and linked to White Cerberus,
// came out "for an underground rebel organization", with no faction and
// no one she knew.
import { sidesOf, withMemberships } from '../src/generate/run.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';

const wc = { id: 'fac_wc', type: 'faction', name: 'White Cerberus', description: 'A mercenary outfit.', base: { members: ['chr_vex', 'chr_doc'] } };
const vex = { id: 'chr_vex', type: 'character', name: 'Vex' };
const doc = { id: 'chr_doc', type: 'character', name: 'Doc' };
const lena = { id: 'chr_lena', type: 'character', name: 'Lena', related_entity_ids: ['fac_wc'], base: { description: 'skilled in stealth' } };
const order = { id: 'fac_ord', type: 'faction', name: 'Order of the Ash', description: 'Knights.', base: { members: ['chr_bran'] } };
const bran = { id: 'chr_bran', type: 'character', name: 'Ser Brannoc' };
const squire = { id: 'chr_sq', type: 'character', name: 'Tam', related_entity_ids: ['fac_ord'], base: {} };
const all = { faction: [wc, order], character: [vex, doc, lena, bran, squire] };

describe('a filled person tied in', () => {
    it('takes the side State Engine links them to, with its people', () => {
        const [side] = sidesOf(lena, { all, relations: [] });
        expect(side).toMatchObject({ id: 'fac_wc', name: 'White Cerberus', members: ['chr_vex', 'chr_doc'] });
        expect(sidesOf(squire, { all, relations: [] })[0]).toMatchObject({ name: 'Order of the Ash', members: ['chr_bran'] });
    });
    it('the fill is asked for its ties, names the side\'s people, and its own words make it a member', () => {
        const type = { id: 'character', noun: 'character' };
        const { user } = buildGenerationPrompt({ task: 'fill', tieUp: true, type, fields: [], relationNames: ['White Cerberus', 'Vex', 'Doc'], sides: [{ name: 'White Cerberus', description: 'A mercenary outfit.', ties: [], members: ['Vex', 'Doc'] }] });
        expect(user).toContain('its people include: Vex, Doc');
        expect(user).toMatch(/"relations": up to THREE existing entries.*Its side first \("member of"\)/);
        expect(buildGenerationPrompt({ task: 'fill', type, fields: [], relationNames: ['Vex'] }).user).not.toContain('"relations"');
        const joined = withMemberships([{ otherId: 'chr_vex', name: 'Vex', kind: 'works with' }], 'Surveillance Specialist for White Cerberus', [wc]);
        expect(joined[0]).toMatchObject({ otherId: 'fac_wc', kind: expect.stringMatching(/member|works for|serves/) });
        expect(joined).toContainEqual({ otherId: 'chr_vex', name: 'Vex', kind: 'works with' });
    });
});
