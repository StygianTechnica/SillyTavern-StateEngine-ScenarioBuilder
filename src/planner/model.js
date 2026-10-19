// The GM planner - the pure half (docs/DESIGN - GM PLANNER.md). The data
// the planner keeps per chat (chat document `gm`), the user's guidance
// queue, the pace signals and aim (§6.1), which background passes are due
// (§4), and the private GM PLAN section the director reads (§6). No
// SillyTavern imports, so all of it is unit-tested.
//
// gm: {
//   day: { day, madeAt, madeTurn, moments: [moment], agendas: [{ who, wants, will, hidden }],
//          offscreen: [text] } | null          the plan for one in-game day
//     moment = { id, text, when, trigger, ties: [name], source, droppable,
//                status: 'pending' | 'done' | 'skipped', note }
//   queue: [{ id, text, urgency: 'soon' | 'today' | 'whenever', status: 'waiting' |
//             'planned' | 'done' | 'withdrawn', at, plannedAs: [momentId], doneAt }]
//   inspirations: [{ id, title, text, motifs: [text], at, error }]
//   log: [{ pass, at, ms, outcome, error }]     the last LOG_LIMIT passes
//   counters: { sinceCheck, turn, lastCheck }   replies since the last CHECK; replies seen;
//                                               when the last CHECK or DAY pass ran (ISO)
//   pace: { sceneKey, sceneReplies, idleReplies, baselineWords, hold }
//   checkWanted                                 a beat was skipped: CHECK on the next pass
//   peeked: [momentId]                          spoilers the user looked at one by one
//   shape                                       story shape id (src/planner/shapes.js); '' = none chosen
//   outline: { premise, themes: [text], acts: [{ id, title, beats: [beat] }],
//              seeds: [{ id, text, payoff }], updatedAt, madeTurn } | null
//     beat = { id, text, ties: [name], status: 'pending' | 'active' | 'done' | 'skipped',
//              locked, by: 'planner' | 'user', note }
//   tension: [{ at, index, threat, uncertainty, emotional, overall, reason, source }]
//                                               readings, oldest first (Archivist's, or the
//                                               planner's own without it); the last TENSION_LIMIT
//   outlineWanted                               Archivist compiled: OUTLINE on the next pass
//   join: { act, note }                         a story already under way: the chapter (act
//                                               index, -1 = let the planner judge) it is in
//                                               now, and the user's note on the story so far
// }

export const URGENCIES = Object.freeze([['soon', 'Soon'], ['today', 'Today'], ['whenever', 'Whenever it fits']]);
export const LEVELS = Object.freeze([['light', 'Light'], ['moderate', 'Moderate'], ['heavy', 'Heavy']]);
export const PACINGS = Object.freeze([['off', 'Off'], ['gentle', 'Gentle'], ['brisk', 'Brisk'], ['fast', 'Fast']]);

// Background passes per level (§4): CHECK every n replies (0: only when
// the director reports a skipped beat); a day plan is re-made as "the rest
// of the day" after dayExpire replies; OUTLINE every n replies (0: on
// demand), and after Archivist compiles (compile).
export const LEVEL_CADENCE = Object.freeze({
    light: { check: 0, dayExpire: 40, outline: 0, compile: false },
    moderate: { check: 3, dayExpire: 25, outline: 15, compile: true },
    heavy: { check: 1, dayExpire: 15, outline: 8, compile: true },
});
// The first outline once the story has had this many replies to show what
// it is about (or on demand).
export const FIRST_OUTLINE_AFTER = 5;

const LOG_LIMIT = 30;
const QUEUE_DONE_LIMIT = 20;
const INSPIRATION_LIMIT = 12;
const INSPIRATION_CHARS = 12000;
const MOMENT_LIMIT = 8;
const BEAT_LIMIT = 10;
const TENSION_LIMIT = 50;
const BEAT_STATUSES = ['pending', 'active', 'done', 'skipped'];

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const clean = (v) => str(v).replace(/\s+/g, ' ').trim();
const strList = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
const int = (v, fallback = 0) => (Number.isInteger(v) && v >= 0 ? v : fallback);

