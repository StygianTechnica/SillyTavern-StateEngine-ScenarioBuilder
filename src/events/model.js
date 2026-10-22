// Structured events - the pure half (docs/DESIGN - STRUCTURED EVENTS.md;
// the runner is src/events/run.js). An event is a programme of stages the
// story is held to: the director and the narrator see the stage under way
// only, and only Scenario Builder moves it on - a stage that ended in an
// earlier reply gives way to the next at the start of a briefing
// (beginReply), and a bout ends with the fight (afterFight). Stages are
// keyed to the chat's reply count (doc.turn), so a swipe or a regenerated
// briefing never moves the event on twice.
//
// Four kinds:
//   arena       opponents one after another, each fought until beaten (or
//               the player is);
//   tournament  entrants in a bracket: each round the player's match is a
//               bout, the other matches are decided off screen (by the
//               entrants' strength, with a seeded roll) and reported in a
//               moment; the winners go on to a grand final;
//   crawl       rooms (places) the party goes through in any order the
//               routes allow; the room the scene is in is the stage, cleared
//               by beating what waits there and/or by a story flag (a puzzle,
//               a trap); a final room ends it;
//   programme   a free sequence of moments, bouts and waits (a festival, a
//               trial).
// A wait stage holds the event until the clock reaches a time ("noon", "the
// next morning"); the story is free meanwhile.

