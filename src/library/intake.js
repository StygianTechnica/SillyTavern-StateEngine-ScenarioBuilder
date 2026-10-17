// Intake: taking objects into the library once they are CONFIRMED into the
// setting. Confirming is State Engine's own object review (its "New ...
// detected for review" notification, auto-confirm, or another extension
// creating an object) - Scenario Builder does not repeat it. What it adds
// once an object is confirmed:
//   - marks it as tracked (and, when it carries no origin, as coming from
//     the story);
//   - a new location without a parent is placed next to where the scene
//     came from (the user can drag it elsewhere in the tree);
//   - a creature detected in the story (or a character State Engine marks
//     present) joins the scene: it was detected because it is there;
//   - it is listed in the open chat's Review ("New in the setting");
//   - its empty fields are enriched in the background, when auto-enrich is
//     on and the canon switches allow it (src/generate/enrich.js).
// The first pass for a setting only records what is already there, so an
// existing library is never flooded with enrichment.

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';
import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { setCanonical } from '../state/canonical.js';
import { getObjectTypes, listEntries, getParents, setParent, setEntryMeta, mayAddGeneratedDetail } from './library.js';
import { enqueueEnrichment } from '../generate/enrich.js';

// Where a new place most likely sits: next to the place the scene came
// from when it moved here, else next to the current location.
function neighbourParent(chatDoc, parents, id) {
    const moved = [...chatDoc.history].reverse().find((h) => h.after?.locationId === id && h.before?.locationId);
    const from = moved?.before?.locationId || (chatDoc.canonical.locationId !== id ? chatDoc.canonical.locationId : '');
    if (!from || from === id) return null;
    return parents[from] ?? null;
}

// Puts newly taken-in creatures and characters into the canonical scene,
// unless the user has taken them out by hand.
export function sceneArrivals(chatId, chatKey, arrived, names = new Map()) {
    const doc = getChatDoc(chatKey);
    const heldOut = new Set(doc.held.filter((x) => x.op === 'remove' && x.until > doc.turn).map((x) => x.objectId));
    const patch = {};
    const joined = [];
    for (const key of ['creatureIds', 'castIds']) {
        const add = (arrived[key] ?? []).filter((id) => !heldOut.has(id) && !doc.canonical[key].includes(id));
        if (!add.length) continue;
        patch[key] = [...doc.canonical[key], ...add];
        joined.push(...add.map((id) => names.get(id) ?? id));
    }
    if (!joined.length) return null;
    return setCanonical(chatKey, patch, { source: 'review', note: `Detected in the story, now in the scene: ${joined.join(', ')}`, chatId });
}

// A person the story knows only by a description ("the eyepatched man",
// "a hooded woman"): provisional until it names them (src/director/ RENAME).
export function isDescriptiveName(name) {
    return /^(the|a|an)\s+\S/i.test(String(name ?? '').trim());
}

let running = false;

// One intake pass for a chat's setting. Never throws.
export async function runIntake(chatId, chatKey, settingId) {
    if (running || !chatId || !settingId) return;
    running = true;
    try {
        const world = (await getObjectTypes()).filter((t) => t.scope === 'world');
        const objects = [];
        for (const t of world) objects.push(...(await listEntries(chatId, settingId, t.id)).filter((o) => o.scope === 'setting' && o.confirmed !== false));
        const doc = getSettingDoc(settingId);
        if (!doc.trackedReady) {
            updateSettingDoc(settingId, (d) => { d.tracked = objects.map((o) => o.id); d.trackedReady = true; });
            return;
        }
        const known = new Set(doc.tracked);
        const fresh = objects.filter((o) => !known.has(o.id));
        if (!fresh.length) return;

        const auto = getSettings().generation.autoEnrich === true;
        const chatDoc = getChatDoc(chatKey);
        const parents = getParents(settingId);
        const names = new Map(objects.map((o) => [o.id, o.name]));
        const items = [];
        const arrived = { creatureIds: [], castIds: [] };
        for (const obj of fresh) {
            const fromStory = !obj.meta?.origin || obj.meta.origin === 'story';
            if (!obj.meta?.origin) setEntryMeta(settingId, obj.id, { origin: 'story', ...(obj.type === 'character' && isDescriptiveName(obj.name) ? { provisional: true } : {}) });
            if (fromStory && obj.type === 'creature') arrived.creatureIds.push(obj.id);
            if (fromStory && obj.type === 'character' && (obj.runtime?.present === true || obj.present === true)) arrived.castIds.push(obj.id);
            let placedUnder = '';
            if (obj.type === 'location' && !parents[obj.id]) {
                const parent = neighbourParent(chatDoc, parents, obj.id);
                if (parent && setParent(settingId, obj.id, parent)) placedUnder = names.get(parent) ?? '';
            }
            const enrich = auto && mayAddGeneratedDetail(settingId, obj.id) ? 'queued' : 'off';
            items.push({ id: newLocalId('a'), objectId: obj.id, type: obj.type, name: obj.name, at: new Date().toISOString(), placedUnder, enrich, error: '' });
        }
        updateSettingDoc(settingId, (d) => { d.tracked = [...d.tracked, ...fresh.map((o) => o.id)]; });
        updateChatDoc(chatKey, (d) => {
            const seen = new Set(d.adopted.map((a) => a.objectId));
            d.adopted = [...d.adopted, ...items.filter((a) => !seen.has(a.objectId))];
        });
        sceneArrivals(chatId, chatKey, arrived, names);
        for (const item of items) {
            if (item.enrich === 'queued') enqueueEnrichment({ settingId, chatId, chatKey, objectId: item.objectId, name: item.name, adoptedId: item.id });
        }
        console.info(LOG_PREFIX, `took ${items.length} new ${items.length === 1 ? 'entry' : 'entries'} into the library`);
    } catch (err) {
        console.warn(LOG_PREFIX, 'intake failed', err);
    } finally {
        running = false;
    }
}

// Enriches one listed entry now (the Review list's button).
export function enrichListed(chatId, chatKey, settingId, adoptedId) {
    const item = getChatDoc(chatKey).adopted.find((a) => a.id === adoptedId);
    if (!item) return;
    enqueueEnrichment({ settingId, chatId, chatKey, objectId: item.objectId, name: item.name, adoptedId: item.id });
}
