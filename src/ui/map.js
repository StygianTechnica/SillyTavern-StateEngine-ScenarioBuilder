// The location map (SB-141: "a map-like outline"): the Locations chapter's
// Map view. One level of the location tree at a time - the top-level
// places first; click a place that holds others to go inside it, the
// breadcrumb to come back out. Each place is a tile the user drags to where
// it lies (saved per setting); the routes between the places on the level
// are drawn with their travel times.
//
// Guessing distances: the routes whose time the user set give the level a
// scale; each guessed route then shows what the map says it takes (a
// dashed label) and "Apply map estimates" writes those times in. Placing
// places roughly is all it needs. Model: src/ui/map-model.js.

import { listRoutes, updateRoute, addRoute, guessRoute } from '../library/routes.js';
import { getParents, getMapPositions, setMapPosition, getPlaceOverview } from '../library/library.js';
import { syncNow } from '../guidance/sync.js';
import { levelPlaces, levelRoutes, insideCounts, mapScale, estimates, seedPositions, formatMinutes } from './map-model.js';
import { labelPoint, boundsOf } from './graph-layout.js';
import { ws, rerender, openSheet } from './ws.js';
import { h, icon, button, toast } from './dom.js';
import { safeImageSrc } from '../images/attach.js';

const SVG = 'http://www.w3.org/2000/svg';
const TILE_W = 150;
const TILE_H = 64;

function s(tag, attrs = {}, ...children) {
    const el = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) el.setAttribute(key, String(value));
    for (const child of children.flat()) if (child) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return el;
}

