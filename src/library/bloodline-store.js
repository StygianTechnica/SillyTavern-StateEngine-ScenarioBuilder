// Bloodlines in the library (docs/DESIGN - BLOODLINES.md): the world's
// bloodlines (Lore entries marked as one), making them from a preset or by
// hand, and the world's mix; then (phase 3) the bloodlines part of the
// premise call, the sheet's two calls, and kinds of being the story brings
// in. The pure halves are bloodlines.js and bloodline-prompts.js.

import { listEntries, createEntry, setEntryMeta, getOverview, setOverview, getParents, mayAddGeneratedDetail } from './library.js';
import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { getSettings } from '../settings.js';
import { enqueueEnrichment } from '../generate/enrich.js';
import { bloodlinesOf, choicesOf, normalizeBloodline, normalizePopulation, emptyBloodline, mixFor, HUMANS } from './bloodlines.js';
import { fromPreset, BLOODLINE_PRESETS } from './bloodline-presets.js';
import { premiseBloodlinesSection, splitPremiseAnswer, readPremiseBloodlines, buildRewritePrompt, readRewrite, buildLookPrompt, readLook, storyKind, storyBloodline } from './bloodline-prompts.js';

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

// ---- phase 3: from the premise

// The bloodlines' part of the premise call (src/naming/run.js
// proposeCultures): the section for the prompt, and the answer split and
// read. None in a canon-only world: nothing is invented there.
export function premiseBloodlines(settingId, bloodlines) {
    if (getSettingDoc(settingId).canonOnly) return null;
    const existing = bloodlines.map((b) => b.name);
    return {
        section: premiseBloodlinesSection({ existing }),
        cultures: (raw) => splitPremiseAnswer(raw).cultures,
        read: (raw) => readPremiseBloodlines(raw, { existing }),
    };
}

// Adds the ticked bloodline proposals: each from its preset (bent to the
// age) with the model's lines over it, or new; named by the culture its
// NAMES line gives - one just added (cultureIds: { name: id }), one of the
// world's, else its preset's - or the place's ("local"). Each joins the
// world's mix with its share; `only` (true / false) sets "these and no
// others". -> [created entry]
export async function acceptBloodlineProposals(chatId, settingId, proposals, { only = null, cultureIds = {} } = {}) {
    const doc = getSettingDoc(settingId);
    const own = Object.values(doc.naming.cultures);
    const isLocal = (p) => String(p.names ?? '').trim().toLowerCase() === 'local';
    const cultureOf = (text) => {
        const t = String(text ?? '').trim().toLowerCase();
        if (!t || t === 'local') return '';
        const added = Object.entries(cultureIds).find(([n]) => n.toLowerCase() === t);
        if (added) return added[1];
        return own.find((c) => String(c.name).toLowerCase() === t)?.id ?? '';
    };
    const made = [];
    const mix = [...normalizePopulation(getOverview(settingId).population).mix];
    for (const p of proposals) {
        const base = p.preset ? fromPreset(p.preset, getOverview(settingId)) : null;
        const block = base?.bloodline ?? normalizeBloodline({ ...emptyBloodline(), on: true, playable: true });
        const culture = isLocal(p) ? '' : cultureOf(p.names) || block.culture;
        const bloodline = normalizeBloodline({
            ...block,
            kind: p.kind || block.kind,
            singular: p.one || block.singular,
            look: p.look || block.look,
            here: p.here || block.here,
            culture,
            naming: isLocal(p) ? 'local' : culture ? block.naming || 'own' : '',
            visual: { ...block.visual, known: p.known || block.visual.known, body: p.body || block.visual.body, skin: p.skin || block.visual.skin, features: p.features || block.visual.features },
        });
        // The preset's description, else the model's look and here lines.
        const description = p.here ? [p.look, p.here].filter(Boolean).map((x) => x.replace(/[.!]?$/, '.')).join(' ') : base?.description ?? '';
        const created = await createEntry(chatId, settingId, 'lore', { name: p.name, description }, { origin: 'user', bloodline });
        if (!created) continue;
        made.push(created);
        const humanAt = bloodline.kind === 'human' ? mix.findIndex((r) => r.id === HUMANS) : -1;
        if (humanAt >= 0) mix[humanAt] = { id: created.id, share: p.share || mix[humanAt].share };
        else mix.push({ id: created.id, share: p.share || 'some' });
    }
    setWorldPopulation(settingId, { mix, ...(only === null ? {} : { only }) });
    return made;
}

// ---- phase 3: the sheet's calls (each one generation, on a button)

// "Rewrite for this world". -> { description, look, here, dress }
export async function rewriteBloodline(settingId, entry, { brief = '' } = {}) {
    const { askReliably } = await import('../generate/run.js');
    const r = await askReliably(buildRewritePrompt({ entry, overview: getOverview(settingId), brief }), (_p, text) => readRewrite(text), 700);
    if (r.error) throw new Error(r.error);
    return r.values;
}

