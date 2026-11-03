// Assassins Inc: the Medina Syndicate's moves came from Enrique, not his
// father Serlos who leads it; Enrique hunted Cyril to "question" him,
// though he is the one who shot him; and he sent his brother Bartin,
// Cyril's old lover, to find him. The world pass now sees who leads a
// faction, what each person hides, and who is close to whom.
import { castFacts } from '../src/world/model.js';
import { worldPart } from '../src/world/prompts.js';
import { buildDayPrompt } from '../src/planner/prompts.js';

const entries = [
    { id: 'cyril', type: 'character', name: 'Cyril', base: {} },
    { id: 'serlos', type: 'character', name: 'Serlos Medina', base: { role: 'Founder and Leader of the Medina Syndicate' } },
    { id: 'enrique', type: 'character', name: 'Enrique Medina', base: { role: 'Elder son' } },
    { id: 'bartin', type: 'character', name: 'Bartin Medina', base: { role: 'Street-smart operative' } },
    { id: 'tole', type: 'character', name: 'Adrigo Tole', base: {} },
    { id: 'medina', type: 'faction', name: 'Medina Syndicate', base: {} },
];
const byId = new Map(entries.map((e) => [e.id, e]));
const ties = {
    enrique: [{ otherId: 'cyril', kind: 'rival' }, { otherId: 'serlos', kind: 'child of' }, { otherId: 'bartin', kind: 'sibling' }],
    bartin: [{ otherId: 'cyril', kind: 'former lover of' }, { otherId: 'enrique', kind: 'sibling' }],
    serlos: [{ otherId: 'enrique', kind: 'parent of' }, { otherId: 'bartin', kind: 'parent of' }],
    medina: [{ otherId: 'serlos', kind: 'own organization (them)' }],
};
const tiesOf = (id) => ties[id] ?? [];
const memberships = new Map([['serlos', ['medina']], ['enrique', ['medina']], ['bartin', ['medina']]]);
const knowledge = [
    { kind: 'secret', text: 'Enrique was the one who shot Cyril dead over his relationship with Bartin.', knownBy: [{ id: 'enrique', name: 'Enrique Medina' }], madeBy: [], status: 'kept' },
    { kind: 'secret', text: 'Tole put the implant in.', knownBy: [{ id: 'tole', name: 'Adrigo Tole' }], status: 'kept' },
    { kind: 'secret', text: 'An old thing, long out.', knownBy: [{ id: 'enrique', name: 'Enrique Medina' }], status: 'revealed' },
];
const opts = { byId, tiesOf, memberships, knowledge, playerId: 'cyril' };

describe('what the world pass knows of a stakeholder', () => {
    it('a person: what they hide, and who is close to whom', () => {
        const f = castFacts('enrique', opts);
        expect(f.secrets).toEqual(['Enrique was the one who shot Cyril dead over his relationship with Bartin.']);
        expect(f.bonds[0]).toBe('rival Cyril');
        expect(f.bonds).toContain('sibling Bartin Medina - who is former lover of Cyril');
        expect(f.bonds).toContain('child of Serlos Medina');
    });

    it('a faction: who leads it, and how its members stand with the player character', () => {
        const f = castFacts('medina', opts);
        expect(f.leaders).toEqual(['Serlos Medina (Founder and Leader of the Medina Syndicate)']);
        expect(f.members).toContain('Bartin Medina - Street-smart operative [former lover of Cyril]');
        expect(f.members).toContain('Enrique Medina - Elder son [rival Cyril]');
        expect(f.secrets).toEqual([]);
    });

    it('a leader named only by a tie still counts', () => {
        const f = castFacts('medina', { ...opts, byId: new Map(entries.map((e) => [e.id, e.id === 'serlos' ? { ...e, base: {} } : e])) });
        expect(f.leaders).toEqual(['Serlos Medina']);
    });
});

describe('the world prompt', () => {
    const part = worldPart({
        userName: 'Cyril',
        day: 10,
        stakeholders: [
            { name: 'Medina Syndicate', type: 'faction', why: [], ...castFacts('medina', opts) },
            { name: 'Enrique Medina', type: 'person', why: [''], ...castFacts('enrique', opts) },
        ],
        limits: { start: 1, surface: 1 },
    });

    it('shows the leader, the ties and the secret', () => {
        expect(part.text).toContain('led by Serlos Medina');
        expect(part.text).toContain('hides: Enrique was the one who shot Cyril');
        expect(part.text).toContain('[former lover of Cyril]');
        expect(part.text).not.toContain('Enrique Medina (person) - ;');
    });

    it('asks for motives of their own, the leader\'s orders, and no one close sent against him', () => {
        expect(part.text).toContain('silenced or gone, not questioned');
        expect(part.text).toContain("A faction moves on its leader's orders");
        expect(part.text).toContain('No one sends someone close to Cyril');
    });
});

describe('the day plan', () => {
    it('plans what comes after the latest chat, never the chat again', () => {
        const { prompt } = buildDayPrompt({ userName: 'Cyril', messages: [{ name: 'Adam', text: 'I accept your terms.' }], place: 'The Signal Box', situation: 'Adam reassesses strategies with Doc and Galice.' });
        expect(prompt).toContain('THE LATEST CHAT (all of this has already happened)');
        expect(prompt).toContain('That is where things stand - already played');
        expect(prompt).toContain('never what THE LATEST CHAT already shows');
    });
});
