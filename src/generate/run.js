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
import { getObjectTypes, getParents, getOverview, getPlaceOverview, isCanonOnly, mayAddGeneratedDetail, playerIdOf } from '../library/library.js';
import { getEntryMeta } from '../store/setting-store.js';
import { pathOf, childrenOf } from '../library/hierarchy.js';
import { relationsOf } from '../library/relations.js';
import { buildGenerationPrompt, parseGenerationResponse, buildOverviewPrompt, parseOverviewResponse, groundRefs, buildAliasPrompt, readAlias } from './prompt.js';
import { genderFrom } from '../naming/classify.js';
import { callModel } from './llm.js';
import { storyRelationships, relationshipLine } from '../library/story-relations.js';
import { relationsFor, pairCovered, authoredLine } from '../library/relations-edit.js';
import { getSettingDoc } from '../store/setting-store.js';
import { useStateEngineJsonParser } from './json.js';
import { LOG_PREFIX } from '../constants.js';
import { rollNameFor, namePoolFor } from '../naming/run.js';
import { PROMPT_CLICHES } from '../naming/registry.js';
import { parentFrame, surpriseKind, placeRuleFor } from './fit-place.js';
import { isLaterAge } from '../library/world-options.js';
import { bloodlinesOf, choicesOf, decideLineage, namesOfLineage, lineageOf, lineageBriefLine, populationBriefLine, mixFor, viewsAt } from '../library/bloodlines.js';
import { BLOODLINE_PRESETS } from '../library/bloodline-presets.js';
import { briefMemberships, memberKindOf } from '../library/faction-sync.js';

// Every kind-of-being word the presets know, for spotting one a brief names
// that the world has no bloodline for - not those that are also plain words
// ("a giant of a man", "a witch hunter").
const PRESET_WORDS = BLOODLINE_PRESETS.map((p) => p.singular).filter((w) => !['human', 'giant', 'witch', 'spacer', 'uplift'].includes(w));

// What a generation knows of bloodlines (docs/DESIGN - BLOODLINES.md,
// phase 2): a new character's bloodline - chosen, named in the brief, or
// rolled from the mix where they will be - and the culture it names them
// in; a saved character's own; and, for a place or faction, who lives
// there. Nothing when the world has no bloodlines.
// -> { ids, how, unknown, cultureId, familyCulture, line, populationLine }
// familyCulture: { id } when mixed heritage names them from both parents.
export function bloodlineContext({ settingId, type, task, entry = null, all, brief = '', placeId = null, factionIds = [], chosen = '', random = Math.random }) {
    const none = { ids: [], how: '', unknown: '', cultureId: '', familyCulture: null, line: '', populationLine: '' };
    const bloodlines = bloodlinesOf(all?.lore ?? []);
    if (!bloodlines.length) return none;
    const byId = Object.fromEntries(choicesOf(bloodlines).map((b) => [b.id, b]));
    const doc = getSettingDoc(settingId);
    const parents = getParents(settingId);
    const mixAtOf = (p, f) => mixFor({ world: doc.overview.population, parents, metaById: doc.entries, placeId: p, factionId: f });
    if (type.id === 'character') {
        const decided = task === 'create' && !entry?.id
            ? decideLineage({ chosen, brief, bloodlines, mix: mixAtOf(placeId, factionIds[0] ?? null).mix, extraWords: PRESET_WORDS, random })
            : { ...lineageOf(entry, bloodlines), how: 'own', unknown: '' };
        const names = namesOfLineage(decided.ids, byId, random);
        return { ...none, ids: decided.ids, how: decided.how, unknown: decided.unknown, cultureId: names.given, familyCulture: names.split ? { id: names.family } : null, line: lineageBriefLine(decided.ids, byId, decided.unknown) };
    }
    // How each bloodline is seen there (a place's own, else the one it is in).
    const views = (p) => viewsAt(doc.overview.population, parents, doc.entries, p);
    if (type.id === 'location') return { ...none, populationLine: populationBriefLine(mixAtOf(entry?.id ?? placeId, null), byId, doc.overview.population, views(entry?.id ?? placeId)) };
    if (type.id === 'faction') return { ...none, populationLine: populationBriefLine(mixAtOf(placeId, entry?.id ?? null), byId, doc.overview.population, views(placeId)) };
    return none;
}

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

