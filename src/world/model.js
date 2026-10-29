// The world meanwhile - the pure half (docs/DESIGN - THE WORLD MEANWHILE.md,
// phase 1). People and factions who are not in the scene pursue things of
// their own: something happens (a ripple), code works out who would care
// (the stakeholders), and the DAY pass, when an in-game day begins, says
// what each one does about it (a scheme, moved on a step at a time). What
// they do is kept in a side log; some of it reaches the story as a rumour,
// news, a trace or someone coming to find the player character (surfaced
// lines the director reads in its MEANWHILE section). No SillyTavern
// imports, so all of it is unit-tested; the runner is src/world/run.js.
//
// gm.world: {
//   ripples:  [{ id, kind, text, day, ties: [id], reach, takenUp, at }]  the last RIPPLE_LIMIT
//     kind: 'belief' | 'secret' | 'oath' | 'quest' | 'death' | 'user'
//     reach: who could know of it - 'here' (only those present), 'local', 'everyone'
//   schemes:  [scheme]
//     scheme = { id, who: [id], names: [name], aim, motive, from, steps: [text],
//                done (steps done), nextDay, aboutPlayer, visibility, status, startedDay, held, at }
//   log:      [{ day, text, schemeId, veiled }]                         the last LOG_LIMIT
//   surfaced: [{ id, way, text, where, whereId, who: [id], schemeId, fromDay, untilDay,
//                shownFor: [userIndex], hostile }]
//   seen:     { primed, quests: { id: status }, dead: [id], knowledge: { id: status },
//               beliefs: { beliefId: count } }       what was there last time, to find ripples
//   dismissed: [key]                                 schemes the user ended: not started again
//   lastDay                                          the in-game day the world last moved
// }

export const WORLD_LEVELS = Object.freeze([['off', 'Off'], ['quiet', 'Quiet']]);
export const SURFACINGS = Object.freeze([['all', 'Everything'], ['talk', 'Rumours and news only'], ['log', 'Side log only']]);
// Per level: schemes under way at once, stakeholders put to the DAY pass,
// new schemes a pass may start, lines that may surface per in-game day.
export const LEVEL_LIMITS = Object.freeze({
    quiet: Object.freeze({ schemes: 3, stakeholders: 3, start: 1, surface: 1 }),
});
export const SCHEME_STATUSES = Object.freeze(['under way', 'stalled', 'done', 'failed', 'dropped']);
export const VISIBILITIES = Object.freeze(['hidden', 'traces', 'rumoured', 'public']);
export const ABOUT_PLAYER = Object.freeze(['seeks', 'watches', 'opposes', 'helps', 'none']);
export const SURFACE_WAYS = Object.freeze(['rumour', 'news', 'trace', 'approach']);
const TALK_WAYS = new Set(['rumour', 'news']);
const REACHES = ['here', 'local', 'everyone'];

const RIPPLE_LIMIT = 20;
const LOG_LIMIT = 120;
const SURFACED_LIMIT = 12;
const SCHEME_LIMIT = 16;
const DISMISSED_LIMIT = 60;
// A surfaced line is shown for this many player messages, then retired.
export const SHOWN_LIMIT = 3;
// And lasts this many in-game days from when it surfaces.
const SURFACE_DAYS = 3;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const clean = (v) => str(v).replace(/\s+/g, ' ').trim();
const cut = (v, n) => clean(v).slice(0, n);
const strList = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
const int = (v, fallback = 0) => (Number.isInteger(v) && v >= 0 ? v : fallback);
const intList = (v) => (Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : []);
const sentence = (text) => { const t = clean(text); return !t ? '' : /[.!?…]$/.test(t) ? t : `${t}.`; };
const unstop = (text) => clean(text).replace(/[.!?…]+$/, '');

export const limitsOf = (level) => LEVEL_LIMITS[level] ?? null;
export const worldOn = (level) => !!limitsOf(level);

export function emptyWorld() {
    return { ripples: [], schemes: [], log: [], surfaced: [], seen: emptySeen(), dismissed: [], lastDay: null };
}

function emptySeen() {
    return { primed: false, quests: {}, dead: [], knowledge: {}, beliefs: {} };
}

