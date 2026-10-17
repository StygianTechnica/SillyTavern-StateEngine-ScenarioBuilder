// The relationship graph (docs/ROADMAP.md, Catalog UI): every library entry
// as a node - State Engine's type colour and icon, or its portrait - and
// every relationship the library holds as an edge (src/library/relations.js:
// reference fields, related ids, the location tree; the relationships the
// user wrote; routes; and the story's relationships from Archivist). Drawn
// as plain SVG, laid out by src/ui/graph-layout.js, no library.
//
//   - filter by type, or show only what is in play in this chat;
//   - drag a node to put it where you want it: it stays there (saved per
//     setting); "Reset layout" lets everything settle again;
//   - drag from one node to another with the Link tool on (or Shift held)
//     to link them: a reference field, a route, or a relationship;
//   - drag the background to pan, wheel, pinch or the +/- buttons to zoom;
//   - "Labels" writes each link's kind on the canvas (a lit node's links
//     always show theirs);
//   - "Group by region" gathers everything under its top-level place, in
//     a labelled box;
//   - hover a node to light up its neighbours; click it to open its sheet.

import { getChatDoc } from '../store/chat-store.js';
import { listRelations, addLink, addRelation, RELATION_KINDS, MUTUAL_KINDS } from '../library/relations-edit.js';
import { listRoutes, addRoute, guessRoute } from '../library/routes.js';
import { baselineFields } from '../library/fields.js';
import { getObjectTypes, CHAPTER_LABELS, listEntries, getParents, getGraphPositions, setGraphPosition, clearGraphPositions, getOverview } from '../library/library.js';
import { safeImageSrc } from '../images/attach.js';
import { syncNow } from '../guidance/sync.js';
import { buildGraph, layoutGraph, boundsOf, storyEdges, regionsFor, linkOptions, labelPoint, regionBox } from './graph-layout.js';
import { STATUS_LABELS } from './catalog-model.js';
import { ws, rerender, openSheet } from './ws.js';
import { h, icon, button, toast } from './dom.js';

const SVG = 'http://www.w3.org/2000/svg';
const NODE_R = 22;
const EDGE_LABELS = { parent: 'Inside', ref: 'Reference', related: 'Related', bond: 'Relationship', story: 'In the story', route: 'Route' };

function s(tag, attrs = {}, ...children) {
    const el = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) el.setAttribute(key, String(value));
    for (const child of children.flat()) if (child) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return el;
}

const shortName = (name) => (name.length > 18 ? `${name.slice(0, 17)}…` : name);
const shortLabel = (text) => (text.length > 28 ? `${text.slice(0, 27)}…` : text);
let clipCounter = 0;

