// Content generation - the runner (spec 6.4): gathers the context a
// generation needs from the setting (SB-131: overview, neighbours in the
// location tree, linked entries, existing names, Archivist memories, GM
// notes marked as such - SB-135), calls the model (src/generate/llm.js),
// and returns field values that fit the object's fields (SB-132).
//
// Nothing here writes to the library: results go into the sheet's edit
// draft, where the user sees, changes and saves them - generation is a
// proposal (SB-133). Canon gates (canon-only setting, canon-locked entry)
// are checked first (library.mayAddGeneratedDetail).

import { getSettings } from '../settings.js';
import { getChatDoc } from '../store/chat-store.js';
import { getObjectTypes, getParents, getOverview, getPlaceOverview, isCanonOnly, mayAddGeneratedDetail } from '../library/library.js';
import { getEntryMeta } from '../store/setting-store.js';
import { pathOf, childrenOf } from '../library/hierarchy.js';
import { relationsOf } from '../library/relations.js';
import { buildGenerationPrompt, parseGenerationResponse, buildOverviewPrompt, parseOverviewResponse, groundRefs } from './prompt.js';
import { callModel } from './llm.js';
import { storyRelationships, relationshipLine } from '../library/story-relations.js';
import { relationsFor, pairCovered, authoredLine } from '../library/relations-edit.js';
import { getSettingDoc } from '../store/setting-store.js';
import { useStateEngineJsonParser } from './json.js';
import { LOG_PREFIX } from '../constants.js';

const lower = (s) => String(s ?? '').trim().toLowerCase();

// Whether generation may touch this entry. -> { ok, reason }
export function canGenerateFor(settingId, entryId) {
    if (!entryId || entryId === 'new') return { ok: true, reason: '' };
    if (mayAddGeneratedDetail(settingId, entryId)) return { ok: true, reason: '' };
    return {
        ok: false,
        reason: isCanonOnly(settingId) ? 'This setting is canon-only - turn that off on the front page to generate detail.' : 'This entry is canon-locked - unlock it in GM notes to generate detail.',
    };
}

// The entries an entry's per-chat state and starting values point at - a
// location's Factions, a character's runtime factions: [{ field, ids }].
// Those live outside its base record, where relationsOf() looks.
export function runtimeRefs(entry) {
    const out = [];
    const seen = new Set();
    for (const values of [entry?.runtime?.values, entry?.startValues ?? entry?.base?.startValues]) {
        for (const [field, value] of Object.entries(values ?? {})) {
            const ids = (Array.isArray(value) ? value : [value]).filter((v) => typeof v === 'string' && /^[a-z]{3}_[\w-]+$/.test(v) && !seen.has(`${field}|${v}`));
            for (const id of ids) seen.add(`${field}|${id}`);
            if (ids.length) out.push({ field, ids });
        }
    }
    return out;
}

const fieldLabel = (field) => field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');

// Related entries as prompt context, the most direct first: what the
// entry points at and what points at it (its fields, its per-chat state
// such as a location's Factions, its starting values), then the places
// around it. The prompt shows the first 16, so direct ties are never
// crowded out by a long list of neighbouring places.
export function neighboursOf(entry, all, parents, parentId) {
    const allEntries = Object.values(all).flat();
    const byId = new Map(allEntries.map((e) => [e.id, e]));
    const out = [];
    const add = (id, relation) => {
        const e = byId.get(id);
        if (e && e.id !== entry?.id && !out.some((o) => o.name === e.name)) out.push({ relation, type: e.type, name: e.name, description: e.description ?? e.base?.description ?? '' });
    };
    if (entry?.id) {
        const rel = relationsOf(entry, allEntries, parents);
        for (const o of rel.outgoing) for (const id of o.ids) add(id, o.label);
        for (const r of runtimeRefs(entry)) for (const id of r.ids) add(id, fieldLabel(r.field));
        for (const r of rel.incoming) add(r.id, `${r.label} of`);
        for (const id of rel.children) add(id, 'Inside it');
    }
    const locationIds = (all.location ?? []).map((e) => e.id);
    const placeId = entry?.id && entry.type === 'location' ? entry.id : parentId;
    if (placeId) {
        const path = pathOf(parents, placeId);
        const up = entry?.id === placeId ? path.slice(0, -1) : path;
        for (const id of [...up].reverse()) add(id, 'Inside');
        const parent = entry?.id === placeId ? parents[placeId] : placeId;
        if (parent) for (const id of childrenOf(parents, locationIds, parent)) add(id, 'Nearby');
    }
    return out;
}

