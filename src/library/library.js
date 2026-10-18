// The library (spec section 6): the setting's State Engine objects plus
// Scenario Builder's own organisation metadata. Every entry IS a State
// Engine object (SB-011, SB-100) - created, edited and deleted only through
// the Object API (src/api/objects.js). Metadata (location parents, GM notes,
// tags, environment) is kept per setting in src/store/setting-store.js,
// keyed by object id.
//
// The setting is whatever State Engine assigns the chat (SB-600, SB-605):
// Scenario Builder never asks for one of its own.

import { LOG_PREFIX } from '../constants.js';
import * as se from '../api/objects.js';
import { getSettingDoc, updateSettingDoc, getEntryMeta } from '../store/setting-store.js';
import { wouldCreateCycle, parentsAfterDelete, pathOf } from './hierarchy.js';
import { placeOverview } from './world-options.js';
import { normalizeKnowledgeItem, authoredKnowledge, storyKnowledge } from './knowledge.js';

// ---- types

let typesCache = null;

// State Engine's type registry (SB-100: its ids, prefixes, colours, icons -
// never Scenario Builder's own).
export async function getObjectTypes() {
    typesCache ??= await se.listObjectTypes();
    return typesCache;
}

export async function getObjectType(typeId) {
    return (await getObjectTypes()).find((t) => t.id === typeId) ?? null;
}

// The catalog's chapter names (spec 6.1).
export const CHAPTER_LABELS = Object.freeze({
    character: 'Characters', location: 'Locations', faction: 'Factions', item: 'Items', creature: 'Creatures',
    lore: 'Lore', quest: 'Quests', scene: 'Scenes', event: 'Events',
});

// ---- the bound setting

// The chat's State Engine setting id, without asking - the Default setting
// until the chat has chosen one (as State Engine itself treats it).
export async function getBoundSettingId(chatId) {
    if (!chatId) return null;
    const chosen = await se.getChatSetting(chatId);
    if (chosen) return chosen;
    const settings = await se.listSettings();
    return settings.find((s) => s.isDefault)?.id ?? settings[0]?.id ?? null;
}

// The chat's setting id, letting State Engine ask the user once when the
// chat has none yet (SB-600: ensureChatSetting).
export async function ensureBoundSetting(chatId) {
    if (!chatId) return null;
    return se.ensureChatSetting(chatId);
}

export async function getSettingSummary(settingId) {
    return settingId ? se.getSetting(settingId) : null;
}

export async function listAllSettings() {
    return se.listSettings();
}

// Switches the chat to another setting (SB-605), through State Engine.
export async function switchSetting(chatId, settingId) {
    return se.setChatSetting(chatId, settingId);
}

// ---- entries

// The library entries of one type for a chat: a world type's canonical
// objects in the setting, or a story type's objects in the chat - each with
// its Scenario Builder metadata under `meta`.
export async function listEntries(chatId, settingId, typeId) {
    const type = await getObjectType(typeId);
    if (!type) return [];
    const objects = type.scope === 'world'
        ? await se.listObjects(chatId, typeId, { settingId })
        : await se.listObjects(chatId, typeId);
    const doc = getSettingDoc(settingId);
    return objects.map((o) => ({ ...o, meta: doc.entries[o.id] ?? getEntryMeta(settingId, o.id) }));
}

// Objects of a type the chat met that are not in the library yet
// (unconfirmed chat objects) - the raw material of candidates.
export async function listUnconfirmed(chatId, typeId) {
    const type = await getObjectType(typeId);
    if (!type || type.scope !== 'world') return [];
    return (await se.listObjects(chatId, typeId)).filter((o) => o.scope === 'chat' && o.confirmed === false);
}

export async function getEntry(chatId, settingId, id) {
    const obj = await se.getObject(chatId, id);
    if (!obj) return null;
    return { ...obj, meta: getEntryMeta(settingId, id) };
}

const nameKey = (name) => String(name ?? '').toLowerCase().replace(/[’']s$/, '').replace(/["'’]/g, '').replace(/\s+/g, ' ').trim();

// Library entries of the type whose name or an alias matches `name` -
// the duplicate guard (SB-137).
export async function findSimilar(chatId, settingId, typeId, name) {
    const key = nameKey(name);
    if (!key) return [];
    const entries = await listEntries(chatId, settingId, typeId);
    return entries.filter((e) => [e.name, ...(e.aliases ?? [])].some((n) => {
        const other = nameKey(n);
        return other === key || (other.length > 3 && key.length > 3 && (other.includes(key) || key.includes(other)));
    }));
}

// Creates a library entry: a canonical object in the setting (world types)
// or a chat object (story types). `data`: { name, description?, aliases?,
// ...type fields }. `meta`: initial metadata (e.g. { parentId }).
// Resolves to the created object, or null when State Engine refused.
export async function createEntry(chatId, settingId, typeId, data, meta = null) {
    const type = await getObjectType(typeId);
    if (!type) throw new Error(`unknown object type ${typeId}`);
    const created = type.scope === 'world'
        ? await se.createObject(settingId, typeId, data)
        : await se.createChatObject(chatId, typeId, data.name, data);
    if (created && meta) setEntryMeta(settingId, created.id, meta);
    // Made here, so intake (src/library/intake.js) never "takes it in" again.
    if (created && type.scope === 'world') updateSettingDoc(settingId, (doc) => { doc.tracked = [...doc.tracked, created.id]; });
    return created;
}