export function emptyGm() {
    return {
        day: null, queue: [], inspirations: [], log: [],
        counters: { sinceCheck: 0, turn: 0, lastCheck: '', sinceOutline: 0, lastCompiled: '' },
        pace: emptyPace(),
        checkWanted: false,
        peeked: [],
        shape: '',
        outline: null,
        tension: [],
        outlineWanted: false,
        join: { act: -1, note: '' },
    };
}

function emptyPace() {
    return { sceneKey: '', sceneReplies: 0, idleReplies: 0, baselineWords: 0, hold: false };
}

function normalizeMoment(m, i) {
    if (!isObject(m) || !clean(m.text)) return null;
    return {
        id: clean(m.id) || `m${i + 1}`,
        text: clean(m.text),
        when: clean(m.when),
        trigger: clean(m.trigger),
        ties: strList(m.ties),
        source: clean(m.source),
        droppable: m.droppable !== false,
        status: ['pending', 'done', 'skipped'].includes(m.status) ? m.status : 'pending',
        note: clean(m.note),
    };
}

function normalizeDay(d) {
    if (!isObject(d) || !Number.isInteger(d.day)) return null;
    return {
        day: d.day,
        madeAt: str(d.madeAt),
        madeTurn: int(d.madeTurn),
        moments: (Array.isArray(d.moments) ? d.moments : []).map(normalizeMoment).filter(Boolean).slice(0, MOMENT_LIMIT),
        agendas: (Array.isArray(d.agendas) ? d.agendas : []).filter((a) => isObject(a) && clean(a.who))
            .map((a) => ({ who: clean(a.who), wants: clean(a.wants), will: clean(a.will), hidden: clean(a.hidden) })).slice(0, 8),
        offscreen: strList(d.offscreen).slice(0, 6),
    };
}

function normalizeRequest(r) {
    if (!isObject(r) || !clean(r.text) || !clean(r.id)) return null;
    return {
        id: clean(r.id),
        text: clean(r.text).slice(0, 500),
        urgency: URGENCIES.some(([u]) => u === r.urgency) ? r.urgency : 'whenever',
        status: ['waiting', 'planned', 'done', 'withdrawn'].includes(r.status) ? r.status : 'waiting',
        at: str(r.at),
        plannedAs: strList(r.plannedAs),
        doneAt: str(r.doneAt),
    };
}

function normalizeInspiration(x) {
    if (!isObject(x) || !clean(x.id) || !str(x.text).trim()) return null;
    return { id: clean(x.id), title: clean(x.title), text: str(x.text).slice(0, INSPIRATION_CHARS), motifs: strList(x.motifs).slice(0, 12), at: str(x.at), error: clean(x.error) };
}

export function normalizeGm(value) {
    const g = isObject(value) ? value : {};
    const p = isObject(g.pace) ? g.pace : {};
    const c = isObject(g.counters) ? g.counters : {};
    const queue = (Array.isArray(g.queue) ? g.queue : []).map(normalizeRequest).filter(Boolean);
    return {
        day: normalizeDay(g.day),
        queue: trimQueue(queue),
        inspirations: (Array.isArray(g.inspirations) ? g.inspirations : []).map(normalizeInspiration).filter(Boolean).slice(0, INSPIRATION_LIMIT),
        log: (Array.isArray(g.log) ? g.log : []).filter((l) => isObject(l) && clean(l.pass)).slice(-LOG_LIMIT),
        counters: { sinceCheck: int(c.sinceCheck), turn: int(c.turn), lastCheck: str(c.lastCheck), sinceOutline: int(c.sinceOutline), lastCompiled: str(c.lastCompiled) },
        pace: { sceneKey: str(p.sceneKey), sceneReplies: int(p.sceneReplies), idleReplies: int(p.idleReplies), baselineWords: Number.isFinite(p.baselineWords) && p.baselineWords > 0 ? p.baselineWords : 0, hold: p.hold === true },
        checkWanted: g.checkWanted === true,
        peeked: strList(g.peeked).slice(-40),
        shape: clean(g.shape),
        outline: normalizeOutline(g.outline),
        tension: (Array.isArray(g.tension) ? g.tension : []).map(normalizeReading).filter(Boolean).slice(-TENSION_LIMIT),
        outlineWanted: g.outlineWanted === true,
        join: { act: Number.isInteger(g.join?.act) && g.join.act >= 0 ? g.join.act : -1, note: str(g.join?.note).trim().slice(0, 4000) },
    };
}

