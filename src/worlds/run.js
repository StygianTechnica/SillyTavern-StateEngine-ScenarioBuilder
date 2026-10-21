// Worlds, starting points and playthroughs - the runner (the pure half and
// the data shapes are src/worlds/model.js).
//
//   saveStartingPoint()   the world as it is now, kept as a file
//   startOver()           a new playthrough: a copy of the world made from a
//                         starting point (or the world without what the story
//                         added), and a new chat on it
//   deletePlaythrough()   a playthrough gone: its world copy, Scenario
//                         Builder's data for it and its chats, and - when
//                         asked - Archivist's memories and the chat files
//   copyEntriesTo()       objects copied into another world
//   followChatChange()    binds a new playthrough's chat; saves "Original"
//                         the first time a world is used from a fresh chat
//   followDeletedChat()   a deleted chat's document goes with it
//
// Nothing changes a playthrough but the user's own action here: the old
// world and its chats stay as they were when a new one starts.

import { LOG_PREFIX } from '../constants.js';
import { getSettings, saveSettings } from '../settings.js';
import * as se from '../api/objects.js';
import { getSettingDoc, updateSettingDoc, deleteSettingDoc } from '../store/setting-store.js';
import { getChatDoc, listChatKeys, deleteChatDoc } from '../store/chat-store.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { readJsonFile, writeJsonFile, deleteJsonFile, downloadText, safeFileName } from '../store/files.js';
import { getPresetStatus } from '../preset/scenario-preset.js';
import { storyMarkdown } from '../planner/model.js';
import {
    buildWorldFile, checkWorldFile, objectCountOf, libraryForCopy, metaForCopiedObjects, withoutStoryAdditions,
    normalizeWorlds, familyOf, familyNameOf, playthroughsOf, startingPointsOf, nextPlaythroughNumber, playthroughName,
    chatsOn, parseChatKey, deletedChatKey, storyNotBegun,
} from './model.js';

export const WORLDS_EVENT = 'scenario_builder_worlds_changed';

function emit() {
    try {
        SillyTavern.getContext().eventSource.emit(WORLDS_EVENT);
    } catch {
        // No event bus (tests).
    }
}

export function getWorlds() {
    return normalizeWorlds(getSettings().worlds);
}

function updateWorlds(mutate) {
    const settings = getSettings();
    const worlds = normalizeWorlds(settings.worlds);
    mutate(worlds);
    settings.worlds = normalizeWorlds(worlds);
    saveSettings();
    emit();
    return settings.worlds;
}

const newId = () => `wp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const dateStamp = () => new Date().toISOString().slice(0, 10);

// ---- what the Worlds tab shows

// The open world's family: its playthroughs (with their chats) and its
// starting points.
export async function describeFamily(settingId) {
    const worlds = getWorlds();
    const settings = await se.listSettings();
    const family = familyOf(worlds, settingId);
    const chats = getSettings().chats;
    const playthroughs = playthroughsOf(worlds, family, settings).map((p) => ({
        ...p,
        chats: chatsOn(chats, p.setting.id).map((chatKey) => ({ chatKey, ...parseChatKey(chatKey) })),
    }));
    return {
        family,
        familyName: familyNameOf(worlds, family, settings),
        playthroughs,
        startingPoints: startingPointsOf(worlds, family),
        canCopy: await se.canCopyWorlds(),
    };
}

// ---- starting points

// The world as it is now: { setting, library }, as a world file.
async function snapshot(settingId, name) {
    const setting = await se.exportSetting(settingId);
    if (!setting) throw new Error('State Engine could not export this world - is it up to date?');
    return buildWorldFile({ name, setting, library: getSettingDoc(settingId) });
}

// Keeps the world as it is now as a starting point of its family.
export async function saveStartingPoint(settingId, { name = '', auto = false } = {}) {
    const worlds = getWorlds();
    const settings = await se.listSettings();
    const family = familyOf(worlds, settingId);
    const familyName = familyNameOf(worlds, family, settings);
    const pointName = name.trim() || `As of ${dateStamp()}`;
    const data = await snapshot(settingId, pointName);
    const id = newId();
    const fileName = `scenario-builder-world-${id}.json`;
    await writeJsonFile(fileName, data);
    const point = { id, family, familyName, name: pointName, savedAt: data.savedAt, fileName, objectCount: objectCountOf(data.setting), auto };
    updateWorlds((w) => { w.startingPoints[id] = point; });
    return point;
}

async function readStartingPoint(pointId) {
    const point = getWorlds().startingPoints[pointId];
    if (!point) throw new Error('That starting point is gone.');
    const data = await readJsonFile(point.fileName);
    if (!data) throw new Error(`The starting point's file (${point.fileName}) is missing from your data folder.`);
    return { point, data: checkWorldFile(data) };
}

