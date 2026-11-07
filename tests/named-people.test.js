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

    // Cyril's post: 'one of Enrique's men, Delvin "Ice" Timmors'. The model
    // answered with a form the post never has word for word - no one made.
    it('knows a name written with a nickname inside, by any of its forms', () => {
        const post = { text: 'Cyril found himself remembering one of Enrique\'s men, Delvin "Ice" Timmors. He was good with drones. Ice would think his drone had failed.', known: ['Cyril', 'Enrique Medina'] };
        const delvin = { name: 'Delvin Timmors', description: "Enrique's drone man.", aliases: ['Ice', 'Ice Timmors'] };
        for (const said of ['Delvin Timmors', 'Ice Timmors', 'Delvin "Ice" Timmors', 'Delvin “Ice” Timmors', 'Ice']) {
            expect(readPeople(`${said} | Enrique's drone man.`, post)).toEqual([delvin]);
        }
        // Two forms of him are one person.
        expect(readPeople("Delvin Timmors | Enrique's drone man.\nIce | the same", post)).toHaveLength(1);
        // Known by his nickname already: not made again.
        expect(readPeople("Delvin Timmors | Enrique's drone man.", { ...post, known: ['Ice'] })).toEqual([]);
        // A nickname in parentheses too.
        expect(readPeople('Maria Vos | a fixer', { text: 'They called on Maria (Needle) Vos.' })[0]).toEqual({ name: 'Maria Vos', description: 'a fixer', aliases: ['Needle', 'Needle Vos'] });
    });

    it('matches a name as written, not inside another word', () => {
        expect(namedInText('Karin smiled', 'Arin')).toBe(false);
        expect(namedInText('Arin smiled', 'Arin')).toBe(true);
        expect(namedInText('the arin tree', 'Arin')).toBe(false);
    });
});