export const EVENT_KINDS = Object.freeze(['arena', 'tournament', 'crawl', 'programme']);
export const EVENT_STATUSES = Object.freeze(['planned', 'running', 'won', 'lost', 'ended']);
export const STAGE_KINDS = Object.freeze(['bout', 'moment', 'wait', 'room']);
export const STAGE_STATUSES = Object.freeze(['pending', 'current', 'won', 'lost', 'done', 'skipped']);
// How hard an entrant is to beat (Combat in ROADMAP.md: no stats, a few steps).
export const STRENGTHS = Object.freeze(['minor', 'standard', 'strong', 'deadly']);
const STRENGTH_WEIGHT = { minor: 1, standard: 2, strong: 3, deadly: 5 };
export const KIND_LABEL = Object.freeze({ arena: 'arena', tournament: 'tournament', crawl: 'dungeon crawl', programme: 'programme' });
const MAX_STAGES = 60;
const MAX_ENTRANTS = 32;
const DONE_KEPT = 10;
const COMING_KEPT = 8;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const num = (v) => (Number.isFinite(v) ? v : null);
let counter = 0;
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter = (counter + 1) % 1e6).toString(36)}`;

const normalizeFoes = (list, max = 8) => (Array.isArray(list) ? list : [])
    .filter((o) => isObject(o) && clean(o.name)).map((o) => ({ name: clean(o.name).slice(0, 80), objectId: clean(o.objectId) })).slice(0, max);

function normalizeStage(s) {
    if (!isObject(s)) return null;
    const kind = STAGE_KINDS.includes(s.kind) ? s.kind : 'moment';
    const opponents = normalizeFoes(s.opponents);
    const round = Number.isInteger(s.round) && s.round > 0 ? s.round : null;
    // A tournament's bout is drawn when its round comes; any other needs foes.
    if (kind === 'bout' && !opponents.length && round === null) return null;
    if (kind === 'room' && !clean(s.placeId)) return null;
    const out = {
        id: clean(s.id) || newId('stg'),
        kind,
        title: clean(s.title).slice(0, 80) || ({ bout: 'Bout', wait: 'A wait', room: 'A room' }[kind] ?? 'Moment'),
        opponents,
        note: clean(s.note).slice(0, 600),
        status: STAGE_STATUSES.includes(s.status) ? s.status : 'pending',
        startedTurn: int(s.startedTurn),
        endedTurn: int(s.endedTurn),
    };
    if (round !== null) out.round = round;
    if (kind === 'wait') {
        // What it waits for ("noon", "two hours", "the next morning") and the
        // moment on the setting's calendar it ends (set when it begins).
        out.waitFor = clean(s.waitFor).slice(0, 80) || 'a while';
        out.until = num(s.until);
    }
    if (kind === 'room') {
        out.placeId = clean(s.placeId);
        // What waits here is `opponents`; what is there to find, and whether
        // it has been (the room was left once it was safe).
        out.loot = clean(s.loot).slice(0, 300);
        out.looted = s.looted === true;
        // A puzzle or a trap: cleared only once the story shows this (a story
        // trigger watches for it: triggerId).
        out.clearWhen = clean(s.clearWhen).slice(0, 300);
        out.triggerId = clean(s.triggerId);
        out.final = s.final === true;
        out.visited = s.visited === true;
        out.beaten = s.beaten === true;
        out.solved = s.solved === true;
    }
    return out;
}

function normalizeBracket(b) {
    if (!isObject(b)) return null;
    const entrants = (Array.isArray(b.entrants) ? b.entrants : []).filter((x) => isObject(x) && clean(x.name)).slice(0, MAX_ENTRANTS)
        .map((x) => ({ name: clean(x.name).slice(0, 80), objectId: clean(x.objectId), strength: STRENGTHS.includes(x.strength) ? x.strength : 'standard', player: x.player === true }));
    if (entrants.length < 2) return null;
    const ok = (i) => Number.isInteger(i) && i >= 0 && i < entrants.length;
    const rounds = (Array.isArray(b.rounds) ? b.rounds : []).filter(Array.isArray).map((r) => r.filter((m) => isObject(m) && ok(m.a))
        .map((m) => ({ a: m.a, b: ok(m.b) ? m.b : null, winner: ok(m.winner) ? m.winner : null })));
    return { entrants, rounds };
}

export function normalizeEvent(e) {
    if (!isObject(e)) return null;
    const stages = (Array.isArray(e.stages) ? e.stages : []).map(normalizeStage).filter(Boolean).slice(0, MAX_STAGES);
    if (!stages.length) return null;
    const kind = EVENT_KINDS.includes(e.kind) ? e.kind : 'arena';
    // A crawl is between rooms (-1) while the scene is in none of them.
    const lowest = kind === 'crawl' ? -1 : 0;
    const current = Number.isInteger(e.current) ? Math.min(Math.max(lowest, e.current), stages.length - 1) : lowest;
    const out = {
        id: clean(e.id) || newId('evt'),
        kind,
        name: clean(e.name).slice(0, 100) || ({ tournament: 'The tournament', crawl: 'The dungeon', programme: 'The event' }[kind] ?? 'The arena'),
        placeId: clean(e.placeId),
        intro: clean(e.intro).slice(0, 800),
        close: clean(e.close).slice(0, 800),
        prize: clean(e.prize).slice(0, 300),
        onLoss: e.onLoss === 'continue' ? 'continue' : 'ends',
        status: EVENT_STATUSES.includes(e.status) ? e.status : 'planned',
        current,
        stages,
        startedTurn: int(e.startedTurn),
        endedTurn: int(e.endedTurn),
        // A planned event that starts by itself on this day of the story.
        startDay: Number.isInteger(e.startDay) && e.startDay > 0 ? e.startDay : null,
        // The roll that decides a tournament's matches off screen.
        seed: Number.isInteger(e.seed) ? e.seed : 1,
    };
    if (kind === 'tournament') out.bracket = normalizeBracket(e.bracket);
    if (kind === 'tournament' && !out.bracket) return null;
    return out;
}

export const normalizeEventsDone = (list) => (Array.isArray(list) ? list.map(normalizeEvent).filter(Boolean) : []).slice(-DONE_KEPT);
// Planned events waiting for their day (startDay), soonest first.
export const normalizeEventsComing = (list) => (Array.isArray(list) ? list.map(normalizeEvent).filter((e) => e?.status === 'planned') : [])
    .sort((a, b) => (a.startDay ?? 0) - (b.startDay ?? 0)).slice(0, COMING_KEPT);

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

// ---- setups (the user's form, a template, or a generated one)

// An arena: { name, placeId, opponents: [{ name, objectId }] in order, intro,
// close, prize }. The introduction and the close are moments around the bouts.
export function arenaFromSetup({ name, placeId = '', opponents = [], intro = '', close = '', prize = '' } = {}) {
    const list = (Array.isArray(opponents) ? opponents : []).filter((o) => clean(o?.name));
    if (!list.length) return null;
    const stages = [
        { kind: 'moment', title: 'The opening', note: clean(intro) || 'The arena fills; the herald presents the contest and the challenger.' },
        ...list.map((o, i) => ({ kind: 'bout', title: `Bout ${i + 1}`, opponents: [{ name: o.name, objectId: o.objectId ?? '' }] })),
        { kind: 'moment', title: 'The close', note: clean(close) || `The last opponent is beaten; the victor is hailed${clean(prize) ? ` and given the prize: ${clean(prize)}` : ''}.` },
    ];
    return normalizeEvent({ kind: 'arena', name, placeId, intro, close, prize, stages, status: 'planned' });
}

// How many rounds a bracket of n entrants takes.
export const roundsFor = (n) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));

// What a round is called: the last the grand final, the one before it the
// semi-finals (when four or more are left).
export function roundTitle(round, total) {
    if (round === total) return 'The grand final';
    if (round === total - 1 && total >= 3) return 'The semi-finals';
    if (round === total - 2 && total >= 4) return 'The quarter-finals';
    return `Round ${round}`;
}

// A tournament: { name, placeId, entrants: [{ name, objectId, strength }]
// (the player character's rivals), playerName, intro, close, prize, between
// (a wait between rounds: "two hours", "the next morning"; '' none) }.
// Stages: the opening; per round the player's match (drawn when its round
// comes), then - before the final - the other matches' results and the wait;
// the close.
export function tournamentFromSetup({ name, placeId = '', entrants = [], playerName = '', intro = '', close = '', prize = '', between = '', seed = randomSeed() } = {}) {
    const rivals = (Array.isArray(entrants) ? entrants : []).filter((o) => clean(o?.name)).slice(0, MAX_ENTRANTS - 1);
    if (!rivals.length) return null;
    const all = [{ name: clean(playerName) || 'the player character', objectId: '', strength: 'standard', player: true },
        ...rivals.map((o) => ({ name: o.name, objectId: o.objectId ?? '', strength: o.strength }))];
    const total = roundsFor(all.length);
    const stages = [{ kind: 'moment', title: 'The opening', note: clean(intro) || `The entrants are presented - ${all.length} of them - and the draw for the first round is made.` }];
    for (let r = 1; r <= total; r++) {
        stages.push({ kind: 'bout', round: r, title: roundTitle(r, total) });
        if (r < total) {
            stages.push({ kind: 'moment', round: r, title: `${roundTitle(r, total)}: the other matches`, note: 'The other matches of the round are fought.' });
            if (clean(between)) stages.push({ kind: 'wait', title: `Before ${roundTitle(r + 1, total).replace(/^The /, 'the ')}`, waitFor: clean(between) });
        }
    }
    stages.push({ kind: 'moment', title: 'The close', note: clean(close) || `The champion is crowned${clean(prize) ? ` and given the prize: ${clean(prize)}` : ''}.` });
    return normalizeEvent({ kind: 'tournament', name, placeId, intro, close, prize, stages, status: 'planned', seed, bracket: { entrants: all, rounds: [] } });
}

// A dungeon crawl: { name, placeId (the dungeon), rooms: [{ placeId, name,
// threats: [{ name, objectId }], note, loot, clearWhen, final }], intro, close,
// prize }. The first room is the way in. Without a final room, clearing every
// room ends it.
export function crawlFromSetup({ name, placeId = '', rooms = [], intro = '', close = '', prize = '' } = {}) {
    const list = (Array.isArray(rooms) ? rooms : []).filter((r) => clean(r?.placeId));
    if (!list.length) return null;
    const stages = list.map((r) => ({
        kind: 'room', placeId: r.placeId, title: clean(r.name) || 'A room', opponents: r.threats ?? [], note: r.note ?? '',
        loot: r.loot ?? '', clearWhen: r.clearWhen ?? '', final: r.final === true,
    }));
    return normalizeEvent({ kind: 'crawl', name, placeId, intro, close, prize, stages, status: 'planned', current: -1 });
}

// A programme from lines, one stage each:
//   bout: Graxx and the Pit-Wolf - a note
//   moment: The feast - a note          (a line with no kind is a moment)
//   wait: until noon
export function readProgrammeLines(text, matchFoe = (n) => ({ name: n, objectId: '' })) {
    const out = [];
    for (const raw of String(text ?? '').split('\n')) {
        const line = clean(raw.replace(/^[-*•\d.)\s]+(?=\S)/, ''));
        if (!line) continue;
        const m = line.match(/^(bout|fight|match|moment|wait|rest)\s*[:\-–]\s*(.+)$/i);
        const kind = !m ? 'moment' : /^(bout|fight|match)$/i.test(m[1]) ? 'bout' : /^(wait|rest)$/i.test(m[1]) ? 'wait' : 'moment';
        const body = m ? m[2] : line;
        const [head, ...rest] = body.split(/\s+[-–—]\s+/);
        const note = clean(rest.join(' - '));
        if (kind === 'bout') {
            const opponents = head.split(/\s*(?:,|&|\band\b)\s*/i).map(clean).filter(Boolean).map(matchFoe);
            if (opponents.length) out.push({ kind, opponents, note });
        } else if (kind === 'wait') {
            out.push({ kind, waitFor: clean(head.replace(/^until\s+/i, '')), note });
        } else out.push({ kind, title: clean(head).slice(0, 80), note });
    }
    let n = 0;
    return out.map((s) => (s.kind === 'bout' ? { ...s, title: `Bout ${++n}` } : s.kind === 'wait' ? { ...s, title: `Until ${s.waitFor}` } : s));
}

// A programme: { name, placeId, stages (readProgrammeLines), prize, onLoss }.
// A lost bout goes on to the next stage unless onLoss is 'ends'.
export function programmeFromSetup({ name, placeId = '', stages = [], prize = '', onLoss = 'continue', intro = '', close = '' } = {}) {
    if (!(Array.isArray(stages) ? stages : []).length) return null;
    return normalizeEvent({ kind: 'programme', name, placeId, prize, intro, close, onLoss, stages, status: 'planned' });
}

// ---- running it

export const isRunning = (e) => e?.status === 'running';
export const currentStage = (e) => (e && e.current >= 0 ? e.stages[e.current] ?? null : null);
const finished = (s) => ['won', 'lost', 'done', 'skipped'].includes(s?.status);
export const bouts = (e) => (e?.stages ?? []).filter((s) => s.kind === 'bout');
export const rooms = (e) => (e?.stages ?? []).filter((s) => s.kind === 'room');
const cleared = (s) => s.status === 'won' || s.status === 'done';
const totalRounds = (e) => roundsFor(e.bracket?.entrants.length ?? 2);

// A seeded roll in 0..1 (mulberry32): the same seed always rolls the same.
function roll(seed) {
    let t = (seed + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Who is still in before round r (entrant indexes, in bracket order).
function survivors(e, r) {
    if (r <= 1) return e.bracket.entrants.map((_, i) => i);
    return (e.bracket.rounds[r - 2] ?? []).map((m) => m.winner).filter((w) => w !== null);
}

// The pairs of round r: neighbours in bracket order, the odd one out a bye.
function drawRound(e, r) {
    const list = survivors(e, r);
    const matches = [];
    for (let i = 0; i < list.length; i += 2) matches.push({ a: list[i], b: list[i + 1] ?? null, winner: list[i + 1] === undefined ? list[i] : null });
    const rounds = e.bracket.rounds.slice(0, r - 1);
    rounds[r - 1] = matches;
    e.bracket = { ...e.bracket, rounds };
    return matches;
}

const playerIndex = (e) => Math.max(0, e.bracket.entrants.findIndex((x) => x.player));
const playerMatch = (e, r) => (e.bracket.rounds[r - 1] ?? []).find((m) => m.a === playerIndex(e) || m.b === playerIndex(e)) ?? null;
const entrantName = (e, i) => e.bracket.entrants[i]?.name ?? '';

// Decides round r's other matches off screen, the player's from their bout.
// The stronger entrant is likelier to win; the roll is the event's own.
function resolveRound(e, r, playerWon) {
    const p = playerIndex(e);
    const matches = (e.bracket.rounds[r - 1] ?? []).map((m, i) => {
        if (m.b === null) return { ...m, winner: m.a };
        if (m.a === p || m.b === p) return { ...m, winner: playerWon ? p : (m.a === p ? m.b : m.a) };
        const wa = STRENGTH_WEIGHT[e.bracket.entrants[m.a].strength] ?? 2;
        const wb = STRENGTH_WEIGHT[e.bracket.entrants[m.b].strength] ?? 2;
        return { ...m, winner: roll(e.seed + r * 1009 + i * 31) * (wa + wb) < wa ? m.a : m.b };
    });
    const rounds = [...e.bracket.rounds];
    rounds[r - 1] = matches;
    e.bracket = { ...e.bracket, rounds };
    // The round's results moment says how the other matches went.
    const at = e.stages.findIndex((s) => s.kind === 'moment' && s.round === r);
    if (at >= 0) {
        const others = matches.filter((m) => m.a !== p && m.b !== p);
        const told = others.map((m) => (m.b === null ? `${entrantName(e, m.a)} goes through unopposed` : `${entrantName(e, m.winner)} beats ${entrantName(e, m.winner === m.a ? m.b : m.a)}`));
        const through = matches.map((m) => m.winner).filter((w) => w !== null && w !== p).map((w) => entrantName(e, w));
        const total = totalRounds(e);
        e.stages[at] = {
            ...e.stages[at],
            note: `${told.length ? `Elsewhere in ${roundTitle(r, total).replace(/^The /, 'the ')}: ${told.join('; ')}.` : 'There were no other matches.'} Through to ${roundTitle(r + 1, total).replace(/^The /, 'the ')} with the player character: ${through.join(', ') || 'no one else'}. Show the news reaching them - the crowd, the board, a herald.`,
        };
    }
}

// Begins stage i: a tournament's bout is drawn now.
function enter(e, i, turn = null) {
    let s = { ...e.stages[i], status: 'current', startedTurn: turn };
    if (e.kind === 'tournament' && s.kind === 'bout' && s.round) {
        drawRound(e, s.round);
        const m = playerMatch(e, s.round);
        const p = playerIndex(e);
        const foe = m && m.b !== null ? (m.a === p ? m.b : m.a) : null;
        s = foe === null
            ? { ...s, opponents: [], status: 'won', note: 'A bye: no one to fight this round.', endedTurn: turn ?? 0 }
            : { ...s, opponents: [{ name: entrantName(e, foe), objectId: e.bracket.entrants[foe].objectId }] };
    }
    e.current = i;
    e.stages[i] = s;
}

// Starts a planned event: its first stage is under way from the next reply
// (a crawl's, once the scene is in one of its rooms).
export function startEvent(event, turn) {
    const e = normalizeEvent(event);
    if (!e || e.status !== 'planned') return e;
    e.status = 'running';
    e.startedTurn = turn;
    e.startDay = null;
    if (e.kind === 'crawl') e.current = -1;
    else enter(e, 0, null);
    return e;
}

// How an event ends once its stages are through: every bout won (or left
// out) is a win.
function endEvent(e, turn, lost) {
    if (lost) e.stages = e.stages.map((x) => (x.status === 'pending' || x.status === 'current' ? { ...x, status: 'skipped' } : x));
    const allBouts = bouts(e).every((b) => b.status === 'won' || b.status === 'skipped');
    e.status = lost ? 'lost'
        : e.kind === 'crawl' ? (rooms(e).some((r) => r.final && cleared(r)) || rooms(e).every(cleared) ? 'won' : 'ended')
            : allBouts ? 'won' : 'ended';
    e.endedTurn = turn;
    return e;
}

// The scene is now in room `roomId` (a stage's placeId, or '' for none of
// them). The room left is marked: still lurking (pending again, visited) when
// not cleared; its treasure taken or left behind once it was.
function moveToRoom(e, turn, roomId) {
    const at = roomId ? e.stages.findIndex((s) => s.kind === 'room' && s.placeId === roomId) : -1;
    if (at === e.current) return e;
    const was = currentStage(e);
    if (was) {
        e.stages[e.current] = was.status === 'current' ? { ...was, status: 'pending' } : cleared(was) && was.loot ? { ...was, looted: true } : was;
    }
    if (at < 0) {
        e.current = -1;
        return e;
    }
    const s = e.stages[at];
    if (s.status === 'pending') enter(e, at, turn);
    else e.current = at;
    e.stages[at] = { ...e.stages[at], visited: true };
    return e;
}

// A crawl room is cleared once what waits there is beaten and the puzzle (if
// any) solved; one with neither once it has been seen for a reply.
function settleRoom(s, turn) {
    if (s.kind !== 'room' || s.status !== 'current') return s;
    const needsFight = s.opponents.length > 0;
    const needsFlag = !!s.clearWhen;
    if (!needsFight && !needsFlag) return s.startedTurn !== null && s.startedTurn < turn ? { ...s, status: 'done', endedTurn: s.startedTurn } : s;
    if ((!needsFight || s.beaten) && (!needsFlag || s.solved)) return { ...s, status: needsFight ? 'won' : 'done', endedTurn: s.endedTurn ?? Math.max(0, turn - 1) };
    return s;
}

// The event as a reply's briefing begins (turn: the chat's reply count).
// ctx: { now: the canonical time (a wait ends when it reaches `until`),
// roomId: a crawl's room the scene is in ('' none of them; undefined: not
// known), fired: trigger ids that have fired (a crawl room's puzzle) }.
// A moment shown in an earlier reply is done; a stage that ended in an
// earlier reply gives way to the next, or the event ends. The stage under
// way is marked begun this reply. -> the event (unchanged when nothing moves).
export function beginReply(event, turn, { now = null, roomId, fired = [] } = {}) {
    const e = normalizeEvent(event);
    if (!e || !isRunning(e)) return e;
    if (e.kind === 'crawl') return crawlReply(e, turn, { roomId, fired });
    let s = currentStage(e);
    if (s.status === 'current' && s.kind === 'moment' && s.startedTurn !== null && s.startedTurn < turn) {
        e.stages[e.current] = s = { ...s, status: 'done', endedTurn: s.startedTurn };
    }
    // A wait ends when the clock reaches its time (without a clock, after a
    // reply); it then gives way at once.
    if (s.status === 'current' && s.kind === 'wait' && s.startedTurn !== null && s.startedTurn < turn) {
        const over = Number.isFinite(now) && Number.isFinite(s.until) ? now >= s.until : !Number.isFinite(now);
        if (over) e.stages[e.current] = s = { ...s, status: 'done', endedTurn: turn - 1 };
    }
    // Ended in an earlier reply - never in this one (a regenerated briefing).
    if (finished(s) && s.endedTurn !== null && s.endedTurn < turn) {
        if (e.kind === 'tournament' && s.kind === 'bout' && s.round && !e.bracket.rounds[s.round - 1]?.every((m) => m.winner !== null)) {
            resolveRound(e, s.round, s.status !== 'lost');
        }
        const lost = s.status === 'lost' && e.onLoss === 'ends';
        const next = e.stages.findIndex((x, i) => i > e.current && x.status === 'pending');
        if (lost || next < 0) return endEvent(e, turn, lost);
        enter(e, next, null);
        s = e.stages[next];
        // A bye is over as soon as it is drawn.
        if (finished(s)) return beginReply(e, turn, { now });
    }
    if (s.status === 'current' && s.startedTurn === null) e.stages[e.current] = { ...s, startedTurn: turn };
    return e;
}

function crawlReply(e, turn, { roomId, fired }) {
    const firedSet = new Set(fired ?? []);
    // A puzzle the story has shown solved.
    e.stages = e.stages.map((s) => (s.kind === 'room' && s.triggerId && firedSet.has(s.triggerId) && !s.solved ? { ...s, solved: true } : s));
    if (e.current >= 0) e.stages[e.current] = settleRoom(e.stages[e.current], turn);
    const s = currentStage(e);
    if (s && s.status === 'lost' && s.endedTurn !== null && s.endedTurn < turn && e.onLoss === 'ends') return endEvent(e, turn, true);
    const done = (r) => cleared(r) && r.endedTurn !== null && r.endedTurn < turn;
    if (rooms(e).some((r) => r.final && done(r)) || (!rooms(e).some((r) => r.final) && rooms(e).every((r) => done(r) || r.status === 'skipped'))) return endEvent(e, turn, false);
    if (roomId !== undefined) moveToRoom(e, turn, roomId);
    const now = currentStage(e);
    if (now?.status === 'current' && now.startedTurn === null) e.stages[e.current] = { ...now, startedTurn: turn };
    return e;
}

// After the briefing moved the scene (a crawl): the room it is in now, so
// the narrator is told what waits there in this same reply.
export function afterMove(event, turn, roomId) {
    const e = normalizeEvent(event);
    if (!e || !isRunning(e) || e.kind !== 'crawl') return e;
    return moveToRoom(e, turn, roomId);
}

// A bout's (or a room's) result from the fight after a briefing
// (src/director/fight.js): every foe down or fled - won; a foe who won -
// lost; otherwise it goes on.
export function afterFight(event, fight, turn) {
    const e = normalizeEvent(event);
    const s = currentStage(e);
    if (!e || !isRunning(e) || !['bout', 'room'].includes(s?.kind) || s.status !== 'current' || !fight) return e;
    if (s.kind === 'room' && (!s.opponents.length || s.beaten)) return e;
    const foes = (fight.fighters ?? []).filter((f) => f.side === 'foe');
    if (!foes.length) return e;
    const result = foes.some((f) => f.condition === 'won') ? 'lost'
        : foes.every((f) => f.condition === 'down' || f.condition === 'fled') ? 'won' : null;
    if (!result) return e;
    if (s.kind === 'room') {
        e.stages[e.current] = result === 'lost' ? { ...s, status: 'lost', endedTurn: turn } : settleRoom({ ...s, beaten: true, endedTurn: s.clearWhen && !s.solved ? null : turn }, turn + 1);
        return e;
    }
    e.stages[e.current] = { ...s, status: result, endedTurn: turn };
    return e;
}

// The user's hand on it: 'won' | 'lost' | 'skip' the stage under way, or
// 'end' the event. It moves on at the next reply's briefing.
export function markStage(event, action, turn) {
    const e = normalizeEvent(event);
    if (!e || !isRunning(e)) return e;
    if (action === 'end') {
        e.stages = e.stages.map((x) => (x.status === 'pending' || x.status === 'current' ? { ...x, status: 'skipped' } : x));
        e.status = 'ended';
        e.endedTurn = turn;
        return e;
    }
    const s = currentStage(e);
    if (!s || s.status !== 'current') return e;
    const fought = s.kind === 'bout' || (s.kind === 'room' && s.opponents.length);
    const status = action === 'skip' ? 'skipped' : action === 'won' ? (fought ? 'won' : 'done') : action === 'lost' ? 'lost' : null;
    if (!status) return e;
    e.stages[e.current] = { ...s, status, endedTurn: Math.max(0, turn - 1), ...(s.kind === 'room' && action === 'won' ? { beaten: true, solved: true } : {}) };
    return e;
}

// A wait under way whose end on the calendar is not set yet (the runner works
// it out from `waitFor` and the clock).
export const waitToSet = (e) => {
    const s = currentStage(e);
    return isRunning(e) && s?.kind === 'wait' && s.status === 'current' && !Number.isFinite(s.until) ? s : null;
};
export function setWaitUntil(event, until) {
    const e = normalizeEvent(event);
    const s = currentStage(e);
    if (s?.kind === 'wait') e.stages[e.current] = { ...s, until: Number.isFinite(until) ? until : null };
    return e;
}

// A crawl room under way that waits on a story flag not yet watched.
export const roomToWatch = (e) => {
    const s = currentStage(e);
    return isRunning(e) && s?.kind === 'room' && s.status === 'current' && s.clearWhen && !s.solved && !s.triggerId ? s : null;
};
export function setRoomTrigger(event, triggerId) {
    const e = normalizeEvent(event);
    const s = currentStage(e);
    if (s?.kind === 'room') e.stages[e.current] = { ...s, triggerId: clean(triggerId) };
    return e;
}

// The calendar's day a planned event starts on, from now.
export function scheduleOn(event, day) {
    const e = normalizeEvent(event);
    if (e && e.status === 'planned') e.startDay = Number.isInteger(day) && day > 0 ? day : null;
    return e;
}

// ---- what each reader sees

const names = (s) => s.opponents.map((o) => o.name).join(' and ');
const boutNumber = (e, s) => bouts(e).indexOf(s) + 1;
const roomsCleared = (e) => rooms(e).filter(cleared).length;

// "Bout 2 of 4: Graxx" / "The semi-finals: against Sela" / "The opening" -
// for panels and the UI.
export function stageLabel(e) {
    const s = currentStage(e);
    if (!s) return e?.kind === 'crawl' && isRunning(e) ? `Outside the rooms (${roomsCleared(e)} of ${rooms(e).length} cleared)` : '';
    if (s.kind === 'bout' && s.round) return `${roundTitle(s.round, totalRounds(e))}${s.opponents.length ? `: against ${names(s)}` : ''}`;
    if (s.kind === 'bout') return `Bout ${boutNumber(e, s)} of ${bouts(e).length}: ${names(s)}`;
    if (s.kind === 'room') return `${s.title}${cleared(s) ? ' (cleared)' : ''}`;
    if (s.kind === 'wait') return `${s.title} - waiting for ${s.waitFor}`;
    return s.title;
}

// The bracket so far, a line a round: "Round 1: Remus beat Graxx; Sela beat
// Orrin. The semi-finals: Remus v Sela." Only what has been drawn.
export function bracketText(e) {
    if (e?.kind !== 'tournament' || !e.bracket) return '';
    const total = totalRounds(e);
    return e.bracket.rounds.map((matches, i) => `${roundTitle(i + 1, total)}: ${matches.map((m) => (m.b === null ? `${entrantName(e, m.a)} (a bye)`
        : m.winner === null ? `${entrantName(e, m.a)} v ${entrantName(e, m.b)}` : `${entrantName(e, m.winner)} beat ${entrantName(e, m.winner === m.a ? m.b : m.a)}`)).join('; ')}.`).join(' ');
}

const ROOM_STATE = (s) => (cleared(s) ? 'cleared' : s.visited ? 'left with something still in it' : 'not yet entered');

// The director's dossier section (THE EVENT) - '' when none runs. The
// reply the event ended in (turn) is told how it ended. ways: the rooms
// reachable from a crawl's room, as stage placeIds.
export function eventFacts(event, { placeName = '', turn = null, ways = [] } = {}) {
    const e = normalizeEvent(event);
    if (!e) return '';
    if (!isRunning(e)) {
        if (e.endedTurn === null || e.endedTurn !== turn || !['won', 'lost', 'ended'].includes(e.status)) return '';
        const how = e.status === 'won' ? `The player character has won it${e.prize ? ` - the prize: ${e.prize}` : ''}.`
            : e.status === 'lost' ? (e.kind === 'crawl' ? 'The player character was beaten in it. Nothing more of it is fought.' : 'The player character lost a bout, and with it the contest. Nothing more is fought in it.')
                : 'It has ended.';
        return `${e.name} is over. ${how} Show what follows from it; begin no new stage of it.`;
    }
    const where = placeName ? ` at ${placeName}` : '';
    if (e.kind === 'crawl') return crawlFacts(e, where, ways);
    const s = currentStage(e);
    const won = bouts(e).filter((b) => b.status === 'won').length;
    const head = {
        arena: `${e.name}${where} - an arena: opponents come out one at a time, each fought until beaten. ${won} of ${bouts(e).length} bouts won so far.`,
        tournament: `${e.name}${where} - a tournament of ${e.bracket?.entrants.length ?? 0} entrants over ${totalRounds(e)} rounds, the winners going on to a grand final. The player character is still in it.${bracketText(e) ? ` So far: ${bracketText(e)}` : ''}`,
        programme: `${e.name}${where} - a programme of ${e.stages.length} parts, in order. This is part ${e.current + 1}.`,
    }[e.kind];
    const nextTitle = e.stages.find((x, i) => i > e.current && x.status === 'pending')?.title ?? 'the next part';
    const now = s.kind === 'bout'
        ? `NOW: ${s.round ? `${roundTitle(s.round, totalRounds(e))} - the player character's match against ${names(s)}` : stageLabel(e)}. Bring ${names(s)} out to face the player character in this reply if they are not already, and write FIGHT lines for the bout. It ends only when ${s.opponents.length > 1 ? 'they are' : `${names(s)} is`} down or fled (the player wins) or has won (the player loses) - by the fight, never by talk.`
        : s.kind === 'wait'
            ? `NOW: a wait - ${nextTitle.replace(/^The /, 'the ')} begins at ${s.waitFor}. Until then the story is free: rest, talk, other things may happen - but do not begin it early. If the story skips ahead to it, write a TIME line for the time that passes.`
            : `NOW: ${s.title} - ${s.note || 'a moment of the programme, not a fight'}. This reply only; no one fights in it.`;
    const rules = 'Only this stage happens in this reply. Do not bring out, name or hint at the next opponent; do not skip ahead, repeat a finished bout or end the event. Scenario Builder moves it on when this stage is over.';
    return [head, now, rules].join(' ');
}

function crawlFacts(e, where, ways) {
    const s = currentStage(e);
    const head = `${e.name}${where} - a dungeon crawl: ${rooms(e).length} rooms, ${roomsCleared(e)} cleared so far.${rooms(e).some((r) => r.final) ? ' It ends when its last room is cleared.' : ' It ends when every room is cleared.'}`;
    const wayRooms = (ways ?? []).map((id) => e.stages.find((x) => x.kind === 'room' && x.placeId === id)).filter((x) => x && x !== s);
    const waysText = wayRooms.length ? `Ways on from here: ${wayRooms.map((r) => `${r.title} (${ROOM_STATE(r)})`).join(', ')}.` : '';
    const rules = 'What waits in a room not yet entered is unknown: never describe, name or hint at it. If the party goes on into another room, write a MOVE line; Scenario Builder tells the narrator what is there. Never invent the dungeon\'s foes or treasure - only what is given here.';
    if (!s) {
        const entrance = rooms(e)[0];
        return [head, `NOW: the party is not in any of its rooms.${entrance ? ` The way in is ${entrance.title}.` : ''}`, rules].join(' ');
    }
    const here = [`NOW: in ${s.title}${s.note ? ` - ${s.note}` : ''}.`];
    if (cleared(s)) here.push('This room is cleared: nothing here fights any more.');
    else {
        if (s.opponents.length && !s.beaten) here.push(`What waits here: ${names(s)}. Bring them on in this reply if they are not already, and write FIGHT lines; the room is cleared only when they are down or fled - by the fight, never by talk.`);
        if (s.clearWhen && !s.solved) here.push(`It is cleared only once the story shows this: ${s.clearWhen}. Let the party work at it; never solve it for them.`);
    }
    if (s.loot && !s.looted) here.push(`To be found here${cleared(s) ? '' : ' once it is safe'}: ${s.loot}.`);
    return [head, here.join(' '), waysText, rules].filter(Boolean).join(' ');
}

// The narrator's guidance section - '' when none runs.
export function eventGuidance(event) {
    const e = normalizeEvent(event);
    if (!e || !isRunning(e)) return '';
    const s = currentStage(e);
    if (e.kind === 'crawl') {
        if (!s) return '';
        const parts = [`${e.name}: the party is in ${s.title}.${s.note ? ` ${s.note}` : ''}`];
        if (!cleared(s) && s.opponents.length && !s.beaten) parts.push(`Waiting here: ${names(s)} - the fight is with them and nothing else.`);
        else parts.push('Nothing else lurks here.');
        if (!cleared(s) && s.clearWhen && !s.solved) parts.push(`The way through: ${s.clearWhen} - not solved yet.`);
        if (s.loot && !s.looted) parts.push(`There is ${s.loot} here to be found.`);
        parts.push('What lies in rooms not yet entered is unknown until they go in - never show it.');
        return parts.join(' ');
    }
    const now = s.kind === 'bout'
        ? `${stageLabel(e)} is under way: the fight is with ${names(s)} and no one else.`
        : s.kind === 'wait'
            ? `The next part begins at ${s.waitFor}; until then the story is free, and it does not begin early.`
            : `${s.title}: ${s.note || 'a moment between the bouts'}. No one fights now.`;
    return `${e.name}: ${now} Who comes next is not known until this is over - never show or name them.`;
}

// For panels (sb__event_*). Empty while none runs.
export function eventValues(event) {
    const e = normalizeEvent(event);
    if (!e || !isRunning(e)) return { event_active: false, event_name: '', event_kind: '', event_stage: '', event_progress: '', event_bracket: '' };
    const s = currentStage(e);
    const total = bouts(e).length;
    const progress = e.kind === 'crawl' ? `${roomsCleared(e)} / ${rooms(e).length}`
        : e.kind === 'tournament' ? `${s?.round ? `Round ${s.round}` : `Round ${Math.max(1, e.bracket.rounds.length)}`} of ${totalRounds(e)}`
            : e.kind === 'programme' ? `${e.current + 1} / ${e.stages.length}`
                : s.kind === 'bout' ? `${boutNumber(e, s)} / ${total}` : `${bouts(e).filter((b) => b.status === 'won').length} / ${total}`;
    return {
        event_active: true,
        event_name: e.name,
        event_kind: e.kind,
        event_stage: stageLabel(e),
        event_progress: progress,
        event_bracket: bracketText(e),
    };
}
