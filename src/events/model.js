// Structured events - the pure half (docs/DESIGN - STRUCTURED EVENTS.md;
// the runner is src/events/run.js). An event is a programme of stages the
// story is held to: the director and the narrator see the stage under way
// only, and only Scenario Builder moves it on - a stage that ended in an
// earlier reply gives way to the next at the start of a briefing
// (beginReply), and a bout ends with the fight (afterFight). Stages are
// keyed to the chat's reply count (doc.turn), so a swipe or a regenerated
// briefing never moves the event on twice.
//
// Phase 1: the arena - opponents one after another, each fought until
// beaten (or the player is).

export const EVENT_KINDS = Object.freeze(['arena']);
export const EVENT_STATUSES = Object.freeze(['planned', 'running', 'won', 'lost', 'ended']);
export const STAGE_KINDS = Object.freeze(['bout', 'moment']);
export const STAGE_STATUSES = Object.freeze(['pending', 'current', 'won', 'lost', 'done', 'skipped']);
const MAX_STAGES = 40;
const DONE_KEPT = 10;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
let counter = 0;
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter = (counter + 1) % 1e6).toString(36)}`;

function normalizeStage(s) {
    if (!isObject(s)) return null;
    const kind = STAGE_KINDS.includes(s.kind) ? s.kind : 'moment';
    const opponents = (Array.isArray(s.opponents) ? s.opponents : [])
        .filter((o) => isObject(o) && clean(o.name)).map((o) => ({ name: clean(o.name).slice(0, 80), objectId: clean(o.objectId) })).slice(0, 8);
    if (kind === 'bout' && !opponents.length) return null;
    return {
        id: clean(s.id) || newId('stg'),
        kind,
        title: clean(s.title).slice(0, 80) || (kind === 'bout' ? 'Bout' : 'Moment'),
        opponents,
        note: clean(s.note).slice(0, 600),
        status: STAGE_STATUSES.includes(s.status) ? s.status : 'pending',
        startedTurn: int(s.startedTurn),
        endedTurn: int(s.endedTurn),
    };
}

export function normalizeEvent(e) {
    if (!isObject(e)) return null;
    const stages = (Array.isArray(e.stages) ? e.stages : []).map(normalizeStage).filter(Boolean).slice(0, MAX_STAGES);
    if (!stages.length) return null;
    const current = Number.isInteger(e.current) ? Math.min(Math.max(0, e.current), stages.length - 1) : 0;
    return {
        id: clean(e.id) || newId('evt'),
        kind: EVENT_KINDS.includes(e.kind) ? e.kind : 'arena',
        name: clean(e.name).slice(0, 100) || 'The arena',
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
    };
}

export const normalizeEventsDone = (list) => (Array.isArray(list) ? list.map(normalizeEvent).filter(Boolean) : []).slice(-DONE_KEPT);

// An arena from the user's setup: { name, placeId, opponents: [{ name,
// objectId }] in order, intro, close, prize }. The introduction and the
// close are moments around the bouts.
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

export const isRunning = (e) => e?.status === 'running';
export const currentStage = (e) => (e ? e.stages[e.current] ?? null : null);
const finished = (s) => ['won', 'lost', 'done', 'skipped'].includes(s?.status);
export const bouts = (e) => (e?.stages ?? []).filter((s) => s.kind === 'bout');

// Starts a planned event: its first stage is under way from the next reply.
export function startEvent(event, turn) {
    const e = normalizeEvent(event);
    if (!e || e.status !== 'planned') return e;
    e.status = 'running';
    e.startedTurn = turn;
    e.current = 0;
    e.stages[0] = { ...e.stages[0], status: 'current', startedTurn: null };
    return e;
}

// The event as a reply's briefing begins (turn: the chat's reply count).
// A moment shown in an earlier reply is done; a stage that ended in an
// earlier reply gives way to the next, or the event ends. The stage under
// way is marked begun this reply. -> the event (unchanged when nothing moves).
export function beginReply(event, turn) {
    const e = normalizeEvent(event);
    if (!e || !isRunning(e)) return e;
    let s = currentStage(e);
    if (s.status === 'current' && s.kind === 'moment' && s.startedTurn !== null && s.startedTurn < turn) {
        e.stages[e.current] = s = { ...s, status: 'done', endedTurn: s.startedTurn };
    }
    // Ended in an earlier reply - never in this one (a regenerated briefing).
    if (finished(s) && s.endedTurn !== null && s.endedTurn < turn) {
        const lost = s.status === 'lost' && e.onLoss === 'ends';
        const next = e.stages.findIndex((x, i) => i > e.current && x.status === 'pending');
        if (lost || next < 0) {
            if (lost) e.stages = e.stages.map((x, i) => (i > e.current && x.status === 'pending' ? { ...x, status: 'skipped' } : x));
            e.status = lost ? 'lost' : (bouts(e).every((b) => b.status === 'won' || b.status === 'skipped') ? 'won' : 'ended');
            e.endedTurn = turn;
            return e;
        }
        e.current = next;
        e.stages[next] = s = { ...e.stages[next], status: 'current' };
    }
    if (s.status === 'current' && s.startedTurn === null) e.stages[e.current] = { ...s, startedTurn: turn };
    return e;
}

// A bout's result from the fight after a briefing (src/director/fight.js):
// every foe down or fled - won; a foe who won - lost; otherwise it goes on.
export function afterFight(event, fight, turn) {
    const e = normalizeEvent(event);
    const s = currentStage(e);
    if (!e || !isRunning(e) || s?.kind !== 'bout' || s.status !== 'current' || !fight) return e;
    const foes = (fight.fighters ?? []).filter((f) => f.side === 'foe');
    if (!foes.length) return e;
    const result = foes.some((f) => f.condition === 'won') ? 'lost'
        : foes.every((f) => f.condition === 'down' || f.condition === 'fled') ? 'won' : null;
    if (!result) return e;
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
    const status = action === 'skip' ? 'skipped' : action === 'won' ? (s.kind === 'bout' ? 'won' : 'done') : action === 'lost' ? 'lost' : null;
    if (!status) return e;
    e.stages[e.current] = { ...s, status, endedTurn: Math.max(0, turn - 1) };
    return e;
}

// ---- what each reader sees

const names = (s) => s.opponents.map((o) => o.name).join(' and ');
const boutNumber = (e, s) => bouts(e).indexOf(s) + 1;

// "Bout 2 of 4: Graxx" / "The opening" - for panels and the UI.
export function stageLabel(e) {
    const s = currentStage(e);
    if (!s) return '';
    return s.kind === 'bout' ? `Bout ${boutNumber(e, s)} of ${bouts(e).length}: ${names(s)}` : s.title;
}

// The director's dossier section (THE EVENT) - '' when none runs. The
// reply the event ended in (turn) is told how it ended.
export function eventFacts(event, { placeName = '', turn = null } = {}) {
    const e = normalizeEvent(event);
    if (!e) return '';
    if (!isRunning(e)) {
        if (e.endedTurn === null || e.endedTurn !== turn || !['won', 'lost', 'ended'].includes(e.status)) return '';
        const how = e.status === 'won' ? `The player character has won it${e.prize ? ` - the prize: ${e.prize}` : ''}.`
            : e.status === 'lost' ? 'The player character lost a bout, and with it the contest. Nothing more is fought in it.'
                : 'It has ended.';
        return `${e.name} is over. ${how} Show what follows from it; begin no new stage of it.`;
    }
    const s = currentStage(e);
    const where = placeName ? ` at ${placeName}` : '';
    const done = bouts(e).filter((b) => b.status === 'won').length;
    const head = `${e.name}${where} - an arena: opponents come out one at a time, each fought until beaten. ${done} of ${bouts(e).length} bouts won so far.`;
    const now = s.kind === 'bout'
        ? `NOW: ${stageLabel(e)}. Bring ${names(s)} out to face the player character in this reply if they are not already, and write FIGHT lines for the bout. It ends only when ${s.opponents.length > 1 ? 'they are' : `${names(s)} is`} down or fled (the player wins) or has won (the player loses) - by the fight, never by talk.`
        : `NOW: ${s.title} - ${s.note || 'a moment of the programme, not a fight'}. This reply only; no one fights in it.`;
    const rules = 'Only this stage happens in this reply. Do not bring out, name or hint at the next opponent; do not skip ahead, repeat a finished bout or end the event. Scenario Builder moves it on when this stage is over.';
    return [head, now, rules].join(' ');
}

// The narrator's guidance section - '' when none runs.
export function eventGuidance(event) {
    const e = normalizeEvent(event);
    if (!e || !isRunning(e)) return '';
    const s = currentStage(e);
    const now = s.kind === 'bout'
        ? `${stageLabel(e)} is under way: the fight is with ${names(s)} and no one else.`
        : `${s.title}: ${s.note || 'a moment between the bouts'}. No one fights now.`;
    return `${e.name}: ${now} Who comes next is not known until this is over - never show or name them.`;
}

// For panels (sb__event_*). Empty while none runs.
export function eventValues(event) {
    const e = normalizeEvent(event);
    if (!e || !isRunning(e)) return { event_active: false, event_name: '', event_stage: '', event_progress: '' };
    const s = currentStage(e);
    const total = bouts(e).length;
    return {
        event_active: true,
        event_name: e.name,
        event_stage: stageLabel(e),
        event_progress: s.kind === 'bout' ? `${boutNumber(e, s)} / ${total}` : `${bouts(e).filter((b) => b.status === 'won').length} / ${total}`,
    };
}
