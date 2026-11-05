// The plan wrote about Inji Miyama away from the scene from the name alone
// ("Inji uses her connections") and the narrator was handed it: those out
// of the scene carry he or she too.
import { dossierText } from '../src/director/prompt.js';
import { personGender } from '../src/naming/classify.js';

describe('people out of the scene', () => {
    it('are he or she from their own text', () => {
        expect(personGender({ name: 'Inji Miyama', own: ['Inji is lean and athletic, with a wiry build that belies his intense focus. He has close-cropped white hair.'] })).toBe('m');
    });

    it('carry it in every list of those away', () => {
        const text = dossierText({
            cast: [{ name: 'Cyril', player: true }],
            nearby: [{ name: 'Inji Miyama', gender: 'm', role: 'Elite Agent' }, { name: 'Vex', gender: 'f' }, { name: 'Zane' }],
            elsewhere: [{ name: 'Galice Buckar', gender: 'f' }],
            barred: [{ name: 'Enrique Medina', gender: 'm' }],
            ground: { place: 'The Signal Box', holders: ['White Cerberus'] },
        });
        expect(text).toContain('- Inji Miyama [he] (Elite Agent)');
        expect(text).toContain('- Vex [she]');
        expect(text).toContain('- Zane');
        expect(text).not.toContain('Zane [');
        expect(text).toContain('Galice Buckar [she]');
        expect(text).toContain('- Enrique Medina [he]');
    });
});
