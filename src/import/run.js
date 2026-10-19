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
//            filled (never overwritten - but an object's own entry replaces
//            what a mention in another entry gave it), new objects are created (marked as
//            imported, with their source entry; canon-locked if chosen),
//            places put inside the place the entry names.
//
// The books themselves are only read, never changed (SB-150).

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';
import { getObject } from '../api/objects.js';
import { getEntryMeta, getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { getObjectTypes, listEntries, createEntry, updateEntry, setEntryMeta, setParent, setCanonOnly, getParents, deleteEntry } from '../library/library.js';
import { baselineFields } from '../library/fields.js';
import { addRelation } from '../library/relations-edit.js';
import { callModel } from '../generate/llm.js';
import { askReliably } from '../generate/run.js';
import { useStateEngineJsonParser } from '../generate/json.js';
import { parseGenerationResponse, extractJson } from '../generate/prompt.js';

// Any JSON in an answer: an object, or a bare list wrapped as { items }.
function extractAny(text) {
    const obj = extractJson(text);
    if (obj) return obj;
    const t = String(text ?? '');
    const start = t.indexOf('[');
    const end = t.lastIndexOf(']');
    if (start === -1 || end <= start) return null;
    try { return { items: JSON.parse(t.slice(start, end + 1)) }; } catch { return null; }
}
import { readEntries, matchEntry, buildClassifyPrompt, parseClassify, buildExtractPrompt, fallbackValues, blanksOnly, keepMentionedLinks, buildManyPrompt, readManyItems, readRelations, isOwnEntry, heldFromMention, ownOver, keepDetail } from './lorebook.js';

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
        job.titles = Object.fromEntries(entries.map((e) => [e.source, e.title || e.keys[0] || e.uid]));
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
            job.proposals.push(...await analyseEntry(entry, { objects, types, typeLabels, fieldsFor, maxTokens }));
            job.done += 1;
            announce();
        }
        markOwnOverMentions(job.proposals);
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

// One entry -> one proposal, or several for an entry that lists many things.
async function analyseEntry(entry, { objects, types, typeLabels, fieldsFor, maxTokens }) {
    const opts = job.options;
    const proposal = { id: `p${++nextId}`, entry, action: 'skip', type: '', name: '', matchId: null, matchName: '', values: {}, locatedIn: '', relations: [], include: false, note: '' };
    if (entry.disabled && opts.skipDisabled) return [{ ...proposal, note: 'switched off in the lorebook' }];

    const match = matchEntry(entry, objects);
    let type;
    let name;
    if (match) {
        if (!opts.fill) return [{ ...proposal, type: match.type, name: match.name, matchId: match.id, matchName: match.name, note: 'already in the library (filling is off)' }];
        return [await analyseMatched(entry, match, proposal, { types, fieldsFor, maxTokens, objects, own: isOwnEntry(entry, match) })];
    }
    if (!opts.create) return [{ ...proposal, note: 'not in the library (creating is off)' }];
    const kind = await classify(entry, typeLabels, maxTokens);
    if (kind.type === 'skip') return [{ ...proposal, note: 'not about anything in the world' }];
    if (kind.type === 'many') return analyseMany(entry, { objects, typeLabels, maxTokens });
    type = kind.type;
    name = kind.name;
    if (kind.guessed) proposal.note = 'kind guessed - check it';
    // The model's name may match an object the title did not.
    const byName = objects.find((o) => o.type === type && [o.name, ...(o.aliases ?? [])].some((n) => lower(n) === lower(name)));
    // An entry about one thing is that thing's own entry.
    if (byName) return [await analyseMatched(entry, byName, proposal, { types, fieldsFor, maxTokens, objects, own: true })];

    const typeDef = types.find((t) => t.id === type);
    const { values, relations, note } = await extract(entry, { type: typeDef, name, existing: {}, fieldsFor, maxTokens, objects, own: true });
    const locatedIn = typeof values.located_in === 'string' ? values.located_in : '';
    delete values.located_in;
    return [{ ...proposal, action: 'create', type, name, values, locatedIn, relations, include: true, own: true, note: [proposal.note, note].filter(Boolean).join('; ') }];
}

