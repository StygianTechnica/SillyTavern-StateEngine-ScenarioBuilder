// Lore from Archivist - the runner (the pure half is src/library/lore.js).
//
//   runLoreSync()  Archivist's compiled world lore (getCompiledMemory()'s
//                  world.lore) -> library Lore entries, the way quests come
//                  from its threads (src/quests/sync.js): an entry not yet
//                  linked becomes a Lore entry (origin 'story') with the
//                  people and places it involves linked, or is linked to a
//                  Lore entry of the same name; a linked entry's description
//                  follows Archivist's text while nobody has edited it. New
//                  entries are listed in Review and enriched like any other.
//                  Runs after Archivist compiles (when automatic creation is
//                  on), and on demand (`scan`).
//
// A Lore entry the user deletes or rejects is not made again from the same
// Archivist entry. Nothing is written to Archivist (SB-005).

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { getEntryMeta } from '../store/setting-store.js';
import { newLocalId } from '../store/schema.js';
import { listEntries, createEntry, updateEntry, setEntryMeta, mayAddGeneratedDetail } from './library.js';
import { enqueueEnrichment } from '../generate/enrich.js';
import { planLore, loreUpdate } from './lore.js';

const lower = (s) => String(s ?? '').trim().toLowerCase();

// Archivist's compiled lore for the open chat, or [].
async function archivistLore() {
    try {
        const view = await window.StateEngineArchivist?.getCompiledMemory?.();
        const list = view?.world?.lore;
        return Array.isArray(list) ? list.filter((e) => !e.kind || e.kind === 'lore') : [];
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read Archivist\'s lore', err);
        return [];
    }
}

export function hasArchivistLore() {
    return typeof window.StateEngineArchivist?.getCompiledMemory === 'function';
}

let running = false;

// One pass. `scan`: the user asked (creates entries even when automatic
// creation is off). -> { created, linked, updated } or null.
export async function runLoreSync(chatId, chatKey, settingId, { scan = false } = {}) {
    if (running || !chatId || !settingId || !hasArchivistLore()) return null;
    running = true;
    const out = { created: 0, linked: 0, updated: 0 };
    try {
        const settings = getSettings();
        const create = scan || settings.lore?.autoCreate !== false;
        const worlds = await archivistLore();
        if (!worlds.length) return out;
        let lore = await listEntries(chatId, settingId, 'lore');
        const doc = getChatDoc(chatKey);
        const links = { ...doc.loreLinks };
        const dismissed = new Set(doc.loreDismissed);
        const rejected = (name) => doc.rejected.some((r) => r.type === 'lore' && lower(r.name) === lower(name));
        const adopted = [];

        for (const world of worlds) {
            const plan = planLore(world, { lore, links, dismissed, rejected });
            if (plan.action === 'skip') continue;
            if (plan.action === 'dismiss') {
                // Its Lore entry was deleted: not made again.
                dismissed.add(world.id);
                delete links[world.id];
                continue;
            }
            if (plan.action === 'link') {
                if (links[world.id] !== plan.id) { links[world.id] = plan.id; out.linked += 1; }
                const entry = lore.find((l) => l.id === plan.id);
                const meta = getEntryMeta(settingId, plan.id).archivist ?? {};
                const { patch, synced } = loreUpdate(entry, world, meta.syncedText ?? '');
                if (Object.keys(patch).length) {
                    await updateEntry(chatId, settingId, plan.id, patch);
                    out.updated += 1;
                }
                if (synced !== (meta.syncedText ?? '')) setEntryMeta(settingId, plan.id, { archivist: { ...meta, syncedText: synced } });
                continue;
            }
            if (!create) continue;
            const created = await createEntry(chatId, settingId, 'lore', plan.data, { origin: 'story', archivist: { syncedText: plan.data.description } });
            if (!created) continue;
            links[world.id] = created.id;
            lore = [...lore, created];
            out.created += 1;
            adopted.push({ id: newLocalId('a'), objectId: created.id, type: 'lore', name: created.name, at: new Date().toISOString(), placedUnder: '', enrich: 'off', error: '' });
        }

        updateChatDoc(chatKey, (d) => {
            d.loreLinks = links;
            d.loreDismissed = [...dismissed];
            const known = new Set(d.adopted.map((a) => a.objectId));
            d.adopted = [...d.adopted, ...adopted.filter((a) => !known.has(a.objectId))];
        });

        // New entries get fleshed out like any new entry (canon switches
        // permitting).
        if (settings.generation.autoEnrich) {
            for (const a of adopted) {
                if (!mayAddGeneratedDetail(settingId, a.objectId)) continue;
                updateChatDoc(chatKey, (d) => { const item = d.adopted.find((x) => x.id === a.id); if (item) item.enrich = 'queued'; });
                enqueueEnrichment({ settingId, chatId, chatKey, objectId: a.objectId, name: a.name, adoptedId: a.id });
            }
        }
        if (out.created) console.info(LOG_PREFIX, `took ${out.created} lore ${out.created === 1 ? 'entry' : 'entries'} from Archivist`);
        return out;
    } catch (err) {
        console.warn(LOG_PREFIX, 'lore sync failed', err);
        return null;
    } finally {
        running = false;
    }
}