function normalizeBeat(b, i) {
    if (!isObject(b) || !clean(b.text)) return null;
    return {
        id: clean(b.id) || `b${i + 1}`,
        text: clean(b.text).slice(0, 400),
        ties: strList(b.ties).slice(0, 6),
        status: BEAT_STATUSES.includes(b.status) ? b.status : 'pending',
        locked: b.locked === true,
        by: b.by === 'user' ? 'user' : 'planner',
        note: clean(b.note),
    };
}

function normalizeOutline(o) {
    if (!isObject(o) || !Array.isArray(o.acts)) return null;
    let n = 0;
    const acts = o.acts.filter(isObject).map((a, i) => ({
        id: clean(a.id) || `a${i + 1}`,
        title: clean(a.title),
        beats: (Array.isArray(a.beats) ? a.beats : []).map((b) => normalizeBeat(b, n++)).filter(Boolean).slice(0, BEAT_LIMIT),
    }));
    if (!acts.length) return null;
    return {
        premise: clean(o.premise).slice(0, 1200),
        themes: strList(o.themes).slice(0, 8),
        acts,
        seeds: (Array.isArray(o.seeds) ? o.seeds : []).filter((x) => isObject(x) && clean(x.text))
            .map((x, i) => ({ id: clean(x.id) || `s${i + 1}`, text: clean(x.text), payoff: clean(x.payoff) })).slice(0, 8),
        updatedAt: str(o.updatedAt),
        madeTurn: int(o.madeTurn),
    };
}

const score = (v) => (Number.isFinite(v) ? Math.round(Math.min(5, Math.max(0, v)) * 10) / 10 : null);

function normalizeReading(r) {
    if (!isObject(r)) return null;
    const parts = { threat: score(r.threat), uncertainty: score(r.uncertainty), emotional: score(r.emotional) };
    const known = Object.values(parts).filter((v) => v !== null);
    const overall = score(r.overall) ?? (known.length ? score(known.reduce((a, b) => a + b, 0) / known.length) : null);
    if (overall === null) return null;
    return { at: str(r.at), index: Number.isInteger(r.index) ? r.index : null, ...parts, overall, reason: clean(r.reason).slice(0, 300), source: r.source === 'archivist' ? 'archivist' : 'planner' };
}

// Finished and withdrawn requests are kept a while, then dropped.
function trimQueue(queue) {
    const open = queue.filter((r) => r.status === 'waiting' || r.status === 'planned');
    const closed = queue.filter((r) => r.status === 'done' || r.status === 'withdrawn').slice(-QUEUE_DONE_LIMIT);
    return queue.filter((r) => open.includes(r) || closed.includes(r));
}

export function addLog(gm, entry) {
    gm.log = [...gm.log, { pass: entry.pass, at: entry.at ?? new Date().toISOString(), ms: entry.ms ?? 0, outcome: clean(entry.outcome), error: clean(entry.error) }].slice(-LOG_LIMIT);
}

// ---------------------------------------------------------------- queue

export function addRequest(gm, { id, text, urgency = 'whenever', at = '' }) {
    const r = normalizeRequest({ id, text, urgency, at, status: 'waiting' });
    if (r) gm.queue = trimQueue([...gm.queue, r]);
    return r;
}

export function setRequestStatus(gm, id, status, extra = {}) {
    gm.queue = trimQueue(gm.queue.map((r) => (r.id === id ? { ...r, status, ...extra } : r)));
}

export const openRequests = (gm) => gm.queue.filter((r) => r.status === 'waiting' || r.status === 'planned');
export const waitingRequests = (gm) => gm.queue.filter((r) => r.status === 'waiting');

