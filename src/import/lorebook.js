// Lorebook import (spec 6.6) - the pure half: reading a World Info book's
// entries, matching them to existing objects, and the prompts that classify
// an entry and pull its facts into an object's fields. The runner is
// src/import/run.js.
//
// The rules:
//   - an entry that names an existing object (its title or a key matches
//     the object's name or an alias - or it was imported from this entry
//     before, SB-155) FILLS THAT OBJECT'S BLANK FIELDS - nothing it already
//     has is overwritten;
//   - an entry with no match becomes a NEW object of the kind it describes;
//   - extraction uses ONLY what the entry says: nothing is invented - a
//     lorebook is canon (and can be canon-locked on import);
//   - the original books are never changed (SB-150).

import { BASE_FIELDS } from '../generate/prompt.js';

export const IMPORT_TYPES = Object.freeze(['character', 'location', 'faction', 'item', 'creature', 'lore']);

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = String(text ?? '').trim();
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
};
const nameKey = (name) => String(name ?? '').toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const strList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => clean(x)).filter(Boolean);

// A book's entries as SillyTavern stores them ({ entries: { uid: {...} } })
// -> [{ uid, book, title, keys, secondary, content, disabled, constant, source }]
export function readEntries(book, data) {
    const raw = data?.entries ?? {};
    return Object.values(raw)
        .filter((e) => e && typeof e === 'object')
        .map((e) => ({
            uid: String(e.uid ?? ''),
            book,
            title: clean(e.comment) || strList(e.key)[0] || '',
            keys: strList(e.key),
            secondary: strList(e.keysecondary),
            content: String(e.content ?? '').trim(),
            disabled: e.disable === true,
            constant: e.constant === true,
            source: `lorebook:${book}#${e.uid ?? ''}`,
        }))
        .filter((e) => e.content)
        .sort((a, b) => Number(a.uid) - Number(b.uid) || a.title.localeCompare(b.title));
}

// The existing object an entry is about, or null: one imported from this
// very entry before, else one whose name or alias matches the entry's
// title or a key. `objects`: [{ id, type, name, aliases, meta: { source } }]
export function matchEntry(entry, objects) {
    const bySource = objects.find((o) => o.meta?.source === entry.source);
    if (bySource) return bySource;
    const names = new Set([entry.title, ...entry.keys].map(nameKey).filter((k) => k.length > 1));
    if (!names.size) return null;
    const hits = objects.filter((o) => [o.name, ...(o.aliases ?? [])].some((n) => names.has(nameKey(n))));
    if (!hits.length) return null;
    // The title is the strongest signal.
    const title = nameKey(entry.title);
    return hits.find((o) => [o.name, ...(o.aliases ?? [])].some((n) => nameKey(n) === title)) ?? hits[0];
}

const SYSTEM = [
    'You are cataloguing a roleplaying setting from its lorebook.',
    'You only ever use facts that are written in the entry you are given. You never invent, embellish or guess.',
].join('\n');

const entryBlock = (entry) => `# The lorebook entry\nTitle: ${entry.title || '(none)'}\nKeywords: ${entry.keys.join(', ') || '(none)'}\nText:\n"""\n${cut(entry.content, 6000)}\n"""`;

// "What kind of thing is this entry about?" - one plain line back:
// "<type> | <name>".
export function buildClassifyPrompt(entry, typeLabels = {}) {
    const choices = IMPORT_TYPES.map((t) => `- ${t}${typeLabels[t] ? `: ${typeLabels[t]}` : ''}`).join('\n');
    const user = [
        entryBlock(entry),
        `# Your task\nDecide what ONE thing this entry is mainly about, and what that thing is called.\nKinds:\n${choices}\n- skip: the entry is not about one specific thing (writing rules, instructions to the AI, formatting, a list of many unrelated things)`,
        '# Reply\nReply with ONE line, exactly in this form, and nothing else:\nkind | name\nFor example:\nlocation | The Brass Market',
    ].join('\n\n');
    return { system: SYSTEM, user };
}

