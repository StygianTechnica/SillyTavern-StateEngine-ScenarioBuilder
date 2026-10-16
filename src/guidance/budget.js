// Token budgeting for the guidance text (spec SB-305), pure and
// deterministic (SB-015): the same sections and budget always give the
// same result.
//
// Tokens are ESTIMATED as ceil(characters / 4) - no tokenizer is loaded,
// and the estimate only has to be stable, not exact.
//
// Drop / compress order: each section has a `priority` (higher = kept
// longer). While over budget, the lowest-priority section that still has a
// shorter `compact` form is compacted; once none can be compacted, the
// lowest-priority section that is not `keep` is dropped. Sections marked
// `keep` (current location/time, knowledge boundaries, active corrections)
// are the last to go and are never dropped - only compacted.

export function estimateTokens(text) {
    return Math.ceil(String(text ?? '').length / 4);
}

// sections: [{ key, priority, full, compact?, keep? }] in display order.
// Returns the same order: [{ key, text, mode: 'full'|'compact'|'dropped' }]
// plus the total token estimate (joined with blank lines, plus `overhead`
// tokens for the header).
export function fitToBudget(sections, budget, overhead = 0) {
    const state = sections.map((s) => ({ ...s, mode: s.full ? 'full' : 'dropped' }));
    const textOf = (s) => (s.mode === 'full' ? s.full : (s.mode === 'compact' ? s.compact : ''));
    const total = () => {
        const parts = state.map(textOf).filter(Boolean);
        return parts.length ? overhead + estimateTokens(parts.join('\n\n')) : 0;
    };
    const byPriority = () => [...state].sort((a, b) => a.priority - b.priority || state.indexOf(a) - state.indexOf(b));
    const limit = Number.isFinite(budget) && budget > 0 ? budget : Infinity;

    while (total() > limit) {
        const compactable = byPriority().find((s) => s.mode === 'full' && s.compact && s.compact.length < s.full.length);
        if (compactable) {
            compactable.mode = 'compact';
            continue;
        }
        const droppable = byPriority().find((s) => s.mode !== 'dropped' && !s.keep);
        if (!droppable) break;
        droppable.mode = 'dropped';
    }
    return {
        sections: state.map((s) => ({ key: s.key, text: textOf(s), mode: s.mode })),
        tokens: total(),
    };
}