// The place an entry belongs to, as prompt context (SB-131): the places it
// is inside, nearest first, with their descriptions, and the factions tied
// to them (a faction whose fields hold one of those places, one a place's
// own fields or per-chat state name, or one the user related to it). A new
// room of a fortress that fights the death god must not come out as a haven
// for the death god's minions. -> { path: [{ name, description }],
// factions: [{ name, description }] } or null.
export function placeContext(placeId, all, parents, relations = []) {
    if (!placeId) return null;
    const allEntries = Object.values(all).flat();
    const byId = new Map(allEntries.map((e) => [e.id, e]));
    const pathIds = [...pathOf(parents, placeId)].reverse().slice(0, 3);
    const inPath = new Set(pathIds);
    const path = pathIds.map((id) => byId.get(id)).filter(Boolean).map((e) => ({ name: e.name, description: e.description ?? e.base?.description ?? '' }));
    if (!path.length) return null;
    const factionIds = new Set();
    for (const f of all.faction ?? []) {
        const record = f.base ?? f;
        if (Object.entries(record).some(([k, v]) => k !== 'id' && (Array.isArray(v) ? v : [v]).some((x) => inPath.has(x)))) factionIds.add(f.id);
    }
    for (const id of pathIds) {
        const place = byId.get(id);
        for (const r of runtimeRefs(place)) for (const ref of r.ids) if (byId.get(ref)?.type === 'faction') factionIds.add(ref);
        const record = place?.base ?? place ?? {};
        for (const v of Object.values(record)) for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string' && byId.get(x)?.type === 'faction') factionIds.add(x);
    }
    for (const r of relations ?? []) {
        if (inPath.has(r.from) && byId.get(r.to)?.type === 'faction') factionIds.add(r.to);
        if (inPath.has(r.to) && byId.get(r.from)?.type === 'faction') factionIds.add(r.from);
    }
    const factions = [...factionIds].map((id) => byId.get(id)).filter(Boolean).slice(0, 4).map((f) => ({ name: f.name, description: f.description ?? f.base?.description ?? '' }));
    return { path, factions };
}