// The kind and name from a classify answer. -> { type, name } ('skip' as type
// to leave the entry out), or null when the answer is unreadable.
export function parseClassify(text, entry) {
    const line = String(text ?? '').split('\n').map((l) => l.replace(/[`*]/g, '').trim()).find((l) => l.includes('|') || IMPORT_TYPES.some((t) => l.toLowerCase().startsWith(t)) || l.toLowerCase().startsWith('skip'));
    if (!line) return null;
    const [kindRaw, ...rest] = line.split('|');
    const kind = clean(kindRaw).toLowerCase().replace(/^kind\s*:\s*/, '');
    const type = kind.startsWith('skip') ? 'skip' : IMPORT_TYPES.find((t) => kind.startsWith(t) || kind === `${t}s`);
    if (!type) return null;
    const name = clean(rest.join('|')).replace(/^name\s*:\s*/i, '').replace(/^["']|["'.]$/g, '') || entry.title;
    return { type, name };
}

// "Pull this entry's facts into these fields" - a JSON template; fields
// the entry says nothing about stay "". For a location, "located_in" names
// the place it is inside, if the entry says.
// -> { system, user, keys }
export function buildExtractPrompt(entry, { typeNoun, name, fields, refNames = {}, locations = [], existing = {} }) {
    const all = [...BASE_FIELDS, ...fields].filter((f) => f.kind !== 'boolean' && f.kind !== 'number');
    const want = all.filter((f) => !existing[f.name] || (Array.isArray(existing[f.name]) && !existing[f.name].length));
    const template = want.map((f) => {
        let value = '"..."';
        if (f.kind === 'list') value = '["...", "..."]';
        if (f.kind === 'enum') value = `"<one of: ${f.values.join(' | ')} - or \\"\\">"`;
        if (f.kind === 'ref') value = refNames[f.refType]?.length ? `"<one of: ${refNames[f.refType].join(' | ')} - or \\"\\">"` : '""';
        if (f.kind === 'refs') value = refNames[f.refType]?.length ? `["<names from: ${refNames[f.refType].join(' | ')}>"]` : '[]';
        return [f.name, value];
    });
    if (typeNoun === 'location') template.push(['located_in', locations.length ? `"<the place it is inside, if the entry says - e.g. one of: ${locations.slice(0, 30).join(' | ')} - or \\"\\">"` : '"<the place it is inside, if the entry says - or \\"\\">"']);
    const needs = want.map((f) => `- "${f.name}" (${f.label})${f.about ? `: ${f.about}` : ''}`);
    const user = [
        entryBlock(entry),
        `# Your task\nThis entry is about the ${typeNoun} "${name}". Copy its facts into the fields below.\n- Use ONLY what the entry says. Do not invent anything.\n- Where the entry says nothing for a field, use "" (or [] for a list).\n- "description": what it is and what it is like, in a few sentences drawn from the entry.\n- "aliases": other names the entry gives it (its keywords may help).`,
        `# Reply\nReply with ONLY this JSON object, filled in. Keep exactly these keys:\n{\n${template.map(([k, v]) => `  "${k}": ${v}`).join(',\n')}\n}\nWhat each key needs:\n${needs.join('\n')}`,
    ].join('\n\n');
    return { system: SYSTEM, user, keys: template.map(([k]) => k) };
}

// When extraction fails: what the entry itself can always give - its text as
// the description, its keywords (other than the name) as aliases.
export function fallbackValues(entry, name) {
    const nk = nameKey(name);
    return {
        description: entry.content,
        aliases: entry.keys.filter((k) => nameKey(k) !== nk && k.length < 60),
    };
}

// Only what fills a gap: values for fields that are empty on the object,
// plus new aliases appended. Never overwrites. -> patch
export function blanksOnly(existing, values) {
    const patch = {};
    const empty = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
    for (const [key, value] of Object.entries(values)) {
        if (key === 'aliases') {
            const have = new Set((existing.aliases ?? []).map(nameKey));
            const add = (value ?? []).filter((a) => !have.has(nameKey(a)) && nameKey(a) !== nameKey(existing.name));
            if (add.length) patch.aliases = [...(existing.aliases ?? []), ...add];
            continue;
        }
        if (empty(value)) continue;
        if (empty(existing[key])) patch[key] = value;
    }
    return patch;
}

