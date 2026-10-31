import { spokenOf } from '../src/guidance/spoken.js';
import { buildGuidance, guidanceParts, buildCast } from '../src/guidance/build.js';

const riven = { id: 'chr_riven', name: 'Riven', aliases: ['The Ghost'], base: { role: 'A skilled hacker and information broker, operating in the shadowy underbelly of Arcadia City.' } };
const galice = { id: 'chr_galice', name: 'Galice Buckar', base: { role: 'Lead Cyberdeck Developer' } };
const cyril = { id: 'chr_cyril', name: 'Cyril Moriarty', base: { role: 'An enigmatic figure' } };
const tiago = { id: 'chr_tiago', name: 'Tiago Moriarty', base: {} };
const factions = new Map([['fac_wc', 'White Cerberus'], ['fac_ms', 'Medina Syndicate']]);
const opts = (recentText, more = {}) => ({
    recentText,
    here: ['chr_galice', 'chr_cyril'],
    skip: ['chr_cyril'],
    memberships: new Map([['chr_riven', ['fac_wc']], ['chr_galice', ['fac_wc']]]),
    factionName: (id) => factions.get(id) ?? '',
    relations: [
        { from: 'chr_riven', to: 'fac_ms', kind: 'distrusts' },
        { from: 'chr_riven', to: 'fac_wc', kind: 'member of' },
        { from: 'chr_riven', to: 'chr_tiago', kind: 'distrusts' },
    ],
    ...more,
});

describe('people spoken of but not here', () => {
    it('gives an absent person named in the chat their side, role and stances', () => {
        const out = spokenOf([riven, galice, cyril], opts('"Vex has called a briefing about our next moves regarding Riven and the Medina Syndicate."'));
        expect(out).toEqual([{ name: 'Riven', sides: ['White Cerberus'], role: riven.base.role, stances: ['distrusts Medina Syndicate'] }]);
    });

    it('finds them by an alias, and never lists those here, the player or the skipped', () => {
        expect(spokenOf([riven, galice, cyril], opts('The Ghost slipped out before dawn.')).map((p) => p.name)).toEqual(['Riven']);
        expect(spokenOf([riven, galice, cyril], opts('Galice and Cyril talk about Riven.', { here: ['chr_riven', 'chr_galice'] }))).toEqual([]);
        expect(spokenOf([riven, galice, cyril], opts('Cyril Moriarty sleeps.', { here: [] }))).toEqual([]);
    });

    it('does not take a shared family name for one person, and skips people with nothing to say', () => {
        expect(spokenOf([cyril, tiago], opts('The Moriarty family runs the docks.', { here: [], skip: [] }))).toEqual([]);
        expect(spokenOf([tiago], opts('Tiago Moriarty was seen at the docks.', { here: [], skip: [] }))).toEqual([]);
    });

    it('becomes a guidance line in the scene part, with the rule that a side holds while away', () => {
        const spoken = spokenOf([riven, galice, cyril], opts('next moves regarding Riven'));
        const built = buildGuidance({ spoken });
        const text = guidanceParts(built).guidance_scene;
        expect(text).toContain('Spoken of, but not here: Riven - of White Cerberus, a skilled hacker and information broker');
        expect(text).toContain('; distrusts Medina Syndicate.');
        expect(text).toMatch(/never made an attacker, enemy or ally of a side/);
        expect(buildGuidance({ spoken: [] }).sections.find((s) => s.key === 'spoken').mode).toBe('empty');
        expect(buildGuidance({ spoken, sections: { spoken: false } }).text).not.toContain('Riven');
    });
});

describe('people here who stand against each other', () => {
    it('are told their stance holds, with the story\'s reason', () => {
        const cast = [{ name: 'Cyril', player: true }, { name: 'Riven', relations: ['toward Cyril: rival/antagonist, antagonistic, stable - Riven accuses Cyril of complicity with Omicron Innovations due to his family\'s legacy'] }];
        const text = buildCast({ cast });
        expect(text).toContain('Toward Cyril: rival/antagonist, antagonistic, stable - Riven accuses Cyril of complicity with Omicron Innovations due to his family\'s legacy.');
        expect(text).toContain('never greets the other as a stranger');
        expect(buildCast({ cast: [{ name: 'Cyril', player: true }, { name: 'Vex' }] })).not.toContain('never greets the other as a stranger');
    });
});
