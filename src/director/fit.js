// The director's prompt, trimmed to fit the context window of the model it
// runs on (settings.director.contextTokens). A small local model (8k) fails
// with "Bad Request" once a busy scene - a full cast, memories, lore, the
// plan - outgrows it. Pure: the same input and limit give the same prompt.
//
// The prompt is built, measured and, while it is over, the least important
// part is shortened or dropped and it is built again. Never trimmed: the
// instructions, the scene, who and what is here, the GM plan (fired story
// triggers included) and what each person does not know.

import { buildDirectorPrompt } from './prompt.js';

// Tokens are estimated, not counted (no tokenizer here): a little more
// cautious than the guidance's characters / 4, for names and punctuation.
export const estimateDirectorTokens = (text) => Math.ceil(String(text ?? '').length / 3.5);

// What the prompt may take: the context, less the briefing's own room and a
// safety margin for the chat template and the estimate.
export function promptBudget(contextTokens, replyTokens) {
    const context = Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : 8192;
    const reply = Number.isFinite(replyTokens) && replyTokens > 0 ? replyTokens : 700;
    return Math.max(1000, Math.floor((context - reply) * 0.9));
}

const cutText = (text, max) => {
    const t = String(text ?? '');
    return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}...`;
};

// A person's profile, compacted: the essentials kept short.
const compactPerson = (c) => (c.player ? c : {
    ...c,
    description: cutText(c.description, 160),
    personality: cutText(c.personality, 90),
    voice: cutText(c.voice, 70),
    goals: cutText(c.goals, 100),
    relations: (c.relations ?? []).slice(0, 2),
    knows: (c.knows ?? []).slice(0, 2),
    sworn: (c.sworn ?? []).slice(0, 1),
    owed: (c.owed ?? []).slice(0, 1),
});

// The trimming steps, least important first: [label, input -> input].
const STEPS = [
    ['earlier scenes', (i) => ({ ...i, scenes: [] })],
    ['also relevant', (i) => ({ ...i, relevant: [] })],
    ['last briefing shortened', (i) => ({ ...i, previousNote: cutText(i.previousNote, 500) })],
    ['memories to 6', (i) => ({ ...i, memories: (i.memories ?? []).slice(0, 6) })],
    ['lore, factions, events to 3', (i) => ({ ...i, lore: (i.lore ?? []).slice(0, 3), factions: (i.factions ?? []).slice(0, 3), eventObjects: (i.eventObjects ?? []).slice(0, 3), events: (i.events ?? []).slice(0, 3) })],
    ['others who could turn up to 4', (i) => ({ ...i, nearby: (i.nearby ?? []).slice(0, 4) })],
    ['recent messages to 6', (i) => ({ ...i, messages: (i.messages ?? []).slice(-6), messageChars: 700 })],
    ['last briefing', (i) => ({ ...i, previousNote: '' })],
    ['memories to 3', (i) => ({ ...i, memories: (i.memories ?? []).slice(0, 3) })],
    ['people compacted', (i) => ({ ...i, cast: (i.cast ?? []).map(compactPerson) })],
    ['recent messages to 4', (i) => ({ ...i, messages: (i.messages ?? []).slice(-4), messageChars: 500 })],
    ['others who could turn up', (i) => ({ ...i, nearby: [] })],
    ['lore, factions, events', (i) => ({ ...i, lore: [], factions: [], eventObjects: [], events: [] })],
    ['memories', (i) => ({ ...i, memories: [] })],
    ['recent messages to 3', (i) => ({ ...i, messages: (i.messages ?? []).slice(-3), messageChars: 400 })],
];

// -> { system, prompt, tokens, budget, trimmed: [label], fits }
export function fitDirectorPrompt(input, budget) {
    let current = input;
    let built = buildDirectorPrompt(current);
    const size = (b) => estimateDirectorTokens(b.system) + estimateDirectorTokens(b.prompt);
    const trimmed = [];
    for (const [label, step] of STEPS) {
        if (size(built) <= budget) break;
        current = step(current);
        built = buildDirectorPrompt(current);
        trimmed.push(label);
    }
    const tokens = size(built);
    return { ...built, tokens, budget, trimmed, fits: tokens <= budget };
}
