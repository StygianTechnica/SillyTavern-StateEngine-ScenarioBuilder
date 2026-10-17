import { roleFills, fits } from '../src/preset/role-fill.js';

const role = (publicName, type, extra = {}) => ({ id: `prettyPanels__${publicName}`, publicName, type, exists: true, valid: false, variable: null, ...extra });

describe('filling roles with the canonical state', () => {
    it('gives familiar empty roles the canonical variable that fits their type', () => {
        const fills = roleFills([
            role('scene.characters', 'list'),
            role('scene.location', 'object'),
            role('scene.date', 'date'),
            role('scene.date_text', 'text'),
            role('weather', 'list'),
            role('scene.is_raining', 'boolean'),
            role('scene.time', 'text'),
        ]);
        expect(fills).toEqual([
            { roleId: 'prettyPanels__scene.characters', variable: 'sb__canon_characters' },
            { roleId: 'prettyPanels__scene.location', variable: 'sb__canon_location' },
            { roleId: 'prettyPanels__scene.date', variable: 'sb__canon_datetime' },
            { roleId: 'prettyPanels__weather', variable: 'sb__canon_weather' },
            { roleId: 'prettyPanels__scene.is_raining', variable: 'sb__is_raining' },
            { roleId: 'prettyPanels__scene.time', variable: 'sb__canon_time' },
        ]);
    });

    it('never touches a working assignment, an undefined role or an unknown name', () => {
        expect(roleFills([
            role('scene.location', 'object', { valid: true, variable: 'se__scene_location' }),
            role('scene.characters', 'list', { exists: false }),
            role('character.health', 'number'),
        ])).toEqual([]);
    });

    it('replaces an assignment that no longer works (Scene Context switched off)', () => {
        expect(roleFills([role('scene.characters', 'list', { variable: 'se__scene_characters', problem: 'not active' })]))
            .toEqual([{ roleId: 'prettyPanels__scene.characters', variable: 'sb__canon_characters' }]);
    });

    it('follows State Engine\'s type rules', () => {
        expect(fits('text', 'object')).toBe(true);
        expect(fits('object', 'array')).toBe(false);
        expect(fits('any', 'datetime')).toBe(true);
    });
});
