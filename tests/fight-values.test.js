import { fightValues } from '../src/director/fight.js';
import { FIGHT_VARIABLES, ALL_VARIABLES } from '../src/preset/blueprint.js';

describe('the fight as variables, for a panel', () => {
    const fight = { round: 2, ended: false, fighters: [
        { name: 'Graxx', side: 'foe', condition: 'wounded' },
        { name: 'Varyn', side: 'ally', condition: 'hurt' },
        { name: 'two zombies', side: 'foe', condition: 'unhurt' },
    ] };
    const ids = { graxx: 'chr_g', varyn: 'chr_v' };

    it('is all empty with no fight, or once it ended', () => {
        const none = { fight_active: false, fight_round: 0, fight_summary: '', fight_fighters: [], fight_allies: [], fight_foes: [] };
        expect(fightValues(null)).toEqual(none);
        expect(fightValues({ ...fight, ended: true })).toEqual(none);
    });

    it('gives the round, a line per fighter, and the characters by side', () => {
        const v = fightValues(fight, 5, (name) => ids[name.toLowerCase()] ?? '');
        expect(v).toMatchObject({ fight_active: true, fight_round: 2, fight_allies: ['chr_v'], fight_foes: ['chr_g'] });
        expect(v.fight_summary).toBe('Round 2 of at most 5: Graxx wounded, Varyn hurt, two zombies unhurt');
        expect(v.fight_fighters).toEqual(['Graxx (foe) - wounded', 'Varyn (ally) - hurt', 'two zombies (foe) - unhurt']);
    });

    it('has a preset variable for each value', () => {
        const names = FIGHT_VARIABLES.map(([name]) => name);
        expect(names.sort()).toEqual(Object.keys(fightValues(null)).sort());
        for (const name of names) expect(ALL_VARIABLES.some(([n]) => n === name)).toBe(true);
    });
});
