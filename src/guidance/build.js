// The guidance text (sb__guidance, spec 8.1 / 9.2) and the canonical state
// block (sb__state_block, SB-301), built from already-gathered inputs.
// Pure and deterministic (SB-015, SB-804): no SillyTavern imports, no
// clock, no randomness - identical inputs give byte-identical text. The
// gathering (library, canonical state, runtime values) happens in
// src/guidance/sync.js.
//
// The text is for the roleplay model: setting-specific, current, never
// naming Scenario Builder (SB-302), starting with REFERENCE_HEADER
// (SB-303), and '' when there is nothing to say (SB-304).

import { REFERENCE_HEADER } from '../constants.js';
import { fitToBudget, estimateTokens } from './budget.js';
import { WORLD_TYPES, describeMagic, describeTech } from '../library/world-options.js';

const labelOf = (list, id) => list.find(([key]) => key === id)?.[1] ?? id;

// The sections, in display order (spec 9.2), with their budget priority
// (higher = kept longer) and whether they are never dropped (SB-305: last
// to drop are current location/time, knowledge boundaries and active
// corrections). Knowledge boundaries, quests and the wider library
// (spec 9.2 items 5-7) come in later phases.
export const SECTIONS = Object.freeze([
    { key: 'overview', title: 'Setting', priority: 1, keep: false },
    { key: 'location', title: 'Where and when', priority: 5, keep: true },
    { key: 'scene', title: 'Scene', priority: 3, keep: false },
    { key: 'cast', title: 'Characters present', priority: 4, keep: false },
    { key: 'corrections', title: 'Corrections', priority: 6, keep: true },
]);

