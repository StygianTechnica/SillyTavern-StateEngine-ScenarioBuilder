// Quests (spec 9.5) - the pure half: which Archivist threads are quests,
// what a quest's status is, how far along it is, how much it matters right
// now, and keeping its objectives in step with Archivist's plan steps. No
// SillyTavern imports (SB-804); the runner is src/quests/sync.js.
//
// Where a quest's status comes from, strongest first (SB-434):
//   1. the user's override (always wins, always visible);
//   2. the quest object's runtime status - State Engine fills it from the
//      roleplay while the quest is held in sb__quests (SB-432, SB-439a B);
//   3. Archivist's thread status - supporting evidence (SB-439a A).
// A disagreement (Archivist says resolved, the runtime still says Active)
// is shown, not silently resolved.

import { normalizeMission } from './missions.js';

export const QUEST_TYPES = Object.freeze(['main', 'side', 'personal', 'faction', 'mystery', 'task', 'mission']);
export const QUEST_PRIORITIES = Object.freeze(['low', 'medium', 'high']);
// State Engine's quest status values, plus Abandoned (spec SB-439, C7).
export const QUEST_STATUSES = Object.freeze(['Not started', 'Active', 'Completed', 'Failed', 'Abandoned']);
export const OBJECTIVE_STATUSES = Object.freeze(['pending', 'done', 'failed', 'optional']);

const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const key = (t) => clean(t).toLowerCase().replace(/[^a-z0-9 ]/g, '');

// Archivist thread kinds that are quest material (quest seeds, goals,
// plans, hooks, missions...), or a thread Archivist linked to a quest object.
export function isQuestThread(thread) {
    if (!thread || typeof thread !== 'object') return false;
    if (thread.entity?.type === 'quest') return true;
    return /quest|seed|hook|goal|plan|mission|task|errand|job|vow|oath|bounty|objective/i.test(String(thread.kind ?? ''));
}

export function statusFromThread(status) {
    switch (String(status ?? '').toLowerCase()) {
        case 'active': return 'Active';
        case 'resolved': return 'Completed';
        case 'abandoned': return 'Abandoned';
        default: return 'Not started';
    }
}

export function typeFromThread(thread) {
    const kind = String(thread?.kind ?? '').toLowerCase();
    if (/main/.test(kind)) return 'main';
    if (/goal|plan|vow|oath|personal/.test(kind)) return 'personal';
    if (/mystery|secret|question/.test(kind)) return 'mystery';
    if (/task|errand|job|bounty/.test(kind)) return 'task';
    if (/faction/.test(kind)) return 'faction';
    return 'side';
}

const STEP_TO_OBJECTIVE = { done: 'done', failed: 'failed', skipped: 'optional', active: 'pending', pending: 'pending' };

// Objectives from a thread: its plan steps, else its goal.
export function objectivesFromThread(thread) {
    const steps = Array.isArray(thread?.steps) ? thread.steps : [];
    if (steps.length) return steps.map((s) => ({ text: clean(s.text), status: STEP_TO_OBJECTIVE[s.status] ?? 'pending' })).filter((o) => o.text);
    return clean(thread?.goal) ? [{ text: clean(thread.goal), status: thread.status === 'resolved' ? 'done' : 'pending' }] : [];
}

// Matching objectives. Archivist rewords its plan steps from one compile to
// the next ("Confront Maren about Elyon's influence" -> the same with "(Maren
// explained the visions)" appended, "[Highly classified]" put in front, or a
// " - ..." tail), so an objective is matched on its core: the text without
// bracketed notes or a dash tail, then on its distinctive words.
const STOP = new Set(('a an the and or but of to in on at by for with from into onto about as is are was were be been being '
    + 'this that these those his her their its your our my him them they he she it you we i who whom which what '
    + 'how whether while then than so if not no any some all more most over under after before during between '
    + 'through toward towards out up down off there here will would can could should must may might has have had do does did').split(' '));

// The part of an objective that says what it is: no (notes), [notes] or
// " - tail", no closing punctuation.
export function objectiveCore(text) {
    let t = clean(text).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
    t = t.split(/\s[-–—]\s/)[0];
    return clean(t).replace(/[.,;:!?\s]+$/, '');
}

