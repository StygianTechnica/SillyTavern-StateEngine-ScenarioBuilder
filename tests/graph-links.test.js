import { buildGraph, storyEdges, regionsFor, linkOptions, labelPoint, layoutGraph } from '../src/ui/graph-layout.js';

const people = [
    { id: 'remus', type: 'character', name: 'Remus' },
    { id: 'niamh', type: 'character', name: 'Niamh' },
    { id: 'varyn', type: 'character', name: 'Varyn' },
];

describe('story relationships in the graph', () => {
    const compiled = [
        { from: { id: 'niamh', name: 'Niamh' }, to: { id: 'remus', name: 'Remus' }, type: 'ally', polarity_label: 'friendly' },
        { from: { id: 'varyn', name: 'Varyn' }, to: { id: 'remus', name: 'Remus' }, type: 'rival', polarity_label: 'wary' },
        { from: { id: null, name: 'a stranger' }, to: { id: 'remus', name: 'Remus' }, type: 'enemy' },
    ];
    it('are drawn between library objects only', () => {
        expect(storyEdges(compiled)).toEqual([
            { from: 'niamh', to: 'remus', type: 'ally', polarityLabel: 'friendly' },
            { from: 'varyn', to: 'remus', type: 'rival', polarityLabel: 'wary' },
        ]);
    });
    it('give way to a relationship the user wrote for the pair', () => {
        const { edges } = buildGraph({ entries: people, story: storyEdges(compiled), relations: [{ from: 'remus', to: 'varyn', kind: 'friend' }] });
        expect(edges.filter((e) => e.kind === 'story')).toEqual([{ source: 'niamh', target: 'remus', kind: 'story', label: 'ally, friendly' }]);
        expect(edges.some((e) => e.kind === 'bond' && e.label === 'friend')).toBe(true);
    });
});

describe('regions', () => {
    const entries = [
        { id: 'wastes', type: 'location', name: 'The Wastes' },
        { id: 'fortress', type: 'location', name: 'Fortress' },
        { id: 'hall', type: 'location', name: 'Hall' },
        { id: 'sea', type: 'location', name: 'The Sea' },
        { id: 'relic', type: 'item', name: 'Relic', base: { location: 'hall' } },
        { id: 'remus', type: 'character', name: 'Remus' },
    ];
    const parents = { fortress: 'wastes', hall: 'fortress' };
    it('are each place\'s top-level place, and the place of what lies there', () => {
        expect(regionsFor(entries, parents)).toEqual({ wastes: 'wastes', fortress: 'wastes', hall: 'wastes', sea: 'sea', relic: 'wastes' });
    });
    it('pull their members together in the layout', () => {
        const graph = { nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id })), edges: [] };
        const groups = { a: 'g1', b: 'g1', c: 'g2', d: 'g2' };
        const p = layoutGraph(graph, {}, { groups });
        const d = (x, y) => Math.hypot(p[x].x - p[y].x, p[x].y - p[y].y);
        expect(d('a', 'b')).toBeLessThan(d('a', 'c'));
        expect(d('c', 'd')).toBeLessThan(d('b', 'd'));
    });
});

describe('drawing a link', () => {
    const defs = {
        faction: [{ name: 'members', label: 'Members', kind: 'refs', refType: 'character' }, { name: 'base', label: 'Base', kind: 'ref', refType: 'location' }],
        character: [{ name: 'role', kind: 'text' }],
        location: [],
    };
    const guild = { id: 'guild', type: 'faction', name: 'Wardens' };
    it('offers the reference fields that fit, either way, and a relationship', () => {
        const opts = linkOptions(people[0], guild, (t) => defs[t]);
        expect(opts.map((o) => o.kind)).toEqual(['field', 'relation']);
        expect(opts[0]).toMatchObject({ owner: 'guild', other: 'remus', field: 'members', multiple: true, label: "Wardens's members: Remus" });
    });
    it('offers a route between two places', () => {
        const a = { id: 'a', type: 'location', name: 'A' };
        const b = { id: 'b', type: 'location', name: 'B' };
        expect(linkOptions(a, b, (t) => defs[t]).map((o) => o.kind)).toEqual(['route', 'relation']);
    });
    it('puts a label beside the middle of its line', () => {
        const p = labelPoint({ x: 0, y: 0 }, { x: 100, y: 0 });
        expect(p.x).toBe(50);
        expect(Math.abs(p.y)).toBe(8);
    });
});