export const DEFAULT_SECTIONS = Object.freeze(Object.fromEntries(SECTIONS.map((s) => [s.key, true])));

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// Shortens `text` to at most `max` characters, at a word boundary.
export function truncate(text, max) {
    const t = clean(text);
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

const sentence = (text) => {
    const t = clean(text);
    return !t ? '' : /[.!?…]$/.test(t) ? t : `${t}.`;
};
const lower = (text) => clean(text).toLowerCase();

export function timeText(time) {
    if (!time || (!time.dayPart && !time.day)) return '';
    const parts = [];
    if (time.day) parts.push(`day ${time.day}`);
    if (time.dayPart) parts.push(time.dayPart);
    return parts.join(', ');
}

function weatherText({ weather, temperature }) {
    const parts = [];
    if (weather?.length) parts.push(`Weather: ${weather.map(lower).join(', ')}`);
    if (temperature) parts.push(`Temperature: ${lower(temperature)}`);
    return parts.length ? `${parts.join('. ')}.` : '';
}

function overviewSection(overview) {
    const o = overview ?? {};
    const lines = [];
    if (clean(o.premise)) lines.push(sentence(truncate(o.premise, 400)));
    const meta = [
        ['World', o.worldType ? labelOf(WORLD_TYPES, o.worldType).toLowerCase() : ''],
        ['Tone', o.tone], ['Themes', o.themes], ['Era', o.era],
    ].filter(([, v]) => clean(v)).map(([k, v]) => `${k}: ${clean(v)}`);
    if (meta.length) lines.push(`${meta.join('. ')}.`);
    const magic = describeMagic(o.magic);
    const tech = describeTech(o.tech);
    for (const line of [...magic.lines, ...tech.lines]) lines.push(sentence(truncate(line, 360)));
    if (clean(o.rules)) lines.push(`Society and law: ${sentence(truncate(o.rules, 400))}`);
    // Hard limits (what does not exist) survive shortening: they are what
    // keeps the model from slipping arcane magic into a divine-only world.
    const limits = [...magic.limits, ...tech.limits].map((l) => `- ${l}`);
    const limitText = limits.length ? `World limits:\n${limits.join('\n')}` : '';
    if (limitText) lines.push(limitText);
    if (!lines.length) return null;
    const compact = [clean(o.premise) ? sentence(truncate(o.premise, 160)) : '', limitText].filter(Boolean).join('\n');
    return { full: lines.join('\n'), compact };
}

function locationSection(input) {
    const loc = input.location;
    const time = timeText(input.time);
    const weather = weatherText(input);
    const head = [];
    if (loc?.path?.length) {
        const where = loc.path.join(' > ');
        const inOut = loc.indoor === true ? ', indoors' : (loc.indoor === false ? ', outdoors' : '');
        head.push(`Location: ${where}${inOut}.`);
    }
    if (time) head.push(`Time: ${time}.`);
    if (weather) head.push(weather);
    if (!head.length) return null;

    const lines = [head.join(' ')];
    if (loc?.description) lines.push(sentence(truncate(loc.description, 360)));
    const env = loc?.environment ?? {};
    const envParts = [['Climate', env.climate], ['Lighting', env.lighting], ['Local rules', env.rules]]
        .filter(([, e]) => e?.value)
        .map(([label, e]) => `${label}: ${clean(e.value)}${e.from ? ` (${e.from})` : ''}`);
    if (envParts.length) lines.push(`${envParts.join('. ')}.`);
    return { full: lines.join('\n'), compact: head.join(' ') };
}

function sceneSection(scene) {
    const title = clean(scene?.title);
    const premise = clean(scene?.premise);
    if (!title && !premise) return null;
    const full = [title ? `${title}.` : '', premise ? sentence(truncate(premise, 400)) : ''].filter(Boolean).join(' ');
    return { full, compact: title ? `${title}.` : sentence(truncate(premise, 120)) };
}

function castLine(c, compact) {
    const name = clean(c.name);
    const role = clean(c.role);
    let line = `- ${name}${role ? ` (${role})` : ''}`;
    if (compact) return line;
    const bits = [];
    if (clean(c.description)) bits.push(sentence(truncate(c.description, 200)));
    if (clean(c.mood)) bits.push(`Mood: ${lower(c.mood)}.`);
    if (clean(c.intent)) bits.push(`Intends: ${sentence(truncate(c.intent, 120))}`);
    if (clean(c.condition)) bits.push(`Condition: ${sentence(truncate(c.condition, 120))}`);
    if (bits.length) line += `: ${bits.join(' ')}`;
    return line;
}

function castSection(cast) {
    const list = (cast ?? []).filter((c) => clean(c?.name));
    if (!list.length) return null;
    return { full: list.map((c) => castLine(c, false)).join('\n'), compact: list.map((c) => castLine(c, true)).join('\n') };
}

function correctionsSection(corrections) {
    const list = [...new Set((corrections ?? []).map(clean).filter(Boolean))];
    if (!list.length) return null;
    return { full: list.map((t) => `- ${t}`).join('\n'), compact: '' };
}

const BUILDERS = {
    overview: (input) => overviewSection(input.overview),
    location: (input) => locationSection(input),
    scene: (input) => sceneSection(input.scene),
    cast: (input) => castSection(input.cast),
    corrections: (input) => correctionsSection(input.corrections),
};

// input: { overview, location: { path, description, environment, indoor },
//   time: { day, dayPart }, weather, temperature, scene: { title, premise },
//   cast: [{ name, role, description, mood, intent, condition, why }],
//   corrections: [text], sections: { [key]: boolean }, budget }
// -> { text, tokens, sections: [{ key, title, mode, text, tokens, why }] }
//   mode: 'full' | 'compact' | 'dropped' (over budget) | 'off' (toggled
//   off) | 'empty' (nothing to say). `why` says what the section was built
//   from, for the preview (SB-314).
export function buildGuidance(input) {
    const toggles = { ...DEFAULT_SECTIONS, ...(input.sections ?? {}) };
    const built = SECTIONS.map((s) => ({ ...s, on: toggles[s.key] !== false, content: toggles[s.key] !== false ? BUILDERS[s.key](input) : null }));
    const titled = (s, text) => (text ? `[${s.title}]\n${text}` : '');
    const candidates = built.filter((s) => s.on && s.content).map((s) => ({
        key: s.key,
        priority: s.priority,
        keep: s.keep,
        full: titled(s, s.content.full),
        compact: s.content.compact ? titled(s, s.content.compact) : '',
    }));
    const fitted = fitToBudget(candidates, input.budget, estimateTokens(`${REFERENCE_HEADER}\n`));
    const byKey = new Map(fitted.sections.map((s) => [s.key, s]));
    const parts = fitted.sections.map((s) => s.text).filter(Boolean);
    const text = parts.length ? `${REFERENCE_HEADER}\n${parts.join('\n\n')}` : '';

    const why = {
        overview: 'The setting overview.',
        location: input.location?.path?.length ? `Canonical location, its path and inherited environment; canonical time and weather.` : 'Canonical time and weather.',
        scene: 'The canonical scene title and premise.',
        cast: (input.cast ?? []).map((c) => `${c.name}: ${c.why ?? 'present'}`).join('; ') || 'Characters present.',
        corrections: 'Adjustments made by validation, kept for a few replies.',
    };
    return {
        text,
        tokens: text ? estimateTokens(text) : 0,
        sections: built.map((s) => {
            const fit = byKey.get(s.key);
            const mode = !s.on ? 'off' : !s.content ? 'empty' : fit.mode;
            return { key: s.key, title: s.title, mode, text: fit?.text ?? '', tokens: fit?.text ? estimateTokens(fit.text) : 0, why: why[s.key] };
        }),
    };
}

// sb__state_block: the canonical state as text, a line per value, empty
// lines omitted, '' when there is nothing (SB-301) - in the style of State
// Engine's own se__state_block, but from canonical values only.
// input: { locationPath: [names], time, weather, temperature, indoor,
//          sceneTitle, castNames }
export function buildStateBlock(input) {
    const lines = [];
    if (input.locationPath?.length) lines.push(`Location: ${input.locationPath.join(' > ')}`);
    if (input.indoor === true) lines.push('Indoors: yes');
    else if (input.indoor === false) lines.push('Indoors: no');
    const time = timeText(input.time);
    if (time) lines.push(`Time: ${time}`);
    if (input.weather?.length) lines.push(`Weather: ${input.weather.join(', ')}`);
    if (input.temperature) lines.push(`Temperature: ${input.temperature}`);
    if (clean(input.sceneTitle)) lines.push(`Scene: ${clean(input.sceneTitle)}`);
    if (input.castNames?.length) lines.push(`Present: ${input.castNames.join(', ')}`);
    return lines.length ? `${REFERENCE_HEADER}\n${lines.join('\n')}` : '';
}
