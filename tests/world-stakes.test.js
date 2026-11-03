// Assassins Inc: only the Medina Syndicate ever hunted Cyril. The world
// looked only at those a fresh ripple named, then only at those already
// scheming - Omicron Innovations, whose researcher made Cyril and whose
// implant he carries, never came into view. Those with a standing claim
// on the player character now stay in view; one side never runs the same
// aim twice; and what Cyril has not learned stays hidden.
import { standingStakes, stakeholders, applyWorld, emptyWorld, meanwhileSection } from '../src/world/model.js';
import { worldPart } from '../src/world/prompts.js';

const entries = [
    { id: 'cyril', type: 'character', name: 'Cyril', base: {} },
    { id: 'tole', type: 'character', name: 'Doctor Adrigo Tole', base: { role: 'Lead Cybernetics Researcher' } },
    { id: 'enrique', type: 'character', name: 'Enrique Medina', base: {} },
    { id: 'bartin', type: 'character', name: 'Bartin Medina', base: {} },
    { id: 'shopkeep', type: 'character', name: 'Old Wen', base: {} },
    { id: 'omicron', type: 'faction', name: 'Omicron Innovations', base: { aliases: ['Omicron'] } },
    { id: 'medina', type: 'faction', name: 'Medina Syndicate', base: {} },
];
const ties = {
    cyril: [{ otherId: 'tole', kind: 'greatest creation yet (them)' }, { otherId: 'enrique', kind: 'rival' }, { otherId: 'bartin', kind: 'former lover of (them)' }, { otherId: 'medina', kind: 'former member of' }],
};
const tiesOf = (id) => ties[id] ?? [];
const memberships = new Map([['tole', ['omicron']], ['enrique', ['medina']], ['bartin', ['medina']]]);
const knowledge = [
    { kind: 'secret', text: "Cyril's implant is classified research belonging to Omicron Innovations.", knownBy: [{ id: 'tole' }], madeBy: [], about: [] },
    { kind: 'belief', text: 'Cyril is dead', knownBy: [{ id: 'enrique' }], about: [{ id: 'cyril' }] },
];
const base = { entries, tiesOf, memberships, knowledge, playerId: 'cyril' };

describe('a standing claim on the player character', () => {
    const stakes = standingStakes(base);
    const of = (id) => stakes.find((x) => x.id === id);

    it('the maker, and the faction that owns what he made', () => {
        expect(of('tole').score).toBe(4);
        expect(of('tole').why).toContain('greatest creation yet Cyril');
        expect(of('omicron').why).toContain('named in what is known of Cyril');
        expect(of('omicron').why).toContain('Doctor Adrigo Tole is one of theirs');
        expect(of('omicron').score).toBeGreaterThan(of('bartin').score);
    });

    it('rivals and lovers too, a belief never, a stranger never', () => {
        expect(of('enrique').why).toBe('Cyril: rival them');
        expect(of('bartin').why).toBe('former lover of Cyril');
        expect(of('shopkeep')).toBeUndefined();
        expect(of('cyril')).toBeUndefined();
    });

    it('stays in view with no ripple, while those scheming take no room', () => {
        const found = stakeholders([], { ...base, stakes, schemers: ['medina', 'enrique'], limit: 2 });
        expect(found.slice(0, 2).map((x) => x.id).sort()).toEqual(['omicron', 'tole']);
        expect(found.map((x) => x.id)).toEqual(expect.arrayContaining(['medina', 'enrique']));
    });
});

describe('one side, one aim', () => {
    it('a faction and its own man never chase the same aim twice', () => {
        const world = emptyWorld();
        const side = (id) => [id, ...(memberships.get(id) ?? []), ...[...memberships].filter(([, fs]) => fs.includes(id)).map(([p]) => p)];
        const scheme = (who) => ({ id: '', who: [who], aim: 'Capture Cyril alive for interrogation', motive: '', from: 'goal', steps: ['Ask around.'], done: 0, inDays: 1, status: '', visibility: 'hidden', aboutPlayer: 'seeks', log: '', surface: null, changes: [] });
        const names = { medina: 'Medina Syndicate', enrique: 'Enrique Medina', omicron: 'Omicron Innovations' };
        const opts = { day: 1, resolve: (n) => Object.keys(names).find((k) => names[k] === n) ?? null, nameOf: (id) => names[id], ids: ['medina', 'enrique', 'omicron'], limits: { schemes: 6, start: 3, surface: 0 }, side };
        applyWorld(world, { schemes: [{ ...scheme('Medina Syndicate') }, { ...scheme('Enrique Medina') }, { ...scheme('Omicron Innovations') }] }, opts);
        expect(world.schemes.map((s) => s.names[0])).toEqual(['Medina Syndicate', 'Omicron Innovations']);
    });
});

describe('what Cyril has not learned', () => {
    it('the world prompt keeps it to what he could see or hear', () => {
        const part = worldPart({ userName: 'Cyril', day: 1, stakeholders: [{ name: 'Omicron Innovations', type: 'faction', why: ['x'] }], limits: { start: 1, surface: 1 } });
        expect(part.text).toContain('What Cyril has not learned - who made them');
        expect(part.text).toContain('no scheme yet is the likeliest to start one');
    });

    it('the director is told not to say it outright', () => {
        const world = emptyWorld();
        world.surfaced = [{ id: 'w1', way: 'rumour', text: 'Corporate men asking about an elf with a silver eye.', where: '', whereId: '', who: [], schemeId: '', fromDay: 1, untilDay: 5, hostile: false, shownFor: [] }];
        const { text } = meanwhileSection(world, { day: 1 });
        expect(text).toContain('never to tell them outright what they have not learned about themselves');
    });
});