// Whether `text` names `name` as a whole word (case aside).
const names = (text, name) => {
    const n = lower(name).trim();
    if (n.length < 3) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(lower(text));
};

// The sides an entry stands with, and how each stands with others: the
// factions its fields (or per-chat state) hold, those whose fields hold it,
// those it is authored a member of, and - for a new entry - those the
// user's idea names. A member of a faction shares its friends and enemies:
// without this a new member of the Iron Hand came out as the close
// confidant of the Iron Hand's rival. Pure.
//   fields: the draft's field values; relations: the setting's authored ones
// -> [{ id, name, description, ties: [{ otherId, line }] }] (at most three
//    sides, eight ties each)
export function sidesOf(entry, { fields = {}, brief = '', all, relations = [] }) {
    const allEntries = Object.values(all).flat();
    const byId = new Map(allEntries.map((e) => [e.id, e]));
    const isFaction = (id) => byId.get(id)?.type === 'faction';
    const ids = [];
    const add = (id) => { if (isFaction(id) && id !== entry?.id && !ids.includes(id)) ids.push(id); };
    // Not a field that sets it against a faction (its enemies, its target).
    const against = (field) => /rival|enem|oppos|hunt|target|against|war|hate|fear/i.test(field);
    for (const [k, v] of Object.entries({ ...(entry?.base ?? entry ?? {}), ...fields })) if (!against(k)) for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string') add(x);
    if (entry?.id) {
        for (const r of runtimeRefs(entry)) if (!against(r.field)) r.ids.forEach(add);
        for (const f of all.faction ?? []) if (Object.entries(f.base ?? f).some(([k, v]) => !against(k) && (Array.isArray(v) ? v : [v]).includes(entry.id))) add(f.id);
        for (const r of relationsFor(entry.id, relations)) if (/member|serves|works for|leads/.test(r.kind)) add(r.otherId);
    }
    if (brief) for (const f of all.faction ?? []) if ([f.name, ...(f.aliases ?? [])].some((n) => names(brief, n))) add(f.id);

    return ids.slice(0, 3).map((id) => {
        const side = byId.get(id);
        const ties = [];
        const tie = (otherId, line) => { if (otherId !== entry?.id && !ties.some((t) => t.line === line)) ties.push({ otherId, line }); };
        for (const r of relationsFor(id, relations)) if (byId.has(r.otherId)) tie(r.otherId, authoredLine(side.name, byId.get(r.otherId).name, r));
        // Link fields both ways: its leader and members, and a rival's "enemy of".
        const rel = relationsOf(side, allEntries);
        for (const o of rel.outgoing) for (const x of o.ids) tie(x, `${side.name} → ${byId.get(x).name}: ${fieldLabel(o.field)}`);
        for (const r of rel.incoming) tie(r.id, `${byId.get(r.id).name} → ${side.name}: ${fieldLabel(r.field)}`);
        return { id, name: side.name, description: side.description ?? side.base?.description ?? '', ties: ties.slice(0, 8) };
    });
}

