// Changes the story makes to the world - the runners (the pure half, and the
// why: src/state/changes-model.js). Never throw.

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { setNarrative } from './narrative.js';
import { CHANGE_TYPES, changesFrom, addChanges, openChanges, buildChangePrompt, readChangeAnswer } from './changes-model.js';

export * from './changes-model.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---- runners

async function worldEntries(chatId, settingId) {
    const lib = await import('../library/library.js');
    const out = [];
    for (const type of CHANGE_TYPES) {
        for (const e of await lib.listEntries(chatId, settingId, type).catch(() => [])) out.push({ id: e.id, type, name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [] });
    }
    // Never the player character: their own changes are theirs to describe.
    const playerId = lib.playerIdOf(settingId, out.filter((e) => e.type === 'character'));
    return out.filter((e) => e.id !== playerId);
}

let scanning = false;

// After a reply (and when Archivist's memories change): new changes go on
// the list; with settings.changes.auto they are written at once. -> how many
// were found. Never throws.
export async function scanStoryChanges(chatId, chatKey, settingId) {
    if (scanning || !settingId) return 0;
    const { getSettings } = await import('../settings.js');
    const settings = getSettings().changes ?? {};
    if (settings.suggest === false) return 0;
    const archivist = window.StateEngineArchivist;
    if (typeof archivist?.getAllMemories !== 'function') return 0;
    scanning = true;
    try {
        const memories = await archivist.getAllMemories();
        const doc = getChatDoc(chatKey);
        const { found, seen } = changesFrom(memories, { entries: await worldEntries(chatId, settingId), seen: doc.changes.seen, first: !doc.changes.started });
        updateChatDoc(chatKey, (d) => { d.changes = { ...addChanges(d.changes, found), seen, started: true }; });
        if (found.length) console.info(LOG_PREFIX, `the story changed ${found.map((f) => f.name).join(', ')} - listed in Review`);
        if (found.length && settings.auto === true) {
            for (const f of found) {
                const s = openChanges(getChatDoc(chatKey)).find((x) => x.objectId === f.objectId);
                if (s) await writeChange(chatId, chatKey, settingId, s.id, { use: true });
            }
        }
        return found.length;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not look for changes in the story', err);
        return 0;
    } finally {
        scanning = false;
    }
}

// Writes the current description for a suggestion (one model call): kept as
// its draft, or - use - put in place at once. -> the text, or ''.
export async function writeChange(chatId, chatKey, settingId, id, { use = false } = {}) {
    try {
        const s = getChatDoc(chatKey).changes.suggestions.find((x) => x.id === id);
        if (!s) return '';
        const lib = await import('../library/library.js');
        const entry = await lib.getEntry(chatId, settingId, s.objectId);
        if (!entry) return '';
        const overview = lib.getOverview(settingId);
        const prompt = buildChangePrompt({
            name: entry.name, type: s.type, description: entry.base?.description ?? entry.description ?? '',
            current: getChatDoc(chatKey).narrative[s.objectId]?.text ?? '', changes: s.texts,
            overview: [overview.premise, overview.tone && `Tone: ${overview.tone}.`].filter(Boolean).join(' '),
        });
        const { askReliably } = await import('../generate/run.js');
        const result = await askReliably(prompt, (_p, text) => {
            const values = readChangeAnswer(text);
            return values ? { values, dropped: [], error: null } : { values: '', dropped: [], error: 'no description' };
        }, 500);
        if (result.error) {
            console.warn(LOG_PREFIX, `could not write how ${entry.name} is now: ${result.error}`);
            return '';
        }
        updateChatDoc(chatKey, (d) => { d.changes.suggestions = d.changes.suggestions.map((x) => (x.id === id ? { ...x, draft: result.values } : x)); });
        if (use) useChange(chatKey, id, result.values);
        return result.values;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not write the current description', err);
        return '';
    }
}

// The draft (or the user's edit of it) becomes the current description.
export function useChange(chatKey, id, text) {
    const s = getChatDoc(chatKey).changes.suggestions.find((x) => x.id === id);
    const value = clean(text ?? s?.draft);
    if (!s || !value) return false;
    setNarrative(chatKey, s.objectId, value);
    updateChatDoc(chatKey, (d) => { d.changes.suggestions = d.changes.suggestions.map((x) => (x.id === id ? { ...x, status: 'used', draft: value } : x)); });
    return true;
}

export function dismissChange(chatKey, id) {
    updateChatDoc(chatKey, (d) => { d.changes.suggestions = d.changes.suggestions.map((x) => (x.id === id ? { ...x, status: 'dismissed' } : x)); });
}

export function editChangeDraft(chatKey, id, text) {
    updateChatDoc(chatKey, (d) => { d.changes.suggestions = d.changes.suggestions.map((x) => (x.id === id ? { ...x, draft: String(text ?? '').slice(0, 2000) } : x)); });
}
