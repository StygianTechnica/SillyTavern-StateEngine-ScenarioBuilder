// "Enrique's operatives", taken in as a character, are a crowd: a creature
// kind that turns up in numbers.
import { looksLikeGroup } from '../src/library/as-group.js';

describe('a name that reads as a group', () => {
    it('is offered as a creature kind', () => {
        for (const n of ["Enrique's operatives", 'Medina Syndicate goons', 'the guards', 'a pack of thugs', 'Imperial stormtroopers', 'bandits']) expect(looksLikeGroup(n)).toBe(true);
    });
    it('not one person', () => {
        for (const n of ['Inji Miyama', 'Zane', 'Ser Brannoc', 'Doc', 'unnamed cyborg guard']) expect(looksLikeGroup(n)).toBe(false);
    });
});