export async function renameStartingPoint(pointId, name) {
    const clean = String(name ?? '').trim();
    if (!clean) return;
    updateWorlds((w) => { if (w.startingPoints[pointId]) w.startingPoints[pointId].name = clean; });
}

export async function deleteStartingPoint(pointId) {
    const point = getWorlds().startingPoints[pointId];
    if (!point) return;
    try {
        await deleteJsonFile(point.fileName);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not delete the starting point\'s file', err);
    }
    updateWorlds((w) => { delete w.startingPoints[pointId]; });
}

export async function downloadStartingPoint(pointId) {
    const { point, data } = await readStartingPoint(pointId);
    downloadText(`${safeFileName(`${point.familyName} - ${point.name}`, 'world')}.json`, JSON.stringify(data, null, 2));
}

// A world file's data: the world as it is now, or a starting point's.
export async function worldData(settingId, pointId = '') {
    if (pointId) return (await readStartingPoint(pointId)).data;
    const summary = await se.getSetting(settingId);
    return snapshot(settingId, summary?.name ?? 'World');
}

// The world as it is now, as a file to keep or share.
export async function downloadWorld(settingId) {
    const summary = await se.getSetting(settingId);
    const data = await snapshot(settingId, summary?.name ?? 'World');
    downloadText(`${safeFileName(`${data.name} - ${dateStamp()}`, 'world')}.json`, JSON.stringify(data, null, 2));
}

// A world file loaded: a new world of its own (its own family), with the
// file kept as its "Original" starting point. -> the setting summary.
export async function loadWorldFile(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('That file is not JSON.');
    }
    checkWorldFile(data);
    const made = await makeWorld(data, data.name);
    const id = newId();
    const fileName = `scenario-builder-world-${id}.json`;
    await writeJsonFile(fileName, data);
    updateWorlds((w) => {
        w.startingPoints[id] = { id, family: made.setting.id, familyName: made.setting.name, name: 'Original', savedAt: data.savedAt || new Date().toISOString(), fileName, objectCount: objectCountOf(data.setting), auto: false };
    });
    return made.setting;
}

// A State Engine setting and its library document from a world file.
async function makeWorld(data, name) {
    const made = await se.importSetting(data.setting, { name });
    if (!made?.setting) throw new Error('State Engine could not make the world - see the browser console.');
    const library = libraryForCopy(data.library, made.idMap);
    updateSettingDoc(made.setting.id, (doc) => {
        for (const key of Object.keys(doc)) delete doc[key];
        Object.assign(doc, library);
    });
    return made;
}

// ---- starting over

// The chat that should be bound to a new playthrough once it opens.
let pendingBind = null;

// A new playthrough of the open world's family, from a starting point (or,
// `from: 'clean'`, the open world without what the story added), and a new
// chat with the same character on it. -> { setting, left? }
export async function startOver(settingId, { from }) {
    const worlds = getWorlds();
    const settings = await se.listSettings();
    const family = familyOf(worlds, settingId);
    const familyName = familyNameOf(worlds, family, settings);
    let data;
    let left = 0;
    let startingPointId = '';
    if (from === 'clean') {
        const now = await snapshot(settingId, familyName);
        const clean = withoutStoryAdditions(now.setting, now.library);
        data = { ...now, setting: clean.setting };
        left = clean.left;
    } else {
        data = (await readStartingPoint(from)).data;
        startingPointId = from;
    }
    const number = nextPlaythroughNumber(worlds, family);
    const made = await makeWorld(data, playthroughName(familyName, number));
    updateWorlds((w) => {
        w.playthroughs[made.setting.id] = { family, familyName, number, startingPointId, createdAt: new Date().toISOString() };
    });
    await openNewChatOn(made.setting.id);
    return { setting: made.setting, left };
}

