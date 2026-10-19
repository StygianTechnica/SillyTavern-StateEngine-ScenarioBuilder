// People the story names become characters: the short question's answer is
// kept only for names the messages really hold and the library lacks.
import { buildPeoplePrompt, readPeople, namedInText } from '../src/director/people.js';

const text = 'Graxx: "Kael and Arin are both seasoned veterans," he explained. "Kael is a brutal yet precise fighter. Arin is our resident archer and scout." Varyn nodded at Remus.';
const input = { text, known: ['Graxx', 'Varyn Vance', 'Varyn', 'Niamh', 'Morvath'], playerNames: ['Remus'] };

describe('newly named people', () => {
    it('asks with the messages and the names already known', () => {
        const p = buildPeoplePrompt(input);
        expect(p.user).toContain('Kael and Arin');
        expect(p.user).toContain('Remus, Graxx, Varyn Vance, Varyn, Niamh, Morvath');
        expect(p.user).toMatch(/Name \| what the messages say/);
    });

    it('keeps the new names the messages hold', () => {
        expect(readPeople('Kael | A brutal yet precise swordsman.\nArin | The quiet archer and scout.', input)).toEqual([
            { name: 'Kael', description: 'A brutal yet precise swordsman.' },
            { name: 'Arin', description: 'The quiet archer and scout.' },
        ]);
    });

    it('drops known names, the player, names not in the messages and non-names', () => {
        const answer = '- Varyn | a rogue\n1. Remus | the hero\nBrom | a smith\nthe guards | soldiers\nKael | a fighter\nKael | again';
        expect(readPeople(answer, input)).toEqual([{ name: 'Kael', description: 'a fighter' }]);
    });

    it('reads NONE as no one, and nothing readable as unreadable', () => {
        expect(readPeople('NONE', input)).toEqual([]);
        expect(readPeople('None.', input)).toEqual([]);
        expect(readPeople('There are some new people here.', input)).toBeNull();
    });

    it('matches a name as written, not inside another word', () => {
        expect(namedInText('Karin smiled', 'Arin')).toBe(false);
        expect(namedInText('Arin smiled', 'Arin')).toBe(true);
        expect(namedInText('the arin tree', 'Arin')).toBe(false);
    });
});
