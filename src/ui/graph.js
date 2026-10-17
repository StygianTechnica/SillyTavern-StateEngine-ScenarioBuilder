// The relationship graph (docs/ROADMAP.md, Catalog UI): every library entry
// as a node - State Engine's type colour and icon, or its portrait - and
// every relationship the library holds as an edge (src/library/relations.js:
// reference fields, related ids, the location tree). Drawn as plain SVG,
// laid out by src/ui/graph-layout.js, no library.
//
//   - filter by type, or show only what is in play in this chat;
//   - drag a node to put it where you want it: it stays there (saved per
//     setting); "Reset layout" lets everything settle again;
//   - drag the background to pan, wheel or the +/- buttons to zoom;
//   - hover a node to light up its neighbours; click it to open its sheet.

import { getChatDoc } from '../store/chat-store.js';
import { listRelations } from '../library/relations-edit.js';
import { getObjectTypes, CHAPTER_LABELS, listEntries, getParents, getGraphPositions, setGraphPosition, clearGraphPositions } from '../library/library.js';
import { safeImageSrc } from '../images/attach.js';
import { buildGraph, layoutGraph, boundsOf } from './graph-layout.js';
import { STATUS_LABELS } from './catalog-model.js';
import { ws, rerender, openSheet } from './ws.js';
import { h, icon, button } from './dom.js';

const SVG = 'http://www.w3.org/2000/svg';
const NODE_R = 22;
const EDGE_LABELS = { parent: 'Inside', ref: 'Reference', related: 'Related', bond: 'Relationship' };

function s(tag, attrs = {}, ...children) {
    const el = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) el.setAttribute(key, String(value));
    for (const child of children.flat()) if (child) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return el;
}

const shortName = (name) => (name.length > 18 ? `${name.slice(0, 17)}…` : name);
let clipCounter = 0;

