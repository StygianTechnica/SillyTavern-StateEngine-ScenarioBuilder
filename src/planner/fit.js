// The outline prompt, trimmed to fit the context window of the model it runs
// on (settings.director.contextTokens - the planner and the director share a
// connection). On an 8k model (Stheno) Assassins Inc's outline prompt took
// about 8,000 tokens: the answer had room for a hundred or two, was cut off
// in its first act, and every regenerate failed. Pure: the same input and
// limit give the same prompt.
//
// The prompt is built, measured and, while it is over, the least important
// part is shortened or dropped and it is built again. Never trimmed: the
// instructions, the outline kept, the shape, the user's steer and wish, the
// scene and who is here.

import { buildOutlinePrompt } from './prompts.js';
import { estimateDirectorTokens } from '../director/fit.js';

export { promptBudget } from '../director/fit.js';

const cutText = (text, max) => {
    const t = String(text ?? '');
    return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}...`;
};

// The dossier (src/director/prompt.js dossierText) is sections apart by a
// blank line, each starting with its title. Dropped by title, or every
// section cut short.
const sections = (dossier) => String(dossier ?? '').split(/\n\s*\n/);
const dropSections = (titles) => (i) => ({
    ...i,
    dossier: sections(i.dossier).filter((s) => !titles.some((t) => s.trimStart().startsWith(t))).join('\n\n'),
});
const cutSections = (max) => (i) => ({ ...i, dossier: sections(i.dossier).map((s) => cutText(s, max)).join('\n\n') });
const cutMessages = (n, max) => (i) => ({ ...i, messages: (i.messages ?? []).slice(-n).map((m) => ({ ...m, text: cutText(m.text, max) })) });

// The trimming steps, least important first: [label, input -> input].
const STEPS = [
    ['factions not yet in play', (i) => ({ ...i, untouched: [] })],
    ['motifs to 3', (i) => ({ ...i, motifs: (i.motifs ?? []).slice(0, 3) })],
    ['recent messages to 6', cutMessages(6, 700)],
    ['others who could turn up, enemy ground, elsewhere, names', dropSections(['OTHERS WHO COULD TURN UP', 'ENEMY GROUND', 'ELSEWHERE', 'Names for anyone'])],
    ['story so far shortened', (i) => ({ ...i, storySoFar: cutText(i.storySoFar, 2500) })],
    ['events, secrets', dropSections(['EVENTS', 'SECRETS AND OATHS'])],
    ['dossier sections to 1500', cutSections(1500)],
    ['recent messages to 4', cutMessages(4, 450)],
    ['story so far to 1200', (i) => ({ ...i, storySoFar: cutText(i.storySoFar, 1200) })],
    ['dossier sections to 800', cutSections(800)],
    ['recent messages to 3', cutMessages(3, 300)],
    ['dossier sections to 450', cutSections(450)],
];

// -> { system, prompt, tokens, budget, trimmed: [label], fits }
export function fitOutlinePrompt(input, budget) {
    let current = input;
    let built = buildOutlinePrompt(current);
    const size = (b) => estimateDirectorTokens(b.system) + estimateDirectorTokens(b.prompt);
    const trimmed = [];
    for (const [label, step] of STEPS) {
        if (size(built) <= budget) break;
        current = step(current);
        built = buildOutlinePrompt(current);
        trimmed.push(label);
    }
    const tokens = size(built);
    return { ...built, tokens, budget, trimmed, fits: tokens <= budget };
}
