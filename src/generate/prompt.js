// Content generation (spec 6.4) - the pure half: writing the prompt from
// already-gathered context, and turning the model's answer into field
// values that fit the object's fields (SB-132). No SillyTavern imports;
// the runner is src/generate/run.js.
//
// Written for small local models as much as big ones:
//   - ONE field (a sparkle) is asked for as PLAIN TEXT: the prompt names
//     the field, says what it is for, shows what it says now (keep it and
//     build on it) or that it is empty (write it), and asks for the text
//     alone. No JSON to get wrong.
//   - SEVERAL fields (Fill empty, Enrich all, Generate, Write front page)
//     are asked for as JSON, with a literal template to fill in.
//   - Answers are read forgivingly: near-miss keys, arrays of paragraphs,
//     chatter around the JSON, or plain text when one field was asked for.
//
// Tasks: field (one field), fill (empty fields), enrich (all fields),
// create (a new entry, from a brief or a surprise). Whatever already exists
// is canon: kept, built on, never contradicted (SB-139).

import { describeMagic, describeTech, lookLines } from '../library/world-options.js';

// Length guidance, for one field and for each field of several.
export const DETAIL_LEVELS = Object.freeze({
    brief: 'one or two sentences',
    standard: 'two to four vivid sentences',
    rich: 'a full, evocative paragraph rich in concrete detail',
});

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
};
const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
const norm = (key) => String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The pseudo-fields every entry has, ahead of its type's own fields.
export const BASE_FIELDS = Object.freeze([
    { name: 'description', label: 'Description', kind: 'longtext', about: 'what it is and what it is like - appearance, character, the details a storyteller needs' },
    { name: 'aliases', label: 'Other names', kind: 'list', about: 'other names, titles or nicknames it is known by' },
]);

const SYSTEM_BASE = [
    'You are a worldbuilding collaborator for a tabletop-style roleplaying setting.',
    'You write setting material: concrete, specific, playable details that give a storyteller hooks to use.',
    'Everything the user has already decided is canon: keep it, build on it, never contradict it.',
    'Match the setting\'s tone and era. Avoid clichés and generic filler.',
];

// The setting's magic and technology: descriptive lines, and hard limits.
function worldLines(o) {
    const magic = describeMagic(o?.magic);
    const tech = describeTech(o?.tech);
    return { lines: [...magic.lines, ...tech.lines].map((l) => cut(l, 600)), limits: [...magic.limits, ...tech.limits] };
}

// The world as the user has defined it, and its hard limits.
function worldBlocks(o, { skip = [] } = {}) {
    const facts = [
        !skip.includes('premise') && o.premise ? `Premise: ${cut(o.premise, 700)}` : '',
        o.worldType ? `World type: ${o.worldType.replace(/_/g, ' ')}` : '',
        ...lookLines(o),
        o.era ? `Era: ${o.era}` : '',
        o.tone ? `Tone: ${o.tone}` : '',
        o.themes ? `Themes: ${o.themes}` : '',
        ...worldLines(o).lines,
        !skip.includes('rules') && o.rules ? `Society and law: ${cut(o.rules, 500)}` : '',
    ].filter(Boolean);
    const limits = worldLines(o).limits;
    return [
        `# The world (decided by the user - treat these as facts)\n${facts.length ? facts.join('\n') : '(Nothing decided yet - invent freely, but keep everything consistent.)'}`,
        limits.length ? `# Hard limits - never break these\n${limits.map((l) => `- ${l}`).join('\n')}` : '',
    ].filter(Boolean);
}