export async function renderGraph() {
    const { chatId, chatKey, settingId } = ws.ctx;
    const types = await getObjectTypes();
    const byType = new Map(types.map((t) => [t.id, t]));
    const entries = [];
    for (const t of types) entries.push(...await listEntries(chatId, settingId, t.id));
    const doc = getChatDoc(chatKey);
    const parents = getParents(settingId);
    ws.graphTypes ??= null; // null = every type
    const filters = { types: ws.graphTypes ? new Set(ws.graphTypes) : null, inPlayOnly: ws.graphInPlay === true };
    const graph = buildGraph({ entries, parents, doc, filters, relations: listRelations(settingId) });
    const pinned = getGraphPositions(settingId);
    const pos = layoutGraph(graph, pinned, { warm: ws.graphLast?.settingId === settingId ? ws.graphLast.pos : null });
    ws.graphLast = { settingId, pos };

    // ---- toolbar
    const counts = Object.fromEntries(types.map((t) => [t.id, entries.filter((e) => e.type === t.id).length]));
    const toggleType = (id) => {
        const current = new Set(ws.graphTypes ?? types.map((t) => t.id));
        if (current.has(id)) current.delete(id); else current.add(id);
        ws.graphTypes = current.size === types.length ? null : [...current];
        ws.graphView = null; // re-frame what is now shown
        rerender();
    };
    const typeChips = h('div', { class: 'sb-graph-types' }, types.filter((t) => counts[t.id]).map((t) => {
        const on = !filters.types || filters.types.has(t.id);
        return h('span', { class: `sb-chipopt sb-typechip${on ? ' on' : ''}`, style: `--sb-accent: ${t.color}`, title: on ? `Hide ${t.plural.toLowerCase()}` : `Show ${t.plural.toLowerCase()}`, onclick: () => toggleType(t.id) },
            h('i', { class: `fa-solid ${t.icon}` }), ` ${CHAPTER_LABELS[t.id] ?? t.plural}`);
    }));
    const svg = s('svg', { class: 'sb-graph-svg', role: 'img', 'aria-label': 'Relationship graph' });
    const toolbar = h('div', { class: 'sb-graph-bar' },
        h('div', { class: 'sb-viewtoggle', title: 'See the setting as a book, or as a graph' },
            h('div', { class: 'sb-viewbtn', title: 'Book', onclick: () => { ws.tab = 'catalog'; ws.chapter = 'overview'; ws.entryId = null; rerender(); } }, icon('fa-book-open'), ' Book'),
            h('div', { class: 'sb-viewbtn active', title: 'Graph' }, icon('fa-diagram-project'), ' Graph')),
        typeChips,
        h('label', { class: 'checkbox_label', title: 'Only what has been in this chat\'s scene' },
            h('input', { type: 'checkbox', checked: filters.inPlayOnly, onchange: (e) => { ws.graphInPlay = e.target.checked; ws.graphView = null; rerender(); } }), h('span', {}, 'In play only')),
        h('div', { class: 'sb-actions sb-push' },
            h('span', { class: 'sb-iconbtn', title: 'Zoom in', onclick: () => zoomBy(svg, 1.25) }, icon('fa-magnifying-glass-plus')),
            h('span', { class: 'sb-iconbtn', title: 'Zoom out', onclick: () => zoomBy(svg, 0.8) }, icon('fa-magnifying-glass-minus')),
            h('span', { class: 'sb-iconbtn', title: 'Fit everything in view', onclick: () => fit(svg, pos) }, icon('fa-expand')),
            Object.keys(pinned).length ? button('Reset layout', () => { clearGraphPositions(settingId); ws.graphView = null; }, { iconName: 'fa-rotate-left', title: 'Forget where you dragged nodes and let them settle again' }) : null));

    if (!graph.nodes.length) {
        return h('div', { class: 'sb-graph' }, toolbar, h('div', { class: 'sb-callout sb-callout-big' }, icon('fa-diagram-project'),
            h('div', {}, h('b', {}, entries.length ? 'Nothing matches these filters.' : 'The setting is empty.'), h('div', {}, entries.length ? 'Show more types, or turn off "In play only".' : 'Add places, people and factions in the catalog - their links appear here.'))));
    }

    // ---- edges, then nodes on top
    const world = s('g', { class: 'sb-graph-world' });
    const edgeEls = [];
    const edgeLayer = s('g', { class: 'sb-graph-edges' });
    for (const e of graph.edges) {
        const a = pos[e.source];
        const b = pos[e.target];
        const line = s('line', { class: `sb-gedge sb-gedge-${e.kind}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        const hit = s('line', { class: 'sb-gedge-hit', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, s('title', {}, `${graph.nodes.find((n) => n.id === e.source)?.name} - ${e.label} - ${graph.nodes.find((n) => n.id === e.target)?.name}`));
        edgeEls.push({ e, line, hit });
        edgeLayer.append(line, hit);
    }
    const nodeLayer = s('g', { class: 'sb-graph-nodes' });
    const nodeEls = new Map();
    for (const n of graph.nodes) {
        const t = byType.get(n.type);
        const p = pos[n.id];
        const src = safeImageSrc(n.image);
        const g = s('g', { class: `sb-gnode sb-gnode-${n.status}${pinned[n.id] ? ' sb-gnode-pinned' : ''}`, transform: `translate(${p.x} ${p.y})`, style: `--sb-accent: ${t?.color ?? '#888'}`, tabindex: 0 });
        g.append(s('title', {}, `${n.name} (${t?.label ?? n.type})${n.status !== 'unused' ? ` - ${STATUS_LABELS[n.status]}` : ''}`));
        if (n.status === 'scene') g.append(s('circle', { class: 'sb-gnode-halo', r: NODE_R + 7 }));
        g.append(s('circle', { class: 'sb-gnode-disc', r: NODE_R }));
        if (src) {
            const clip = `sbclip${++clipCounter}`;
            g.append(s('clipPath', { id: clip }, s('circle', { r: NODE_R - 2 })),
                s('image', { href: src, x: -(NODE_R - 2), y: -(NODE_R - 2), width: (NODE_R - 2) * 2, height: (NODE_R - 2) * 2, 'clip-path': `url(#${clip})`, preserveAspectRatio: 'xMidYMid slice' }));
        } else {
            const fo = s('foreignObject', { x: -NODE_R, y: -NODE_R, width: NODE_R * 2, height: NODE_R * 2 });
            fo.append(h('div', { class: 'sb-gnode-icon' }, h('i', { class: `fa-solid ${t?.icon ?? 'fa-circle'}` })));
            g.append(fo);
        }
        g.append(s('text', { class: 'sb-gnode-label', y: NODE_R + 15 }, shortName(n.name)));
        g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openSheet(n.id, n.type); });
        nodeEls.set(n.id, g);
        nodeLayer.append(g);
    }
    world.append(edgeLayer, nodeLayer);
    svg.append(world);

    wireInteraction({ svg, world, graph, pos, nodeEls, edgeEls, settingId });

    const legend = h('div', { class: 'sb-graph-legend' },
        Object.entries(EDGE_LABELS).map(([kind, label]) => h('span', {}, s('svg', { width: 26, height: 8 }, s('line', { class: `sb-gedge sb-gedge-${kind}`, x1: 1, y1: 4, x2: 25, y2: 4 })), ` ${label}`)),
        h('span', {}, icon('fa-thumbtack'), ' dragged nodes stay put'),
        h('small', { class: 'sb-hint' }, `${graph.nodes.length} entries · ${graph.edges.length} links`));

    const wrap = h('div', { class: 'sb-graph' }, toolbar, h('div', { class: 'sb-graph-stage' }, svg), legend);
    // Size-dependent framing once the SVG is on the page.
    requestAnimationFrame(() => {
        if (ws.graphView) applyView(svg);
        else fit(svg, pos);
    });
    return wrap;
}

