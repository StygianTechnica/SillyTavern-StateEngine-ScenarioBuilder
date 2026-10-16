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

export const QUEST_TYPES = Object.freeze(['main', 'side', 'personal', 'faction', 'mystery', 'task']);
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

// Objectives kept in step with a thread's steps: matched by text, a step's
// newer status updates its objective (unless the user set that objective by
// hand), new steps are added, the user's own objectives kept.
export function mergeObjectives(current, fromThread) {
    const out = (current ?? []).map((o) => ({ ...o }));
    for (const t of fromThread ?? []) {
        const hit = out.find((o) => key(o.text) === key(t.text));
        if (!hit) out.push({ ...t, from: 'archivist' });
        else if (!hit.byUser && hit.status !== t.status) hit.status = t.status;
    }
    return out;
}

// -> { status, from: 'user' | 'story' | 'archivist' | 'none', conflict }
// conflict: what Archivist suggests when it disagrees with the runtime.
export function effectiveStatus({ override = '', runtime = '', thread = null } = {}) {
    const fromThread = thread ? statusFromThread(thread.status) : '';
    if (QUEST_STATUSES.includes(override)) return { status: override, from: 'user', conflict: '' };
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
    return { type: '', priority: 'medium', status: '', objectives: [], completion: '', abandon: '', threadId: '' };
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
        completion: typeof q.completion === 'string' ? q.completion : '',
        abandon: typeof q.abandon === 'string' ? q.abandon : '',
        threadId: typeof q.threadId === 'string' ? q.threadId : '',
    };
}
