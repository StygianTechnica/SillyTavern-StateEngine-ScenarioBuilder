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

import { buildGroupPrompt } from '../src/library/as-group.js';
describe('the group\'s description', () => {
    it('is asked for as a type, plural, without one person\'s details', () => {
        const { user } = buildGroupPrompt({ name: "Enrique's operatives", description: 'He is a tall man with a scar across his cheek.', role: 'Enforcer for the Medina Syndicate' });
        expect(user).toContain('"Enrique\'s operatives" are not one person but a group');
        expect(user).toContain('plural throughout ("they", never he or she)');
        expect(user).toContain('dropping anything only one person could have');
        expect(user).toContain('Role: Enforcer for the Medina Syndicate');
    });
});