// ---- view (pan / zoom) - kept in ws so redraws don't jump

function applyView(svg) {
    const v = ws.graphView ?? { tx: 0, ty: 0, k: 1 };
    svg.querySelector('.sb-graph-world')?.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k})`);
}

function fit(svg, pos) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const b = boundsOf(pos, 70);
    const k = Math.min(2, Math.max(0.2, Math.min(rect.width / b.width, rect.height / b.height)));
    ws.graphView = { k, tx: (rect.width - b.width * k) / 2 - b.x * k, ty: (rect.height - b.height * k) / 2 - b.y * k };
    applyView(svg);
}

function zoomBy(svg, factor, cx = null, cy = null) {
    const rect = svg.getBoundingClientRect();
    const v = ws.graphView ?? { tx: 0, ty: 0, k: 1 };
    const px = cx ?? rect.width / 2;
    const py = cy ?? rect.height / 2;
    const k = Math.min(3, Math.max(0.15, v.k * factor));
    const f = k / v.k;
    ws.graphView = { k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f };
    applyView(svg);
}

// ---- dragging nodes, panning, hovering, clicking

function wireInteraction({ svg, graph, pos, nodeEls, edgeEls, settingId }) {
    const neighbours = new Map(graph.nodes.map((n) => [n.id, new Set([n.id])]));
    for (const { e } of edgeEls) {
        neighbours.get(e.source)?.add(e.target);
        neighbours.get(e.target)?.add(e.source);
    }
    const toWorld = (ev) => {
        const rect = svg.getBoundingClientRect();
        const v = ws.graphView ?? { tx: 0, ty: 0, k: 1 };
        return { x: (ev.clientX - rect.left - v.tx) / v.k, y: (ev.clientY - rect.top - v.ty) / v.k };
    };
    const moveNode = (id, p) => {
        pos[id] = p;
        nodeEls.get(id).setAttribute('transform', `translate(${p.x} ${p.y})`);
        for (const { e, line, hit } of edgeEls) {
            for (const el of [line, hit]) {
                if (e.source === id) { el.setAttribute('x1', p.x); el.setAttribute('y1', p.y); }
                if (e.target === id) { el.setAttribute('x2', p.x); el.setAttribute('y2', p.y); }
            }
        }
    };
    const highlight = (id) => {
        const near = id ? neighbours.get(id) : null;
        svg.classList.toggle('sb-graph-focus', !!near);
        for (const [nid, el] of nodeEls) el.classList.toggle('sb-lit', !!near && near.has(nid));
        for (const { e, line } of edgeEls) line.classList.toggle('sb-lit', !!near && (e.source === id || e.target === id));
    };

    let drag = null; // { kind: 'node' | 'pan', id?, start, origin, moved }
    for (const n of graph.nodes) {
        const el = nodeEls.get(n.id);
        el.addEventListener('pointerenter', () => { if (!drag) highlight(n.id); });
        el.addEventListener('pointerleave', () => { if (!drag) highlight(null); });
        el.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            svg.setPointerCapture(ev.pointerId);
            drag = { kind: 'node', id: n.id, type: n.type, start: { x: ev.clientX, y: ev.clientY }, origin: { ...pos[n.id] }, grab: toWorld(ev), moved: false };
            highlight(n.id);
        });
    }
    svg.addEventListener('pointerdown', (ev) => {
        svg.setPointerCapture(ev.pointerId);
        const v = ws.graphView ?? { tx: 0, ty: 0, k: 1 };
        drag = { kind: 'pan', start: { x: ev.clientX, y: ev.clientY }, origin: { x: v.tx, y: v.ty }, moved: false };
        svg.classList.add('sb-panning');
    });
    svg.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        const dx = ev.clientX - drag.start.x;
        const dy = ev.clientY - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        if (drag.kind === 'pan') {
            ws.graphView = { ...(ws.graphView ?? { k: 1 }), tx: drag.origin.x + dx, ty: drag.origin.y + dy };
            applyView(svg);
        } else {
            const w = toWorld(ev);
            moveNode(drag.id, { x: drag.origin.x + (w.x - drag.grab.x), y: drag.origin.y + (w.y - drag.grab.y) });
        }
    });
    const end = () => {
        if (!drag) return;
        const d = drag;
        drag = null;
        svg.classList.remove('sb-panning');
        if (d.kind === 'node') {
            if (d.moved) {
                nodeEls.get(d.id).classList.add('sb-gnode-pinned');
                setGraphPosition(settingId, d.id, pos[d.id]);
            } else {
                openSheet(d.id, d.type);
            }
        }
        highlight(null);
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const rect = svg.getBoundingClientRect();
        zoomBy(svg, ev.deltaY < 0 ? 1.12 : 0.9, ev.clientX - rect.left, ev.clientY - rect.top);
    }, { passive: false });
}
