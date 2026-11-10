// Who can go on a job. Assassins Inc: Tadam Chi, taken by Cyril's side and
// processed into White Cerberus's custody, turned up on the Medina
// Syndicate's next crew - nothing had him down as held, and the crew was
// picked from the faction's people as if all of them were free. Pure.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => clean(s).toLowerCase();

// detained, dead: the chat's records ([{ id, name }]); captives: those the
// player's posts have taken and not let go ([{ name }]).
// -> { ids: Set, names: Set } of those who cannot go.
export function offTheJob({ detained = [], dead = [], captives = [] } = {}) {
    const all = [...(detained ?? []), ...(dead ?? []), ...(captives ?? [])];
    return { ids: new Set(all.map((x) => x?.id).filter(Boolean)), names: new Set(all.map((x) => key(x?.name)).filter(Boolean)) };
}

// Whether someone ({ name, objectId, aliases }) is one of them.
export const isOff = (p, off) => !!p && ((!!p.objectId && off.ids.has(p.objectId)) || [p.name, ...(p.aliases ?? [])].some((n) => off.names.has(key(n))));

// A plan without them. A held leader hands the job to the first of the
// crew still free.
export function dropUnavailable(plan, off) {
    if (!plan) return plan;
    const crew = (plan.crew ?? []).filter((c) => !isOff(c, off));
    if (!plan.leader || !isOff(plan.leader, off)) return { ...plan, crew };
    const [next, ...rest] = crew;
    return { ...plan, leader: next ? { ...plan.leader, name: next.name, objectId: next.objectId ?? '' } : { ...plan.leader, name: '', objectId: '' }, crew: rest };
}