// An entry listing several things (a pantheon, a roster): each named thing
// becomes its own proposal - filling an existing object's blanks, or a new
// one - with what the entry says about it as its description.
async function analyseMany(entry, { objects, typeLabels, maxTokens }) {
    const prompt = buildManyPrompt(entry, typeLabels);
    const read = (_p, text) => {
        const items = readManyItems(extractAny(text), entry);
        return items.length ? { values: { items }, dropped: [], error: null } : { values: {}, dropped: [], error: 'no items it names' };
    };
    let items = [];
    try {
        const result = await askReliably({ ...prompt, keys: ['items'], plain: false }, read, maxTokens);
        if (!result.error) items = result.values.items;
    } catch (err) {
        console.warn(LOG_PREFIX, 'reading a list entry failed', err);
    }
    if (!items.length) {
        return [{ id: `p${++nextId}`, entry, action: 'create', type: 'lore', name: entry.title || entry.keys[0] || 'Untitled', matchId: null, matchName: '', values: fallbackValues(entry, entry.title), locatedIn: '', relations: [], include: true, note: 'a list the model could not split - kept as one lore entry' }];
    }
    return items.map((item) => {
        const existing = objects.find((o) => [o.name, ...(o.aliases ?? [])].some((n) => lower(n) === lower(item.name)));
        const base = { id: `p${++nextId}`, entry, locatedIn: '', relations: [], mention: true, note: `one of several in "${entry.title || 'this entry'}"` };
        if (existing) {
            const b = existing.base ?? existing;
            const patch = blanksOnly({ name: existing.name, aliases: b.aliases ?? [], description: b.description ?? '' }, { description: item.description });
            const any = Object.keys(patch).length > 0;
            return { ...base, action: any ? 'fill' : 'skip', type: existing.type, name: existing.name, matchId: existing.id, matchName: existing.name, values: patch, include: any, note: any ? base.note : 'already in the library' };
        }
        return { ...base, action: 'create', type: item.type, name: item.name, matchId: null, matchName: '', values: { description: item.description || '' }, include: true };
    });
}

async function analyseMatched(entry, match, proposal, { types, fieldsFor, maxTokens, objects, own = false }) {
    const base = match.base ?? match;
    const typeDef = types.find((t) => t.id === match.type);
    const fields = await fieldsFor(match.type);
    const existing = { name: match.name, aliases: base.aliases ?? match.aliases ?? [], description: base.description ?? '', ...Object.fromEntries(fields.map((f) => [f.name, base[f.name]])) };
    // Its own entry, over what a mention in another entry gave it: every
    // field is asked for again, and what differs replaces the old.
    const replacing = own && heldFromMention(match.meta, entry);
    const asked = replacing ? { name: existing.name, aliases: existing.aliases } : existing;
    const { values, relations, note } = await extract(entry, { type: typeDef, name: match.name, existing: asked, fieldsFor, maxTokens, objects, own });
    const locatedIn = typeof values.located_in === 'string' ? values.located_in : '';
    delete values.located_in;
    const { patch, replaced } = replacing ? ownOver(existing, values) : { patch: blanksOnly(existing, values), replaced: {} };
    const any = Object.keys(patch).length > 0 || relations.length > 0 || (match.type === 'location' && locatedIn && !match.meta?.parentId);
    const from = job?.titles?.[match.meta?.source] ?? 'another entry';
    const why = Object.keys(replaced).length ? `its own entry - replaces what "${from}" gave it` : '';
    return {
        ...proposal, action: any ? 'fill' : 'skip', type: match.type, name: match.name, matchId: match.id, matchName: match.name,
        values: patch, replaces: replaced, own, locatedIn, relations, include: any, note: any ? [why, note].filter(Boolean).join('; ') : 'nothing new for it',
    };
}