// Archivist's compiled relationships, as id pairs ([] without Archivist).
async function storyRelationships() {
    try {
        const view = await window.StateEngineArchivist?.getCompiledMemory?.();
        return storyEdges(view?.relationships);
    } catch {
        return [];
    }
}

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
    const story = ws.graphStory === false ? [] : await storyRelationships();
    const graph = buildGraph({ entries, parents, doc, filters, relations: listRelations(settingId), routes: listRoutes(settingId), story });
    const regions = regionsFor(entries, parents);
    const grouping = ws.graphGroups === true;
    const pinned = getGraphPositions(settingId);
    const warmKey = `${settingId}|${grouping}`;
    const pos = layoutGraph(graph, pinned, { warm: ws.graphLast?.key === warmKey ? ws.graphLast.pos : null, groups: grouping ? regions : null });
    ws.graphLast = { key: warmKey, pos };

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
    const check = (label, title, on, set) => h('label', { class: 'checkbox_label', title },
        h('input', { type: 'checkbox', checked: on, onchange: (e) => { set(e.target.checked); rerender(); } }), h('span', {}, label));
    const svg = s('svg', { class: `sb-graph-svg${ws.graphLinking ? ' sb-linking' : ''}${ws.graphLabels ? ' sb-graph-labels' : ''}`, role: 'img', 'aria-label': 'Relationship graph' });
    const toolbar = h('div', { class: 'sb-graph-bar' },
        h('div', { class: 'sb-viewtoggle', title: 'See the setting as a book, or as a graph' },
            h('div', { class: 'sb-viewbtn', title: 'Book', onclick: () => { ws.tab = 'catalog'; ws.chapter = 'overview'; ws.entryId = null; rerender(); } }, icon('fa-book-open'), ' Book'),
            h('div', { class: 'sb-viewbtn active', title: 'Graph' }, icon('fa-diagram-project'), ' Graph')),
        typeChips,
        check('In play only', 'Only what has been in this chat\'s scene', filters.inPlayOnly, (on) => { ws.graphInPlay = on; ws.graphView = null; }),
        check('Labels', 'Write each link\'s kind on the canvas', ws.graphLabels === true, (on) => { ws.graphLabels = on; }),
        check('Group by region', 'Gather everything under its top-level place', grouping, (on) => { ws.graphGroups = on; ws.graphView = null; }),
        window.StateEngineArchivist?.getCompiledMemory ? check('Story links', 'The relationships Archivist found in the story', ws.graphStory !== false, (on) => { ws.graphStory = on; }) : null,
        h('div', { class: 'sb-actions sb-push' },
            button('Link', () => { ws.graphLinking = !ws.graphLinking; ws.graphLink = null; rerender(); }, { iconName: 'fa-link', cls: ws.graphLinking ? 'sb-primary' : '', title: 'Drag from one node to another to link them (or hold Shift while dragging)' }),
            h('span', { class: 'sb-iconbtn', title: 'Zoom in', onclick: () => zoomBy(svg, 1.25) }, icon('fa-magnifying-glass-plus')),
            h('span', { class: 'sb-iconbtn', title: 'Zoom out', onclick: () => zoomBy(svg, 0.8) }, icon('fa-magnifying-glass-minus')),
            h('span', { class: 'sb-iconbtn', title: 'Fit everything in view', onclick: () => fit(svg, pos) }, icon('fa-expand')),
            Object.keys(pinned).length ? button('Reset layout', () => { clearGraphPositions(settingId); ws.graphView = null; }, { iconName: 'fa-rotate-left', title: 'Forget where you dragged nodes and let them settle again' }) : null));

    if (!graph.nodes.length) {
        return h('div', { class: 'sb-graph' }, toolbar, h('div', { class: 'sb-callout sb-callout-big' }, icon('fa-diagram-project'),
            h('div', {}, h('b', {}, entries.length ? 'Nothing matches these filters.' : 'The setting is empty.'), h('div', {}, entries.length ? 'Show more types, or turn off "In play only".' : 'Add places, people and factions in the catalog - their links appear here.'))));
    }

    // ---- region boxes, edges, then nodes on top
    const world = s('g', { class: 'sb-graph-world' });
    const nameOf = new Map(entries.map((e) => [e.id, e.name]));
    const regionLayer = s('g', { class: 'sb-graph-regions' });
    const regionEls = [];
    if (grouping) {
        const shown = new Set(graph.nodes.map((n) => n.id));
        const members = new Map();
        for (const id of shown) if (regions[id]) members.set(regions[id], [...(members.get(regions[id]) ?? []), id]);
        for (const [region, ids] of members) {
            if (ids.length < 2) continue;
            const rect = s('rect', { class: 'sb-gregion', rx: 18 });
            const label = s('text', { class: 'sb-gregion-label' }, nameOf.get(region) ?? 'Region');
            regionEls.push({ ids, rect, label });
            regionLayer.append(rect, label);
        }
    }
    const placeRegions = () => {
        for (const { ids, rect, label } of regionEls) {
            const b = regionBox(ids.map((id) => pos[id]), 42);
            rect.setAttribute('x', b.x); rect.setAttribute('y', b.y); rect.setAttribute('width', b.width); rect.setAttribute('height', b.height);
            label.setAttribute('x', b.x + 14); label.setAttribute('y', b.y + 20);
        }
    };
    placeRegions();

    const edgeEls = [];
    const edgeLayer = s('g', { class: 'sb-graph-edges' });
    const labelLayer = s('g', { class: 'sb-graph-edge-labels' });
    for (const e of graph.edges) {
        const a = pos[e.source];
        const b = pos[e.target];
        const line = s('line', { class: `sb-gedge sb-gedge-${e.kind}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        const hit = s('line', { class: 'sb-gedge-hit', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, s('title', {}, `${nameOf.get(e.source)} - ${e.label} - ${nameOf.get(e.target)}`));
        const at = labelPoint(a, b);
        const text = e.kind === 'parent' ? null : s('text', { class: `sb-gedge-label sb-gedge-label-${e.kind}`, x: at.x, y: at.y }, shortLabel(e.label));
        edgeEls.push({ e, line, hit, text });
        edgeLayer.append(line, hit);
        if (text) labelLayer.append(text);
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
    // The line drawn while linking two nodes.
    const rubber = s('line', { class: 'sb-glink', x1: 0, y1: 0, x2: 0, y2: 0, visibility: 'hidden' });
    world.append(regionLayer, edgeLayer, labelLayer, rubber, nodeLayer);
    svg.append(world);

    const stage = h('div', { class: 'sb-graph-stage' }, svg);
    const entryById = new Map(entries.map((e) => [e.id, e]));
    wireInteraction({ svg, graph, pos, nodeEls, edgeEls, settingId, rubber, placeRegions, onLink: (fromId, toId) => openLinkChooser(stage, entryById.get(fromId), entryById.get(toId), byType) });

    const legend = h('div', { class: 'sb-graph-legend' },
        Object.entries(EDGE_LABELS).filter(([kind]) => kind !== 'story' || story.length).map(([kind, label]) => h('span', {}, s('svg', { width: 26, height: 8 }, s('line', { class: `sb-gedge sb-gedge-${kind}`, x1: 1, y1: 4, x2: 25, y2: 4 })), ` ${label}`)),
        h('span', {}, icon('fa-thumbtack'), ' dragged nodes stay put'),
        h('span', {}, icon('fa-link'), ' Link (or Shift) + drag between nodes links them'),
        h('small', { class: 'sb-hint' }, `${graph.nodes.length} entries · ${graph.edges.length} links`));

    const wrap = h('div', { class: 'sb-graph' }, toolbar, stage, legend);
    // Size-dependent framing once the SVG is on the page.
    requestAnimationFrame(() => {
        if (ws.graphView) applyView(svg);
        else fit(svg, pos);
    });
    return wrap;
}

// ---- linking two nodes

// The chooser shown when a link is dropped: what the link becomes.
async function openLinkChooser(stage, source, target, byType) {
    if (!source || !target || source.id === target.id) return;
    stage.querySelector('.sb-glink-chooser')?.remove();
    const { chatId, settingId } = ws.ctx;
    const defs = new Map();
    for (const typeId of new Set([source.type, target.type])) {
        const type = byType.get(typeId);
        defs.set(typeId, type ? await baselineFields(settingId, type) : []);
    }
    const options = linkOptions(source, target, (typeId) => defs.get(typeId));
    let choice = 0;
    const kindInput = h('input', { class: 'text_pole', list: 'sb-glink-kinds', placeholder: 'ally, rival, mentor of…', value: 'knows' });
    const noteInput = h('input', { class: 'text_pole', placeholder: 'Note (optional)' });
    const relationRow = h('div', { class: 'sb-row' }, kindInput, noteInput,
        h('datalist', { id: 'sb-glink-kinds' }, RELATION_KINDS.map((k) => h('option', { value: k }))));
    const showRelation = () => { relationRow.hidden = options[choice].kind !== 'relation'; };
    const picker = h('select', { class: 'text_pole', onchange: (e) => { choice = Number(e.target.value); showRelation(); } },
        options.map((o, i) => h('option', { value: i }, o.label)));
    const close = () => chooser.remove();
    const add = async () => {
        const o = options[choice];
        try {
            if (o.kind === 'field') {
                if (!await addLink(chatId, settingId, o.owner, o.field, o.other, { multiple: o.multiple })) throw new Error('State Engine refused the change');
            } else if (o.kind === 'route') {
                // The travel time is guessed from the two places, to edit on their sheets.
                const places = new Map([source, target].map((p) => [p.id, { name: p.name, description: p.base?.description ?? p.description ?? '' }]));
                const guess = guessRoute(source.id, target.id, { up: (id) => [id], places, techLevel: getOverview(settingId)?.tech?.level ?? '' });
                addRoute(settingId, { from: source.id, to: target.id, travel: guess?.travel ?? '10 minutes', note: 'guessed - edit if wrong', guessed: true });
            } else {
                const kind = kindInput.value.trim() || 'knows';
                addRelation(settingId, { from: source.id, to: target.id, kind, note: noteInput.value.trim(), mutual: MUTUAL_KINDS.has(kind) });
            }
            close();
            toast('success', 'Linked.');
            await syncNow();
            rerender();
        } catch (err) {
            toast('error', `Could not link them: ${err?.message ?? err}`);
        }
    };
    const chooser = h('div', { class: 'sb-glink-chooser sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-link'), ` Link ${source.name} and ${target.name}`),
        picker, relationRow,
        h('div', { class: 'sb-actions' }, button('Add link', () => void add(), { iconName: 'fa-check', cls: 'sb-primary' }), button('Cancel', close, { iconName: 'fa-xmark' })));
    showRelation();
    stage.append(chooser);
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

function zoomTo(svg, k, px, py, from = ws.graphView ?? { tx: 0, ty: 0, k: 1 }) {
    const next = Math.min(3, Math.max(0.15, k));
    const f = next / from.k;
    ws.graphView = { k: next, tx: px - (px - from.tx) * f, ty: py - (py - from.ty) * f };
    applyView(svg);
}

function zoomBy(svg, factor, cx = null, cy = null) {
    const rect = svg.getBoundingClientRect();
    const v = ws.graphView ?? { tx: 0, ty: 0, k: 1 };
    zoomTo(svg, v.k * factor, cx ?? rect.width / 2, cy ?? rect.height / 2);
}

// ---- dragging nodes, linking, panning, pinching, hovering, clicking

function wireInteraction({ svg, graph, pos, nodeEls, edgeEls, settingId, rubber, placeRegions, onLink }) {
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
        for (const { e, line, hit, text } of edgeEls) {
            if (e.source !== id && e.target !== id) continue;
            for (const el of [line, hit]) {
                if (e.source === id) { el.setAttribute('x1', p.x); el.setAttribute('y1', p.y); }
                if (e.target === id) { el.setAttribute('x2', p.x); el.setAttribute('y2', p.y); }
            }
            if (text) {
                const at = labelPoint(pos[e.source], pos[e.target]);
                text.setAttribute('x', at.x); text.setAttribute('y', at.y);
            }
        }
        placeRegions();
    };
    const highlight = (id) => {
        const near = id ? neighbours.get(id) : null;
        svg.classList.toggle('sb-graph-focus', !!near);
        for (const [nid, el] of nodeEls) el.classList.toggle('sb-lit', !!near && near.has(nid));
        for (const { e, line, text } of edgeEls) {
            const lit = !!near && (e.source === id || e.target === id);
            line.classList.toggle('sb-lit', lit);
            text?.classList.toggle('sb-lit', lit);
        }
    };
    // The node under a point (for dropping a link), or null.
    const nodeAt = (ev) => {
        const w = toWorld(ev);
        let best = null;
        for (const n of graph.nodes) {
            const d = Math.hypot(pos[n.id].x - w.x, pos[n.id].y - w.y);
            if (d <= NODE_R + 6 && (!best || d < best.d)) best = { id: n.id, d };
        }
        return best?.id ?? null;
    };

    // Two fingers on the canvas zoom; one drags.
    const pointers = new Map();
    let pinch = null; // { d0, view, mid }
    const startPinch = () => {
        const [a, b] = [...pointers.values()];
        const rect = svg.getBoundingClientRect();
        pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), view: { ...(ws.graphView ?? { tx: 0, ty: 0, k: 1 }) }, mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top } };
        drag = null;
        rubber.setAttribute('visibility', 'hidden');
        highlight(null);
    };

    let drag = null; // { kind: 'node' | 'link' | 'pan', id?, start, origin, moved }
    for (const n of graph.nodes) {
        const el = nodeEls.get(n.id);
        el.addEventListener('pointerenter', () => { if (!drag) highlight(n.id); });
        el.addEventListener('pointerleave', () => { if (!drag) highlight(null); });
        el.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            svg.setPointerCapture(ev.pointerId);
            pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
            if (pointers.size === 2) return startPinch();
            const linking = ws.graphLinking === true || ev.shiftKey;
            drag = { kind: linking ? 'link' : 'node', id: n.id, type: n.type, start: { x: ev.clientX, y: ev.clientY }, origin: { ...pos[n.id] }, grab: toWorld(ev), moved: false };
            highlight(n.id);
        });
    }
    svg.addEventListener('pointerdown', (ev) => {
        svg.setPointerCapture(ev.pointerId);
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pointers.size === 2) return startPinch();
        const v = ws.graphView ?? { tx: 0, ty: 0, k: 1 };
        drag = { kind: 'pan', start: { x: ev.clientX, y: ev.clientY }, origin: { x: v.tx, y: v.ty }, moved: false };
        svg.classList.add('sb-panning');
    });
    svg.addEventListener('pointermove', (ev) => {
        if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pinch && pointers.size >= 2) {
            const [a, b] = [...pointers.values()];
            zoomTo(svg, pinch.view.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0), pinch.mid.x, pinch.mid.y, pinch.view);
            return;
        }
        if (!drag) return;
        const dx = ev.clientX - drag.start.x;
        const dy = ev.clientY - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        if (drag.kind === 'pan') {
            ws.graphView = { ...(ws.graphView ?? { k: 1 }), tx: drag.origin.x + dx, ty: drag.origin.y + dy };
            applyView(svg);
        } else if (drag.kind === 'link') {
            const w = toWorld(ev);
            rubber.setAttribute('x1', drag.origin.x); rubber.setAttribute('y1', drag.origin.y);
            rubber.setAttribute('x2', w.x); rubber.setAttribute('y2', w.y);
            rubber.setAttribute('visibility', 'visible');
        } else {
            const w = toWorld(ev);
            moveNode(drag.id, { x: drag.origin.x + (w.x - drag.grab.x), y: drag.origin.y + (w.y - drag.grab.y) });
        }
    });
    const end = (ev) => {
        pointers.delete(ev.pointerId);
        if (pinch) {
            if (pointers.size < 2) pinch = null;
            return;
        }
        if (!drag) return;
        const d = drag;
        drag = null;
        svg.classList.remove('sb-panning');
        rubber.setAttribute('visibility', 'hidden');
        if (d.kind === 'link') {
            const to = d.moved ? nodeAt(ev) : null;
            if (to && to !== d.id) onLink(d.id, to);
            else if (!d.moved) openSheet(d.id, d.type);
        } else if (d.kind === 'node') {
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