// Edits an entry's object fields through State Engine.
export async function updateEntry(chatId, settingId, id, patch) {
    const obj = await se.getObject(chatId, id);
    if (!obj) return null;
    const options = obj.scope === 'setting' ? { settingId: obj.settingId ?? settingId } : {};
    return se.updateObject(chatId, id, patch, options);
}

// Merges `patch` into an entry's Scenario Builder metadata. A parent change
// goes through setParent() instead (cycle check).
export function setEntryMeta(settingId, id, patch) {
    const { parentId, ...rest } = patch ?? {};
    updateSettingDoc(settingId, (doc) => {
        const current = doc.entries[id] ?? {};
        doc.entries[id] = { ...current, ...rest, environment: { ...(current.environment ?? {}), ...(rest.environment ?? {}) } };
    });
    if (parentId !== undefined) setParent(settingId, id, parentId);
}

// The setting's location parent map { id: parentId }.
export function getParents(settingId) {
    const doc = getSettingDoc(settingId);
    return Object.fromEntries(Object.entries(doc.entries).filter(([, m]) => m.parentId).map(([id, m]) => [id, m.parentId]));
}

// Re-parents a location (null = top level). Refuses a cycle (SB-140):
// returns false then.
export function setParent(settingId, id, parentId) {
    const parents = getParents(settingId);
    if (wouldCreateCycle(parents, id, parentId || null)) return false;
    updateSettingDoc(settingId, (doc) => {
        doc.entries[id] = { ...(doc.entries[id] ?? {}), parentId: parentId || null };
    });
    return true;
}

// Location path names, root first: ["Veylan", "Old Quarter", "Brass Market"].
export async function getLocationPathNames(chatId, settingId, id) {
    const names = [];
    for (const placeId of pathOf(getParents(settingId), id)) {
        const obj = await se.getObject(chatId, placeId);
        if (obj) names.push(obj.name);
    }
    return names;
}

// Everything that refers to `id`, for the confirmation before deleting it
// (SB-113): child locations, object fields holding it, and the open chat's
// canonical state. -> [{ kind, id?, name, detail }]
export async function findReferrers(chatId, settingId, id, canonical = null) {
    const out = [];
    const doc = getSettingDoc(settingId);
    for (const [childId, meta] of Object.entries(doc.entries)) {
        if (meta.parentId !== id) continue;
        const child = await se.getObject(chatId, childId);
        out.push({ kind: 'child', id: childId, name: child?.name ?? childId, detail: 'is inside it (will move up a level)' });
    }
    for (const type of await getObjectTypes()) {
        const objects = await listEntries(chatId, settingId, type.id);
        for (const obj of objects) {
            if (obj.id === id) continue;
            const fields = Object.entries(obj.base ?? obj).filter(([key, value]) => key !== 'id' && (value === id || (Array.isArray(value) && value.includes(id))));
            for (const [key] of fields) out.push({ kind: 'field', id: obj.id, name: obj.name, detail: key === 'related_entity_ids' ? 'lists it as related' : `refers to it in "${key}"` });
        }
    }
    if (canonical) {
        if (canonical.locationId === id) out.push({ kind: 'canonical', name: 'This chat', detail: 'is the current location' });
        if (canonical.castIds?.includes(id)) out.push({ kind: 'canonical', name: 'This chat', detail: 'is present in the scene' });
    }
    return out;
}

// Deletes an entry through State Engine (which removes it from every
// variable and reference), then repairs Scenario Builder's metadata: its
// children move up a level instead of being orphaned (SB-140), and it
// leaves every group.
export async function deleteEntry(chatId, settingId, id) {
    const obj = await se.getObject(chatId, id);
    const options = obj?.scope === 'setting' ? { settingId: obj.settingId ?? settingId } : {};
    const ok = await se.deleteObject(chatId, id, options);
    if (!ok) return false;
    const next = parentsAfterDelete(getParents(settingId), id);
    updateSettingDoc(settingId, (doc) => {
        delete doc.entries[id];
        for (const [childId, meta] of Object.entries(doc.entries)) {
            if (meta.parentId === id) meta.parentId = next[childId] ?? null;
        }
        for (const group of doc.groups) group.entryIds = group.entryIds.filter((e) => e !== id);
        delete doc.graph.positions[id];
    });
    return true;
}

// ---- the graph view

// Where the user dragged nodes: { [id]: { x, y } }.
export function getGraphPositions(settingId) {
    return getSettingDoc(settingId).graph.positions;
}