function normalizeRipple(r) {
    if (!isObject(r) || !clean(r.id) || !clean(r.text)) return null;
    return {
        id: clean(r.id),
        kind: ['belief', 'secret', 'oath', 'quest', 'death', 'user'].includes(r.kind) ? r.kind : 'user',
        text: cut(r.text, 300),
        day: Number.isInteger(r.day) ? r.day : null,
        ties: strList(r.ties).slice(0, 8),
        reach: REACHES.includes(r.reach) ? r.reach : 'local',
        takenUp: r.takenUp === true,
        at: str(r.at),
    };
}

function normalizeScheme(s) {
    if (!isObject(s) || !clean(s.id) || !clean(s.aim)) return null;
    const steps = strList(s.steps).slice(0, 6).map((t) => t.slice(0, 200));
    return {
        id: clean(s.id),
        who: strList(s.who).slice(0, 4),
        names: strList(s.names).slice(0, 4),
        aim: cut(s.aim, 200),
        motive: cut(s.motive, 200),
        from: cut(s.from, 200),
        steps,
        done: Math.min(int(s.done), steps.length),
        nextDay: Number.isInteger(s.nextDay) ? s.nextDay : null,
        aboutPlayer: ABOUT_PLAYER.includes(s.aboutPlayer) ? s.aboutPlayer : 'none',
        visibility: VISIBILITIES.includes(s.visibility) ? s.visibility : 'hidden',
        status: SCHEME_STATUSES.includes(s.status) ? s.status : 'under way',
        startedDay: Number.isInteger(s.startedDay) ? s.startedDay : null,
        // The user paused it: the world leaves it be until they let it go on.
        held: s.held === true,
        at: str(s.at),
    };
}

function normalizeSurfaced(x) {
    if (!isObject(x) || !clean(x.id) || !clean(x.text) || !SURFACE_WAYS.includes(x.way)) return null;
    return {
        id: clean(x.id),
        way: x.way,
        text: cut(x.text, 300),
        where: cut(x.where, 120),
        whereId: clean(x.whereId),
        who: strList(x.who).slice(0, 4),
        schemeId: clean(x.schemeId),
        fromDay: Number.isInteger(x.fromDay) ? x.fromDay : null,
        untilDay: Number.isInteger(x.untilDay) ? x.untilDay : null,
        shownFor: intList(x.shownFor).slice(-SHOWN_LIMIT),
        hostile: x.hostile === true,
    };
}

function normalizeSeen(v) {
    if (!isObject(v)) return emptySeen();
    const strMap = (m) => (isObject(m) ? Object.fromEntries(Object.entries(m).filter(([k, x]) => k && typeof x === 'string')) : {});
    const intMap = (m) => (isObject(m) ? Object.fromEntries(Object.entries(m).filter(([k, x]) => k && Number.isInteger(x))) : {});
    return { primed: v.primed === true, quests: strMap(v.quests), dead: strList(v.dead), knowledge: strMap(v.knowledge), beliefs: intMap(v.beliefs) };
}

export function normalizeWorld(value) {
    const w = isObject(value) ? value : {};
    return {
        ripples: (Array.isArray(w.ripples) ? w.ripples : []).map(normalizeRipple).filter(Boolean).slice(-RIPPLE_LIMIT),
        schemes: (Array.isArray(w.schemes) ? w.schemes : []).map(normalizeScheme).filter(Boolean).slice(-SCHEME_LIMIT),
        log: (Array.isArray(w.log) ? w.log : []).filter((l) => isObject(l) && clean(l.text))
            .map((l) => ({ day: Number.isInteger(l.day) ? l.day : null, text: cut(l.text, 300), schemeId: clean(l.schemeId), veiled: l.veiled !== false })).slice(-LOG_LIMIT),
        surfaced: (Array.isArray(w.surfaced) ? w.surfaced : []).map(normalizeSurfaced).filter(Boolean).slice(-SURFACED_LIMIT),
        seen: normalizeSeen(w.seen),
        dismissed: strList(w.dismissed).slice(-DISMISSED_LIMIT),
        lastDay: Number.isInteger(w.lastDay) ? w.lastDay : null,
    };
}

// ---------------------------------------------------------------- ripples (§3.1)

const sameText = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

// Adds a ripple, unless the same one is still waiting. -> the ripple, or null.
export function addRipple(world, { id, kind = 'user', text, day = null, ties = [], reach = 'local', at = new Date().toISOString() }) {
    const r = normalizeRipple({ id, kind, text, day, ties, reach, at });
    if (!r) return null;
    if (world.ripples.some((x) => !x.takenUp && sameText(x.text, r.text))) return null;
    world.ripples = [...world.ripples, r].slice(-RIPPLE_LIMIT);
    return r;
}

