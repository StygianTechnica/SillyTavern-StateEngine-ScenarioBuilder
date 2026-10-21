// Generation for a person's (or a creature's) gifts - what they can do
// beyond their weapons (meta.gifts, src/library/powers.js) - from what the
// sheet says of them and the powers they are champion of: a war god's
// champion fights like no one else, a trickster spirit's slips away. The
// prompt and the reader are pure (and tested); suggestGifts() runs them on
// the generation connection. Nothing is written here - the sheet keeps it.

import { describeMagic, describeTech } from '../library/world-options.js';
import { fitText, GIFTS_MAX, ACTS_MAX } from '../library/powers.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
// Excerpts end at a whole phrase - a "…" shown to the model gets copied.
const cut = fitText;
export const GIFTS_CHARS = GIFTS_MAX;
// The length asked for - well inside what is kept, so nothing is shortened.
const GIFTS_WORDS = 70;
const ACTS_WORDS = 50;

// entry: { name, noun, description, facts: [text] } (facts: a few of its
// fields, "Role: guard captain"); patrons: [{ name, description, acts }];
// overview: the setting's (its magic and technology set the limits);
// current: the gifts written so far (kept and built on); brief: the user's
// steer. -> { system, user, plain: true }
export function buildGiftsPrompt({ entry, patrons = [], overview = {}, current = '', brief = '' }) {
    const magic = describeMagic(overview?.magic);
    const tech = describeTech(overview?.tech);
    const system = 'You are a worldbuilding assistant for a roleplaying story. You write what a character can do beyond ordinary skill and weapons - their gifts - so they fit who they are, the powers they serve and the world. Reply with the text only.';
    const user = [
        clean(overview?.premise) && `The setting: ${cut(overview.premise, 300)}`,
        ...magic.lines, ...tech.lines,
        ...[...magic.limits, ...tech.limits].map((l) => `Never break this: ${l}`),
        '',
        `${clean(entry.name)} (${clean(entry.noun) || 'character'})${clean(entry.description) ? `: ${cut(entry.description, 700)}` : ''}`,
        ...(entry.facts ?? []).slice(0, 6).map((f) => `- ${cut(f, 160)}`),
        ...(patrons.length ? [
            '',
            `${clean(entry.name)} is the champion of ${patrons.map((p) => clean(p.name)).join(' and ')}:`,
            ...patrons.map((p) => `- ${clean(p.name)}${clean(p.description) ? `: ${cut(p.description, 400)}` : ''}${clean(p.acts) ? ` (it makes itself known through ${cut(p.acts, 160)})` : ''}`),
            'Their gifts come from that bond: shaped by the nature of the power, granted rather than learned.',
        ] : []),
        clean(current) ? `\nWhat is written so far - keep it, and build on it: ${cut(current, GIFTS_CHARS)}` : '',
        clean(brief) ? `Make it this: ${clean(brief)}` : '',
        '',
        `Write their gifts in one to three sentences (under ${GIFTS_WORDS} words): concrete things they can do that show in a scene, above all in a fight - and their limits or price, if any. Nothing they could not plausibly have from what is written above. No preamble, no heading.`,
    ].filter((l) => l !== '' && l !== false).join('\n');
    return { system, user, plain: true };
}

// The model's answer -> { values: text, error }.
export function readGifts(text) {
    const t = clean(String(text ?? '').replace(/```[a-z]*\n?/gi, ''))
        .replace(/^(?:gifts?|powers?|abilities)\s*[:\-–]\s*/i, '')
        .replace(/^["“]|["”]$/g, '');
    if (!t || t.length < 12) return { values: '', error: 'the reply held no gifts' };
    if (/^[{[]/.test(t)) return { values: '', error: 'the reply was JSON, not text' };
    return { values: fitText(t, GIFTS_CHARS), error: '' };
}

// ---- a power: how it makes itself known (meta.power.acts)

export const ACTS_CHARS = ACTS_MAX;

// power: { name, description, facts }; champions: [names] of those tied to
// it; current: what is written so far (built on). -> { system, user, plain }
export function buildActsPrompt({ power, champions = [], overview = {}, current = '', brief = '' }) {
    const magic = describeMagic(overview?.magic);
    const system = 'You are a worldbuilding assistant for a roleplaying story. You write how a god, spirit or force with no body makes itself known in the world. Reply with the text only.';
    const user = [
        clean(overview?.premise) && `The setting: ${cut(overview.premise, 300)}`,
        ...magic.lines,
        ...magic.limits.map((l) => `Never break this: ${l}`),
        '',
        `${clean(power.name)} - a power with no body, never present in person${clean(power.description) ? `: ${cut(power.description, 700)}` : ''}`,
        ...(power.facts ?? []).slice(0, 6).map((f) => `- ${cut(f, 160)}`),
        champions.length ? `Its champions: ${champions.map(clean).join(', ')}.` : '',
        clean(current) ? `\nWhat is written so far - keep it, and build on it: ${cut(current, ACTS_CHARS)}` : '',
        clean(brief) ? `Make it this: ${clean(brief)}` : '',
        '',
        `Write how it makes itself known, as a short list of signs that fit its nature - omens, a voice, visions or dreams, what its blessing feels like (e.g. "a voice in the storm; dreams of falling stars; a cold wind and whispers"). Under ${ACTS_WORDS} words, separated by semicolons. No preamble, no heading.`,
    ].filter((l) => l !== '' && l !== false).join('\n');
    return { system, user, plain: true };
}

export function readActs(text) {
    const t = clean(String(text ?? '').replace(/```[a-z]*\n?/gi, ''))
        .replace(/^(?:signs?|it makes itself known(?: through| by)?|manifestations?)\s*[:\-–]?\s*/i, '')
        .replace(/^["“]|["”]$/g, '');
    if (!t || t.length < 8) return { values: '', error: 'the reply held no signs' };
    if (/^[{[]/.test(t)) return { values: '', error: 'the reply was JSON, not text' };
    return { values: fitText(t, ACTS_CHARS), error: '' };
}

export async function suggestActs(input) {
    const { askReliably } = await import('./run.js');
    const result = await askReliably(buildActsPrompt(input), (_p, text) => readActs(text), 300);
    if (result.error) throw new Error(result.error);
    return result.values;
}

// -> the gifts text. Throws when the model gave nothing usable.
export async function suggestGifts(input) {
    const { askReliably } = await import('./run.js');
    const result = await askReliably(buildGiftsPrompt(input), (_p, text) => readGifts(text), 400);
    if (result.error) throw new Error(result.error);
    return result.values;
}
