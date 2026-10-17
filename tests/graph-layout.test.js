import { buildGraph, layoutGraph, boundsOf, hashUnit } from '../src/ui/graph-layout.js';

const parents = { market: 'city', stall: 'market' };
const entries = [
    { id: 'city', type: 'location', name: 'City' },
    { id: 'market', type: 'location', name: 'Market' },
    { id: 'stall', type: 'location', name: 'Stall', image: 'x.png' },
    { id: 'mira', type: 'character', name: 'Mira' },
    { id: 'blade', type: 'item', name: 'Blade', base: { owner: 'mira', location: 'stall' } },
    { id: 'guild', type: 'faction', name: 'Guild', base: { members: ['mira'], related_entity_ids: ['market'] } },
    { id: 'eel', type: 'creature', name: 'Eel' },
];
const doc = { canonical: { locationId: 'market', castIds: ['mira'] }, inPlay: ['market', 'mira'] };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('graph model', () => {
    it('turns references, related ids and the tree into edges', () => {
        const { nodes, edges } = buildGraph({ entries, parents, doc });
        expect(nodes).toHaveLength(7);
        expect(nodes.find((n) => n.id === 'stall').image).toBe('x.png');
        expect(nodes.find((n) => n.id === 'mira').status).toBe('scene');
        const keys = edges.map((e) => `${e.source}>${e.target}:${e.kind}:${e.label}`).sort();
        expect(keys).toEqual([
            'blade>mira:ref:owner',
            'blade>stall:ref:location',
            'guild>market:related:Related',
            'guild>mira:ref:members',
            'market>city:parent:inside',
            'stall>market:parent:inside',
        ]);
    });

    it('filters by type and keeps only edges between shown nodes', () => {
        const { nodes, edges } = buildGraph({ entries, parents, filters: { types: new Set(['location', 'item']) } });
        expect(nodes.map((n) => n.id).sort()).toEqual(['blade', 'city', 'market', 'stall']);
        expect(edges.every((e) => e.source !== 'mira' && e.target !== 'mira')).toBe(true);
        expect(edges).toHaveLength(3);
    });

    it('shows only what is in play when asked', () => {
        const { nodes } = buildGraph({ entries, parents, doc, filters: { inPlayOnly: true } });
        expect(nodes.map((n) => n.id).sort()).toEqual(['market', 'mira']);
    });
});

describe('graph layout', () => {
    const graph = buildGraph({ entries, parents, doc });

    it('is deterministic and finite', () => {
        const a = layoutGraph(graph);
        const b = layoutGraph(graph);
        expect(a).toEqual(b);
        expect(Object.keys(a).sort()).toEqual(entries.map((e) => e.id).sort());
        for (const p of Object.values(a)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    });

    it('keeps pinned nodes exactly where the user put them', () => {
        const pos = layoutGraph(graph, { mira: { x: 10, y: 20 } });
        expect(pos.mira).toEqual({ x: 10, y: 20 });
    });

    it('barely moves a warm-started layout', () => {
        const first = layoutGraph(graph);
        const again = layoutGraph(graph, { mira: { x: first.mira.x + 40, y: first.mira.y } }, { warm: first });
        for (const id of ['city', 'eel', 'guild']) expect(dist(first[id], again[id])).toBeLessThan(40);
        expect(again.mira).toEqual({ x: first.mira.x + 40, y: first.mira.y });
    });

    it('pulls connected nodes closer than unconnected ones', () => {
        const pos = layoutGraph(graph);
        expect(dist(pos.stall, pos.market)).toBeLessThan(dist(pos.stall, pos.eel));
    });

    it('does not stack nodes on top of each other', () => {
        const pos = layoutGraph(graph);
        const ids = Object.keys(pos);
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(dist(pos[ids[i]], pos[ids[j]])).toBeGreaterThan(20);
    });

    it('frames the positions and hashes stably', () => {
        expect(boundsOf({ a: { x: 0, y: 0 }, b: { x: 100, y: 50 } }, 10)).toEqual({ x: -10, y: -10, width: 120, height: 70 });
        expect(boundsOf({})).toEqual({ x: 0, y: 0, width: 800, height: 600 });
        expect(hashUnit('abc')).toBe(hashUnit('abc'));
        expect(hashUnit('abc')).toBeGreaterThanOrEqual(0);
    });
});

describe('authored relationships in the graph', () => {
    it('draws them as bond edges between shown nodes', () => {
        const entries = [{ id: 'chr_a', type: 'character', name: 'A' }, { id: 'chr_b', type: 'character', name: 'B' }];
        const { edges } = buildGraph({ entries, relations: [{ id: 'r1', from: 'chr_a', to: 'chr_b', kind: 'rival', note: 'old debt' }, { id: 'r2', from: 'chr_a', to: 'chr_x', kind: 'friend' }] });
        expect(edges).toEqual([{ source: 'chr_a', target: 'chr_b', kind: 'bond', label: 'rival (old debt)' }]);
    });
});