const short = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// locations: the setting's location entries; doc: the chat document.
export function locationMap(locations, doc) {
    const { settingId } = ws.ctx;
    const parents = getParents(settingId);
    const byId = new Map(locations.map((l) => [l.id, l]));
    // The level shown: a place still in the library, else the top.
    if (ws.mapParent && !byId.has(ws.mapParent)) ws.mapParent = null;
    const parentId = ws.mapParent ?? null;
    const places = levelPlaces(locations, parents, parentId);
    const counts = insideCounts(locations, parents);
    const saved = getMapPositions(settingId);
    const pos = seedPositions(places, saved);
    const routes = levelRoutes(listRoutes(settingId), places.map((p) => p.id));
    const scale = mapScale(routes, pos);
    const guesses = estimates(routes, pos, scale);
    const scenePath = new Set();
    for (let at = doc?.canonical?.locationId; at && !scenePath.has(at); at = parents[at]) scenePath.add(at);

    // ---- breadcrumb and tools
    const trail = [];
    for (let at = parentId; at; at = parents[at]) trail.unshift(at);
    const crumb = h('div', { class: 'sb-map-crumbs' },
        crumbLink(null, h('span', {}, icon('fa-earth-americas'), ' The world'), !parentId),
        trail.map((id) => [h('span', { class: 'sb-hint' }, ' › '),
            crumbLink(id, byId.get(id)?.name ?? '?', id === parentId)]));
    const apply = () => {
        for (const g of guesses) updateRoute(settingId, g.route.id, { travel: g.travel });
        toast('success', `Updated ${guesses.length} guessed route${guesses.length === 1 ? '' : 's'} from the map.`);
        void syncNow().then(() => rerender());
    };
    const tools = h('div', { class: 'sb-actions sb-push' },
        scale ? h('small', { class: 'sb-hint', title: 'From the routes whose travel time you set, on this level' }, icon('fa-ruler'), ` scale: ${scaleText(scale)}`)
            : h('small', { class: 'sb-hint', title: 'Set the travel time of a route here (on a place\'s sheet) to give the map a scale' }, icon('fa-ruler'), ' no scale yet'),
        guesses.length ? button(`Apply map estimates (${guesses.length})`, apply, { iconName: 'fa-wand-magic', title: 'Write what the map says into the guessed routes on this level' }) : null,
        parentId ? button('Open sheet', () => openSheet(parentId, 'location'), { iconName: 'fa-book-open' }) : null);

    if (!places.length) {
        return h('div', { class: 'sb-map' }, h('div', { class: 'sb-toolbar' }, crumb, tools),
            h('div', { class: 'sb-callout' }, icon('fa-map'), h('span', {}, parentId ? 'Nothing is inside this place yet.' : 'No places yet.')));
    }

    // ---- the canvas: routes, their labels, then the tiles
    const svg = s('svg', { class: 'sb-map-svg', role: 'img', 'aria-label': 'Location map' });
    const world = s('g', { class: 'sb-map-world' });
    const routeEls = [];
    const estimateOf = new Map(guesses.map((g) => [g.route.id, g.travel]));
    for (const r of routes) {
        const a = pos[r.from];
        const b = pos[r.to];
        const line = s('line', { class: `sb-map-route${r.guessed ? ' sb-map-route-guess' : ''}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        const at = labelPoint(a, b);
        const est = estimateOf.get(r.id);
        const label = s('text', { class: 'sb-map-route-label', x: at.x, y: at.y },
            r.travel || '?', r.guessed ? s('tspan', { class: 'sb-map-route-guess-mark' }, ' (guess)') : null,
            est ? s('tspan', { class: 'sb-map-route-estimate', x: at.x, dy: 14 }, `map: ≈ ${est}`) : null);
        line.append(s('title', {}, `${byId.get(r.from)?.name} - ${byId.get(r.to)?.name}: ${r.travel}${r.note && !r.guessed ? ` (${r.note})` : ''}`));
        routeEls.push({ r, line, label });
        world.append(line, label);
    }
    const tiles = new Map();
    for (const p of places) {
        const at = pos[p.id];
        const inside = counts[p.id] ?? 0;
        const here = scenePath.has(p.id);
        const src = safeImageSrc(p.image);
        const g = s('g', { class: `sb-map-tile${here ? ' sb-map-tile-here' : ''}${inside ? ' sb-map-tile-deep' : ''}`, transform: `translate(${at.x} ${at.y})`, tabindex: 0 });
        g.append(s('title', {}, `${p.name}${inside ? ` - ${inside} place${inside === 1 ? '' : 's'} inside: click to go in` : ' - click to open its sheet'}${here ? '\nThe scene is here' : ''}`));
        g.append(s('rect', { class: 'sb-map-tile-box', x: -TILE_W / 2, y: -TILE_H / 2, width: TILE_W, height: TILE_H, rx: 12 }));
        if (src) {
            const clip = `sbmap${p.id.replace(/\W/g, '')}`;
            g.append(s('clipPath', { id: clip }, s('rect', { x: -TILE_W / 2, y: -TILE_H / 2, width: TILE_W, height: TILE_H, rx: 12 })),
                s('image', { href: src, x: -TILE_W / 2, y: -TILE_H / 2, width: TILE_W, height: TILE_H, 'clip-path': `url(#${clip})`, preserveAspectRatio: 'xMidYMid slice', class: 'sb-map-tile-image' }));
        }
        g.append(s('text', { class: 'sb-map-tile-name', y: inside ? -4 : 5 }, short(p.name, 20)));
        if (inside) g.append(s('text', { class: 'sb-map-tile-count', y: 16 }, `${inside} inside ›`));
        if (here) g.append(s('circle', { class: 'sb-map-tile-pin', cx: TILE_W / 2 - 10, cy: -TILE_H / 2 + 10, r: 5 }));
        g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') enter(p, inside); });
        tiles.set(p.id, g);
        world.append(g);
    }
    svg.append(world);

    const enter = (p, inside) => {
        if (inside) { ws.mapParent = p.id; ws.mapView = null; rerender(); } else openSheet(p.id, 'location');
    };
    wireMap({ svg, world, pos, tiles, routeEls, places, settingId, enter, counts });

    const hint = h('small', { class: 'sb-hint sb-map-hint' }, icon('fa-hand'), ' Drag places to where they lie. Click one to go inside it (or open its sheet). Shift + drag from one place to another to add a route.');
    requestAnimationFrame(() => {
        if (ws.mapView?.parent === parentId) applyView(svg);
        else fit(svg, pos, parentId);
    });
    return h('div', { class: 'sb-map' }, h('div', { class: 'sb-toolbar' }, crumb, tools), h('div', { class: 'sb-map-stage' }, svg), hint);
}

// A breadcrumb step: a button to that level (the current one is not).
function crumbLink(id, label, current) {
    const go = () => { ws.mapParent = id; ws.mapView = null; rerender(); };
    return h('span', current
        ? { class: 'sb-linkchip active', 'aria-current': 'page', title: 'You are here' }
        : { class: 'sb-linkchip', role: 'button', tabindex: 0, title: id ? 'Show the places inside this one' : 'Show the top-level places', onclick: go, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } }, label);
}

function scaleText(minutesPerUnit) {
    // Per 100 units on the map (about a tile's width and a half).
    const m = minutesPerUnit * 100;
    if (m < 60) return `${Math.round(m)} min per step`;
    if (m < 60 * 24) return `${Math.round(m / 6) / 10} h per step`;
    return `${Math.round(m / 144) / 10} days per step`;
}

// ---- view

function applyView(svg) {
    const v = ws.mapView ?? { tx: 0, ty: 0, k: 1 };
    svg.querySelector('.sb-map-world')?.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k})`);
}

function fit(svg, pos, parent) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const b = boundsOf(pos, 110);
    const k = Math.min(1.6, Math.max(0.25, Math.min(rect.width / b.width, rect.height / b.height)));
    ws.mapView = { parent, k, tx: (rect.width - b.width * k) / 2 - b.x * k, ty: (rect.height - b.height * k) / 2 - b.y * k };
    applyView(svg);
}

function zoomAt(svg, factor, px, py) {
    const v = ws.mapView ?? { tx: 0, ty: 0, k: 1 };
    const k = Math.min(3, Math.max(0.2, v.k * factor));
    const f = k / v.k;
    ws.mapView = { ...v, k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f };
    applyView(svg);
}

// ---- dragging tiles, drawing routes, panning, zooming

function wireMap({ svg, pos, tiles, routeEls, places, settingId, enter, counts }) {
    const toWorld = (ev) => {
        const rect = svg.getBoundingClientRect();
        const v = ws.mapView ?? { tx: 0, ty: 0, k: 1 };
        return { x: (ev.clientX - rect.left - v.tx) / v.k, y: (ev.clientY - rect.top - v.ty) / v.k };
    };
    const move = (id, p) => {
        pos[id] = p;
        tiles.get(id).setAttribute('transform', `translate(${p.x} ${p.y})`);
        for (const { r, line, label } of routeEls) {
            if (r.from !== id && r.to !== id) continue;
            line.setAttribute('x1', pos[r.from].x); line.setAttribute('y1', pos[r.from].y);
            line.setAttribute('x2', pos[r.to].x); line.setAttribute('y2', pos[r.to].y);
            const at = labelPoint(pos[r.from], pos[r.to]);
            label.setAttribute('x', at.x); label.setAttribute('y', at.y);
            for (const t of label.querySelectorAll('tspan[dy]')) t.setAttribute('x', at.x);
        }
    };
    const tileAt = (ev) => {
        const w = toWorld(ev);
        return places.find((p) => Math.abs(pos[p.id].x - w.x) <= TILE_W / 2 && Math.abs(pos[p.id].y - w.y) <= TILE_H / 2)?.id ?? null;
    };
    const rubber = s('line', { class: 'sb-glink', visibility: 'hidden' });
    svg.querySelector('.sb-map-world').append(rubber);

    const pointers = new Map();
    let pinch = null;
    let drag = null;
    for (const p of places) {
        tiles.get(p.id).addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            svg.setPointerCapture(ev.pointerId);
            pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
            if (pointers.size === 2) { pinch = pinchStart(); drag = null; return; }
            drag = { kind: ev.shiftKey ? 'route' : 'tile', id: p.id, start: { x: ev.clientX, y: ev.clientY }, origin: { ...pos[p.id] }, grab: toWorld(ev), moved: false };
        });
    }
    const pinchStart = () => {
        const [a, b] = [...pointers.values()];
        const rect = svg.getBoundingClientRect();
        return { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), view: { ...(ws.mapView ?? { tx: 0, ty: 0, k: 1 }) }, mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top } };
    };
    svg.addEventListener('pointerdown', (ev) => {
        svg.setPointerCapture(ev.pointerId);
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pointers.size === 2) { pinch = pinchStart(); drag = null; return; }
        const v = ws.mapView ?? { tx: 0, ty: 0, k: 1 };
        drag = { kind: 'pan', start: { x: ev.clientX, y: ev.clientY }, origin: { x: v.tx, y: v.ty }, moved: false };
    });
    svg.addEventListener('pointermove', (ev) => {
        if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pinch && pointers.size >= 2) {
            const [a, b] = [...pointers.values()];
            const f = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0;
            ws.mapView = pinch.view;
            zoomAt(svg, f, pinch.mid.x, pinch.mid.y);
            return;
        }
        if (!drag) return;
        const dx = ev.clientX - drag.start.x;
        const dy = ev.clientY - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        if (drag.kind === 'pan') {
            ws.mapView = { ...(ws.mapView ?? { k: 1 }), tx: drag.origin.x + dx, ty: drag.origin.y + dy };
            applyView(svg);
        } else if (drag.kind === 'route') {
            const w = toWorld(ev);
            for (const [k, v] of [['x1', drag.origin.x], ['y1', drag.origin.y], ['x2', w.x], ['y2', w.y]]) rubber.setAttribute(k, v);
            rubber.setAttribute('visibility', 'visible');
        } else {
            const w = toWorld(ev);
            move(drag.id, { x: drag.origin.x + (w.x - drag.grab.x), y: drag.origin.y + (w.y - drag.grab.y) });
        }
    });
    const end = (ev) => {
        pointers.delete(ev.pointerId);
        if (pinch) { if (pointers.size < 2) pinch = null; return; }
        if (!drag) return;
        const d = drag;
        drag = null;
        rubber.setAttribute('visibility', 'hidden');
        const place = places.find((p) => p.id === d.id);
        if (d.kind === 'tile') {
            if (d.moved) {
                setMapPosition(settingId, d.id, pos[d.id]);
                // Estimates follow the new distances.
                rerender();
            } else enter(place, counts[d.id] ?? 0);
        } else if (d.kind === 'route') {
            const to = d.moved ? tileAt(ev) : null;
            if (to && to !== d.id) addMapRoute(settingId, place, places.find((p) => p.id === to), pos);
            else if (!d.moved) enter(place, counts[d.id] ?? 0);
        }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const rect = svg.getBoundingClientRect();
        zoomAt(svg, ev.deltaY < 0 ? 1.12 : 0.9, ev.clientX - rect.left, ev.clientY - rect.top);
    }, { passive: false });
}

// A route drawn between two tiles: guessed from the map when it has a
// scale, else from the places' size (src/library/routes.js).
function addMapRoute(settingId, a, b, pos) {
    const routes = listRoutes(settingId);
    const scale = mapScale(routes, pos);
    const fromMap = scale ? Math.hypot(pos[a.id].x - pos[b.id].x, pos[a.id].y - pos[b.id].y) * scale : null;
    const places = new Map([a, b].map((p) => [p.id, { name: p.name, description: p.base?.description ?? p.description ?? '' }]));
    const guess = guessRoute(a.id, b.id, { up: (id) => [id], places, techLevel: getPlaceOverview(settingId, a.id)?.tech?.level ?? '' });
    const travel = (fromMap && formatMinutes(fromMap)) || guess?.travel || '10 minutes';
    addRoute(settingId, { from: a.id, to: b.id, travel, note: 'guessed - edit if wrong', guessed: true });
    toast('success', `Route added: ${a.name} - ${b.name}, ${travel} (a guess - change it on either place's sheet).`);
    void syncNow().then(() => rerender());
}