// Generates for one entry of `type`.
//   task: 'field' | 'fill' | 'enrich' | 'create'
//   ctx: { chatId, chatKey, settingId }
//   fields: the type's field defs (editor kinds: { name, label, kind, values, refType })
//   entry: the saved entry or null (new); draft: { name, aliases, description, fields }
//   all: { typeId: entries[] }; targetField; brief; parentId
//   naming: { name, cultureId, gender, bloodlineId } - a name the user gave,
//     the culture and gender to roll one in (src/naming/), and the
//     bloodline the user picked for a new character
// -> { values, dropped, lineage: { ids, how, unknown } } (values: name?,
//    description?, aliases?, and type fields; lineage: a new character's
//    bloodline, decided here)
// Throws with a readable reason.
export async function generateEntry({ task, type, ctx, fields, entry = null, draft = null, all, targetField = null, brief = '', parentId = null, naming = {} }) {
    const gate = canGenerateFor(ctx.settingId, entry?.id);
    if (!gate.ok) throw new Error(gate.reason);

    // A name field is rolled by the name generator, not written by the
    // model - unless nothing it makes fits (a quest's title).
    if (task === 'field' && targetField === 'name') {
        const rolled = rollEntryName({ ctx, type, brief: [brief, draft?.description].filter(Boolean).join(' '), all, parentId, naming });
        if (rolled) return { values: { name: rolled }, dropped: [] };
    }

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

    // A new place inside a district, a town or a region fits what it is for
    // (src/generate/fit-place.js): a surprise there is given a fitting kind
    // (a nightclub on the Neon Mile, a bank on the corporate square), picked
    // here so the name and the model both start from it.
    const overview = getPlaceOverview(ctx.settingId, type.id === 'location' ? (entry?.id ?? parentId) : (parentForPrompt ?? entry?.base?.location ?? entry?.location ?? null));
    const parentEntry = type.id === 'location' && parentForPrompt ? allEntries.find((e) => e.id === parentForPrompt) : null;
    const frame = parentEntry ? parentFrame({ name: parentEntry.name, description: parentEntry.description ?? parentEntry.base?.description ?? '' }) : null;
    const siblings = parentEntry ? (all.location ?? []).filter((e) => e.id !== entry?.id && parents[e.id] === parentEntry.id).map((e) => ({ name: e.name, description: e.description ?? e.base?.description ?? '' })) : [];
    const picked = task === 'create' && frame?.purpose && !String(brief ?? '').trim() ? surpriseKind(frame, { later: isLaterAge(overview), siblings }) : '';

    // Names (docs/DESIGN - NAMING.md, 4.1): the one the user gave, then one
    // the brief gives, then one built from the entry it is tied to, then a
    // rolled one. The model is told the name; it does not make one up.
    // The factions its fields already tie it to: their culture names it.
    const factionIds = factionIdsOf(draft?.fields ?? entry?.base ?? {}, all);
    // A new character's bloodline is decided before the name, which its
    // culture shapes (docs/DESIGN - BLOODLINES.md, section 5).
    const kin = bloodlineContext({ settingId: ctx.settingId, type, task, entry, all, brief: picked || brief, placeId: parentForPrompt, factionIds, chosen: naming.bloodlineId ?? '' });
    const nameCulture = naming.cultureId || kin.cultureId;
    let fixedName = '';
    let nameMeaning = '';
    let nameFrom = null;
    let nameApart = '';
    if (task === 'create' && !(draft?.name ?? entry?.name)) {
        if (naming.name) fixedName = naming.name;
        else {
            const placeText = parentForPrompt ? pathOf(parents, parentForPrompt).map((id) => allEntries.find((e) => e.id === id)).filter(Boolean).map((e) => `${e.name} ${e.description ?? e.base?.description ?? ''}`).join(' ') : '';
            const plan = rollNameFor(ctx.settingId, { typeId: type.id, brief: picked || brief, purpose: frame?.purpose ?? '', cultureId: nameCulture, familyCulture: naming.cultureId ? null : kin.familyCulture, gender: naming.gender, hasParent: Boolean(parentForPrompt), placeText, placeId: parentForPrompt, factionIds }, all);
            nameApart = plan.apart ?? '';
            if (plan.mode === 'rolled' || plan.mode === 'given') {
                fixedName = plan.name;
                nameMeaning = plan.meaning;
            } else if (plan.mode === 'derived') nameFrom = { tie: plan.tie, candidates: plan.candidates };
        }
    }
    const placeCtx = placeContext(parentForPrompt, all, parents, getSettingDoc(ctx.settingId).relations);
    // Its side: the factions it is one of, and how each stands with others -
    // the user's ties, the link fields, then the story's for pairs not covered.
    const authored = getSettingDoc(ctx.settingId).relations;
    const sides = sidesOf(entry, { fields: draft?.fields ?? {}, brief, all, relations: authored });
    for (const side of sides) {
        const story = (await storyRelationships({ id: side.id, name: side.name })).filter((x) => !(x.otherId && pairCovered(side.id, x.otherId, authored)) && x.otherId !== entry?.id);
        for (const r of story.slice(0, Math.max(0, 8 - side.ties.length))) side.ties.push({ otherId: r.otherId, line: relationshipLine(side.name, r) });
    }
    // Those its side has ties to come first among the entries it may relate to.
    const tiedIds = new Set(sides.flatMap((s) => [s.id, ...s.ties.map((t) => t.otherId)]));
    const others = allEntries.filter((e) => e.id !== entry?.id);
    const namePool = namePoolFor(ctx.settingId, all, { cultureId: naming.cultureId, placeId: parentForPrompt, factionIds });
    const base = {
        fixedName, nameMeaning, nameFrom, nameApart, namePool, avoidNames: PROMPT_CLICHES,
        type, fields, brief,
        // The world as it holds where the entry is: a place's own realm, or
        // the place an entry lies in (a planet at TL12, a dead-magic zone).
        overview,
        surpriseKind: picked,
        neighbours: neighboursOf(entry, all, parents, parentId),
        similarNames: (all[type.id] ?? []).filter((e) => e.id !== entry?.id).map((e) => e.name),
        memories,
        gmNotes: entry?.id ? getEntryMeta(ctx.settingId, entry.id).gmNotes : '',
        refNames,
        nameOf: (id) => nameOfId.get(id) ?? id,
        detail: settings.generation.detail,
        parentName: parentForPrompt ? pathOf(parents, parentForPrompt).map((id) => nameOfId.get(id)).filter(Boolean).join(' › ') || nameOfId.get(parentForPrompt) : '',
        creating: task === 'create',
        relationNames: [...others.filter((e) => tiedIds.has(e.id)), ...others.filter((e) => !tiedIds.has(e.id))].map((e) => e.name).slice(0, 25),
        place: placeCtx,
        sides: sides.map((s) => ({ name: s.name, description: s.description, ties: s.ties.map((t) => t.line) })),
        // A place inside another: what that place is for, and whether what
        // is in it is its owners' (a fortress's rooms) or its own (a club on
        // the Neon Mile, not another Omicron site).
        placeRule: frame ? placeRuleFor(parentEntry.name, frame, { factions: (placeCtx?.factions ?? []).map((f) => f.name), siblings: siblings.map((s) => s.name) }) : '',
        // A quest is the heroes' own: who pursues it, so its objectives are
        // written from their side - never the side they fight.
        questSide: type.id === 'quest' ? questSide(entry, all, ctx.settingId, nameOfId) : null,
        // A character's bloodline, and who lives where a place or faction is.
        bloodlineLine: kin.line,
        populationLine: kin.populationLine,
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
        let name = draft?.name ?? entry?.name ?? fixedName;
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
    if (fixedName) result.values.name = fixedName;
    // Relationships to existing entries, by name (at most three).
    if (result.values.relations !== undefined) {
        const list = Array.isArray(result.values.relations) ? result.values.relations : [];
        result.values.relations = list.map((r) => {
            const name = typeof r === 'string' ? r : r?.name;
            const other = allEntries.find((e) => e.id !== entry?.id && [e.name, ...(e.aliases ?? [])].some((n) => lower(n) === lower(name)));
            return other ? { otherId: other.id, name: other.name, kind: String((typeof r === 'object' && r?.kind) || 'knows').toLowerCase().slice(0, 40) } : null;
        }).filter(Boolean).slice(0, 3);
    }
    if (task === 'create' && type.id === 'character') {
        const joined = withMemberships(result.values.relations ?? [], brief, all.faction ?? []);
        if (joined.length) result.values.relations = joined;
    }
    return { values: result.values, dropped: result.dropped, lineage: { ids: kin.ids, how: kin.how, unknown: kin.unknown } };
}

// A new character's relationships with its factions made memberships: the
// ones the user's idea gives ("the boss of the Iron Hand") come first and
// replace what the model wrote for that faction, and the model's own words
// for belonging ("enforcer for") become a kind that counts as membership
// (src/library/faction-sync.js MEMBER_KINDS). Pure.
//   relations: [{ otherId, name, kind }]
export function withMemberships(relations, brief, factions) {
    const factionIds = new Set((factions ?? []).map((f) => f.id));
    const given = briefMemberships(brief, factions).map((m) => ({ otherId: m.id, name: m.name, kind: m.kind }));
    const own = (relations ?? []).filter((r) => !given.some((g) => g.otherId === r.otherId))
        .map((r) => (factionIds.has(r.otherId) ? { ...r, kind: memberKindOf(r.kind) ?? r.kind } : r));
    return [...given, ...own].slice(0, Math.max(3, given.length));
}

// The faction ids among an entry's field values.
function factionIdsOf(fields, all) {
    const ids = new Set((all.faction ?? []).map((f) => f.id));
    return Object.values(fields ?? {}).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v) => typeof v === 'string' && ids.has(v));
}