// Within one import: a thing a list entry mentions and its own entry also
// describes is made once, from its own entry (applyImport puts the own
// entry's values over the mention's, whichever comes first). The plan says so.
function markOwnOverMentions(proposals) {
    const key = (p) => `${p.type}|${lower(p.name)}`;
    for (const own of proposals.filter((p) => p.own && p.action === 'create')) {
        const mentions = proposals.filter((p) => p.mention && p.action === 'create' && key(p) === key(own));
        if (!mentions.length) continue;
        own.note = [`its own entry - replaces what "${mentions[0].entry.title}" says of it`, own.note].filter(Boolean).join('; ');
        for (const m of mentions) m.note = `its own entry "${own.entry.title}" replaces this`;
    }
}

async function extract(entry, { type, name, existing, fieldsFor, maxTokens, objects, own = false }) {
    const fields = await fieldsFor(type.id);
    const refTypes = [...new Set(fields.filter((f) => f.kind === 'ref' || f.kind === 'refs').map((f) => f.refType))];
    const refNames = Object.fromEntries(refTypes.map((t) => [t, objects.filter((o) => o.type === t).map((o) => o.name)]));
    const locations = objects.filter((o) => o.type === 'location').map((o) => o.name);
    const prompt = buildExtractPrompt(entry, { typeNoun: type.noun, name, fields, refNames, locations, existing });
    const refLookup = (typeId, n) => objects.find((o) => o.type === typeId && [o.name, ...(o.aliases ?? [])].some((x) => lower(x) === lower(n)))?.id ?? null;
    const parseFields = [...fields, { name: 'located_in', label: 'Located in', kind: 'text' }, { name: 'relations', label: 'Relations', kind: 'raw' }];
    const read = (p, text) => parseGenerationResponse(text, { fields: parseFields, keys: p.keys, refLookup });
    try {
        const result = await askReliably({ ...prompt, plain: false }, read, maxTokens);
        if (!result.error) {
            const relations = readRelations(result.values.relations, entry, name);
            delete result.values.relations;
            // Links survive only if the entry itself names the object.
            const { values, removed } = keepMentionedLinks(entry, result.values, fields, objects);
            if (!values.description && !existing.description) values.description = entry.content;
            // Its own entry keeps its detail: a summary of it is not enough.
            let kept = '';
            if (own && values.description) {
                const full = keepDetail(values.description, entry);
                if (full !== values.description) { values.description = full; kept = 'kept the entry\'s own text as the description'; }
            }
            return { values, relations, note: [kept, removed.length ? `left out links the entry does not name: ${removed.slice(0, 6).join(', ')}${removed.length > 6 ? '…' : ''}` : ''].filter(Boolean).join('; ') };
        }
    } catch (err) {
        console.warn(LOG_PREFIX, 'extraction failed', err);
    }
    return { values: fallbackValues(entry, name), relations: [], note: 'used the entry text as it is' };
}

// The setting's recorded imports, newest first.
export function listImports(settingId) {
    return [...getSettingDoc(settingId).imports].reverse();
}

