// Lorebook import - the runner (spec 6.6). Two steps, so nothing changes
// until the user has seen the plan (SB-153, SB-157):
//
//   analyse  each entry of the chosen books, in the background, one at a
//            time, cancellable: matched to an existing object (by title,
//            keys, aliases, or an earlier import of the same entry), else
//            classified by the model; then its facts pulled into the
//            object's fields - only what the entry says. If the model's
//            answer can't be read even after a retry, the entry's own text
//            becomes the description and its keywords the aliases, so no
//            entry is lost.
//   apply    the plan the user kept: matched objects get their BLANK fields
//            filled (never overwritten), new objects are created (marked as
//            imported, with their source entry; canon-locked if chosen),
//            places put inside the place the entry names.
//
// The books themselves are only read, never changed (SB-150).

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';
import { getObject } from '../api/objects.js';
import { getEntryMeta } from '../store/setting-store.js';
import { getObjectTypes, listEntries, createEntry, updateEntry, setEntryMeta, setParent, setCanonOnly } from '../library/library.js';
import { baselineFields } from '../library/fields.js';
import { callModel } from '../generate/llm.js';
import { askReliably } from '../generate/run.js';
import { useStateEngineJsonParser } from '../generate/json.js';
import { parseGenerationResponse } from '../generate/prompt.js';
import { readEntries, matchEntry, buildClassifyPrompt, parseClassify, buildExtractPrompt, fallbackValues, blanksOnly } from './lorebook.js';

export const IMPORT_EVENT = 'scenario_builder_import';

let worldInfo = null;
async function wiModule() {
    // public/scripts/world-info.js, from src/import/ of a third-party extension.
    worldInfo ??= await import('../../../../../world-info.js');
    return worldInfo;
}

// The World Info books SillyTavern has. -> [name]
export async function listBooks() {
    try {
        const names = (await wiModule()).world_names;
        return Array.isArray(names) ? [...names].sort((a, b) => a.localeCompare(b)) : [];
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not list the lorebooks', err);
        return [];
    }
}

async function loadBook(name) {
    const context = SillyTavern.getContext();
    if (typeof context.loadWorldInfo === 'function') return context.loadWorldInfo(name);
    return (await wiModule()).loadWorldInfo(name);
}

// The current job (one at a time), for the Import tab.
let job = null;
export function getImportJob() {
    return job;
}

function announce() {
    try {
        SillyTavern.getContext().eventSource.emit(IMPORT_EVENT);
    } catch {
        // No event bus.
    }
}

export function cancelImport() {
    if (job && (job.state === 'analysing' || job.state === 'applying')) job.cancelled = true;
}

export function clearImport() {
    if (job && job.state !== 'analysing' && job.state !== 'applying') job = null;
    announce();
}

const lower = (s) => String(s ?? '').trim().toLowerCase();

async function settingObjects(chatId, settingId) {
    const out = [];
    for (const t of (await getObjectTypes()).filter((x) => x.scope === 'world')) out.push(...(await listEntries(chatId, settingId, t.id)));
    return out;
}

// What kind of thing an unmatched entry is. Never throws: an unreadable
// answer (twice) counts as lore under the entry's title.
async function classify(entry, typeLabels, maxTokens) {
    const prompt = buildClassifyPrompt(entry, typeLabels);
    const read = (_p, text) => {
        const got = parseClassify(text, entry);
        return got ? { values: got, dropped: [], error: null } : { values: {}, dropped: [], error: 'no "kind | name" line' };
    };
    try {
        const result = await askReliably({ ...prompt, plain: true }, read, Math.min(maxTokens, 200));
        if (!result.error) return { ...result.values, guessed: false };
    } catch (err) {
        console.warn(LOG_PREFIX, 'classifying failed', err);
    }
    return { type: 'lore', name: entry.title || entry.keys[0] || 'Untitled', guessed: true };
}