// A name for a new entry from the name generator, without the model: the
// one the brief gives, one built from the entry it is tied to, or a rolled
// one. '' when none fits (a room, a quest). The Name dice and the Name
// field's generation use it.
// naming.lineage: a character's bloodline ids - their culture names them.
export function rollEntryName({ ctx, type, brief = '', all, parentId = null, naming = {}, fields = {} }) {
    const byId = Object.fromEntries(choicesOf(bloodlinesOf(all?.lore ?? [])).map((b) => [b.id, b]));
    // Mixed heritage: the given name from one parent's culture, the family name from the other's.
    const names = type.id === 'character' && !naming.cultureId ? namesOfLineage(naming.lineage ?? [], byId) : { given: '', split: false };
    const cultureId = naming.cultureId || names.given;
    const plan = rollNameFor(ctx.settingId, { typeId: type.id, brief, cultureId, familyCulture: names.split ? { id: names.family } : null, gender: naming.gender, hasParent: Boolean(parentId), placeId: parentId || (typeof fields.location === 'string' ? fields.location : null), factionIds: factionIdsOf(fields, all) }, all);
    if (plan.mode === 'rolled' || plan.mode === 'given') return plan.name;
    return plan.mode === 'derived' ? plan.candidates[0] : '';
}

// A new other name for a character (src/library/alias-kinds.js): a
// codename or stage name rolled by the name generator; a nickname or title
// written by the model from who they are. draft: the sheet's draft.
// -> the alias, or '' when nothing fitting came out. Throws (model) with a
// readable reason.
export async function generateAlias({ ctx, type, entry = null, draft, kind, all }) {
    const name = draft?.name || entry?.name || '';
    const existing = draft?.aliases ?? entry?.aliases ?? [];
    if (kind === 'codename' || kind === 'stage') {
        const text = [draft?.description, draft?.fields?.background].filter((t) => typeof t === 'string').join(' ');
        const fields = draft?.fields ?? {};
        const plan = rollNameFor(ctx.settingId, { typeId: type.id, kindInfo: kind === 'codename' ? { kind: 'codename' } : { kind: 'person', gender: genderFrom(text) }, placeId: typeof fields.location === 'string' ? fields.location : null, factionIds: factionIdsOf(fields, all) }, all);
        return plan.mode === 'rolled' ? plan.name : '';
    }
    const gate = canGenerateFor(ctx.settingId, entry?.id);
    if (!gate.ok) throw new Error(gate.reason);
    let memories = [];
    if (entry?.id && window.StateEngineArchivist?.getMemoriesForEntity) {
        try {
            memories = (window.StateEngineArchivist.getMemoriesForEntity(entry.id) ?? []).map((m) => m.text).filter(Boolean);
        } catch {
            memories = [];
        }
    }
    const fieldText = Object.fromEntries(Object.entries(draft?.fields ?? {}).filter(([, v]) => typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'))));
    const taken = Object.values(all).flat().filter((e) => e.id !== entry?.id).flatMap((e) => [e.name, ...(e.aliases ?? [])]).filter(Boolean);
    const prompt = buildAliasPrompt({ kind, name, values: { description: draft?.description ?? '', ...fieldText }, overview: getOverview(ctx.settingId), memories, existing, taken, avoidNames: PROMPT_CLICHES });
    const read = (p, text) => {
        const alias = readAlias(text);
        return alias ? { values: { alias }, dropped: [], error: null } : { values: {}, dropped: [], error: 'the answer was not a short name' };
    };
    const result = await askReliably(prompt, read, 200);
    if (result.error) throw new Error(result.error);
    return result.values.alias;
}

// One prompt, read; if unreadable, asked once more with the reason. ->
// the parse result (error set when both answers failed).
// Who pursues a quest: the player character, and the people the quest is
// tied to. -> { player, with: [name] }
function questSide(entry, all, settingId, nameOfId) {
    const characters = all.character ?? [];
    const playerId = playerIdOf(settingId, characters);
    const player = characters.find((c) => c.id === playerId)?.name ?? '';
    const tied = (entry?.related_entity_ids ?? entry?.base?.related_entity_ids ?? [])
        .filter((id) => id !== playerId && characters.some((c) => c.id === id))
        .map((id) => nameOfId.get(id)).filter(Boolean);
    return { player, with: tied.slice(0, 6) };
}

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
