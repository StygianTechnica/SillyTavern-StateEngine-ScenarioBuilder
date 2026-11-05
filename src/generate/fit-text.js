// Any prompt, trimmed to fit the model's context with room for its answer -
// the last guard before a call (src/generate/llm.js). On an 8k model
// (Stheno) a prompt that fills the context leaves the answer a hundred
// tokens: it is cut off, and a JSON answer cannot be read. Passes with their
// own fitting (the director, the outline: src/director/fit.js,
// src/planner/fit.js) arrive already small and pass through untouched.
//
// A prompt is sections apart by a blank line. While it is over, the longest
// section that may be cut is halved - its first line (its title) kept -
// and measured again. Never cut: the system message, and the sections that
// carry the task: the user's wishes and steer, what is kept, and the
// instructions and answer shape. Pure.

export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 3.5);

// What the prompt may take: the context, less the answer's room and a
// safety margin for the chat template and the estimate.
export function promptRoom(contextTokens, answerTokens) {
    const context = Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : 8192;
    const answer = Number.isFinite(answerTokens) && answerTokens > 0 ? answerTokens : 900;
    return Math.max(1000, Math.floor((context - answer) * 0.9));
}

// Sections that carry the task, by how they start or what they hold.
const KEEP = /^(?:WRITE|REVIEW|PLAN |TODAY|THE WORLD MEANWHILE|WHAT THE USER WANTS|WHERE THE USER WANTS|START THE OUTLINE OVER|THE OUTLINE SO FAR|IMPORTANT|Answer\b|Reply\b|Return\b)|Answer in this JSON shape|answer with JSON|JSON shape/i;
const MIN_SECTION = 160;

function halve(section) {
    const nl = section.indexOf('\n');
    const head = nl >= 0 ? section.slice(0, nl + 1) : '';
    const body = nl >= 0 ? section.slice(nl + 1) : section;
    const keep = Math.max(MIN_SECTION - head.length, Math.floor(body.length / 2));
    return `${head}${body.slice(0, keep).replace(/\s+\S*$/, '')}...`;
}

// text -> { text, cut } fitted to `budget` tokens (with `fixed` tokens
// already taken elsewhere - the system message).
export function fitText(text, budget, fixed = 0) {
    const parts = String(text ?? '').split(/\n\s*\n/);
    const size = () => fixed + estimateTokens(parts.join('\n\n'));
    let cut = 0;
    while (size() > budget) {
        let at = -1;
        for (let i = 0; i < parts.length; i++) {
            if (KEEP.test(parts[i].trimStart()) || parts[i].length <= MIN_SECTION + 3) continue;
            if (at < 0 || parts[i].length > parts[at].length) at = i;
        }
        if (at < 0) break;
        const shorter = halve(parts[at]);
        if (shorter.length >= parts[at].length) break;
        parts[at] = shorter;
        cut += 1;
    }
    return { text: parts.join('\n\n'), cut };
}

// messages: [{ role, content }] -> { messages, cut, tokens, budget, fits }.
// The longest non-system message is the one fitted; the others count as
// they are.
export function fitMessages(messages, contextTokens, answerTokens) {
    const budget = promptRoom(contextTokens, answerTokens);
    const list = (messages ?? []).map((m) => ({ ...m, content: String(m?.content ?? '') }));
    const total = () => list.reduce((n, m) => n + estimateTokens(m.content), 0);
    if (total() <= budget) return { messages: list, cut: 0, tokens: total(), budget, fits: true };
    let at = -1;
    for (let i = 0; i < list.length; i++) if (list[i].role !== 'system' && (at < 0 || list[i].content.length > list[at].content.length)) at = i;
    if (at < 0) return { messages: list, cut: 0, tokens: total(), budget, fits: false };
    const others = total() - estimateTokens(list[at].content);
    const { text, cut } = fitText(list[at].content, budget, others);
    list[at] = { ...list[at], content: text };
    return { messages: list, cut, tokens: total(), budget, fits: total() <= budget };
}
