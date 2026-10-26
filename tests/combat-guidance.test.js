import { buildGuidance } from '../src/guidance/build.js';
import { protectedText } from '../src/director/combat.js';

describe('the narrator hears who cannot be killed, outside a fight too', () => {
    it('puts it in the scene part of the guidance', () => {
        const text = protectedText([{ name: 'Graxx', meta: { combat: { fate: 'unkillable' } } }]);
        const built = buildGuidance({ location: { path: ['Gallows Square'] }, protected: text, budget: 2000 });
        const section = built.sections.find((s) => s.key === 'protected');
        expect(section.mode).toBe('full');
        expect(built.text).toContain('Never killed in this story: Graxx can be beaten, wounded, knocked out or captured, but never killed.');
    });

    it('says nothing when no one here is spared', () => {
        const built = buildGuidance({ location: { path: ['Gallows Square'] }, protected: '', budget: 2000 });
        expect(built.sections.find((s) => s.key === 'protected')).toBeUndefined();
    });
});