// "Describe how they look". In a canon-only world or on a canon entry,
// only what the description says. -> the visual block's fields
export async function describeBloodlineLook(settingId, entry) {
    const { askReliably } = await import('../generate/run.js');
    const canon = getSettingDoc(settingId).canonOnly || entry?.meta?.canonLocked === true;
    const r = await askReliably(buildLookPrompt({ entry, overview: getOverview(settingId), canon }), (_p, text) => readLook(text), 600);
    if (r.error) throw new Error(r.error);
    return r.values;
}

// ---- phase 3: the story

// The presets' words for kinds of being - not those that are also plain
// words ("a giant of a man", "a witch hunter").
export const PRESET_WORDS = BLOODLINE_PRESETS.map((p) => p.singular).filter((w) => !['human', 'giant', 'witch', 'spacer', 'uplift'].includes(w));

// Kinds of being the story brought in that the world has no bloodline for
// (docs/DESIGN - BLOODLINES.md, section 7): for each character taken in,
// the kind their role and first sentence give ("a troll bouncer"). Once the
// world has bloodlines at all, a new one is made - its word as its name,
// rare in the world's mix, these characters of it - and listed in the
// chat's Review to be enriched like anything else the story adds. When the
// world says "these and no others" it waits in Review for the user
// instead. A kind turned down is never raised again. -> [{ word, id? }]
export async function noticeStoryBloodlines(chatId, chatKey, settingId, characters = []) {
    if (getSettingDoc(settingId).canonOnly) return [];
    const bloodlines = await listBloodlines(chatId, settingId);
    if (!bloodlines.length) return [];
    const found = new Map();
    for (const c of characters) {
        const base = c.base ?? c;
        const word = storyKind({ role: Array.isArray(base.role) ? base.role.join(', ') : base.role ?? '', description: c.description ?? base.description ?? '' }, bloodlines, PRESET_WORDS);
        if (!word) continue;
        const key = word.toLowerCase();
        found.set(key, [...(found.get(key) ?? []), c.id]);
    }
    const out = [];
    for (const [word, ids] of found) {
        const doc = getSettingDoc(settingId);
        if ((doc.bloodlinesHeard ?? []).some((x) => x.word === word && x.status === 'dismissed')) continue;
        if (normalizePopulation(doc.overview.population).only) {
            updateSettingDoc(settingId, (d) => {
                const list = d.bloodlinesHeard ?? [];
                const at = list.find((x) => x.word === word);
                if (at) at.ids = [...new Set([...at.ids, ...ids])];
                else list.push({ word, ids, status: 'pending', at: new Date().toISOString() });
                d.bloodlinesHeard = list;
            });
            out.push({ word });
            continue;
        }
        const id = await takeInStoryBloodline(chatId, chatKey, settingId, word, ids);
        if (id) out.push({ word, id });
    }
    return out;
}

// Makes a bloodline for a kind the story brought in, its characters of it,
// and lists it in the chat's Review. -> the new entry's id, or ''
export async function takeInStoryBloodline(chatId, chatKey, settingId, word, characterIds = []) {
    const made = storyBloodline(word);
    const created = await createEntry(chatId, settingId, 'lore', { name: made.name, description: '' }, { origin: 'story', bloodline: made.bloodline });
    if (!created) return '';
    const pop = normalizePopulation(getOverview(settingId).population);
    setWorldPopulation(settingId, { mix: [...pop.mix, { id: created.id, share: 'rare' }] });
    for (const id of characterIds) {
        if (!getSettingDoc(settingId).entries[id]?.lineage?.ids?.length) setEntryMeta(settingId, id, { lineage: { ids: [created.id], note: '' } });
    }
    updateSettingDoc(settingId, (d) => { d.bloodlinesHeard = (d.bloodlinesHeard ?? []).filter((x) => x.word !== String(word).toLowerCase()); });
    const auto = getSettings().generation.autoEnrich === true && mayAddGeneratedDetail(settingId, created.id);
    const item = { id: newLocalId('a'), objectId: created.id, type: 'lore', name: created.name, at: new Date().toISOString(), placedUnder: '', enrich: auto ? 'queued' : 'off', error: '', bloodline: true };
    updateChatDoc(chatKey, (d) => { d.adopted = [...d.adopted, item]; });
    if (auto) enqueueEnrichment({ settingId, chatId, chatKey, objectId: created.id, name: created.name, adoptedId: item.id });
    return created.id;
}

// A kind the story brought into a "these and no others" world, turned down.
export function dismissStoryBloodline(settingId, word) {
    updateSettingDoc(settingId, (d) => {
        d.bloodlinesHeard = (d.bloodlinesHeard ?? []).map((x) => (x.word === word ? { ...x, status: 'dismissed' } : x));
    });
}