// Starts analysing the chosen books. options: { fill, create, skipDisabled,
// canonLock, canonOnly }. Returns the job (updated in place as it runs).
export async function startAnalysis({ chatId, chatKey, settingId, books, options }) {
    if (job?.state === 'analysing' || job?.state === 'applying') return job;
    job = { state: 'analysing', ctx: { chatId, chatKey, settingId }, options: { ...options }, books: [...books], total: 0, done: 0, current: '', proposals: [], cancelled: false, error: '', summary: null };
    announce();
    try {
        await useStateEngineJsonParser();
        const entries = [];
        for (const name of books) entries.push(...readEntries(name, await loadBook(name)));
        job.total = entries.length;
        announce();

        const types = await getObjectTypes();
        const typeLabels = Object.fromEntries(types.map((t) => [t.id, t.plural.toLowerCase()]));
        const objects = await settingObjects(chatId, settingId);
        const maxTokens = getSettings().generation.maxTokens;
        const fieldCache = new Map();
        const fieldsFor = async (typeId) => {
            if (!fieldCache.has(typeId)) fieldCache.set(typeId, await baselineFields(settingId, types.find((t) => t.id === typeId)));
            return fieldCache.get(typeId);
        };

        for (const entry of entries) {
            if (job.cancelled) break;
            job.current = entry.title || entry.keys[0] || `entry ${entry.uid}`;
            announce();
            job.proposals.push(await analyseEntry(entry, { objects, types, typeLabels, fieldsFor, maxTokens }));
            job.done += 1;
            announce();
        }
        job.state = 'review';
        job.current = '';
    } catch (err) {
        console.warn(LOG_PREFIX, 'lorebook analysis failed', err);
        job.state = 'error';
        job.error = err?.message ?? String(err);
    }
    announce();
    return job;
}

let nextId = 0;

async function analyseEntry(entry, { objects, types, typeLabels, fieldsFor, maxTokens }) {
    const opts = job.options;
    const proposal = { id: `p${++nextId}`, entry, action: 'skip', type: '', name: '', matchId: null, matchName: '', values: {}, locatedIn: '', include: false, note: '' };
    if (entry.disabled && opts.skipDisabled) return { ...proposal, note: 'switched off in the lorebook' };

    const match = matchEntry(entry, objects);
    let type;
    let name;
    if (match) {
        if (!opts.fill) return { ...proposal, type: match.type, name: match.name, matchId: match.id, matchName: match.name, note: 'already in the library (filling is off)' };
        type = match.type;
        name = match.name;
    } else {
        if (!opts.create) return { ...proposal, note: 'not in the library (creating is off)' };
        const kind = await classify(entry, typeLabels, maxTokens);
        if (kind.type === 'skip') return { ...proposal, note: 'not about one specific thing' };
        type = kind.type;
        name = kind.name;
        if (kind.guessed) proposal.note = 'kind guessed - check it';
        // The model's name may match an object the title did not.
        const byName = objects.find((o) => o.type === type && [o.name, ...(o.aliases ?? [])].some((n) => lower(n) === lower(name)));
        if (byName) return analyseMatched(entry, byName, proposal, { types, fieldsFor, maxTokens, objects });
    }
    if (match) return analyseMatched(entry, match, proposal, { types, fieldsFor, maxTokens, objects });

    const typeDef = types.find((t) => t.id === type);
    const { values, note } = await extract(entry, { type: typeDef, name, existing: {}, fieldsFor, maxTokens, objects });
    const locatedIn = typeof values.located_in === 'string' ? values.located_in : '';
    delete values.located_in;
    return { ...proposal, action: 'create', type, name, values, locatedIn, include: true, note: [proposal.note, note].filter(Boolean).join('; ') };
}

async function analyseMatched(entry, match, proposal, { types, fieldsFor, maxTokens, objects }) {
    const base = match.base ?? match;
    const typeDef = types.find((t) => t.id === match.type);
    const fields = await fieldsFor(match.type);
    const existing = { name: match.name, aliases: base.aliases ?? match.aliases ?? [], description: base.description ?? '', ...Object.fromEntries(fields.map((f) => [f.name, base[f.name]])) };
    const { values, note } = await extract(entry, { type: typeDef, name: match.name, existing, fieldsFor, maxTokens, objects });
    const locatedIn = typeof values.located_in === 'string' ? values.located_in : '';
    delete values.located_in;
    const patch = blanksOnly(existing, values);
    const any = Object.keys(patch).length > 0 || (match.type === 'location' && locatedIn && !match.meta?.parentId);
    return {
        ...proposal, action: any ? 'fill' : 'skip', type: match.type, name: match.name, matchId: match.id, matchName: match.name,
        values: patch, locatedIn, include: any, note: any ? note : 'nothing new for it',
    };
}