// How a field's answer should look - in prose (one field) and as a JSON
// template value (several).
function formOf(def, refNames) {
    const names = refNames[def.refType] ?? [];
    switch (def.kind) {
        case 'list': return { prose: 'Write a short comma-separated list.', json: '["...", "..."]' };
        case 'number': return { prose: 'Answer with a number only.', json: '0' };
        case 'boolean': return { prose: 'Answer yes or no.', json: 'true' };
        case 'enum': return { prose: `Answer with exactly one of: ${def.values.join(', ')}.`, json: `"<one of: ${def.values.join(' | ')}>"` };
        case 'ref': return names.length
            ? { prose: `Answer with the name of one of these existing ${def.refType}s - only one the facts above actually tie to it; nothing if none is: ${names.join(', ')}.`, json: `"<one of: ${names.join(' | ')} - or empty>"` }
            : { prose: `Answer with nothing - no ${def.refType} exists yet.`, json: '""' };
        case 'refs': return names.length
            ? { prose: `Answer with names chosen from these existing ${def.refType}s - only ones the facts above actually tie to it (an empty list is fine; never pick names just to fill it): ${names.join(', ')}.`, json: `["<only names from: ${names.join(' | ')} that are tied to it - or none>"]` }
            : { prose: `Answer with nothing - no ${def.refType} exists yet.`, json: '[]' };
        default: return { prose: '', json: '"..."' };
    }
}

const isText = (def) => !def.kind || def.kind === 'text' || def.kind === 'longtext';

function show(value, def, nameOf) {
    if (def.kind === 'ref') return nameOf(value);
    if (def.kind === 'refs') return value.map(nameOf).join(', ');
    return Array.isArray(value) ? value.join(', ') : String(value);
}

// A JSON template for several keys: { key: templateValue }.
function jsonTemplate(entries) {
    return `{\n${entries.map(([key, value]) => `  "${key}": ${value}`).join(',\n')}\n}`;
}

const REPLY_PLAIN = '# Reply\nReply with ONLY the text for this field. No title, no field name, no quotation marks, no JSON, nothing before or after it.';