// Pins a node (null unpins it).
export function setGraphPosition(settingId, id, position) {
    updateSettingDoc(settingId, (doc) => {
        if (position) doc.graph.positions[id] = { x: Math.round(position.x), y: Math.round(position.y) };
        else delete doc.graph.positions[id];
    });
}

// Where places sit on the location map: { [id]: { x, y } }.
export function getMapPositions(settingId) {
    return getSettingDoc(settingId).graph.map ?? {};
}

export function setMapPosition(settingId, id, position) {
    updateSettingDoc(settingId, (doc) => {
        doc.graph.map ??= {};
        if (position) doc.graph.map[id] = { x: Math.round(position.x), y: Math.round(position.y) };
        else delete doc.graph.map[id];
    });
}

// Forgets every dragged position, so the layout starts fresh.
export function clearGraphPositions(settingId) {
    updateSettingDoc(settingId, (doc) => { doc.graph.positions = {}; });
}

// ---- overview

export function getOverview(settingId) {
    return getSettingDoc(settingId).overview;
}

// The overview as it holds in a place - its realm's kind of world, magic
// and technology, inherited down the tree (world-options.js placeOverview).
// The setting's own without a place.
export function getPlaceOverview(settingId, placeId) {
    const doc = getSettingDoc(settingId);
    return placeOverview(doc.overview, getParents(settingId), doc.entries, placeId || null);
}

export function setOverview(settingId, patch) {
    updateSettingDoc(settingId, (doc) => {
        doc.overview = { ...doc.overview, ...patch };
    });
}

// A canon-only setting (fixed canon, e.g. read from a published lorebook):
// generation never adds detail to its entries (when generation arrives -
// docs/ROADMAP.md), and what the story invents waits for review instead of
// being adopted.
// ---- the player character

// The character the user plays: the one marked on its sheet, else the one
// named like the SillyTavern persona. `characters`: the setting's
// character entries. -> id or ''.
export function playerIdOf(settingId, characters = []) {
    const marked = settingId ? getSettingDoc(settingId).playerId : '';
    if (marked && characters.some((c) => c.id === marked)) return marked;
    if (marked && !characters.length) return marked;
    const persona = String(SillyTavern.getContext().name1 ?? '').trim().toLowerCase();
    if (!persona) return '';
    return characters.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => String(n ?? '').trim().toLowerCase() === persona))?.id ?? '';
}

// Marks (or, with '', unmarks) the player character - one per setting.
export function setPlayerId(settingId, id) {
    updateSettingDoc(settingId, (doc) => { doc.playerId = id || ''; });
}

export function isCanonOnly(settingId) {
    return getSettingDoc(settingId).canonOnly === true;
}

export function setCanonOnly(settingId, on) {
    updateSettingDoc(settingId, (doc) => { doc.canonOnly = on === true; });
}

// Whether generated detail may be added to an entry: not in a canon-only
// setting, not when the entry is canon-locked. The gate every future
// enrichment/generation write must pass (SB-128, SB-133b).
export function mayAddGeneratedDetail(settingId, objectId) {
    return !isCanonOnly(settingId) && !getEntryMeta(settingId, objectId).canonLocked;
}

// ---- runtime values

// A field's value read by role first (SB-441: renames do not break it),
// falling back to the field name. '' when neither is there. Never throws.
export async function readField(chatId, id, roleId, fieldName) {
    try {
        for (const key of [roleId, fieldName].filter(Boolean)) {
            const value = await se.getObjectField(chatId, id, key);
            if (value !== undefined && value !== null && value !== '') return Array.isArray(value) ? value.join(', ') : String(value);
        }
    } catch (err) {
        console.debug(LOG_PREFIX, `could not read ${roleId ?? fieldName} of ${id}`, err);
    }
    return '';
}

// ---- secrets and oaths (src/library/knowledge.js)

export function listKnowledge(settingId) {
    return getSettingDoc(settingId).knowledge ?? [];
}

// item: { kind, text, knownBy, madeBy, madeTo, status } - a new one, or
// one replacing the item with the same id.
export function saveKnowledge(settingId, item) {
    const stored = normalizeKnowledgeItem({ ...item, id: item.id || `k_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` });
    if (!stored.text) return null;
    updateSettingDoc(settingId, (doc) => {
        doc.knowledge = [...(doc.knowledge ?? []).filter((k) => k.id !== stored.id), stored];
    });
    return stored;
}

export function removeKnowledge(settingId, id) {
    updateSettingDoc(settingId, (doc) => { doc.knowledge = (doc.knowledge ?? []).filter((k) => k.id !== id); });
}

// Every secret and oath for a chat: the user's, then Archivist's compiled
// ones (when Archivist is there). nameOf(id) -> a name. Never throws.
export async function allKnowledge(settingId, nameOf) {
    const out = authoredKnowledge(listKnowledge(settingId), nameOf);
    try {
        const view = await globalThis.window?.StateEngineArchivist?.getCompiledMemory?.();
        out.push(...storyKnowledge(view?.world));
    } catch {
        // No compiled memory yet.
    }
    return out;
}

