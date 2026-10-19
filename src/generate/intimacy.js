// A character's intimate-scene note (entry meta `nsfw`, src/guidance/
// intimacy.js), written from who they already are - personality,
// background, voice, relationships - so each is their own in such a scene.
// The prompt is pure (and tested); writeIntimacyNote() runs it on the
// generation queue.

import { LOG_PREFIX } from '../constants.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

// c: { name, description, personality, background, voice, goals,
// relationships, existing } -> { system, user, plain }
export function buildIntimacyPrompt(c) {
    const facts = [
        ['Looks', c.description], ['Personality', c.personality], ['Background', c.background],
        ['Voice & mannerisms', c.voice], ['Wants', c.goals], ['Relationships', c.relationships],
    ].filter(([, v]) => clean(v)).map(([k, v]) => `${k}: ${cut(v, 700)}`);
    const user = [
        `# The character: ${clean(c.name)}\n${facts.join('\n') || '(nothing written yet)'}`,
        clean(c.existing) ? `# Their note so far (keep every point of it, and add to it)\n${cut(c.existing, 1200)}` : '',
        '# Your task\nWrite how this character is in an intimate or sexual scene, for an adult roleplay: their pace and manner, what they want and enjoy, how they show it, their limits and what puts them off, how their personality, history and voice come through - so they are unmistakably themselves, not generic. Grow it from what is written above; do not contradict it.',
        '# Reply\nThe note only: a few short sentences or a compact list, no heading, no preamble.',
    ].filter(Boolean).join('\n\n');
    return { system: 'You write character notes for an adult interactive fiction setting. You answer with the note only.', user, plain: true };
}

// Writes (or adds to) the note. -> the text, or '' when nothing came back.
export async function writeIntimacyNote(character) {
    try {
        const { askReliably } = await import('./run.js');
        const read = (_p, text) => {
            const t = String(text ?? '').replace(/^\s*(?:#+\s*)?(?:intimate[^\n:]*:|note:)\s*/i, '').trim();
            return t.length > 20 ? { values: { text: t }, dropped: [], error: null } : { values: {}, dropped: [], error: 'no note' };
        };
        const result = await askReliably(buildIntimacyPrompt(character), read, 400);
        return result.error ? '' : result.values.text;
    } catch (err) {
        console.warn(LOG_PREFIX, `could not write the intimate-scene note for ${character?.name}`, err);
        return '';
    }
}
