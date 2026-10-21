// A standard World Info book from a world - the runner (the pure half is
// src/export/lorebook.js). Always a NEW book: an existing one is never
// written over (SB-162) - the name gets " (2)" and so on.

import { LOG_PREFIX } from '../constants.js';
import { worldData } from '../worlds/run.js';
import { buildLorebook, toWorldInfo, freeBookName } from './lorebook.js';

let worldInfo = null;
async function wiModule() {
    // public/scripts/world-info.js, from src/export/ of a third-party extension.
    worldInfo ??= await import('../../../../../world-info.js');
    return worldInfo;
}

// -> { name, entries, counts }
export async function makeLorebook({ settingId, pointId = '', name, options = {} }) {
    const data = await worldData(settingId, pointId);
    const built = buildLorebook(data, options);
    if (!built.entries.length) throw new Error('There is nothing in this world to put in a lorebook.');
    const wi = await wiModule();
    const bookName = freeBookName(String(name ?? '').trim() || `${data.name} (Scenario Builder)`, wi.world_names);
    await wi.saveWorldInfo(bookName, toWorldInfo(built, wi.newWorldInfoEntryTemplate), true);
    try {
        await wi.updateWorldInfoList();
    } catch (err) {
        console.warn(LOG_PREFIX, 'the new lorebook is saved, but the list did not refresh', err);
    }
    return { name: bookName, entries: built.entries.length, counts: built.counts };
}
