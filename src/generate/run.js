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
import { getObjectTypes, getParents, getOverview, isCanonOnly, mayAddGeneratedDetail } from '../library/library.js';
import { getEntryMeta } from '../store/setting-store.js';
import { pathOf, childrenOf } from '../library/hierarchy.js';
import { relationsOf } from '../library/relations.js';
import { buildGenerationPrompt, parseGenerationResponse, buildOverviewPrompt, parseOverviewResponse } from './prompt.js';
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

// Related entries as prompt context, nearest first.
function neighboursOf(entry, all, parents, parentId) {
    const allEntries = Object.values(all).flat();
    const byId = new Map(allEntries.map((e) => [e.id, e]));
    const out = [];
    const add = (id, relation) => {
        const e = byId.get(id);
        if (e && e.id !== entry?.id && !out.some((o) => o.name === e.name)) out.push({ relation, type: e.type, name: e.name, description: e.description ?? '' });
    };
    const locationIds = (all.location ?? []).map((e) => e.id);
    const placeId = entry?.id && entry.type === 'location' ? entry.id : parentId;
    if (placeId) {
        const path = pathOf(parents, placeId);
        const up = entry?.id === placeId ? path.slice(0, -1) : path;
        for (const id of [...up].reverse()) add(id, 'Inside');
        const parent = entry?.id === placeId ? parents[placeId] : placeId;
        if (parent) for (const id of childrenOf(parents, locationIds, parent)) add(id, 'Nearby');
    }
    if (entry?.id) {
        const rel = relationsOf(entry, allEntries, parents);
        for (const id of rel.children) add(id, 'Inside it');
        for (const o of rel.outgoing) for (const id of o.ids) add(id, o.label);
        for (const r of rel.incoming) add(r.id, `${r.label} of`);
    }
    return out;
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
    const parentForPrompt = parentId || (type.id === 'location' ? null : (draft?.fields?.location ?? null));
    const base = {
        type, fields, brief,
        overview: getOverview(ctx.settingId),
        neighbours: neighboursOf(entry, all, parents, parentId),
        similarNames: (all[type.id] ?? []).filter((e) => e.id !== entry?.id).map((e) => e.name),
        memories,
        gmNotes: entry?.id ? getEntryMeta(ctx.settingId, entry.id).gmNotes : '',
        refNames,
        nameOf: (id) => nameOfId.get(id) ?? id,
        detail: settings.generation.detail,
        parentName: parentForPrompt ? pathOf(parents, parentForPrompt).map((id) => nameOfId.get(id)).filter(Boolean).join(' › ') || nameOfId.get(parentForPrompt) : '',
        creating: task === 'create',
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
    const read = (p, text) => parseGenerationResponse(text, { fields, keys: p.keys, refLookup, plain: p.plain });
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
        for (const key of prompt.keys) {
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