// Generates for one entry of `type`.
//   task: 'field' | 'fill' | 'enrich' | 'create'
//   ctx: { chatId, chatKey, settingId }
//   fields: the type's field defs (editor kinds: { name, label, kind, values, refType })
//   entry: the saved entry or null (new); draft: { name, aliases, description, fields }
//   all: { typeId: entries[] }; targetField; brief; parentId
// -> { values, dropped } (values: name?, description?, aliases?, and type fields)
// Throws with a readable reason.
export async function generateEntry({ task, type, ctx, fields, entry = null, draft = null, all, targetField = null, brief = '', parentId = null }) {
    const gate = canGenerateFor(ctx.settingId, entry?.id);
    if (!gate.ok) throw new Error(gate.reason);

    const settings = getSettings();
    const parents = getParents(ctx.settingId);
    const allEntries = Object.values(all).flat();
    const nameOfId = new Map(allEntries.map((e) => [e.id, e.name]));
    const refTypes = [...new Set(fields.filter((f) => f.kind === 'ref' || f.kind === 'refs').map((f) => f.refType))];
    const refNames = Object.fromEntries(refTypes.map((t) => [t, (all[t] ?? []).filter((e) => e.id !== entry?.id).map((e) => e.name)]));

    let memories = [];
    if (entry?.id && window.StateEngineArchivist?.getMemoriesForEntity) {
        try {
            const rank = { high: 0, medium: 1, low: 2 };
            memories = (window.StateEngineArchivist.getMemoriesForEntity(entry.id) ?? [])
                .sort((a, b) => (rank[a.importance] ?? 3) - (rank[b.importance] ?? 3)).map((m) => m.text).filter(Boolean);
        } catch {
            memories = [];
        }
    }

    // Relationships as context: the user's own first, then the story's
    // (Archivist) for pairs the user has not written.
    if (entry?.id) {
        const authored = getSettingDoc(ctx.settingId).relations;
        for (const r of relationsFor(entry.id, authored)) memories.push(authoredLine(entry.name, nameOfId.get(r.otherId) ?? 'someone', r));
        const story = (await storyRelationships(entry)).filter((x) => !(x.otherId && pairCovered(entry.id, x.otherId, authored)));
        for (const r of story.slice(0, 10)) memories.push(relationshipLine(entry.name, r));
    }

    const values = draft ? { description: draft.description, aliases: draft.aliases, ...draft.fields } : {};
    // The place it is in: the chosen parent; a saved location's own parent
    // (enriching an existing room keeps its fortress in view); another
    // entry's location field.
    const parentForPrompt = parentId || (type.id === 'location' ? (entry?.id ? parents[entry.id] ?? null : null) : (draft?.fields?.location ?? entry?.base?.location ?? entry?.location ?? null));
    const base = {
        type, fields, brief,
        // The world as it holds where the entry is: a place's own realm, or
        // the place an entry lies in (a planet at TL12, a dead-magic zone).
        overview: getPlaceOverview(ctx.settingId, type.id === 'location' ? (entry?.id ?? parentId) : (parentForPrompt ?? entry?.base?.location ?? entry?.location ?? null)),
        neighbours: neighboursOf(entry, all, parents, parentId),
        similarNames: (all[type.id] ?? []).filter((e) => e.id !== entry?.id).map((e) => e.name),
        memories,
        gmNotes: entry?.id ? getEntryMeta(ctx.settingId, entry.id).gmNotes : '',
        refNames,
        nameOf: (id) => nameOfId.get(id) ?? id,
        detail: settings.generation.detail,
        parentName: parentForPrompt ? pathOf(parents, parentForPrompt).map((id) => nameOfId.get(id)).filter(Boolean).join(' › ') || nameOfId.get(parentForPrompt) : '',
        creating: task === 'create',
        relationNames: allEntries.filter((e) => e.id !== entry?.id).map((e) => e.name).slice(0, 25),
        place: placeContext(parentForPrompt, all, parents, getSettingDoc(ctx.settingId).relations),
    };
    const narrative = entry?.id ? getChatDoc(ctx.chatKey).narrative[entry.id]?.text ?? '' : '';
    const promptWith = (t, field, name, vals) => buildGenerationPrompt({ ...base, task: t, targetField: field, entry: { name, values: vals, narrative } });
    const prompt = promptWith(task, targetField, draft?.name ?? entry?.name ?? '', values);
    if (!prompt.keys.length) throw new Error('Every field already has content - try Enrich instead.');

    const refLookup = (typeId, name) => {
        const hit = (all[typeId] ?? []).find((e) => [e.name, ...(e.aliases ?? [])].some((n) => lower(n) === lower(name)));
        return hit?.id ?? null;
    };
    await useStateEngineJsonParser();
    const read = (p, text) => parseGenerationResponse(text, { fields: [...fields, { name: 'relations', label: 'Relations', kind: 'raw' }], keys: p.keys, refLookup, plain: p.plain });
    let result = await askReliably(prompt, read, settings.generation.maxTokens);

    // Several fields in one JSON answer failed even after a retry: write
    // them one at a time as plain text - what small models do best. Each
    // field sees the ones written before it.
    if (result.error && !prompt.plain && prompt.keys.length > 1) {
        console.info(LOG_PREFIX, 'the JSON answer could not be read - writing the fields one at a time');
        let name = draft?.name ?? entry?.name ?? '';
        const vals = { ...values };
        const got = {};
        const dropped = [];
        for (const key of prompt.keys.filter((k) => k !== 'relations')) {
            const p = promptWith('field', key, name, vals);
            const r = await askReliably(p, read, settings.generation.maxTokens);
            dropped.push(...r.dropped);
            if (r.error) continue;
            Object.assign(got, r.values);
            if (key === 'name') name = r.values.name ?? name;
            else Object.assign(vals, r.values);
        }
        result = Object.keys(got).length ? { values: got, dropped, error: null } : { values: {}, dropped, error: result.error };
    }
    if (result.error) throw new Error(`${result.error} (asked twice, then field by field - try a larger model in the drawer's Generation settings)`);
    // A reference the model picked must be tied to the entry by something:
    // already there, a related entry, or named in what it is (its text,
    // the user's direction, the story's memories, the GM notes) - never a
    // name picked off the list to fill it (a faction's members).
    const grounded = groundRefs(result.values, fields, {
        existing: values,
        relatedNames: base.neighbours.map((n) => n.name),
        text: [result.values.description, values.description, ...fields.filter((f) => f.kind !== 'ref' && f.kind !== 'refs').map((f) => result.values[f.name] ?? values[f.name]), brief, ...memories, base.gmNotes, draft?.name ?? entry?.name].filter((t) => typeof t === 'string').join('\n'),
        nameOf: (id) => nameOfId.get(id) ?? '',
    });
    result.values = grounded.values;
    result.dropped = [...(result.dropped ?? []), ...grounded.dropped];
    // Relationships to existing entries, by name (at most three).
    if (result.values.relations !== undefined) {
        const list = Array.isArray(result.values.relations) ? result.values.relations : [];
        result.values.relations = list.map((r) => {
            const name = typeof r === 'string' ? r : r?.name;
            const other = allEntries.find((e) => e.id !== entry?.id && [e.name, ...(e.aliases ?? [])].some((n) => lower(n) === lower(name)));
            return other ? { otherId: other.id, name: other.name, kind: String((typeof r === 'object' && r?.kind) || 'knows').toLowerCase().slice(0, 40) } : null;
        }).filter(Boolean).slice(0, 3);
    }
    return { values: result.values, dropped: result.dropped };
}

