// Content generation (spec 6.4) - the pure half: writing the prompt from
// already-gathered context, and turning the model's answer into field
// values that fit the object's fields (SB-132). No SillyTavern imports;
// the runner is src/generate/run.js.
//
// Tasks:
//   field   one field: fill it if empty, otherwise build on what is there
//   fill    every empty field
//   enrich  every field: fill the empty ones, deepen the ones with content
//   create  a whole new entry, from a brief or from nothing (random)
// Whatever already exists is treated as canon: kept, built on, never
// contradicted (SB-139 "what the user supplies is fixed canon").

import { describeMagic, describeTech } from '../library/world-options.js';

export const DETAIL_LEVELS = Object.freeze({
    brief: 'Keep every text field short: one or two sentences.',
    standard: 'Text fields: two to four vivid sentences.',
    rich: 'Text fields: a full, evocative paragraph each, rich in concrete detail.',
});

// The setting's magic and technology: descriptive lines, and hard limits
// (what does not exist) that every prompt states separately and firmly.
function worldLines(o) {
    const magic = describeMagic(o?.magic);
    const tech = describeTech(o?.tech);
    return { lines: [...magic.lines, ...tech.lines].map((l) => cut(l, 600)), limits: [...magic.limits, ...tech.limits] };
}

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
};
const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

// The pseudo-fields every entry has, ahead of its type's own fields.
export const BASE_FIELDS = Object.freeze([
    { name: 'description', label: 'Description', kind: 'longtext' },
    { name: 'aliases', label: 'Other names', kind: 'list' },
]);

// How each field should be answered in JSON.
function shapeOf(def, refNames) {
    switch (def.kind) {
        case 'list': return 'an array of short strings';
        case 'number': return 'a number';
        case 'boolean': return 'true or false';
        case 'enum': return `exactly one of: ${def.values.map((v) => JSON.stringify(v)).join(', ')}`;
        case 'ref': return refNames[def.refType]?.length ? `the name of one existing ${def.refType}: ${refNames[def.refType].map((n) => JSON.stringify(n)).join(', ')} (or "")` : `"" (no ${def.refType} exists yet)`;
        case 'refs': return refNames[def.refType]?.length ? `an array of names of existing ${def.refType}s, chosen from: ${refNames[def.refType].map((n) => JSON.stringify(n)).join(', ')}` : '[]';
        default: return 'a string';
    }
}

function show(value) {
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
}