// Undoes one import: the objects it created are deleted (State Engine
// removes them from every reference), and the fields it filled go back to
// what they held before (as do places it moved). Fields edited since are
// still restored - the import's values are what is taken back. -> summary
export async function undoImport(chatId, settingId, importId) {
    const rec = getSettingDoc(settingId).imports.find((i) => i.id === importId);
    if (!rec) return null;
    const out = { deleted: 0, restored: 0, failed: 0 };
    for (const c of rec.created) {
        try {
            if (await deleteEntry(chatId, settingId, c.id)) out.deleted += 1;
        } catch (err) {
            console.warn(LOG_PREFIX, `could not delete ${c.name}`, err);
            out.failed += 1;
        }
    }
    for (const f of rec.filled) {
        try {
            if (Object.keys(f.before ?? {}).length && !await updateEntry(chatId, settingId, f.id, f.before)) throw new Error('refused');
            if (f.parentBefore !== undefined && getParents(settingId)[f.id] !== (f.parentBefore ?? undefined)) setParent(settingId, f.id, f.parentBefore ?? null);
            setEntryMeta(settingId, f.id, { source: '' });
            out.restored += 1;
        } catch (err) {
            console.warn(LOG_PREFIX, `could not restore ${f.name}`, err);
            out.failed += 1;
        }
    }
    if (rec.relations?.length) {
        const ids = new Set(rec.relations);
        updateSettingDoc(settingId, (d) => { d.relations = d.relations.filter((r) => !ids.has(r.id)); });
    }
    updateSettingDoc(settingId, (d) => { d.imports = d.imports.filter((i) => i.id !== importId); });
    announce();
    return out;
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
    // What this import did, so it can be undone as one (SB-133a/SB-226).
    const record = { id: `imp_${Date.now().toString(36)}`, at: new Date().toISOString(), books: [...job.books], created: [], filled: [] };
    const parentsBefore = getParents(settingId);
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
                    const have = { name: fresh?.name, aliases: base.aliases ?? [], ...base };
                    // Its own entry replaces what a mention elsewhere gave it.
                    const ownOverMention = p.own && heldFromMention(getEntryMeta(settingId, targetId), p.entry);
                    const patch = ownOverMention ? ownOver(have, p.values).patch : blanksOnly(have, p.values);
                    if (Object.keys(patch).length && !await updateEntry(chatId, settingId, targetId, patch)) throw new Error('State Engine refused the change');
                    if (!created.has(key) || p.matchId) {
                        const before = Object.fromEntries(Object.keys(patch).map((k) => [k, structuredClone(base[k] ?? (Array.isArray(patch[k]) ? [] : ''))]));
                        record.filled.push({ id: targetId, name: fresh?.name ?? p.name, before, parentBefore: parentsBefore[targetId] ?? null });
                    }
                    const meta = { ...(job.options.canonLock ? { canonLocked: true } : {}) };
                    if (!getEntryMeta(settingId, targetId).source || ownOverMention) meta.source = p.entry.source;
                    setEntryMeta(settingId, targetId, meta);
                    summary.filled += 1;
                    if (p.locatedIn && p.type === 'location') places.push([targetId, p.locatedIn]);
                    p.appliedId = targetId;
                } else {
                    const obj = await createEntry(chatId, settingId, p.type, { name: p.name, ...p.values }, { origin: 'import', source: p.entry.source, canonLocked: job.options.canonLock === true });
                    if (!obj) throw new Error('State Engine refused to create it');
                    created.set(key, obj.id);
                    record.created.push({ id: obj.id, type: p.type, name: p.name });
                    summary.created += 1;
                    if (p.locatedIn && p.type === 'location') places.push([obj.id, p.locatedIn]);
                    p.appliedId = obj.id;
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
        // Relationships last too: the other side may be new in this import.
        const withRelations = kept.filter((p) => p.applied && p.relations?.length);
        if (withRelations.length) {
            const everything = await settingObjects(chatId, settingId);
            for (const p of withRelations) {
                for (const r of p.relations) {
                    const other = everything.find((o) => o.id !== p.appliedId && [o.name, ...(o.aliases ?? [])].some((n) => lower(n) === lower(r.name)));
                    if (!other) continue;
                    const stored = addRelation(settingId, { from: p.appliedId, to: other.id, kind: r.kind, note: `from the lorebook entry "${p.entry.title}"` });
                    if (stored) {
                        record.relations = [...(record.relations ?? []), stored.id];
                        summary.related = (summary.related ?? 0) + 1;
                    }
                }
            }
        }
        if (job.options.canonOnly) setCanonOnly(settingId, true);
        if (record.created.length || record.filled.length || record.relations?.length) {
            updateSettingDoc(settingId, (d) => { d.imports = [...d.imports, record]; });
            job.importId = record.id;
        }
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

