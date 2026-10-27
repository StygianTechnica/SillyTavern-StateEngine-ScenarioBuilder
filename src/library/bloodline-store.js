// Bloodlines in the library (docs/DESIGN - BLOODLINES.md): the world's
// bloodlines (Lore entries marked as one), making them from a preset or by
// hand, and the world's mix. The pure half is bloodlines.js.

import { listEntries, createEntry, setEntryMeta, getOverview, setOverview, getParents } from './library.js';
import { getSettingDoc } from '../store/setting-store.js';
import { bloodlinesOf, choicesOf, normalizeBloodline, normalizePopulation, emptyBloodline, mixFor, HUMANS } from './bloodlines.js';
import { fromPreset } from './bloodline-presets.js';

// The world's bloodlines: its lore entries marked as one.
export async function listBloodlines(chatId, settingId) {
    return bloodlinesOf(await listEntries(chatId, settingId, 'lore').catch(() => []));
}

// { id: entry } for every bloodline a mix can name, the implicit humans too.
export const byIdOf = (bloodlines) => Object.fromEntries(choicesOf(bloodlines).map((b) => [b.id, b]));

// A new bloodline: from a preset ({ presetId }) or by hand ({ name,
// description }). It joins the world's mix ("some" - humans "most" when
// the mix was empty), to be changed on the Bloodlines tab. -> the entry.
export async function addBloodline(chatId, settingId, { presetId = '', name = '', description = '' } = {}) {
    const made = presetId ? fromPreset(presetId, getOverview(settingId)) : { name, description, bloodline: normalizeBloodline({ ...emptyBloodline(), on: true, playable: true }) };
    if (!made || !String(made.name).trim()) return null;
    const created = await createEntry(chatId, settingId, 'lore', { name: made.name.trim(), description: made.description ?? '' }, { origin: 'user', bloodline: made.bloodline });
    if (!created) return null;
    const pop = normalizePopulation(getOverview(settingId).population);
    const human = made.bloodline.kind === 'human';
    const mix = [...pop.mix];
    // A world's own humans take the implicit ones' place in the mix.
    const implicit = mix.findIndex((r) => r.id === HUMANS);
    if (human && implicit >= 0) mix[implicit] = { id: created.id, share: mix[implicit].share };
    else {
        if (!mix.length && !human) mix.push({ id: HUMANS, share: 'most' });
        mix.push({ id: created.id, share: human ? 'most' : 'some' });
    }
    setOverview(settingId, { population: { ...pop, mix } });
    return created;
}

// Changes a bloodline's block (merged into what it has).
export function setBloodline(settingId, id, patch) {
    const current = normalizeBloodline(getSettingDoc(settingId).entries[id]?.bloodline);
    setEntryMeta(settingId, id, { bloodline: normalizeBloodline({ ...current, ...patch, on: true, visual: { ...current.visual, ...(patch?.visual ?? {}) } }) });
}

export function setWorldPopulation(settingId, patch) {
    const pop = normalizePopulation(getOverview(settingId).population);
    setOverview(settingId, { population: normalizePopulation({ ...pop, ...patch }) });
}

// The mix where something lives: a faction's members, else the place's,
// else the world's.
export function mixWhere(settingId, { placeId = null, factionId = null } = {}) {
    const doc = getSettingDoc(settingId);
    return mixFor({ world: doc.overview.population, parents: getParents(settingId), metaById: doc.entries, placeId, factionId });
}
