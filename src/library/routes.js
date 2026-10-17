// Routes between places (SB-111): which places connect, how long the
// journey takes ("2 hours", "half a day by cart"), and a note (the coast
// road, a hidden passage). Kept in the setting document; both ends see a
// route. When the scene moves along one, the clock skips ahead by its
// travel time (src/calendar/clock.js), and the guidance and the director
// mention the ways on from where the scene is.

import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { newLocalId } from '../store/schema.js';

// ---- pure

// The routes touching a place, seen from it: [{ route, otherId }].
export function routesFrom(placeId, routes) {
    return (routes ?? []).filter((r) => r.from === placeId || r.to === placeId).map((route) => ({ route, otherId: route.from === placeId ? route.to : route.from }));
}

// The route between two places, either way, or null.
export function routeBetween(a, b, routes) {
    return (routes ?? []).find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) ?? null;
}

// The route that covers a move from `fromId` to `toId`: a direct one, else
// one between places they are inside (leaving a tavern in one town for an
// inn in the next still takes the road between the towns). `pathOf` gives
// a place's chain of containing places, innermost first.
export function routeForMove(fromId, toId, routes, pathOf) {
    if (!fromId || !toId || fromId === toId) return null;
    const direct = routeBetween(fromId, toId, routes);
    if (direct) return direct;
    const up = (id) => [id, ...(pathOf(id) ?? []).filter((x) => x !== id)];
    const a = up(fromId);
    const b = up(toId);
    // Moving within one place (both inside the same town) takes no route.
    for (const x of a) for (const y of b) {
        if (x === y) return null;
        const r = routeBetween(x, y, routes);
        if (r) return r;
    }
    return null;
}

// ---- stored

export function listRoutes(settingId) {
    return getSettingDoc(settingId).routes ?? [];
}

// route: { from, to, travel, note }. One route per pair: a new one replaces it.
export function addRoute(settingId, route) {
    const stored = { id: newLocalId('rt'), from: route.from, to: route.to, travel: String(route.travel ?? '').trim(), note: String(route.note ?? '').trim() };
    if (!stored.from || !stored.to || stored.from === stored.to) return null;
    updateSettingDoc(settingId, (d) => {
        d.routes = [...(d.routes ?? []).filter((r) => !((r.from === stored.from && r.to === stored.to) || (r.from === stored.to && r.to === stored.from))), stored];
    });
    return stored;
}

export function updateRoute(settingId, id, patch) {
    updateSettingDoc(settingId, (d) => { d.routes = (d.routes ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)); });
}

export function removeRoute(settingId, id) {
    updateSettingDoc(settingId, (d) => { d.routes = (d.routes ?? []).filter((r) => r.id !== id); });
}