export const waitingRipples = (world) => world.ripples.filter((r) => !r.takenUp);

const ENDED = new Set(['Completed', 'Failed', 'Abandoned']);
const peopleIds = (list) => (list ?? []).map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean);
const peopleNames = (list) => (list ?? []).map((p) => (typeof p === 'string' ? '' : clean(p?.name))).filter(Boolean);
const andList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

// What happened since the world last looked, from the chat's records -
// no model call. now: { quests: [{ id, name, status, involved: [id] }],
// dead: [{ id, name, how }], knowledge: [item] (library/knowledge.js, people
// as { id, name }), beliefsSeen: { beliefId: { personId: turn } } }.
// The first look only records what is there: a story already under way
// does not flood the world with its past.
// -> { ripples: [{ kind, text, ties, reach }], seen } (seen: to store)
export function findRipples(seen, now = {}, { nameOf = () => '' } = {}) {
    const before = normalizeSeen(seen);
    const after = {
        primed: true,
        quests: Object.fromEntries((now.quests ?? []).filter((q) => q?.id).map((q) => [q.id, clean(q.status)])),
        dead: (now.dead ?? []).map((d) => d?.id).filter(Boolean),
        knowledge: Object.fromEntries((now.knowledge ?? []).filter((k) => k?.id).map((k) => [k.id, clean(k.status)])),
        beliefs: Object.fromEntries(Object.entries(now.beliefsSeen ?? {}).map(([id, m]) => [id, Object.keys(m ?? {}).length])),
    };
    if (!before.primed) return { ripples: [], seen: after };
    const ripples = [];
    for (const q of now.quests ?? []) {
        if (!q?.id || !ENDED.has(q.status) || ENDED.has(before.quests[q.id] ?? '')) continue;
        const how = q.status === 'Completed' ? 'was seen through' : q.status === 'Failed' ? 'failed' : 'was given up';
        ripples.push({ kind: 'quest', text: `The quest "${clean(q.name)}" ${how}.`, ties: [...new Set([q.id, ...(q.involved ?? [])])], reach: 'local' });
    }
    const wasDead = new Set(before.dead);
    for (const d of now.dead ?? []) {
        if (!d?.id || wasDead.has(d.id)) continue;
        ripples.push({ kind: 'death', text: `${clean(d.name) || nameOf(d.id) || 'Someone'} died${clean(d.how) ? ` - ${unstop(d.how)}` : ''}.`, ties: [d.id], reach: 'local' });
    }
    for (const k of now.knowledge ?? []) {
        if (!k?.id) continue;
        const was = before.knowledge[k.id];
        if (was === undefined || was === k.status) continue;
        if (k.kind === 'secret' && k.status === 'revealed') {
            ripples.push({ kind: 'secret', text: `A secret came out: ${sentence(k.text)}`, ties: [...peopleIds(k.knownBy), ...peopleIds(k.about)], reach: 'local' });
        } else if (k.kind === 'oath' && k.status === 'broken') {
            ripples.push({ kind: 'oath', text: `An oath was broken: ${sentence(k.text)}${peopleNames(k.madeBy).length ? ` (sworn by ${andList(peopleNames(k.madeBy))})` : ''}`, ties: [...peopleIds(k.madeBy), ...peopleIds(k.madeTo)], reach: 'local' });
        } else if (k.kind === 'belief' && k.status === 'dispelled') {
            ripples.push({ kind: 'belief', text: `It is out: ${sentence(k.truth || `it is not so that ${unstop(k.text)}`)}`, ties: [...peopleIds(k.about), ...peopleIds(k.heldBy), ...peopleIds(k.knownBy)], reach: 'everyone' });
        }
    }
    // A belief shaken: someone who held it has now seen its subject.
    for (const k of (now.knowledge ?? []).filter((x) => x?.kind === 'belief' && x.status === 'held')) {
        const seers = Object.keys(now.beliefsSeen?.[k.id] ?? {});
        if (seers.length <= (before.beliefs[k.id] ?? 0)) continue;
        const who = andList(seers.slice(-2).map((id) => nameOf(id)).filter(Boolean)) || 'someone';
        const subject = andList(peopleNames(k.about)) || 'its subject';
        ripples.push({ kind: 'belief', text: `${who} saw ${subject} - though most believe: ${sentence(k.text)}`, ties: [...peopleIds(k.about), ...peopleIds(k.heldBy), ...peopleIds(k.knownBy)], reach: 'local' });
    }
    return { ripples, seen: after };
}