// input: { task, type: { id, label, noun }, fields: [def] (type fields),
//   targetField (name, for 'field'), entry: { name, values: { field: value },
//   narrative }, brief, overview, neighbours: [{ relation, type, name,
//   description }], similarNames: [string], memories: [string], gmNotes,
//   refNames: { typeId: [names] }, nameOf (id -> name, for showing refs),
//   detail: 'brief' | 'standard' | 'rich', parentName }
// -> { system, user, keys, plain } (plain: one field, answered as text)
export function buildGenerationPrompt(input) {
    const { task, type, entry = { values: {} } } = input;
    const nameField = { name: 'name', label: 'Name', kind: 'text', about: 'a memorable name that fits the setting' };
    const allFields = [...(task === 'field' && input.targetField === 'name' ? [nameField] : []), ...BASE_FIELDS, ...(input.fields ?? [])];
    const nameOf = input.nameOf ?? ((id) => id);
    const refNames = input.refNames ?? {};
    const length = DETAIL_LEVELS[input.detail] ?? DETAIL_LEVELS.standard;

    let targets;
    if (task === 'field') targets = allFields.filter((f) => f.name === input.targetField);
    else if (task === 'fill') targets = allFields.filter((f) => isEmpty(entry.values?.[f.name]));
    else targets = allFields;
    const plain = task === 'field' && targets.length === 1;
    const keys = [...(task === 'create' ? ['name'] : []), ...targets.map((f) => f.name)];
    const subject = entry.name ? `${type.noun} "${entry.name}"` : `new ${type.noun}`;

    const parts = [...worldBlocks(input.overview ?? {})];
    const place = input.place;
    if (place?.path?.length) {
        const lines = place.path.map((x, i) => `- ${i === 0 ? 'Inside' : 'Which is inside'}: ${x.name}${x.description ? ` - ${cut(x.description, 500)}` : ''}`);
        if (place.factions?.length) lines.push(...place.factions.map((f) => `- Tied to it: ${f.name} (faction)${f.description ? ` - ${cut(f.description, 240)}` : ''}`));
        parts.push(`# Where it is (it belongs to this place - what it is like, who holds it and whose side it is on follow from here)\n${lines.join('\n')}`);
    }
    if (input.neighbours?.length) {
        parts.push(`# Related entries already in the setting\n${input.neighbours.slice(0, 16).map((n) => `- ${n.relation ? `${n.relation}: ` : ''}${n.name} (${n.type})${n.description ? ` - ${cut(n.description, 160)}` : ''}`).join('\n')}`);
    }
    if (input.memories?.length) parts.push(`# What the story so far says about it\n${input.memories.slice(0, 12).map((m) => `- ${cut(m, 220)}`).join('\n')}`);
    if (input.gmNotes) parts.push(`# Secret GM notes (let them shape what you write, but never reveal them outright)\n${cut(input.gmNotes, 500)}`);

    if (task !== 'create' || entry.name) {
        const others = allFields.filter((f) => !isEmpty(entry.values?.[f.name]) && !(plain && f.name === targets[0].name));
        const known = others.map((f) => `${f.label}: ${cut(show(entry.values[f.name], f, nameOf), 700)}`);
        parts.push(`# The ${subject} - what is written so far\n${known.length ? known.join('\n') : '(Nothing else written yet.)'}${entry.narrative ? `\nWhat has happened to it in the story: ${cut(entry.narrative, 400)}` : ''}${input.parentName ? `\nIt is located inside: ${input.parentName}` : ''}`);
    }

    const placeRule = place?.path?.length
        ? `It is part of ${place.path[0].name}: keep it true to that place and the people tied to it - their side, their enemies, their mood - unless the user says otherwise. Never make it serve a side the place it is in stands against.`
        : '';
    if (plain) {
        const f = targets[0];
        const current = entry.values?.[f.name];
        const form = formOf(f, refNames);
        const job = [
            `Write the "${f.label}" of the ${subject}${f.about ? ` - ${f.about}` : ''}.`,
            isEmpty(current)
                ? 'It is empty now: write it from scratch, consistent with everything above.'
                : `It currently says:\n"""\n${cut(show(current, f, nameOf), 1500)}\n"""\nRewrite it: keep every fact it already contains, and add new, specific detail that fits everything above.`,
            f.name === 'name'
                ? `Reply with just the name.${input.similarNames?.length ? ` Do not reuse any of these existing names: ${input.similarNames.slice(0, 40).join(', ')}.` : ''}`
                : (isText(f) ? `Length: ${length}.` : form.prose),
            input.creating && !entry.name && f.name !== 'name' ? 'This is a brand-new entry being created now.' : '',
            placeRule,
            input.brief ? `${input.creating ? 'What the user wants' : "The user's direction"}: ${cut(input.brief, 400)}` : '',
        ].filter(Boolean).join('\n');
        parts.push(`# Your task\n${job}`, REPLY_PLAIN);
        return { system: SYSTEM_BASE.join('\n'), user: parts.join('\n\n'), keys, plain: true };
    }

    let job;
    if (task === 'create') {
        job = [
            `Create a new ${type.noun} for this setting${input.parentName ? `, located inside ${input.parentName}` : ''}.`,
            input.brief ? `What the user wants: ${cut(input.brief, 600)}` : 'Surprise the user: something fresh that fits the setting and gives a storyteller something to play with.',
            input.similarNames?.length ? `These already exist - make something different, and do not reuse their names: ${input.similarNames.slice(0, 40).join(', ')}.` : '',
            'Give it a memorable, setting-appropriate name.',
        ].filter(Boolean).join('\n');
    } else if (task === 'fill') {
        job = `Write the empty fields of the ${subject}, consistent with everything written above.`;
    } else {
        job = `Enrich the ${subject}: write every field. Where a field already has text (shown above), keep every fact in it and add new, specific detail. Where it is empty, write it from scratch.`;
    }
    if (input.brief && task !== 'create') job += `\nThe user's direction: ${cut(input.brief, 400)}`;
    if (placeRule) job += `\n${placeRule}`;
    job += `\nEach text field: ${length}.`;

    const template = [...(task === 'create' ? [['name', '"..."']] : []), ...targets.map((f) => [f.name, formOf(f, refNames).json])];
    const needs = [
        ...(task === 'create' ? ['- "name": its name'] : []),
        ...targets.map((f) => `- "${f.name}" (${f.label})${f.about ? `: ${f.about}` : ''}${isText(f) ? '' : ` - ${formOf(f, refNames).prose}`}`),
    ];
    // A new entry may be tied into the setting: up to three relationships
    // to entries that already exist.
    const relationNames = task === 'create' ? (input.relationNames ?? []).slice(0, 25) : [];
    if (relationNames.length) {
        template.push(['relations', '[{"name": "...", "kind": "..."}]']);
        needs.push(`- "relations": up to THREE existing entries it is connected to, and how ("kind" in a few words: ally, rival, serves, sibling, owes...). Choose only from: ${relationNames.join(', ')}. [] if none fits.`);
        keys.push('relations');
    }
    parts.push(`# Your task\n${job}`);
    parts.push(`# Reply\nReply with ONLY this JSON object, every "..." replaced by your writing. Keep exactly these keys:\n${jsonTemplate(template)}\nWhat each key needs:\n${needs.join('\n')}`);
    return { system: SYSTEM_BASE.join('\n'), user: parts.join('\n\n'), keys, plain: false };
}