let newChatFn = null;
async function newChat() {
    // public/script.js, from src/worlds/ of a third-party extension.
    newChatFn ??= (await import('../../../../../../script.js')).doNewChat;
    await newChatFn({ deleteCurrentChat: false });
}

// A new chat for the open character (or group), bound to `settingId`.
async function openNewChatOn(settingId) {
    const before = getCurrentChatRef();
    if (!before) throw new Error('Open a chat with the character first.');
    pendingBind = { settingId, fromChatId: before.chatId };
    try {
        await newChat();
    } catch (err) {
        pendingBind = null;
        throw new Error(`The new playthrough is made, but SillyTavern could not start a chat: ${err?.message ?? err}. Start one yourself and switch it to "${settingId}".`);
    }
    await bindPending();
}

async function bindPending() {
    const ref = getCurrentChatRef();
    if (!pendingBind || !ref || ref.chatId === pendingBind.fromChatId) return false;
    const { settingId } = pendingBind;
    pendingBind = null;
    await se.setChatSetting(ref.chatId, settingId);
    return true;
}

// On every chat change (src/state/lifecycle.js), before the setting is
// read: a new playthrough's chat is bound to it, and a world used for the
// first time from a fresh chat has its "Original" kept. Never throws.
export async function followChatChange() {
    try {
        await bindPending();
        await saveOriginalIfFirstUse();
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not follow the chat into its playthrough', err);
    }
}


// Before the first reply too (src/state/lifecycle.js): a new chat's presets
// are often switched on after it opened. Never throws.
export async function maybeSaveOriginal() {
    try {
        await saveOriginalIfFirstUse();
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not keep the world\'s original', err);
    }
}

async function saveOriginalIfFirstUse() {
    const ref = getCurrentChatRef();
    if (!ref || !storyNotBegun(SillyTavern.getContext().chat ?? []) || !await se.canCopyWorlds()) return;
    if (!(await getPresetStatus(ref.chatId)).active) return;
    const settingId = await se.getChatSetting(ref.chatId);
    if (!settingId) return;
    const worlds = getWorlds();
    // A playthrough was made from a starting point already; only a world's
    // first use is kept on its own.
    if (worlds.playthroughs[settingId]) return;
    const family = familyOf(worlds, settingId);
    if (startingPointsOf(worlds, family).length) return;
    // A world already played has no clean "Original" to keep.
    const playedBefore = listChatKeys().some((key) => key !== chatKeyFor(ref) && getChatDoc(key).settingId === settingId && getChatDoc(key).turn > 0);
    if (playedBefore) return;
    const summary = await se.getSetting(settingId);
    if (!summary?.objectCount) return;
    await saveStartingPoint(settingId, { name: 'Original', auto: true });
}

// ---- deleting a playthrough

// Every chat of a playthrough, its world copy and Scenario Builder's data
// for them. options: { forgetMemories, deleteChats } - Archivist's
// memories of its chats, and the chat files (solo chats; group chats keep
// theirs - SillyTavern lists them in the group). -> { chats, memories, files, kept }
export async function deletePlaythrough(settingId, { forgetMemories = true, deleteChats = false } = {}) {
    const open = getCurrentChatRef();
    if (open && await se.getChatSetting(open.chatId) === settingId) {
        throw new Error('This is the playthrough open now. Start a new one, or open a chat of another, first.');
    }
    if ((await se.getSetting(settingId))?.isDefault) throw new Error('The Default setting cannot be deleted.');
    const keys = chatsOn(getSettings().chats, settingId);
    // The world first: if State Engine refuses, nothing else is gone.
    if (!await se.deleteSetting(settingId)) throw new Error('State Engine could not delete the world - see the browser console.');
    const report = { chats: keys.length, memories: 0, files: 0, kept: 0 };
    for (const key of keys) {
        if (forgetMemories && window.StateEngineArchivist?.forgetChat) {
            if (await window.StateEngineArchivist.forgetChat(key)) report.memories++;
        }
        if (deleteChats) {
            if (await deleteChatFile(key)) report.files++;
            else report.kept++;
        }
        deleteChatDoc(key);
    }
    deleteSettingDoc(settingId);
    updateWorlds((w) => { delete w.playthroughs[settingId]; });
    return report;
}