// ---------------------------------------------------------------- stakeholders (§3.2)

const ENEMY = /enem|rival|foe|nemesis|hunt|hate|wrong|betray|murder|kill/i;

// Who would care about the waiting ripples - only those not in the scene.
// entries: [{ id, type: 'character' | 'faction', name, base }] (no powers);
// tiesOf(id) -> [{ otherId, kind }] (relationships and reference fields,
// both ways); memberships: Map(characterId -> [factionId]); knowledge:
// [item] with people as { id, name }; present: ids in the scene; playerId;
// skip: ids never simulated (dead, keeps to themselves); always: ids
// always in play; schemers: ids with a scheme under way.
// -> [{ id, name, type, why: [text], score }], closest first, at most `limit`.
export function stakeholders(ripples, { entries = [], tiesOf = () => [], memberships = new Map(), knowledge = [], present = [], playerId = '', skip = [], always = [], schemers = [], limit = 3 } = {}) {
    const byId = new Map(entries.map((e) => [e.id, e]));
    const out = new Set([...present, ...skip, ...(playerId ? [playerId] : [])]);
    const found = new Map();
    const add = (id, score, why) => {
        if (!id || out.has(id) || !byId.has(id)) return;
        const s = found.get(id) ?? { id, name: byId.get(id).name, type: byId.get(id).type, why: [], score: 0 };
        s.score += score;
        if (why && !s.why.includes(why) && s.why.length < 3) s.why.push(why);
        found.set(id, s);
    };
    const members = new Map();
    for (const [person, factions] of memberships) for (const f of factions ?? []) members.set(f, [...(members.get(f) ?? []), person]);
    const nameOf = (id) => byId.get(id)?.name ?? (id === playerId ? 'the player character' : '');
    for (const r of ripples ?? []) {
        for (const id of r.ties ?? []) {
            const name = nameOf(id);
            add(id, 3, 'it is about them');
            for (const t of tiesOf(id)) add(t.otherId, ENEMY.test(t.kind) ? 3 : 2, `${clean(t.kind) || 'tied'} to ${name || 'someone in it'}`);
            for (const f of memberships.get(id) ?? []) add(f, 2, `${name || 'someone in it'} is one of theirs`);
            for (const m of (members.get(id) ?? []).slice(0, 4)) add(m, 1, `one of ${name || 'the faction'}`);
        }
        // Those who know the truth of it, or hold the belief it shakes.
        const tied = new Set(r.ties ?? []);
        for (const k of knowledge ?? []) {
            const about = [...peopleIds(k.about), ...peopleIds(k.knownBy), ...peopleIds(k.madeBy), ...peopleIds(k.madeTo)];
            if (!about.some((id) => tied.has(id))) continue;
            for (const id of peopleIds(k.knownBy)) add(id, 2, `knows: ${cut(k.truth || k.text, 80)}`);
            for (const id of peopleIds(k.heldBy)) add(id, 1, 'believed otherwise');
        }
        // A ripple that touches the player character stirs their enemies.
        if (playerId && tied.has(playerId)) for (const t of tiesOf(playerId)) if (ENEMY.test(t.kind)) add(t.otherId, 2, `${clean(t.kind)} of the player character`);
    }
    for (const id of always) add(id, 1, 'always in play');
    // Those already scheming are kept in view: their schemes need them.
    for (const id of schemers) add(id, 0.5, '');
    return [...found.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------- schemes (§3.3)

const schemeKey = (who, aim) => `${[...who].sort().join('+')}|${clean(aim).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 60)}`;

export const openSchemes = (world) => world.schemes.filter((s) => s.status === 'under way' || s.status === 'stalled');

// Schemes whose next step is due by `day`.
export const dueSchemes = (world, day) => openSchemes(world).filter((s) => s.status === 'under way' && !s.held && (s.nextDay === null || s.nextDay <= day));

// The DAY pass's answer for the world (src/world/prompts.js readWorld),
// applied: schemes moved on or begun, the side log, lines that surface.
// resolve(name) -> an id or null (people, factions); nameOf(id) -> its
// name; placeOf(name) -> a
// place id or ''; limits: LEVEL_LIMITS[level]; aim: the tension aim word
// ('build' | 'hold' | 'ease' | ''); surfacing: 'all' | 'talk' | 'log';
// ids: the stakeholders' and schemers' ids the pass was shown (a new
// scheme must belong to one of them).
// -> { moved, started, surfaced } (counts)
export function applyWorld(world, answer, { day, resolve = () => null, nameOf = () => '', placeOf = () => '', limits = LEVEL_LIMITS.quiet, aim = '', surfacing = 'all', ids = [], newId = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`, at = new Date().toISOString() } = {}) {
    const counts = { moved: 0, started: 0, surfaced: 0 };
    const allowed = new Set(ids);
    const surfacedToday = world.surfaced.filter((x) => x.fromDay !== null && x.fromDay >= day).length;
    let budget = Math.max(0, limits.surface - surfacedToday);
    let starts = limits.start;
    for (const a of answer?.schemes ?? []) {
        let scheme = a.id ? world.schemes.find((s) => s.id === a.id) : null;
        if (scheme && (scheme.held || !openSchemes(world).includes(scheme))) continue;
        if (!scheme) {
            const who = [...new Set(a.who.map(resolve).filter((id) => id && allowed.has(id)))];
            if (!who.length || !a.aim || !a.steps.length || starts <= 0 || openSchemes(world).length >= limits.schemes) continue;
            const key = schemeKey(who, a.aim);
            if (world.dismissed.includes(key) || openSchemes(world).some((s) => schemeKey(s.who, s.aim) === key || (s.who.some((id) => who.includes(id)) && sameText(s.aim, a.aim)))) continue;
            scheme = normalizeScheme({ id: newId('s'), who, names: who.map((id, i) => nameOf(id) || a.who[i] || '').filter(Boolean), aim: a.aim, motive: a.motive, from: a.from, steps: a.steps, done: 0, startedDay: day, at });
            world.schemes = [...world.schemes, scheme];
            starts -= 1;
            counts.started += 1;
        } else counts.moved += 1;
        // Steps only go forward; visibility only rises.
        if (Number.isInteger(a.done)) scheme.done = Math.min(scheme.steps.length, Math.max(scheme.done, a.done));
        if (VISIBILITIES.indexOf(a.visibility) > VISIBILITIES.indexOf(scheme.visibility)) scheme.visibility = a.visibility;
        if (ABOUT_PLAYER.includes(a.aboutPlayer)) scheme.aboutPlayer = a.aboutPlayer;
        scheme.status = SCHEME_STATUSES.includes(a.status) ? a.status : scheme.status;
        if (scheme.status === 'under way' && scheme.done >= scheme.steps.length) scheme.status = 'done';
        scheme.nextDay = day + Math.min(14, Math.max(1, a.inDays ?? 1));
        if (a.log) world.log = [...world.log, { day, text: cut(a.log, 300), schemeId: scheme.id, veiled: scheme.visibility === 'hidden' }].slice(-LOG_LIMIT);
        const s = a.surface;
        const fits = s && SURFACE_WAYS.includes(s.way) && s.text && surfacing !== 'log' && (surfacing !== 'talk' || TALK_WAYS.has(s.way));
        // Easing: nothing hostile reaches the story today; the scheme goes on.
        const hostile = scheme.aboutPlayer === 'opposes';
        if (fits && budget > 0 && !(aim === 'ease' && hostile)) {
            const fromDay = day + Math.min(7, Math.max(0, s.inDays ?? 0));
            world.surfaced = [...world.surfaced, normalizeSurfaced({ id: newId('w'), way: s.way, text: s.text, where: s.where, whereId: s.where ? placeOf(s.where) : '', who: s.way === 'approach' ? scheme.who : [], schemeId: scheme.id, fromDay, untilDay: fromDay + SURFACE_DAYS, hostile })].filter(Boolean).slice(-SURFACED_LIMIT);
            budget -= 1;
            counts.surfaced += 1;
            // Surfacing makes it known, at least a little.
            if (scheme.visibility === 'hidden') scheme.visibility = s.way === 'trace' || s.way === 'approach' ? 'traces' : 'rumoured';
        }
    }
    for (const r of world.ripples) r.takenUp = true;
    world.lastDay = day;
    trimSchemes(world);
    return counts;
}

// Schemes that ended are dropped once there are many; their story stays
// in the log.
function trimSchemes(world) {
    const open = openSchemes(world);
    const ended = world.schemes.filter((s) => !open.includes(s));
    world.schemes = [...ended.slice(-Math.max(0, SCHEME_LIMIT - open.length)), ...open].sort((a, b) => world.schemes.indexOf(a) - world.schemes.indexOf(b));
}

// The user ends a scheme: it is not started again.
export function dismissScheme(world, id) {
    const s = world.schemes.find((x) => x.id === id);
    if (!s) return false;
    s.status = 'dropped';
    world.dismissed = [...world.dismissed, schemeKey(s.who, s.aim)].slice(-DISMISSED_LIMIT);
    world.surfaced = world.surfaced.filter((x) => x.schemeId !== id);
    return true;
}

// The user pauses a scheme, or lets it go on.
export function holdScheme(world, id, held) {
    const s = world.schemes.find((x) => x.id === id);
    if (!s || !openSchemes(world).includes(s)) return false;
    s.held = held === true;
    return true;
}

// The day plan's off-screen lines, from the world's log for that day.
export const offscreenOf = (world, day) => world.log.filter((l) => l.day === day).map((l) => l.text).slice(0, 4);

// ---------------------------------------------------------------- what the director reads (§4)

// Those an approach has brought near (they can turn up - director/
// whereabouts.js), while it lasts.
export function arrivals(world, day) {
    return [...new Set(world.surfaced.filter((x) => x.way === 'approach' && x.fromDay !== null && x.fromDay <= day && (x.untilDay === null || x.untilDay >= day)).flatMap((x) => x.who))];
}

const LINE = {
    rumour: (t) => `- Word going round: ${unstop(t)}. Anyone here may let it drop, if it fits who they are - in passing, never as a speech.`,
    news: (t) => `- In the news: ${unstop(t)}. It may come up in talk, or be heard or seen in the background.`,
    trace: (t) => `- Here to be found: ${unstop(t)} - only if the player looks or the scene turns to it.`,
    approach: (t) => `- Coming: ${unstop(t)}. Only where the player's action leaves room; it may wait for a later scene.`,
};

// The MEANWHILE lines for this reply: surfaced items live today, in a scene
// they fit, not shown too often. Nothing while the scene is tense or the
// user is lingering; nothing hostile while the story eases.
// opts: { day, userIndex, placeIds (the place and the places it is in),
// present: ids in the scene, aim, quiet (tense or lingering), max }.
// -> { text, ids } - ids: the items shown (markShown records them).
export function meanwhileSection(world, { day, userIndex = null, placeIds = [], present = [], aim = '', quiet = false, max = 2 } = {}) {
    if (quiet || !Number.isInteger(day)) return { text: '', ids: [] };
    const here = new Set(placeIds);
    const now = new Set(present);
    const live = world.surfaced.filter((x) => {
        if (x.fromDay === null || x.fromDay > day || (x.untilDay !== null && x.untilDay < day)) return false;
        if (x.shownFor.length >= SHOWN_LIMIT && !x.shownFor.includes(userIndex)) return false;
        if (x.whereId && !here.has(x.whereId)) return false;
        if (x.way === 'approach' && x.who.length && x.who.every((id) => now.has(id))) return false;
        if (aim === 'ease' && x.hostile) return false;
        return true;
    });
    // A place's own lines first, then approaches, then talk.
    const order = (x) => (x.whereId ? 0 : x.way === 'approach' ? 1 : 2);
    const shown = live.sort((a, b) => order(a) - order(b)).slice(0, max);
    if (!shown.length) return { text: '', ids: [] };
    return {
        text: ['MEANWHILE (private - what the world beyond the scene is doing; use a line only where it fits the scene and the people in it, and never for the player character)', ...shown.map((x) => LINE[x.way](x.text))].join('\n'),
        ids: shown.map((x) => x.id),
    };
}

// The items shown for the player's message `userIndex` (a swipe of that
// reply is not counted twice).
export function markShown(world, ids, userIndex) {
    if (!Number.isInteger(userIndex)) return;
    for (const x of world.surfaced) if (ids.includes(x.id) && !x.shownFor.includes(userIndex)) x.shownFor = [...x.shownFor, userIndex].slice(-SHOWN_LIMIT);
}

// Surfaced items past their days are let go.
export function settleSurfaced(world, day) {
    if (!Number.isInteger(day)) return;
    world.surfaced = world.surfaced.filter((x) => x.untilDay === null || x.untilDay >= day);
}