// A request is done when every moment planned for it is done (any one
// done is enough when the others were skipped).
export function settleRequests(gm) {
    const byId = new Map((gm.day?.moments ?? []).map((m) => [m.id, m]));
    for (const r of gm.queue) {
        if (r.status !== 'planned' || !r.plannedAs.length) continue;
        const moments = r.plannedAs.map((id) => byId.get(id)).filter(Boolean);
        // The day it was planned for has gone: back in the queue.
        if (!moments.length) { r.status = 'waiting'; r.plannedAs = []; continue; }
        if (moments.some((m) => m.status === 'done') && moments.every((m) => m.status !== 'pending')) { r.status = 'done'; r.doneAt = new Date().toISOString(); }
        else if (moments.every((m) => m.status === 'skipped')) { r.status = 'waiting'; r.plannedAs = []; }
    }
}

// ---------------------------------------------------------------- day plan

// Takes a DAY pass's answer in as the day's plan. Requests it planned for
// are marked; ids are the planner's own (m1, m2...).
export function setDayPlan(gm, plan, { day, turn, at = new Date().toISOString() }) {
    const moments = (plan.moments ?? []).map((m, i) => normalizeMoment({ ...m, id: `m${i + 1}`, status: 'pending' }, i)).filter(Boolean).slice(0, MOMENT_LIMIT);
    gm.day = normalizeDay({ day, madeAt: at, madeTurn: turn, moments, agendas: plan.agendas, offscreen: plan.offscreen });
    // Requests planned for an earlier day that never happened wait again.
    for (const r of gm.queue) if (r.status === 'planned') { r.status = 'waiting'; r.plannedAs = []; }
    planRequests(gm, plan.requests, moments);
    gm.peeked = [];
}

// [{ request: id, moments: [index from 1] }] -> requests marked planned.
function planRequests(gm, requests, moments) {
    for (const link of requests ?? []) {
        const r = gm.queue.find((x) => x.id === clean(link?.request) && x.status === 'waiting');
        const ids = (Array.isArray(link?.moments) ? link.moments : []).map((n) => moments[Number(n) - 1]?.id).filter(Boolean);
        if (r && ids.length) { r.status = 'planned'; r.plannedAs = ids; }
    }
}

// A CHECK pass's answer: { done: [id], skipped: [{ id, why }], add: [moment],
// requests: [{ request, moments: [index into add, from 1] }] }.
export function applyCheck(gm, check) {
    if (!gm.day) return;
    const mark = (id, status, note) => {
        const m = gm.day.moments.find((x) => x.id === clean(id));
        if (m && m.status === 'pending') { m.status = status; if (note) m.note = clean(note); }
    };
    for (const id of check.done ?? []) mark(typeof id === 'object' ? id?.id : id, 'done', typeof id === 'object' ? id?.how : '');
    for (const s of check.skipped ?? []) mark(typeof s === 'object' ? s?.id : s, 'skipped', typeof s === 'object' ? s?.why : '');
    const start = gm.day.moments.length;
    const added = (check.add ?? []).map((m, i) => normalizeMoment({ ...m, id: `m${start + i + 1}`, status: 'pending' }, start + i)).filter(Boolean);
    gm.day.moments = [...gm.day.moments, ...added].slice(-MOMENT_LIMIT);
    planRequests(gm, check.requests, added);
    settleRequests(gm);
}

// The director's BEAT lines: [{ id, status: 'done' | 'skipped', note }].
// -> true when a beat was skipped (the plan needs a CHECK).
export function applyBeats(gm, beats) {
    if (!gm.day || !beats?.length) return false;
    let skipped = false;
    for (const b of beats) {
        const m = gm.day.moments.find((x) => x.id === clean(b.id).toLowerCase());
        if (!m || m.status !== 'pending') continue;
        m.status = b.status === 'done' ? 'done' : 'skipped';
        m.note = clean(b.note);
        if (m.status === 'skipped') skipped = true;
    }
    settleRequests(gm);
    if (skipped) gm.checkWanted = true;
    return skipped;
}

// ---------------------------------------------------------------- pace (§6.1)