// input: { task, type: { id, label, noun }, fields: [def] (type fields),
//   targetField (name, for 'field'), entry: { name, values: { field: value },
//   narrative }, brief, overview, neighbours: [{ relation, type, name,
//   description }], similarNames: [string], memories: [string], gmNotes,
//   refNames: { typeId: [names] }, nameOf (id -> name, for showing refs),
//   detail: 'brief' | 'standard' | 'rich', parentName }
// -> { system, user, keys } (keys: the JSON keys the answer should have)
export function buildGenerationPrompt(input) {
    const { task, type, entry = { values: {} } } = input;
    const allFields = [...BASE_FIELDS, ...(input.fields ?? [])];
    const nameOf = input.nameOf ?? ((id) => id);
    const refNames = input.refNames ?? {};
    const detail = DETAIL_LEVELS[input.detail] ?? DETAIL_LEVELS.standard;

    let targets;
    if (task === 'field') targets = allFields.filter((f) => f.name === input.targetField);
    else if (task === 'fill') targets = allFields.filter((f) => isEmpty(entry.values?.[f.name]));
    else targets = allFields;
    const keys = [...(task === 'create' ? ['name'] : []), ...targets.map((f) => f.name)];

    const system = [
        'You are a worldbuilding collaborator for a tabletop-style roleplaying setting.',
        'You write setting material: concrete, specific, playable details that give a storyteller hooks to use.',
        'Everything already established is canon: keep it, build on it, never contradict it.',
        'Match the setting\'s tone and era. Avoid clichés and generic filler.',
        'Answer with ONE JSON object and nothing else - no commentary, no code fences.',
    ].join('\n');

    const parts = [];
    const o = input.overview ?? {};
    const setting = [
        o.premise ? `Premise: ${cut(o.premise, 600)}` : '',
        o.worldType ? `World type: ${o.worldType.replace(/_/g, ' ')}` : '',
        o.tone ? `Tone: ${o.tone}` : '',
        o.themes ? `Themes: ${o.themes}` : '',
        o.era ? `Era: ${o.era}` : '',
        ...worldLines(o).lines,
        o.rules ? `How the world works: ${cut(o.rules, 500)}` : '',
    ].filter(Boolean);
    parts.push(`# The setting\n${setting.length ? setting.join('\n') : '(Nothing set yet - invent freely, but stay consistent.)'}`);
    const limits = worldLines(o).limits;
    if (limits.length) parts.push(`# Hard limits - never break these\n${limits.map((l) => `- ${l}`).join('\n')}`);

    if (input.neighbours?.length) {
        parts.push(`# Related entries already in the setting\n${input.neighbours.slice(0, 16).map((n) => `- ${n.relation ? `${n.relation}: ` : ''}${n.name} (${n.type})${n.description ? ` - ${cut(n.description, 160)}` : ''}`).join('\n')}`);
    }
    if (input.memories?.length) {
        parts.push(`# What the story so far says about it\n${input.memories.slice(0, 12).map((m) => `- ${cut(m, 220)}`).join('\n')}`);
    }
    if (input.gmNotes) parts.push(`# GM-only notes (secrets - may shape the entry, but write nothing that reveals them outright)\n${cut(input.gmNotes, 500)}`);

    if (task !== 'create' || entry.name) {
        const known = allFields.filter((f) => !isEmpty(entry.values?.[f.name])).map((f) => {
            const v = entry.values[f.name];
            const shown = f.kind === 'ref' ? nameOf(v) : f.kind === 'refs' ? v.map(nameOf).join(', ') : show(v);
            return `${f.label} (${f.name}): ${cut(shown, 700)}`;
        });
        parts.push(`# The ${type.noun}${entry.name ? `: ${entry.name}` : ''}\n${known.length ? known.join('\n') : '(Nothing written yet.)'}${entry.narrative ? `\nNow, in the story: ${cut(entry.narrative, 400)}` : ''}${input.parentName ? `\nIt is inside: ${input.parentName}` : ''}`);
    }

    const shapes = targets.map((f) => `- "${f.name}" (${f.label}): ${shapeOf(f, refNames)}`);
    let job;
    if (task === 'create') {
        job = [
            `Create a new ${type.noun} for this setting${input.parentName ? `, located inside ${input.parentName}` : ''}.`,
            input.brief ? `What the user wants: ${cut(input.brief, 600)}` : 'Surprise the user: something fresh that fits the setting and gives a storyteller something to play with.',
            input.similarNames?.length ? `These ${type.noun === 'lore entry' ? 'lore entries' : `${type.noun}s`} already exist - make something different, and do not reuse their names: ${input.similarNames.slice(0, 40).join(', ')}.` : '',
            `Give it a memorable, setting-appropriate name ("name": a string).`,
        ].filter(Boolean).join('\n');
    } else if (task === 'field') {
        const f = targets[0];
        const has = f && !isEmpty(entry.values?.[f.name]);
        job = has
            ? `Enrich the "${f.label}" field: keep everything it already says, and expand it with more specific, consistent detail.`
            : `Write the "${f?.label}" field, consistent with everything above.`;
    } else if (task === 'fill') {
        job = 'Fill in the empty fields listed below, consistent with everything already written.';
    } else {
        job = 'Enrich this entry: fill the empty fields, and for fields that already have content, keep what they say and deepen it with more specific detail.';
    }
    if (input.brief && task !== 'create') job += `\nGuidance from the user: ${cut(input.brief, 400)}`;
    parts.push(`# Your task\n${job}\n${detail}\nNames of people and places you invent should fit the setting.`);
    parts.push(`# Answer format\nOne JSON object with exactly these keys:\n${task === 'create' ? '- "name": a string\n' : ''}${shapes.join('\n')}`);

    return { system, user: parts.join('\n\n'), keys };
}