// ---- the front page

export const OVERVIEW_TEXT = Object.freeze({
    premise: { label: 'Premise', about: 'what this world is, what is at stake in it, and what kinds of stories happen there', aliases: ['frontpage', 'pitch', 'overview', 'summary', 'setting', 'world'] },
    rules: { label: 'Society and law', about: 'how society works - who holds power, the laws, customs and taboos, and what breaking them costs (magic and technology have their own fields)', aliases: ['society', 'law', 'laws', 'societyandlaw', 'howtheworldworks', 'worldrules', 'customs'] },
    magicNotes: { label: 'How magic works', about: 'how magic works within the hard limits: where it comes from, who can use it, what it costs, how everyday magic compares with great magic', aliases: ['magic', 'howmagicworks', 'magicsystem'] },
    techNotes: { label: 'How technology works', about: 'how technology works at this tech level: what exists, who makes and understands it, how it is spread, what it changes in daily life', aliases: ['technology', 'tech', 'howtechnologyworks'] },
});

// A front-page field's current text (magicNotes/techNotes live in the
// overview's magic/tech objects).
export function overviewValue(o, field) {
    if (field === 'magicNotes') return o?.magic?.notes ?? '';
    if (field === 'techNotes') return o?.tech?.notes ?? '';
    return o?.[field] ?? '';
}

// The front page's text fields. input: { fields: [OVERVIEW_TEXT keys],
// overview, contents: [{ type, names }], detail, brief }
// -> { system, user, keys, plain }
export function buildOverviewPrompt({ fields, overview = {}, contents = [], detail = 'standard', brief = '' }) {
    const o = overview;
    const length = DETAIL_LEVELS[detail] ?? DETAIL_LEVELS.standard;
    const plain = fields.length === 1;
    const parts = [...worldBlocks(o, { skip: plain ? [fields[0]] : [] })];
    const known = contents.filter((c) => c.names.length).map((c) => `${c.type}: ${c.names.slice(0, 15).join(', ')}`);
    if (known.length) parts.push(`# Already in the setting\n${known.join('\n')}`);

    if (plain) {
        const f = fields[0];
        const meta = OVERVIEW_TEXT[f];
        const current = overviewValue(o, f);
        parts.push(`# Your task\n${[
            `Write the "${meta.label}" section of this setting's front page: ${meta.about}.`,
            current ? `It currently says:\n"""\n${cut(current, 2000)}\n"""\nRewrite it: keep every fact it already contains, and add new, specific detail that fits the world above.` : 'It is empty now: write it from scratch, consistent with the world above.',
            `Length: ${f === 'premise' ? 'one rich paragraph' : length}.`,
            brief ? `The user's direction: ${cut(brief, 400)}` : '',
        ].filter(Boolean).join('\n')}`, REPLY_PLAIN);
        return { system: SYSTEM_BASE.join('\n'), user: parts.join('\n\n'), keys: [f], plain: true };
    }

    const needs = fields.map((f) => `- "${f}" (${OVERVIEW_TEXT[f].label}): ${OVERVIEW_TEXT[f].about}${overviewValue(o, f) ? ' - it already has text (above): keep every fact in it and add more' : ''}`);
    parts.push(`# Your task\nWrite the sections of this setting's front page listed below, consistent with the world above.${brief ? `\nThe user's direction: ${cut(brief, 400)}` : ''}\nEach section: ${length}; the premise: one rich paragraph.`);
    parts.push(`# Reply\nReply with ONLY this JSON object, every "..." replaced by your writing. Keep exactly these keys; each value is one string:\n${jsonTemplate(fields.map((f) => [f, '"..."']))}\nWhat each key needs:\n${needs.join('\n')}`);
    return { system: SYSTEM_BASE.join('\n'), user: parts.join('\n\n'), keys: [...fields], plain: false };
}