// One prompt, read; if unreadable, asked once more with the reason. ->
// the parse result (error set when both answers failed).
export async function askReliably(prompt, read, maxTokens) {
    const messages = [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }];
    const first = await callModel(messages, maxTokens);
    const parsed = read(prompt, first);
    if (!parsed.error) return parsed;
    console.info(LOG_PREFIX, `generation answer unreadable (${parsed.error}) - asking again`);
    const nudge = prompt.plain
        ? 'That reply could not be used. Reply again with ONLY the text for the field - no JSON, no labels, no commentary.'
        : `That reply could not be read (${parsed.error}). Reply again with ONLY the complete JSON object from the template - start with { and end with }, nothing else.`;
    const second = await callModel([...messages, { role: 'assistant', content: String(first ?? '').slice(0, 4000) }, { role: 'user', content: nudge }], maxTokens);
    const again = read(prompt, second);
    return again.error ? { ...again, error: parsed.error } : again;
}

// Generates front-page text (premise, rules) from the dropdown choices and
// what the setting already holds. -> { values }
export async function generateOverview({ ctx, fields, overview, all, brief = '' }) {
    const types = await getObjectTypes();
    const contents = types.map((t) => ({ type: t.plural.toLowerCase(), names: (all?.[t.id] ?? []).map((e) => e.name) }));
    const settings = getSettings();
    const prompt = buildOverviewPrompt({ fields, overview: overview ?? getOverview(ctx.settingId), contents, detail: settings.generation.detail, brief });
    await useStateEngineJsonParser();
    const read = (p, text) => ({ dropped: [], ...parseOverviewResponse(text, p.keys, { plain: p.plain }) });
    let result = await askReliably(prompt, read, settings.generation.maxTokens);
    if (result.error && fields.length > 1) {
        const draft = structuredClone(overview ?? getOverview(ctx.settingId));
        const got = {};
        for (const f of fields) {
            const r = await askReliably(buildOverviewPrompt({ fields: [f], overview: draft, contents, detail: settings.generation.detail, brief }), read, settings.generation.maxTokens);
            if (r.error) continue;
            Object.assign(got, r.values);
            if (f === 'magicNotes') draft.magic.notes = r.values[f];
            else if (f === 'techNotes') draft.tech.notes = r.values[f];
            else draft[f] = r.values[f];
        }
        result = Object.keys(got).length ? { values: got, error: null } : result;
    }
    if (result.error) throw new Error(`${result.error} (asked twice, then section by section - try a larger model in the drawer's Generation settings)`);
    return { values: result.values };
}