const OVERVIEW_TEXT = Object.freeze({
    premise: { label: 'Premise', ask: 'the setting\'s premise: what this world is, what is at stake in it, and what kinds of stories happen there (one rich paragraph)' },
    rules: { label: 'Society and law', ask: 'how society works: power, law, customs, taboos and their costs (a few concrete rules; magic and technology have their own fields)' },
    magicNotes: { label: 'How magic works', ask: 'how magic works within the limits above: where it comes from, who can use it, what it costs, how common everyday versus great magic is' },
    techNotes: { label: 'How technology works', ask: 'how technology works within the limits above: what exists, who makes and understands it, how it is spread, what it changes in daily life' },
});

// A front-page field's current text (magicNotes/techNotes live in the
// overview's magic/tech objects).
export function overviewValue(o, field) {
    if (field === 'magicNotes') return o?.magic?.notes ?? '';
    if (field === 'techNotes') return o?.tech?.notes ?? '';
    return o?.[field] ?? '';
}

// The front page's text fields. input: { fields: ['premise' | 'rules'],
// overview, contents: [{ type, names }], detail, brief }
// -> { system, user, keys }
export function buildOverviewPrompt({ fields, overview = {}, contents = [], detail = 'standard', brief = '' }) {
    const o = overview;
    const given = [
        o.worldType ? `World type: ${o.worldType.replace(/_/g, ' ')}` : '',
        o.tone ? `Tone: ${o.tone}` : '',
        o.themes ? `Themes: ${o.themes}` : '',
        o.era ? `Era: ${o.era}` : '',
        o.premise ? `Premise: ${cut(o.premise, 900)}` : '',
        ...worldLines(o).lines,
        o.rules ? `How the world works: ${cut(o.rules, 700)}` : '',
    ].filter(Boolean);
    const limits = worldLines(o).limits;
    const known = contents.filter((c) => c.names.length).map((c) => `${c.type}: ${c.names.slice(0, 15).join(', ')}`);
    const jobs = fields.map((f) => (overviewValue(o, f) ? `- "${f}": enrich ${OVERVIEW_TEXT[f].ask} - keep everything it already says and build on it` : `- "${f}": write ${OVERVIEW_TEXT[f].ask}`));
    const system = [
        'You are a worldbuilding collaborator for a tabletop-style roleplaying setting.',
        'Everything already established is canon: keep it, build on it, never contradict it.',
        'Answer with ONE JSON object and nothing else - no commentary, no code fences.',
    ].join('\n');
    const user = [
        `# The setting so far\n${given.length ? given.join('\n') : '(Nothing chosen yet - invent a fresh, coherent world.)'}`,
        limits.length ? `# Hard limits - never break these\n${limits.map((l) => `- ${l}`).join('\n')}` : '',
        known.length ? `# Already in the setting\n${known.join('\n')}` : '',
        `# Your task\nWrite the setting's front page.${brief ? `\nGuidance from the user: ${cut(brief, 400)}` : ''}\n${DETAIL_LEVELS[detail] ?? DETAIL_LEVELS.standard}`,
        `# Answer format\nOne JSON object with exactly these keys (each a string):\n${jobs.join('\n')}`,
    ].filter(Boolean).join('\n\n');
    return { system, user, keys: [...fields] };
}