// The front-page answer: { values: { field: text }, error }.
export function parseOverviewResponse(text, keys, { plain = keys.length === 1 } = {}) {
    if (plain) {
        const value = plainText(text, OVERVIEW_TEXT[keys[0]]?.label);
        return value ? { values: { [keys[0]]: value }, error: null } : { values: {}, error: 'The model returned no text.' };
    }
    const json = readJson(text);
    if (!json || typeof json !== 'object' || Array.isArray(json)) return { values: {}, error: 'The model did not answer with the JSON it was asked for.' };
    const values = {};
    for (const [rawKey, raw] of Object.entries(json)) {
        const key = matchKey(rawKey, keys.map((k) => ({ name: k, label: OVERVIEW_TEXT[k]?.label, aliases: OVERVIEW_TEXT[k]?.aliases })));
        const value = textOf(raw);
        if (key && value && !values[key]) values[key] = value;
    }
    return Object.keys(values).length ? { values, error: null } : { values, error: 'The answer had nothing usable in it.' };
}

// ---- reading answers

// A stronger JSON reader can be plugged in (src/generate/json.js plugs in
// State Engine's parseModelJson); the local extractJson() is the fallback.
let pluggedParser = null;

export function setJsonParser(fn) {
    pluggedParser = typeof fn === 'function' ? fn : null;
}

// A model's JSON answer as an object, or undefined (src/planner/ uses it too).
export function readModelJson(text) {
    return readJson(text);
}