// A solo chat's file, through SillyTavern's own endpoint. -> boolean
async function deleteChatFile(chatKey) {
    const parsed = parseChatKey(chatKey);
    if (!parsed || parsed.kind !== 'char') return false;
    try {
        const response = await fetch('/api/chats/delete', {
            method: 'POST',
            headers: SillyTavern.getContext().getRequestHeaders(),
            body: JSON.stringify({ chatfile: `${parsed.chatId}.jsonl`, avatar_url: parsed.owner }),
        });
        return response.ok;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not delete the chat file', chatKey, err);
        return false;
    }
}

// ---- opening a playthrough's chat

export async function openChat(chatKey) {
    const parsed = parseChatKey(chatKey);
    if (!parsed) return;
    const context = SillyTavern.getContext();
    if (parsed.kind === 'group') return context.openGroupChat(parsed.owner, parsed.chatId);
    const index = (context.characters ?? []).findIndex((c) => c?.avatar === parsed.owner);
    if (index < 0) throw new Error('That character is no longer in SillyTavern.');
    if (String(context.characterId) !== String(index)) await context.selectCharacterById(index);
    await context.openCharacterChat(parsed.chatId);
}

// ---- the story so far, for a whole playthrough

// Every chat's volumes and the volume in progress, as Markdown.
export function playthroughStoryMarkdown(settingId, title) {
    const parts = [];
    for (const key of chatsOn(getSettings().chats, settingId)) {
        const gm = getChatDoc(key).gm;
        if (!gm.volumes.length && !gm.volume.chronicle.length) continue;
        const chatTitle = parseChatKey(key)?.chatId ?? key;
        parts.push(storyMarkdown(gm, chatTitle, { inProgress: true }).replace(/^# /, '## ').replace(/\n## /g, '\n### '));
    }
    return parts.length ? `# ${title}\n\n${parts.join('\n')}` : '';
}

export function downloadPlaythroughStory(settingId, name) {
    const text = playthroughStoryMarkdown(settingId, name);
    if (!text) return false;
    downloadText(`${safeFileName(`${name} - ${dateStamp()}`, 'story')}.md`, text, 'text/markdown');
    return true;
}

// ---- copying objects into another world

// `ids` (and Scenario Builder's metadata for them) copied from one world
// into another. -> { copied, droppedFields }
export async function copyEntriesTo(fromSettingId, ids, toSettingId) {
    const result = await se.copyObjects(fromSettingId, ids, toSettingId);
    if (!result?.idMap) throw new Error('State Engine could not copy them - see the browser console.');
    const { entries, relations } = metaForCopiedObjects(getSettingDoc(fromSettingId), result.idMap);
    updateSettingDoc(toSettingId, (doc) => {
        Object.assign(doc.entries, entries);
        doc.relations = [...doc.relations, ...relations];
        doc.tracked = [...new Set([...doc.tracked, ...Object.values(result.idMap)])];
    });
    return { copied: Object.keys(result.idMap).length, droppedFields: result.droppedFields ?? {} };
}

// ---- a deleted chat

// CHAT_DELETED / GROUP_CHAT_DELETED: the chat's document goes with it.
export function followDeletedChat(chatId, kind = 'char') {
    try {
        const context = SillyTavern.getContext();
        const owner = kind === 'group' ? String(context.groupId ?? '') : String(context.characters?.[context.characterId]?.avatar ?? '');
        const key = deletedChatKey(listChatKeys(), String(chatId ?? '').replace(/\.jsonl$/i, ''), { kind, owner });
        if (key) deleteChatDoc(key);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not forget the deleted chat', err);
    }
}