// The overview answer: { values: { premise?, rules? }, error }.
export function parseOverviewResponse(text, keys) {
    const json = extractJson(text);
    if (!json || typeof json !== 'object') return { values: {}, error: 'The model did not answer with a JSON object.' };
    const values = {};
    for (const key of keys) if (typeof json[key] === 'string' && json[key].trim()) values[key] = json[key].trim();
    return Object.keys(values).length ? { values, error: null } : { values, error: 'The answer had nothing usable in it.' };
}

// The first JSON object in a model's answer (tolerating code fences and
// chatter around it), or null.
export function extractJson(text) {
    const t = String(text ?? '').replace(/```(?:json)?/gi, '');
    const start = t.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < t.length; i++) {
        const c = t[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') inString = false;
            continue;
        }
        if (c === '"') inString = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
            try {
                return JSON.parse(t.slice(start, i + 1));
            } catch {
                // Trailing commas are the commonest slip.
                try { return JSON.parse(t.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
            }
        }
    }
    return null;
}

// The answer as field values that fit (SB-132): enum values matched
// case-insensitively, references matched to existing names (unknown ones
// dropped), lists as string arrays; unknown keys dropped. `refLookup(typeId,
// name)` -> id or null. -> { values, dropped: [key or "key: value"], error }
export function parseGenerationResponse(text, { fields = [], keys = [], refLookup = () => null } = {}) {
    const json = extractJson(text);
    if (!json || typeof json !== 'object' || Array.isArray(json)) return { values: {}, dropped: [], error: 'The model did not answer with a JSON object.' };
    const defs = new Map([...BASE_FIELDS, ...fields].map((f) => [f.name, f]));
    const wanted = new Set(keys);
    const values = {};
    const dropped = [];
    for (const [key, raw] of Object.entries(json)) {
        if (key === 'name' && wanted.has('name')) {
            if (clean(raw)) values.name = clean(raw).slice(0, 120);
            continue;
        }
        const def = defs.get(key);
        if (!def || !wanted.has(key)) {
            dropped.push(key);
            continue;
        }
        const value = coerce(def, raw, refLookup, dropped);
        if (value !== undefined) values[key] = value;
    }
    if (!Object.keys(values).length) return { values, dropped, error: 'The answer had nothing usable in it.' };
    return { values, dropped, error: null };
}

function coerce(def, raw, refLookup, dropped) {
    const asList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => clean(x)).filter(Boolean);
    switch (def.kind) {
        case 'list': return asList(raw);
        case 'number': {
            const n = Number(raw);
            return Number.isFinite(n) ? n : undefined;
        }
        case 'boolean': return raw === true || String(raw).toLowerCase() === 'true';
        case 'enum': {
            const hit = def.values.find((v) => v.toLowerCase() === clean(raw).toLowerCase());
            if (!hit) dropped.push(`${def.name}: ${clean(raw)}`);
            return hit;
        }
        case 'ref': {
            if (!clean(raw)) return undefined;
            const id = refLookup(def.refType, clean(raw));
            if (!id) dropped.push(`${def.name}: ${clean(raw)}`);
            return id ?? undefined;
        }
        case 'refs': {
            const ids = [];
            for (const name of asList(raw)) {
                const id = refLookup(def.refType, name);
                if (id) ids.push(id);
                else dropped.push(`${def.name}: ${name}`);
            }
            return [...new Set(ids)];
        }
        default: {
            const text = typeof raw === 'string' ? raw.trim() : (raw === null || raw === undefined ? '' : Array.isArray(raw) ? raw.join(', ') : String(raw));
            return text || undefined;
        }
    }
}

// Merges generated values into existing ones for a task: 'fill' never
// replaces a field that has content; the others replace (an enriched
// field already contains what was there).
export function mergeGenerated(existing, generated, task) {
    const out = { ...existing };
    for (const [key, value] of Object.entries(generated)) {
        if (task === 'fill' && !isEmpty(existing[key])) continue;
        out[key] = value;
    }
    return out;
}
