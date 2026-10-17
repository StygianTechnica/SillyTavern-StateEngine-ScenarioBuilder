// The relationship graph's model and layout, as pure functions (unit-
// tested; no DOM, no SillyTavern). The view is src/ui/graph.js.
//
// Nodes are library entries; edges come from src/library/relations.js -
// reference fields (owner, members, location...), related ids, and the
// location tree. The layout is a small deterministic force simulation:
// the same graph and the same pinned positions always give the same
// picture, and nodes the user dragged stay where they were put.

import { relationsOf } from '../library/relations.js';
import { chatStatusOf } from './catalog-model.js';

// filters: { types: Set | null (null = every type), inPlayOnly }
// -> { nodes: [{ id, type, name, image, status }],
//      edges: [{ source, target, kind: 'parent' | 'ref' | 'related' | 'bond', label }] }
// relations: the relationships the user wrote (setting doc), drawn as 'bond'.
// Edges are only drawn between shown nodes, and each pair/kind/label once.
export function buildGraph({ entries, parents = {}, doc = null, filters = {}, relations = [], labelOf = (_t, f) => f.replace(/_/g, ' ') }) {
    const shown = entries.filter((e) => (!filters.types || filters.types.has(e.type))
        && (!filters.inPlayOnly || chatStatusOf(e.id, doc) !== 'unused'));
    const ids = new Set(shown.map((e) => e.id));
    const nodes = shown.map((e) => ({ id: e.id, type: e.type, name: e.name, image: e.image ?? '', status: chatStatusOf(e.id, doc) }));

    const edges = [];
    const seen = new Set();
    const add = (source, target, kind, label) => {
        if (!ids.has(source) || !ids.has(target) || source === target) return;
        const pair = [source, target].sort().join('|');
        const key = `${pair}|${kind}|${label}`;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ source, target, kind, label });
    };
    for (const [child, parent] of Object.entries(parents)) if (parent) add(child, parent, 'parent', 'inside');
    for (const entry of shown) {
        const rel = relationsOf(entry, entries, parents, labelOf);
        for (const o of rel.outgoing) {
            for (const id of o.ids) add(entry.id, id, o.field === 'related_entity_ids' ? 'related' : 'ref', o.label);
        }
    }
    for (const r of relations ?? []) add(r.from, r.to, 'bond', r.note ? `${r.kind} (${r.note})` : r.kind);
    return { nodes, edges };
}

// A stable number in [0, 1) from a string (FNV-1a), for starting positions.
export function hashUnit(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) / 4294967296;
}

const IDEAL = { parent: 80, ref: 120, related: 140 };
const SPACING = 90;

// Positions for every node: { [id]: { x, y } }. `fixed` positions (the ones
// the user dragged) are kept exactly and pull their neighbours around them.
// options: { width, height, iterations, warm } - `warm` is the previous
// layout: nodes start where they were and only settle gently, so a redraw
// (after a drag, a filter change) does not reshuffle the picture.
export function layoutGraph({ nodes, edges }, fixed = {}, { width = 800, height = 600, iterations = 300, warm = null } = {}) {
    const cx = width / 2;
    const cy = height / 2;
    const pos = new Map();
    const pinned = new Set();
    let heat = 1;
    let floor = 0.5;
    if (warm) {
        const known = nodes.filter((n) => warm[n.id] && Number.isFinite(warm[n.id].x));
        for (const n of known) pos.set(n.id, { x: warm[n.id].x, y: warm[n.id].y });
        // Mostly the same graph: settle briefly instead of starting over.
        if (known.length >= nodes.length * 0.8) { heat = 0.02; floor = 0.2; iterations = Math.min(iterations, 30); }
    }
    // Start: pinned where they were; a node with a pinned neighbour near it;
    // the rest on a hashed spiral around the centre.
    for (const n of nodes) {
        const f = fixed[n.id];
        if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) {
            pos.set(n.id, { x: f.x, y: f.y });
            pinned.add(n.id);
        }
    }
    nodes.forEach((n, i) => {
        if (pos.has(n.id)) return;
        const near = edges.map((e) => (e.source === n.id ? e.target : e.target === n.id ? e.source : null)).find((id) => id && pinned.has(id));
        const a = hashUnit(n.id) * Math.PI * 2;
        const r = near ? 60 : 40 + 22 * Math.sqrt(i + 1);
        const origin = near ? pos.get(near) : { x: cx, y: cy };
        pos.set(n.id, { x: origin.x + Math.cos(a) * r, y: origin.y + Math.sin(a) * r });
    });

    const list = nodes.map((n) => n.id);
    // Spacing between unrelated nodes, independent of the canvas: the view
    // zooms to fit, so the layout only has to be readable, not sized.
    const k = SPACING;
    for (let step = 0; step < iterations; step++) {
        const temp = heat * (1 - step / iterations) * k * 0.8 + floor;
        const force = new Map(list.map((id) => [id, { x: 0, y: 0 }]));
        // Every pair repels.
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = pos.get(list[i]);
                const b = pos.get(list[j]);
                let dx = a.x - b.x;
                let dy = a.y - b.y;
                let d2 = dx * dx + dy * dy;
                if (d2 < 0.01) { dx = hashUnit(list[i] + list[j]) - 0.5; dy = 0.5; d2 = 0.5; }
                const d = Math.sqrt(d2);
                if (d > k * 4) continue; // far apart: no need to push
                const f = (k * k) / d * 0.5;
                force.get(list[i]).x += (dx / d) * f; force.get(list[i]).y += (dy / d) * f;
                force.get(list[j]).x -= (dx / d) * f; force.get(list[j]).y -= (dy / d) * f;
            }
        }
        // Edges pull towards their ideal length.
        for (const e of edges) {
            const a = pos.get(e.source);
            const b = pos.get(e.target);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.max(0.01, Math.hypot(dx, dy));
            const f = (d - (IDEAL[e.kind] ?? 120)) * 0.08;
            force.get(e.source).x += (dx / d) * f; force.get(e.source).y += (dy / d) * f;
            force.get(e.target).x -= (dx / d) * f; force.get(e.target).y -= (dy / d) * f;
        }
        // A gentle pull to the centre keeps islands on screen.
        for (const id of list) {
            if (pinned.has(id)) continue;
            const p = pos.get(id);
            const f = force.get(id);
            f.x += (cx - p.x) * 0.04;
            f.y += (cy - p.y) * 0.04;
            const len = Math.hypot(f.x, f.y);
            if (len > 0) {
                const move = Math.min(len, temp);
                p.x += (f.x / len) * move;
                p.y += (f.y / len) * move;
            }
        }
    }
    const out = {};
    for (const [id, p] of pos) out[id] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
    return out;
}

// The box around the positions, with padding: { x, y, width, height }.
export function boundsOf(positions, padding = 60) {
    const list = Object.values(positions);
    if (!list.length) return { x: 0, y: 0, width: 800, height: 600 };
    const xs = list.map((p) => p.x);
    const ys = list.map((p) => p.y);
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;
    return { x: minX, y: minY, width: Math.max(...xs) + padding - minX, height: Math.max(...ys) + padding - minY };
}
