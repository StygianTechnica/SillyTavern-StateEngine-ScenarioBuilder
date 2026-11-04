import { describe, it, expect } from 'vitest';
import { genderOf } from '../src/generate/run.js';
import { buildGenerationPrompt } from '../src/generate/prompt.js';

const character = { id: 'character', noun: 'character' };

describe('a person is a he or a she', () => {
    it('takes the one picked, else what the idea and their text say', () => {
        expect(genderOf({ chosen: 'f', texts: ['a grizzled old man'] })).toBe('f');
        // Cyberpunk, fantasy, sci-fi, real world.
        expect(genderOf({ texts: ['a netrunner who sold her own memories'] })).toBe('f');
        expect(genderOf({ texts: ['the priest of a drowned god'] })).toBe('m');
        expect(genderOf({ texts: ['', 'The captain lost his ship at Vega.'] })).toBe('m');
        expect(genderOf({ texts: ['a waitress at a Brooklyn diner'] })).toBe('f');
        // The idea comes before their own text.
        expect(genderOf({ texts: ['a widow', 'He was once a soldier.'] })).toBe('f');
        expect(genderOf({ texts: ['a smuggler with a conscience', ''] })).toBe('');
    });

    it('tells the writer he or she, and never they', () => {
        const { user } = buildGenerationPrompt({ task: 'create', type: character, fields: [], fixedName: 'Kiri Vance', gender: 'f', person: true });
        expect(user).toContain('Kiri Vance is a woman: write she / her everywhere - never "they" or "them" for this one person');
        const him = buildGenerationPrompt({ task: 'enrich', type: character, entry: { name: 'Bram', values: {} }, fields: [{ name: 'description', label: 'Description', kind: 'text' }], gender: 'm', person: true });
        expect(him.user).toContain('Bram is a man: write he / him everywhere');
        // Not known (a name someone gave): the model reads it from the name, and keeps to it.
        const open = buildGenerationPrompt({ task: 'fill', type: character, entry: { name: 'Sam Reyes', values: {} }, fields: [{ name: 'description', label: 'Description', kind: 'text' }], person: true });
        expect(open.user).toContain('Sam Reyes is a man or a woman - whichever their name');
        expect(open.user).toContain('never "they" or "them" for this one person');
        // Not a person: nothing said.
        const place = buildGenerationPrompt({ task: 'create', type: { id: 'location', noun: 'location' }, fields: [], fixedName: 'Arcadia' });
        expect(place.user).not.toContain('never "they"');
    });
});

// Assassins Inc: Vex's description says she is a woman; her generated
// personality, voice and background called her "he" sixteen times, and all
// of it counted together made her a man - to the narrator and the director.
import { personGender, pronounsNear } from '../src/naming/classify.js';
import { dossierText } from '../src/director/prompt.js';

const VEX_DESCRIPTION = 'Introduced as a member of White Cerberus who offers to help Cyril and implies he could gain protection from her group if he joins them. Vex is a woman of average height with an athletic build, her lean muscles evident beneath fitted black tactical gear.';
const VEX_GENERATED = [
    'Vex carries a dark humor and sharp wit to mask his deeply ingrained mistrust of corporate interests. He has an almost obsessive focus on cutting through the lies.',
    'Vex lost his mother to an Omicron Innovations clinical trial when he was just a child. This forged within him an unyielding determination.',
    "Vex's voice is a gravelly rasp. He has a tendency to let sentences trail off into silence, as if considering whether he dares reveal more than he should.",
];

describe("a person's own description decides", () => {
    it('Vex is a woman, whatever the generated fields say', () => {
        expect(personGender({ name: 'Vex', own: [VEX_DESCRIPTION], more: VEX_GENERATED })).toBe('f');
    });

    it('its pronouns, when it never says outright', () => {
        expect(personGender({ own: ['She keeps her blades oiled and her counsel close.'], more: ['He is wary.', 'His voice is low.'] })).toBe('f');
    });

    it('the other fields only when their own text says nothing', () => {
        expect(personGender({ own: ['A drone mechanic of the lower docks.'], more: ['He is wary of strangers; his hands are never still.'] })).toBe('m');
        expect(personGender({ own: ['A drone mechanic of the lower docks.'] })).toBe('');
    });

    it('"is a man" in their own text wins over pronouns about others', () => {
        expect(personGender({ own: ['Riven is a young man. She trained him, and her lessons stuck with her.'] })).toBe('m');
    });
});

describe('the pronouns that follow a name in the story', () => {
    it('reads her from "Vex rose from her seat", never from someone named after', () => {
        expect(pronounsNear('Vex', 'Vex rose from her seat. Vex continued her watchful vigil. Vex nodded at Cyril and he left.')).toBe('f');
        expect(pronounsNear('Vex', 'Vex helped Cyril, and he thanked her.')).toBe('');
    });

    it('a brief about someone else gives nothing - then the story does', () => {
        const brief = 'Introduced as a member of White Cerberus who offers to help Cyril and implies he could gain protection from her group if he joins them.';
        expect(genderOf({ texts: [brief], name: 'Vex', own: [brief], story: ['Vex rose from her seat, her stance casual. Vex stepped closer, her expression thoughtful.'] })).toBe('f');
    });
});

describe('the director is told', () => {
    it('she or he, ahead of the rest', () => {
        const text = dossierText({ cast: [{ name: 'Vex', gender: 'f', role: 'operative for White Cerberus', personality: 'He has an obsessive focus.' }] });
        expect(text).toContain('- Vex: a woman (she / her); operative for White Cerberus');
    });
});