function readJson(text) {
    if (pluggedParser) {
        try {
            const parsed = pluggedParser(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
            // Fall back to the local reader.
        }
    }
    return extractJson(text);
}


const tryParse = (s) => {
    try {
        return JSON.parse(s);
    } catch {
        try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { return undefined; }
    }
};

// The first JSON object in a model's answer, or null. Tolerates code fences
// and chatter around it, a trailing comma, and - small models do this - an
// answer that stops before its closing brackets (they are added; a value
// cut off mid-way is dropped). This is the fallback: when State Engine
// offers its JSON API (parseModelJson), src/generate/json.js uses that
// stronger repair instead.
export function extractJson(text) {
    const t = String(text ?? '').replace(/```(?:json)?/gi, '');
    const start = t.indexOf('{');
    if (start === -1) return null;
    const open = [];
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
        else if (c === '{' || c === '[') open.push(c === '{' ? '}' : ']');
        else if (c === '}' || c === ']') {
            open.pop();
            if (!open.length) {
                const parsed = tryParse(t.slice(start, i + 1));
                return parsed && typeof parsed === 'object' ? parsed : null;
            }
        }
    }
    // Never closed: close what is open.
    const close = (body, stack, quoted) => `${body}${quoted ? '"' : ''}${[...stack].reverse().join('')}`;
    const body = t.slice(start).trimEnd();
    // Ended after a finished value: just close it. Ended inside a string:
    // that value was cut off - drop it below rather than keep half of it.
    if (!inString) {
        const whole = tryParse(close(body, open, false));
        if (whole && typeof whole === 'object') return whole;
    }
    // Cut off mid-value: drop the unfinished last member and close.
    const lastComma = body.lastIndexOf(',');
    if (lastComma > 0) {
        const head = body.slice(0, lastComma);
        const stack = [];
        let q = false;
        let esc = false;
        for (const c of head) {
            if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') q = false; continue; }
            if (c === '"') q = true;
            else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
            else if (c === '}' || c === ']') stack.pop();
        }
        const salvaged = tryParse(close(head, stack, q));
        if (salvaged && typeof salvaged === 'object') return salvaged;
    }
    return null;
}

// A text value from whatever shape the model used: a string; an array of
// paragraphs; an object of strings.
function textOf(raw) {
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) return raw.map(textOf).filter(Boolean).join('\n\n');
    if (raw && typeof raw === 'object') return Object.values(raw).map(textOf).filter(Boolean).join('\n\n');
    if (raw === null || raw === undefined) return '';
    return String(raw);
}

// The wanted key a model's key means: exact, label, alias, or one
// containing the other (e.g. "description_text").
function matchKey(rawKey, wanted) {
    const k = norm(rawKey);
    if (!k) return null;
    const exact = wanted.find((w) => norm(w.name) === k || norm(w.label) === k || (w.aliases ?? []).includes(k));
    if (exact) return exact.name;
    const loose = wanted.find((w) => (norm(w.name).length > 3 && (k.includes(norm(w.name)) || norm(w.name).includes(k))));
    return loose?.name ?? null;
}

// The text a model gave for one field, without the wrapping models add:
// code fences, "Sure, here is...", a "Label:" line, quotes, a one-value JSON
// object.
export function plainText(text, label = '') {
    let t = String(text ?? '').replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const json = t.startsWith('{') ? readJson(t) : null;
    if (json && typeof json === 'object') {
        const values = Object.values(json).map(textOf).filter(Boolean);
        if (values.length) t = values.join('\n\n');
    }
    t = t.replace(/^(sure|certainly|of course|okay|ok|here(?:'s| is| are))[^\n:]*[:.!]\s*\n?/i, '').trim();
    if (label) t = t.replace(new RegExp(`^\\**\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\**\\s*[:\\-–]\\s*`, 'i'), '').trim();
    t = t.replace(/^"""\s*|\s*"""$/g, '').trim();
    if (/^["“].*["”]$/s.test(t) && !t.slice(1, -1).includes('"')) t = t.slice(1, -1).trim();
    return t;
}

// The answer as field values that fit (SB-132): enum values matched
// case-insensitively, references matched to existing names (unknown ones
// dropped), lists as string arrays; unknown keys dropped. `refLookup(typeId,
// name)` -> id or null. -> { values, dropped: [key or "key: value"], error }
export function parseGenerationResponse(text, { fields = [], keys = [], refLookup = () => null, plain = false } = {}) {
    const defs = [...BASE_FIELDS, ...fields];
    const wanted = keys.map((k) => (k === 'name' ? { name: 'name', label: 'Name', aliases: ['title'] } : defs.find((d) => d.name === k))).filter(Boolean);
    const dropped = [];

    // One field: plain text (or whatever the model sent instead).
    if (plain || (keys.length === 1 && !readJson(text))) {
        const def = wanted[0];
        if (!def) return { values: {}, dropped, error: 'Nothing was asked for.' };
        const raw = plainText(text, def.label);
        const value = def.name === 'name' ? clean(raw).slice(0, 120) : coerce(def, raw, refLookup, dropped);
        if (value === undefined || isEmpty(value)) return { values: {}, dropped, error: dropped.length ? `The answer did not fit: ${dropped.join('; ')}` : 'The model returned no text.' };
        return { values: { [def.name]: value }, dropped, error: null };
    }

    const json = readJson(text);
    if (!json || typeof json !== 'object' || Array.isArray(json)) return { values: {}, dropped, error: 'The model did not answer with the JSON it was asked for.' };
    const values = {};
    const entries = Object.entries(json);
    for (const [rawKey, raw] of entries) {
        let key = matchKey(rawKey, wanted);
        if (!key && entries.length === 1 && wanted.length === 1) key = wanted[0].name;
        if (!key || key in values) {
            dropped.push(rawKey);
            continue;
        }
        if (key === 'name') {
            if (clean(textOf(raw))) values.name = clean(textOf(raw)).slice(0, 120);
            continue;
        }
        const value = coerce(defs.find((d) => d.name === key), raw, refLookup, dropped);
        if (value !== undefined && !isEmpty(value)) values[key] = value;
    }
    if (!Object.keys(values).length) return { values, dropped, error: 'The answer had nothing usable in it.' };
    return { values, dropped, error: null };
}

// Aliases one name each: a model (or an older save) may pack several into
// one string ("Elyon, Sovereign of Dawn, Lord of Radiant Retribution"),
// which then never matches the plain name. Split at commas and semicolons,
// duplicates (any case) dropped.
export function splitAliases(list) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(list) ? list : [list]) {
        for (const part of String(raw ?? '').split(/[,;\n]/)) {
            const alias = part.replace(/^[-*•]\s*/, '').replace(/\s+/g, ' ').trim();
            if (alias && !seen.has(alias.toLowerCase())) { seen.add(alias.toLowerCase()); out.push(alias); }
        }
    }
    return out;
}

// Generated aliases ADD to the ones there: a name someone gave is never
// rewritten away.
export function mergeAliases(existing, generated) {
    return splitAliases([...(existing ?? []), ...(generated ?? [])]);
}

function coerce(def, raw, refLookup, dropped) {
    const asList = (v) => (Array.isArray(v) ? v.map(textOf) : textOf(v).split(/,|\n/)).map((x) => clean(x).replace(/^[-*•]\s*/, '')).filter(Boolean);
    if (def.name === 'aliases') return splitAliases(asList(raw));
    switch (def.kind) {
        case 'raw': return raw;
        case 'list': return asList(raw);
        case 'number': {
            const n = Number(String(textOf(raw)).match(/-?\d+(\.\d+)?/)?.[0]);
            return Number.isFinite(n) ? n : undefined;
        }
        case 'boolean': return raw === true || /^(true|yes)\b/i.test(clean(textOf(raw)));
        case 'enum': {
            const text = clean(textOf(raw)).replace(/[.!]$/, '');
            const hit = def.values.find((v) => v.toLowerCase() === text.toLowerCase()) ?? def.values.find((v) => text.toLowerCase().includes(v.toLowerCase()));
            if (!hit) dropped.push(`${def.name}: ${text}`);
            return hit;
        }
        case 'ref': {
            const name = clean(textOf(raw)).replace(/[.!]$/, '');
            if (!name) return undefined;
            const id = refLookup(def.refType, name);
            if (!id) dropped.push(`${def.name}: ${name}`);
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
        default: return textOf(raw) || undefined;
    }
}

// Merges generated values into existing ones for a task: 'fill' never
// replaces a field that has content; the others replace (an enriched
// field already contains what was there).
export function mergeGenerated(existing, generated, task) {
    const out = { ...existing };
    for (const [key, value] of Object.entries(generated)) {
        if (task === 'fill' && !isEmpty(existing[key])) continue;
        // Aliases are only ever added to.
        out[key] = key === 'aliases' ? mergeAliases(existing[key], value) : value;
    }
    return out;
}

// The references a generation answer may keep (a faction's members, a
// place's factions): each must be tied to the entry by something - already
// there, a related entry, or named in its own text, the user's direction,
// the story's memories or the GM notes. Names picked off the offered list
// just to fill the field are dropped. values: the parsed answer (ids);
// fields: the type's field defs; existing: the entry's values before.
// -> { values, dropped: [text] }
export function groundRefs(values, fields, { existing = {}, relatedNames = [], text = '', nameOf = () => '' } = {}) {
    const out = { ...values };
    const dropped = [];
    const related = new Set((relatedNames ?? []).map((n) => clean(n).toLowerCase()).filter(Boolean));
    const named = (name) => {
        const n = clean(name);
        if (n.length < 3) return false;
        const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(String(text ?? ''));
    };
    for (const f of fields ?? []) {
        if ((f.kind !== 'ref' && f.kind !== 'refs') || out[f.name] === undefined) continue;
        const had = new Set((Array.isArray(existing[f.name]) ? existing[f.name] : [existing[f.name]]).filter(Boolean));
        const ok = (id) => had.has(id) || related.has(clean(nameOf(id)).toLowerCase()) || named(nameOf(id));
        if (f.kind === 'refs') {
            const ids = Array.isArray(out[f.name]) ? out[f.name] : [];
            const kept = ids.filter(ok);
            const left = ids.filter((id) => !ok(id)).map((id) => nameOf(id) || id);
            if (left.length) dropped.push(`${f.label ?? f.name}: ${left.join(', ')} (nothing ties them to it)`);
            out[f.name] = kept;
        } else if (out[f.name] && !ok(out[f.name])) {
            dropped.push(`${f.label ?? f.name}: ${nameOf(out[f.name]) || out[f.name]} (nothing ties it to it)`);
            out[f.name] = '';
        }
    }
    return { values: out, dropped };
}