const stem = (w) => w.replace(/'s$/, '').replace(/(?<=\w{3})s$/, '');
function words(text) {
    return new Set(clean(text).toLowerCase().replace(/[‘’]/g, "'").split(/[^a-z0-9']+/)
        .map((w) => stem(w.replace(/^'+|'+$/g, ''))).filter((w) => w.length > 1 && !STOP.has(w)));
}

// How alike two objectives are, 0..1: 1 for the same core; otherwise the
// share of the shorter one's distinctive words the other has too (at least
// three of them, and most of both).
export function objectiveLikeness(a, b) {
    const ca = key(objectiveCore(a));
    const cb = key(objectiveCore(b));
    if (!ca || !cb) return 0;
    if (ca === cb) return 1;
    const wa = words(objectiveCore(a));
    const wb = words(objectiveCore(b));
    const small = Math.min(wa.size, wb.size);
    if (small < 3) return 0;
    const shared = [...wa].filter((w) => wb.has(w)).length;
    const contained = shared / small;
    const dice = (2 * shared) / (wa.size + wb.size);
    return contained >= 0.8 && dice >= 0.5 ? contained * 0.99 : 0;
}

export const sameObjective = (a, b) => objectiveLikeness(a, b) > 0;

// The existing objective a text matches best, or null.
function bestMatch(list, text) {
    let best = null;
    let score = 0;
    for (const o of list) {
        const s = key(o.text) === key(text) ? 2 : objectiveLikeness(o.text, text);
        if (s > score) { best = o; score = s; }
    }
    return best ? { hit: best, exact: score === 2 } : null;
}

// Objectives kept in step with a thread's steps: matched by text (tolerant
// of rewording, see objectiveLikeness), a step's newer status updates its
// objective (unless the user set that objective by hand; a reworded step
// never reopens a done one), new steps are added, the user's own
// objectives kept. Steps `foreign` says belong to another quest are left out,
// and so are steps like one the user removed (`removed`: their texts) - a
// removed objective stays removed however Archivist rewords it.
export function mergeObjectives(current, fromThread, { foreign = null, removed = [] } = {}) {
    const out = (current ?? []).map((o) => ({ ...o }));
    for (const t of fromThread ?? []) {
        if ((removed ?? []).some((r) => key(r) === key(t.text) || sameObjective(r, t.text))) continue;
        const match = bestMatch(out, t.text);
        if (!match) {
            if (!foreign?.(t.text)) out.push({ ...t, from: 'archivist' });
            continue;
        }
        const { hit, exact } = match;
        if (hit.byUser || hit.status === t.status) continue;
        if (!exact && hit.status === 'done') continue;
        hit.status = t.status;
    }
    return out;
}

const STATUS_WEIGHT = { done: 3, failed: 2, pending: 1, optional: 0 };

// Near-duplicate objectives collapsed into one (in the place of the first):
// the user's own objective wins as it is; otherwise the earliest wording
// without notes (or the first one's core) and the furthest status (done
// stays done).
// Archivist's pending objectives that `foreign` says belong to another
// quest are dropped. -> a new list (the input is left alone).
export function tidyObjectives(objectives, { foreign = null } = {}) {
    const groups = [];
    for (const o of objectives ?? []) {
        if (!o || !clean(o.text)) continue;
        if (!o.byUser && (o.status === 'pending' || o.status === 'optional') && foreign?.(o.text)) continue;
        const group = groups.find((g) => g.some((x) => sameObjective(x.text, o.text) && !(x.byUser && o.byUser)));
        if (group) group.push(o); else groups.push([o]);
    }
    return groups.map((g) => {
        const mine = g.find((o) => o.byUser);
        if (mine) return { ...mine };
        const plain = g.find((o) => clean(o.text).replace(/[.!?]+$/, '') === objectiveCore(o.text));
        const text = plain ? plain.text : objectiveCore(g[0].text) || g[0].text;
        const status = g.reduce((s, o) => (STATUS_WEIGHT[o.status] ?? 0) > (STATUS_WEIGHT[s] ?? 0) ? o.status : s, g[0].status);
        return { text, status, ...(g[0].from ? { from: g[0].from } : {}) };
    });
}

// Whether a step belongs to another quest thread rather than its own.
// Archivist sometimes copies other threads into a thread's plan, as
// "Other thread's title - its summary", as another thread's title or step,
// or retold ("Remus is heading to Liston's walls..."). A step counts as
// foreign when its " - " head or its core is another thread's title, when
// it is another thread's goal or step with no word of its own thread, or
// when it shares at least three distinctive words with another thread and
// fewer than half as many with its own. `own`: the thread's own texts
// (title, goal, summary, the quest's name and description - not its steps,
// which may be the copies); `others`: per other quest thread, its texts
// (title, goal, summary, steps, people). -> (text) => boolean
export function foreignStepTest(own, others) {
    const ownTexts = (own ?? []).filter((t) => clean(t));
    const ownWords = new Set(ownTexts.flatMap((t) => [...words(t)]));
    const ownHeads = new Set(ownTexts.map((t) => key(objectiveCore(t))));
    const heads = new Set((others ?? []).map((texts) => key(objectiveCore((texts ?? [])[0]))).filter((h) => h && !ownHeads.has(h)));
    const otherWords = (others ?? []).map((texts) => new Set((texts ?? []).flatMap((t) => [...words(t)])));
    const otherCores = new Set((others ?? []).flat().map((t) => key(objectiveCore(t))).filter(Boolean));
    return (text) => {
        const t = clean(text);
        if (heads.has(key(objectiveCore(t))) || heads.has(key(objectiveCore(t.split(/\s[-–—]\s/)[0])))) return true;
        const w = [...words(t)];
        const mine = w.filter((x) => ownWords.has(x)).length;
        // Another thread's step or goal word for word, nothing of its own.
        if (!mine && otherCores.has(key(objectiveCore(t)))) return true;
        return otherWords.some((o) => {
            const theirs = w.filter((x) => o.has(x)).length;
            return theirs >= 3 && mine < theirs / 2;
        });
    };
}

// -> { status, from: 'user' | 'story' | 'archivist' | 'none', conflict }
// conflict: what Archivist suggests when it disagrees with the runtime.
// `ended`: Completed or Failed when the story met the quest's own end
// condition (src/quests/ends.js) - over the story's reading, under the user.
export function effectiveStatus({ override = '', runtime = '', thread = null, ended = '' } = {}) {
    const fromThread = thread ? statusFromThread(thread.status) : '';
    if (QUEST_STATUSES.includes(override)) return { status: override, from: 'user', conflict: '' };
    if (ended === 'Completed' || ended === 'Failed') return { status: ended, from: 'ends', conflict: '' };
    if (QUEST_STATUSES.includes(runtime) && runtime !== 'Not started') {
        const finished = fromThread === 'Completed' || fromThread === 'Abandoned';
        return { status: runtime, from: 'story', conflict: runtime === 'Active' && finished ? fromThread : '' };
    }
    if (fromThread) return { status: fromThread, from: 'archivist', conflict: '' };
    return { status: QUEST_STATUSES.includes(runtime) ? runtime : 'Not started', from: runtime ? 'story' : 'none', conflict: '' };
}

// -> { done, total, ratio } over required objectives (optional ones left out).
export function questProgress(objectives) {
    const required = (objectives ?? []).filter((o) => o.status !== 'optional');
    const done = required.filter((o) => o.status === 'done').length;
    return { done, total: required.length, ratio: required.length ? done / required.length : 0 };
}

// The objective being worked on: the first required one still pending.
export function currentObjective(objectives) {
    return (objectives ?? []).find((o) => o.status === 'pending') ?? null;
}

// How much a quest matters right now (SB-438): its base priority and type,
// whether it is active, and how much of it is in the current scene (its
// people, place or linked entries present). Deterministic.
// -> { score, level: 'low' | 'medium' | 'high', reasons: [text] }
export function questPriority({ base = 'medium', type = 'side', status = 'Not started', involved = [], present = [], locationId = '' } = {}) {
    const reasons = [];
    let score = { low: 1, medium: 3, high: 5 }[base] ?? 3;
    if (type === 'main') { score += 3; reasons.push('main quest'); } else if (type === 'personal' || type === 'faction') score += 1;
    if (status === 'Active') { score += 3; reasons.push('active'); }
    if (status === 'Completed' || status === 'Failed' || status === 'Abandoned') return { score: 0, level: 'low', reasons: ['finished'] };
    const here = new Set([...present, locationId].filter(Boolean));
    const hits = involved.filter((id) => here.has(id)).length;
    if (hits) { score += Math.min(4, hits * 2); reasons.push(`${hits} of its people or places in the scene`); }
    const level = score >= 9 ? 'high' : score >= 5 ? 'medium' : 'low';
    return { score, level, reasons };
}

// Sort for a quest board: active first, then by priority score, then name.
export function sortQuests(quests) {
    const rank = { Active: 0, 'Not started': 1, Completed: 2, Failed: 3, Abandoned: 4 };
    return [...quests].sort((a, b) => (rank[a.status] ?? 5) - (rank[b.status] ?? 5) || b.priority.score - a.priority.score || a.name.localeCompare(b.name));
}

export function emptyQuestMeta() {
    return { type: '', priority: 'medium', status: '', objectives: [], removed: [], completion: '', abandon: '', threadId: '', ended: '', endsTried: false, mission: null };
}

export function normalizeQuestMeta(value) {
    const q = value && typeof value === 'object' ? value : {};
    return {
        type: QUEST_TYPES.includes(q.type) ? q.type : '',
        priority: QUEST_PRIORITIES.includes(q.priority) ? q.priority : 'medium',
        status: QUEST_STATUSES.includes(q.status) ? q.status : '',
        objectives: (Array.isArray(q.objectives) ? q.objectives : [])
            .filter((o) => o && clean(o.text))
            .map((o) => ({ text: clean(o.text), status: OBJECTIVE_STATUSES.includes(o.status) ? o.status : 'pending', ...(o.byUser ? { byUser: true } : {}), ...(o.from ? { from: String(o.from) } : {}) })),
        // Objectives the user removed: never added back from Archivist.
        removed: (Array.isArray(q.removed) ? q.removed : []).map((t) => clean(t)).filter(Boolean).slice(-50),
        completion: typeof q.completion === 'string' ? q.completion : '',
        abandon: typeof q.abandon === 'string' ? q.abandon : '',
        threadId: typeof q.threadId === 'string' ? q.threadId : '',
        // Ended by its own condition; whether its ends were written for it.
        ended: q.ended === 'Completed' || q.ended === 'Failed' ? q.ended : '',
        endsTried: q.endsTried === true,
        // A mission's own parts - client, giver, difficulty, target, reward
        // (src/quests/missions.js) - or null.
        mission: normalizeMission(q.mission),
    };
}

// A thread the story has left behind: Archivist still has it open, but no
// message in the last `after` has touched it ("negotiate passage with Niamh"
// long after it was settled, a ceremony from the first chapter). It makes no
// new quest, and a quest on it is not put before the narrator.
// thread: Archivist's view of it (message_range.to: the last message that
// touched it); newest: the chat's newest message Archivist has read.
export const DORMANT_AFTER = 40;
export function threadDormant(thread, newest, after = DORMANT_AFTER) {
    const last = thread?.message_range?.to;
    return Number.isInteger(last) && Number.isInteger(newest) && newest - last > after;
}

// Whether a thread is a quest the user rejected, reworded. Archivist keeps
// re-making a thread under a new id and title ("Negotiate passage terms with
// Niamh", "Niamh's Fortress and Passage", "Negotiate Favorable Terms with
// Niamh"): matched by title, by name alone, its next wording got through.
// thread: { title, text }; rejected: [{ name, text? }] (the quests rejected).
const QUEST_STOP = new Set('the and for with from into onto that this their them they his her its him she are was were has have had will would can could must about over under after before while then than when where which who whom what how also just only very more most some any all each other another again quest'.split(' '));
const questWords = (text) => new Set((String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.replace(/(?:'s|s)$/, '')).filter((w) => w.length >= 3 && !QUEST_STOP.has(w)));
const overlap = (a, b) => {
    if (!a.size || !b.size) return { shared: 0, ofSmaller: 0, jaccard: 0 };
    const shared = [...a].filter((w) => b.has(w)).length;
    return { shared, ofSmaller: shared / Math.min(a.size, b.size), jaccard: shared / (a.size + b.size - shared) };
};
export function rejectedLike(thread, rejected) {
    const title = questWords(thread?.title);
    const all = questWords(`${thread?.title ?? ''} ${thread?.text ?? ''}`);
    return (rejected ?? []).some((r) => {
        const t = overlap(title, questWords(r.name));
        if (t.shared >= 2 && t.ofSmaller >= 0.6) return true;
        if (!r.text) return false;
        const whole = overlap(all, questWords(`${r.name} ${r.text}`));
        return whole.shared >= 3 && whole.jaccard >= 0.45;
    });
}
