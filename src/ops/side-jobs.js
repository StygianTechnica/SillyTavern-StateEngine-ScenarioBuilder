// More than one rival job at a time: doc.op is the one the game master plays
// in full, doc.opsAlso the other going on at once - a faction war the player
// character stumbles into, each side working against the other. The other job
// costs one line in the briefing, so it fits a small model. Pure.

import { isLive, currentStep, normalizeOp } from './model.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const AT_ODDS = /distrust|mistrust|enem|rival|hostil|\bwar\b|oppos|hate|feud|against|suspic|wary|target(?:s|ed|ing)?\b|hunt\w*|competit/i;

// How many may run beside the main one.
export const MAX_ALSO = 1;

export const liveJobs = (doc) => [doc?.op, ...(doc?.opsAlso ?? [])].filter(isLive);
export const roomForJob = (doc) => liveJobs(doc).length < 1 + MAX_ALSO;
export const normalizeOpsAlso = (list) => (Array.isArray(list) ? list.map(normalizeOp).filter(Boolean) : []).slice(-MAX_ALSO);

// Whether two sides work against each other: at odds in the setting, or on
// jobs at the same place.
export function sidesOppose(a, b, relations = []) {
    if (!a || !b || a.id === b.id) return false;
    if (a.placeId && a.placeId === b.placeId) return true;
    if (!a.sideId || !b.sideId) return false;
    return (relations ?? []).some((r) => AT_ODDS.test(clean(r?.kind)) && ((r.from === a.sideId && r.to === b.sideId) || (r.from === b.sideId && r.to === a.sideId)));
}

// The briefing's line for the job beside the main one. '' when there is none.
export function alsoFacts(also = []) {
    return (also ?? []).filter(isLive).map((o) => {
        const step = currentStep(o)?.text;
        return `Also at work, out of this scene unless the story brings them: ${clean(o.side)}, after ${clean(o.aim)}${o.placeName ? ` at ${clean(o.placeName)}` : ''}${step ? `. Their step now: ${clean(step)}` : ''}.${o.opposes ? ` They and ${clean(o.opposes)} are working against each other: each watches the other, gets in the other's way and answers what the other does.` : ''}`;
    }).join('\n');
}

// Which job comes first: the one the scene has its people in. -> [main, ...also].
export function focused(op, also = [], { castIds = [] } = {}) {
    const inScene = (o) => [o?.leader?.objectId, ...(o?.crew ?? []).map((c) => c?.objectId)].some((id) => id && castIds.includes(id));
    const first = (also ?? []).find((o) => isLive(o) && inScene(o));
    if (!first || !isLive(op) || inScene(op)) return [op, ...(also ?? [])];
    return [first, op, ...(also ?? []).filter((o) => o !== first)];
}

// Once a turn has passed, those over go to the record and the other takes
// the main place. -> { op, also, done: [operations over] }.
export function settled(op, also = [], turn = 0) {
    const finished = (o) => !isLive(o) && o?.at?.turn !== turn;
    const done = (also ?? []).filter((o) => o && finished(o));
    let rest = (also ?? []).filter((o) => o && !finished(o));
    let main = op ?? null;
    if (main && finished(main) && rest.some(isLive)) {
        const next = rest.find(isLive);
        done.push(main);
        rest = rest.filter((o) => o !== next);
        main = next;
    }
    return { op: main, also: rest, done };
}