const words = (text) => (str(text).match(/[\p{L}\p{N}']+/gu) ?? []).length;
// Out of character asks to stay: "[stay]", "(ooc: linger here)".
const HOLD = /[[(]\s*(?:ooc\s*:?\s*)?(?:stay|linger|hold|don'?t rush|slow down)\b[^\])]*[\])]/i;

// What the user's post shows: dialogue ("..."), a question, a deliberate
// action.
export function postSignals(text) {
    const t = str(text);
    return {
        words: words(t),
        dialogue: /["“”«»]/.test(t),
        question: /\?/.test(t),
        hold: HOLD.test(t),
    };
}

// Pace bookkeeping after a reply. `scene`: { key } - what identifies the
// scene (place + title); a change starts the count again. `active`: the
// reply changed something (someone came or went, a beat was done, the
// scene moved). `userText`: the user's latest post.
export function trackPace(gm, { sceneKey, active, userText }) {
    const p = gm.pace;
    if (sceneKey !== p.sceneKey) { p.sceneKey = sceneKey; p.sceneReplies = 0; p.idleReplies = 0; p.hold = false; }
    p.sceneReplies += 1;
    p.idleReplies = active ? 0 : p.idleReplies + 1;
    const s = postSignals(userText);
    if (s.hold) p.hold = true;
    if (s.words > 0) p.baselineWords = p.baselineWords ? Math.round((p.baselineWords * 0.8 + s.words * 0.2) * 10) / 10 : s.words;
}

const PACE_RULES = Object.freeze({
    gentle: { idle: 4, passive: 2, longScene: 30 },
    brisk: { idle: 3, passive: 2, longScene: 18 },
    fast: { idle: 2, passive: 1, longScene: 10 },
});

// -> { aim: 'linger' | 'steady' | 'move on', why }
// recentUser: the user's last few posts, oldest first. tense: a fight or
// confrontation is under way (never moved on from). pull: the plan wants
// the story somewhere else or later.
export function paceAim(gm, { level = 'gentle', recentUser = [], tense = false, pull = false } = {}) {
    if (level === 'off') return { aim: 'steady', why: '' };
    const rules = PACE_RULES[level] ?? PACE_RULES.gentle;
    const p = gm.pace;
    if (p.hold) return { aim: 'linger', why: 'the user asked to stay with this scene' };
    const posts = recentUser.map(postSignals);
    const last = posts[posts.length - 1];
    if (!last) return { aim: 'steady', why: '' };
    const base = p.baselineWords || last.words;
    const passive = (s) => !s.dialogue && !s.question && s.words < Math.max(12, base * 0.5);
    let passiveRun = 0;
    for (let i = posts.length - 1; i >= 0 && passive(posts[i]); i--) passiveRun++;
    // The user is in the middle of something: never cut it short.
    if (last.question || last.dialogue || tense) {
        return p.idleReplies < 2 && (last.words >= base * 0.7 || last.dialogue) ? { aim: 'linger', why: 'the user is engaged in the scene' } : { aim: 'steady', why: '' };
    }
    const idle = p.idleReplies >= rules.idle;
    const long = p.sceneReplies >= rules.longScene;
    if (passiveRun >= rules.passive && (idle || long || pull)) {
        return { aim: 'move on', why: [idle ? 'nothing has changed for a while' : '', long ? 'the scene has run long' : '', pull ? 'the plan has something waiting elsewhere or later' : '', 'the user\'s posts are short'].filter(Boolean).join('; ') };
    }
    if (idle && long) return { aim: 'move on', why: 'the scene has run its course' };
    return { aim: 'steady', why: '' };
}

// ---------------------------------------------------------------- cadence (§4)

// Which passes are due after a reply, in the order to run them: OUTLINE
// first (the day plan follows the story's direction), then DAY or CHECK
// (DAY replaces CHECK: a new plan needs no check). OUTLINE only once a
// story shape is chosen.
export function duePasses(gm, { day, turn, level = 'moderate', checkEvery = null, dayExpire = null, outlineEvery = null } = {}) {
    const cadence = LEVEL_CADENCE[level] ?? LEVEL_CADENCE.moderate;
    const out = [];
    if (gm.shape) {
        const often = Number.isInteger(outlineEvery) ? outlineEvery : cadence.outline;
        if (!gm.outline ? turn >= FIRST_OUTLINE_AFTER
            : (often > 0 && gm.counters.sinceOutline >= often) || (cadence.compile && gm.outlineWanted)) out.push('outline');
    }
    const every = Number.isInteger(checkEvery) ? checkEvery : cadence.check;
    const expire = Number.isInteger(dayExpire) ? dayExpire : cadence.dayExpire;
    if (!gm.day || gm.day.day !== day || (expire > 0 && turn - gm.day.madeTurn >= expire)) return [...out, 'day'];
    const pending = gm.day.moments.some((m) => m.status === 'pending');
    // A request newer than the last pass: once, not after every reply.
    if (gm.checkWanted || waitingRequests(gm).some((r) => r.at > gm.counters.lastCheck)) return [...out, 'check'];
    if (every > 0 && gm.counters.sinceCheck >= every && pending) return [...out, 'check'];
    return out;
}

// ---------------------------------------------------------------- the director's section (§6)

// The private GM PLAN section, or '' when there is nothing to say.
// pace: paceAim(); aim: shapes.js tensionAim(); story: { shape (label),
// act (title) } for the outline's line; motifs: [text].
export function planSection(gm, { pace = null, aim = null, story = null, motifs = [] } = {}) {
    const lines = [];
    const beat = activeBeat(gm.outline);
    if (beat) lines.push(`- Story: ${story?.shape ? `${story.shape}, ` : ''}${story?.act ? `in "${story.act}" - ` : ''}the beat now: ${beat.text}`);
    if (aim) lines.push(`- Aim: ${aim.word} (${aim.lean}) - ${aim.why}.`);
    if (pace && pace.aim !== 'steady') {
        lines.push(pace.aim === 'move on'
            ? `- Pace: move on - ${pace.why}. Bring the scene to a natural close from the world's side (the others wrap up, something calls them away, night falls) and let time pass to the next moment worth playing, with a TIME line that covers it. End on a hook that hands the choice back to the player. Never decide for the player character.`
            : `- Pace: linger - ${pace.why}. Give the scene room; let time move only as the story says.`);
    }
    const coming = (gm.day?.moments ?? []).filter((m) => m.status === 'pending').slice(0, 2);
    for (const m of coming) lines.push(`- Coming up [${m.id}]: ${m.text}${m.when ? ` (${m.when}${m.trigger ? `; ${m.trigger}` : ''})` : m.trigger ? ` (${m.trigger})` : ''}`);
    const agendas = (gm.day?.agendas ?? []).slice(0, 4);
    if (agendas.length) lines.push(`- Agendas: ${agendas.map((a) => `${a.who} wants ${a.wants}${a.will ? `, and will ${a.will}` : ''}${a.hidden ? ` (hidden: ${a.hidden})` : ''}`).join('; ')}.`);
    const off = (gm.day?.offscreen ?? []).slice(0, 2);
    if (off.length) lines.push(`- Off-screen: ${off.join('; ')}.`);
    const soon = gm.queue.filter((r) => r.status === 'waiting' && r.urgency === 'soon').slice(0, 2);
    for (const r of soon) lines.push(`- The user would like: ${r.text} - work it in where it is natural.`);
    const m = motifs.filter(Boolean).slice(0, 3);
    if (m.length) lines.push(`- Motifs to echo, as images rather than events: ${m.join('; ')}.`);
    if (!lines.length) return '';
    return ['GM PLAN (private - never mention it; it guides what you choose, it is not a script. A coming moment happens only where the player\'s actions leave room for it; drop one that no longer fits.)', ...lines].join('\n');
}

// The motifs for this chat: the inspirations' distilled motifs, a few from
// each, in turn.
export function motifsOf(gm, max = 6) {
    const lists = gm.inspirations.map((x) => x.motifs).filter((l) => l.length);
    const out = [];
    for (let i = 0; out.length < max && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && out.length < max) out.push(l[i]);
    return out;
}

// What is veiled while spoilers are hidden: a moment's or agenda's text,
// unless the user peeked at it.
export const isVeiled = (gm, id, showSpoilers) => !showSpoilers && !gm.peeked.includes(id);

// ---------------------------------------------------------------- the outline (§3.1)

export const beatsOf = (outline) => (outline?.acts ?? []).flatMap((a) => a.beats);
export const activeBeat = (outline) => beatsOf(outline).find((b) => b.status === 'active') ?? null;
const beatNumber = (id) => Number(/^b(\d+)$/.exec(id)?.[1] ?? 0);

// The act holding the active beat (or the first with a beat still to
// come): { act, index } or null.
export function currentAct(outline) {
    const acts = outline?.acts ?? [];
    let index = acts.findIndex((a) => a.beats.some((b) => b.status === 'active'));
    if (index < 0) index = acts.findIndex((a) => a.beats.some((b) => b.status === 'pending'));
    if (index < 0) index = Math.max(0, acts.length - 1);
    return acts[index] ? { act: acts[index], index } : null;
}

// The story's position, 0-1: beats done (half for the active one) out of
// the beats that count (skipped ones don't).
export function positionOf(outline) {
    const beats = beatsOf(outline).filter((b) => b.status !== 'skipped');
    if (!beats.length) return 0;
    const done = beats.filter((b) => b.status === 'done').length + (beats.some((b) => b.status === 'active') ? 0.5 : 0);
    return Math.round((done / beats.length) * 1000) / 1000;
}

// One active beat at most; with none, the first beat still to come.
function settleActive(outline) {
    const beats = beatsOf(outline);
    const active = beats.filter((b) => b.status === 'active');
    for (const b of active.slice(1)) b.status = 'pending';
    if (!active.length) {
        const next = beats.find((b) => b.status === 'pending');
        if (next) next.status = 'active';
    }
}

const past = (b) => b.status === 'done' || b.status === 'skipped';

// Takes an OUTLINE pass's answer in. parsed: { premise, themes, acts:
// [{ title, beats: [{ id?, text, ties, status }] }], seeds }. What the
// story has done stays done; locked beats (the user's) keep their words;
// beats the answer leaves out are dropped unless done, skipped or locked.
// keepLocked false (a regenerate that starts afresh): locked beats still
// to come are dropped too - only what the story has done is kept.
export function setOutline(gm, parsed, { turn = 0, at = new Date().toISOString(), keepLocked = true } = {}) {
    const kept = (b) => (keepLocked && b.locked) || past(b);
    const old = new Map(beatsOf(gm.outline).filter((b) => keepLocked || past(b)).map((b) => [b.id, b]));
    const used = new Set();
    let next = Math.max(0, ...[...old.keys()].map(beatNumber)) + 1;
    const acts = (parsed.acts ?? []).map((a, i) => {
        const beats = [];
        for (const raw of a.beats ?? []) {
            const prev = raw.id ? old.get(clean(raw.id)) : null;
            if (prev && !used.has(prev.id)) {
                used.add(prev.id);
                const status = past(prev) ? prev.status : (BEAT_STATUSES.includes(raw.status) ? raw.status : prev.status);
                const keepWords = prev.locked || past(prev);
                beats.push({ ...prev, text: keepWords ? prev.text : clean(raw.text) || prev.text, ties: keepWords ? prev.ties : strList(raw.ties).slice(0, 6), status });
            } else {
                const b = normalizeBeat({ ...raw, id: `b${next++}`, locked: false, by: 'planner' }, 0);
                if (b) beats.push(b);
            }
        }
        // History and the user's beats are never lost: back in their act,
        // what is past before what is still to come.
        const oldAct = gm.outline?.acts?.[i];
        for (const b of oldAct?.beats ?? []) {
            if (used.has(b.id) || !kept(b)) continue;
            used.add(b.id);
            const before = past(b) ? beats.findIndex((x) => !past(x)) : -1;
            if (before >= 0) beats.splice(before, 0, b); else beats.push(b);
        }
        return { id: `a${i + 1}`, title: clean(a.title) || clean(oldAct?.title) || `Act ${i + 1}`, beats: beats.slice(0, BEAT_LIMIT) };
    });
    // Kept beats of acts the answer no longer has go to the last act.
    for (const b of old.values()) {
        if (used.has(b.id) || !kept(b) || !acts.length) continue;
        acts[acts.length - 1].beats.push(b);
    }
    gm.outline = normalizeOutline({
        premise: clean(parsed.premise) || gm.outline?.premise || '',
        themes: parsed.themes?.length ? parsed.themes : gm.outline?.themes ?? [],
        acts,
        seeds: parsed.seeds?.length ? parsed.seeds : gm.outline?.seeds ?? [],
        updatedAt: at,
        madeTurn: turn,
    });
    if (gm.outline) settleActive(gm.outline);
}

// The user's own changes. An edited or added beat is locked: the planner
// keeps its words.
export function editBeat(gm, id, text) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (b && clean(text)) { b.text = clean(text).slice(0, 400); b.by = 'user'; b.locked = true; }
}

export function lockBeat(gm, id, locked) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (b) b.locked = locked === true;
}

export function removeBeat(gm, id) {
    if (!gm.outline) return;
    for (const a of gm.outline.acts) a.beats = a.beats.filter((b) => b.id !== id || b.status === 'done');
    settleActive(gm.outline);
}

export function addBeat(gm, actId, text) {
    const act = gm.outline?.acts.find((a) => a.id === actId);
    if (!act || !clean(text) || act.beats.length >= BEAT_LIMIT) return null;
    const beat = normalizeBeat({ id: `b${Math.max(0, ...beatsOf(gm.outline).map((b) => beatNumber(b.id))) + 1}`, text, status: 'pending', locked: true, by: 'user' }, 0);
    act.beats.push(beat);
    settleActive(gm.outline);
    return beat;
}

// A regenerated beat (the BEAT pass): new words from the planner, so it is
// no longer the user's or locked.
export function replaceBeat(gm, id, { text, ties = [] }) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (!b || !clean(text) || past(b)) return false;
    Object.assign(b, { text: clean(text).slice(0, 400), ties: strList(ties).slice(0, 6), by: 'planner', locked: false, note: '' });
    return true;
}

// A beat the story has played out (the user says so, or a pass does).
// A story joined in progress: every beat of the chapters before `act` has
// played out, and the story is now in chapter `act` - its first beat still
// to come is the active one. Nothing the story has done is undone.
export function startAt(gm, act) {
    const acts = gm.outline?.acts ?? [];
    if (!Number.isInteger(act) || act < 0 || act >= acts.length) return;
    acts.forEach((a, i) => {
        for (const b of a.beats) {
            if (i < act && (b.status === 'pending' || b.status === 'active')) b.status = 'done';
            if (i >= act && b.status === 'active') b.status = 'pending';
        }
    });
    const first = acts.slice(act).flatMap((a) => a.beats).find((b) => b.status === 'pending');
    if (first) first.status = 'active';
}

export function finishBeat(gm, id) {
    const b = beatsOf(gm.outline).find((x) => x.id === id);
    if (!b || b.status === 'done') return;
    b.status = 'done';
    settleActive(gm.outline);
}

// ---------------------------------------------------------------- tension (§5)

// Archivist's readings (its compiled tension), merged into ours by message
// index: a Rebuild that starts its graph over keeps our copy of the past.
// -> true when something changed.
export function mergeArchivistTension(gm, readings) {
    const fresh = (readings ?? []).map((r) => normalizeReading({ ...r, index: r.message_index ?? r.index, source: 'archivist' })).filter(Boolean);
    if (!fresh.length) return false;
    const list = gm.tension.filter((r) => r.source === 'archivist');
    const byIndex = new Map(list.filter((r) => r.index !== null).map((r) => [r.index, r]));
    let changed = list.length !== gm.tension.length;
    for (const r of fresh) {
        const prev = r.index !== null ? byIndex.get(r.index) : null;
        if (prev && prev.overall === r.overall && prev.reason === r.reason) continue;
        if (prev) Object.assign(prev, r); else { list.push(r); if (r.index !== null) byIndex.set(r.index, r); }
        changed = true;
    }
    if (changed) gm.tension = list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).slice(-TENSION_LIMIT);
    return changed;
}

// The planner's own reading (a CHECK pass), when Archivist gives none.
export function addOwnReading(gm, reading, { index = null, at = new Date().toISOString() } = {}) {
    const r = normalizeReading({ ...reading, index, at, source: 'planner' });
    if (r) gm.tension = [...gm.tension.filter((x) => x.source === 'planner'), r].slice(-TENSION_LIMIT);
    return r;
}

// -> { now, recent } (recent: the readings before now, oldest first).
export function tensionNow(gm) {
    const list = gm.tension;
    return { now: list[list.length - 1] ?? null, recent: list.slice(-8, -1) };
}