async function extract(entry, { type, name, existing, fieldsFor, maxTokens, objects }) {
    const fields = await fieldsFor(type.id);
    const refTypes = [...new Set(fields.filter((f) => f.kind === 'ref' || f.kind === 'refs').map((f) => f.refType))];
    const refNames = Object.fromEntries(refTypes.map((t) => [t, objects.filter((o) => o.type === t).map((o) => o.name)]));
    const locations = objects.filter((o) => o.type === 'location').map((o) => o.name);
    const prompt = buildExtractPrompt(entry, { typeNoun: type.noun, name, fields, refNames, locations, existing });
    const refLookup = (typeId, n) => objects.find((o) => o.type === typeId && [o.name, ...(o.aliases ?? [])].some((x) => lower(x) === lower(n)))?.id ?? null;
    const parseFields = [...fields, { name: 'located_in', label: 'Located in', kind: 'text' }];
    const read = (p, text) => parseGenerationResponse(text, { fields: parseFields, keys: p.keys, refLookup });
    try {
        const result = await askReliably({ ...prompt, plain: false }, read, maxTokens);
        if (!result.error) {
            if (!result.values.description && !existing.description) result.values.description = entry.content;
            return { values: result.values, note: '' };
        }
    } catch (err) {
        console.warn(LOG_PREFIX, 'extraction failed', err);
    }
    return { values: fallbackValues(entry, name), note: 'used the entry text as it is' };
}

// Applies the proposals the user kept. Never throws.
export async function applyImport() {
    if (!job || job.state !== 'review') return job;
    job.state = 'applying';
    job.done = 0;
    const kept = job.proposals.filter((p) => p.include && p.action !== 'skip');
    job.total = kept.length;
    announce();
    const { chatId, settingId } = job.ctx;
    const summary = { filled: 0, created: 0, failed: 0, placed: 0 };
    const created = new Map(); // "type|name" -> id, so two entries about one thing make one object
    const places = [];
    try {
        for (const p of kept) {
            if (job.cancelled) break;
            job.current = p.name;
            announce();
            try {
                const key = `${p.type}|${lower(p.name)}`;
                const targetId = p.matchId ?? created.get(key) ?? null;
                if (targetId) {
                    const fresh = await getObject(chatId, targetId);
                    const base = fresh?.base ?? fresh ?? {};
                    const patch = blanksOnly({ name: fresh?.name, aliases: base.aliases ?? [], ...base }, p.values);
                    if (Object.keys(patch).length && !await updateEntry(chatId, settingId, targetId, patch)) throw new Error('State Engine refused the change');
                    const meta = { ...(job.options.canonLock ? { canonLocked: true } : {}) };
                    if (!getEntryMeta(settingId, targetId).source) meta.source = p.entry.source;
                    setEntryMeta(settingId, targetId, meta);
                    summary.filled += 1;
                    if (p.locatedIn && p.type === 'location') places.push([targetId, p.locatedIn]);
                } else {
                    const obj = await createEntry(chatId, settingId, p.type, { name: p.name, ...p.values }, { origin: 'import', source: p.entry.source, canonLocked: job.options.canonLock === true });
                    if (!obj) throw new Error('State Engine refused to create it');
                    created.set(key, obj.id);
                    summary.created += 1;
                    if (p.locatedIn && p.type === 'location') places.push([obj.id, p.locatedIn]);
                }
                p.applied = true;
            } catch (err) {
                console.warn(LOG_PREFIX, `could not import "${p.name}"`, err);
                p.error = err?.message ?? String(err);
                summary.failed += 1;
            }
            job.done += 1;
            announce();
        }
        // Places last, so places created in this import can hold each other.
        if (places.length) {
            const locations = (await listEntries(chatId, settingId, 'location'));
            for (const [id, parentName] of places) {
                const parent = locations.find((l) => l.id !== id && [l.name, ...(l.aliases ?? [])].some((n) => lower(n) === lower(parentName)));
                if (parent && setParent(settingId, id, parent.id)) summary.placed += 1;
            }
        }
        if (job.options.canonOnly) setCanonOnly(settingId, true);
        job.summary = summary;
        job.state = 'done';
    } catch (err) {
        job.state = 'error';
        job.error = err?.message ?? String(err);
    }
    job.current = '';
    announce();
    return job;
}

