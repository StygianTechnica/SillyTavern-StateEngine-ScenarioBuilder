// Worlds, starting points and playthroughs - the pure half (the runner is
// src/worlds/run.js).
//
// A STARTING POINT is a world as it stood at some moment - before the story
// began ("Original"), or whenever the user saved one: State Engine's export
// of the setting (its objects and fields) plus Scenario Builder's library
// document for it. It is kept as a file in the user's data folder, and can
// be downloaded and loaded again (a WORLD FILE).
//
// A PLAYTHROUGH is one copy of a world (a State Engine setting) and the
// chats that use it. Starting over makes a new one from a starting point;
// the old one is untouched until the user deletes it. Every playthrough
// made from a world belongs to that world's FAMILY (the setting id of the
// world it all began with); a setting with no record is a family of its own.
//
//   settings.worlds = {
//     startingPoints: { [id]: { id, family, familyName, name, savedAt, fileName,
//                               objectCount, auto } },
//     playthroughs:   { [settingId]: { family, familyName, number, startingPointId, createdAt } },
//   }

export const WORLD_FILE_FORMAT = 'scenario-builder-world';
export const WORLD_FILE_VERSION = 1;
export const STATE_ENGINE_FORMAT = 'state-engine-setting';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ---- world files

export function buildWorldFile({ name, setting, library, savedAt = new Date().toISOString() }) {
    return { format: WORLD_FILE_FORMAT, version: WORLD_FILE_VERSION, name: str(name) || str(setting?.name) || 'World', savedAt, setting, library: isObject(library) ? library : {} };
}

// Throws, with a message for the user, when `data` is not a world file this
// version reads.
export function checkWorldFile(data) {
    if (!isObject(data) || data.format !== WORLD_FILE_FORMAT) throw new Error('This is not a Scenario Builder world file.');
    if (data.version !== WORLD_FILE_VERSION) throw new Error(`This world file is version ${JSON.stringify(data.version)}; this Scenario Builder reads version ${WORLD_FILE_VERSION}.`);
    if (!isObject(data.setting) || data.setting.format !== STATE_ENGINE_FORMAT || !isObject(data.setting.objects)) throw new Error('The world file has no State Engine setting in it.');
    return data;
}

export function objectCountOf(seExport) {
    return Object.values(seExport?.objects ?? {}).reduce((sum, records) => sum + Object.keys(records ?? {}).length, 0);
}

// ---- ids

// `value` with every id in `idMap` replaced by its new one - strings and
// object keys, at any depth. Object ids are prefixed random strings, so a
// string equal to one is a reference to it.
export function remapIds(value, idMap) {
    if (typeof value === 'string') return Object.hasOwn(idMap, value) ? idMap[value] : value;
    if (Array.isArray(value)) return value.map((v) => remapIds(v, idMap));
    if (!isObject(value)) return value;
    const out = {};
    for (const [key, v] of Object.entries(value)) out[Object.hasOwn(idMap, key) ? idMap[key] : key] = remapIds(v, idMap);
    return out;
}

// The library document for a whole copy of a world. The import history
// stays behind: its undo records belong to the world they were made in.
export function libraryForCopy(doc, idMap) {
    const out = remapIds(structuredClone(isObject(doc) ? doc : {}), idMap);
    out.imports = [];
    return out;
}

// Scenario Builder's metadata for objects copied into another world: each
// one's entry (a parent left behind is dropped), and the relationships
// among the copied objects. -> { entries: { [newId]: meta }, relations }
export function metaForCopiedObjects(doc, idMap) {
    const entries = {};
    const mapped = new Set(Object.values(idMap));
    for (const [oldId, newId] of Object.entries(idMap)) {
        const meta = doc?.entries?.[oldId];
        if (!isObject(meta)) continue;
        const copy = remapIds(structuredClone(meta), idMap);
        if (copy.parentId && !mapped.has(copy.parentId)) copy.parentId = null;
        if (Array.isArray(copy.patrons)) copy.patrons = copy.patrons.filter((id) => mapped.has(id));
        copy.enrichments = [];
        entries[newId] = copy;
    }
    const relations = (Array.isArray(doc?.relations) ? doc.relations : [])
        .filter((r) => isObject(r) && Object.hasOwn(idMap, r.from) && Object.hasOwn(idMap, r.to))
        .map((r) => ({ ...r, id: '', from: idMap[r.from], to: idMap[r.to] }));
    return { entries, relations };
}

// ---- a clean copy (a world played before it had a starting point)

// The export without what the story or the director added (entries whose
// origin says so). Edits to the user's own entries cannot be told apart, so
// they stay. -> { setting, left: count }
export function withoutStoryAdditions(seExport, doc) {
    const out = structuredClone(seExport);
    let left = 0;
    for (const records of Object.values(out.objects ?? {})) {
        for (const id of Object.keys(records ?? {})) {
            const origin = doc?.entries?.[id]?.origin;
            if (origin === 'story' || origin === 'director') {
                delete records[id];
                left++;
            }
        }
    }
    return { setting: out, left };
}

// ---- starting points and playthroughs

export function emptyWorlds() {
    return { startingPoints: {}, playthroughs: {} };
}

export function normalizeWorlds(raw) {
    const r = isObject(raw) ? raw : {};
    const startingPoints = {};
    for (const p of Object.values(isObject(r.startingPoints) ? r.startingPoints : {})) {
        if (!isObject(p) || !str(p.id) || !str(p.family) || !str(p.fileName)) continue;
        startingPoints[p.id] = {
            id: p.id, family: p.family, familyName: str(p.familyName), name: str(p.name) || 'Starting point',
            savedAt: str(p.savedAt), fileName: p.fileName, objectCount: Number.isInteger(p.objectCount) ? p.objectCount : 0, auto: p.auto === true,
        };
    }
    const playthroughs = {};
    for (const [settingId, p] of Object.entries(isObject(r.playthroughs) ? r.playthroughs : {})) {
        if (!isObject(p) || !str(p.family)) continue;
        playthroughs[settingId] = {
            family: p.family, familyName: str(p.familyName), number: Number.isInteger(p.number) && p.number > 0 ? p.number : 2,
            startingPointId: str(p.startingPointId), createdAt: str(p.createdAt),
        };
    }
    return { startingPoints, playthroughs };
}

// The family a setting belongs to (its own id when it began one).
export function familyOf(worlds, settingId) {
    return worlds.playthroughs[settingId]?.family ?? settingId;
}

// The settings of a family, in order - the world it began with first.
// `settings`: State Engine's summaries. -> [{ setting, number, record }]
export function playthroughsOf(worlds, family, settings) {
    return settings
        .filter((s) => s.id === family || worlds.playthroughs[s.id]?.family === family)
        .map((s) => ({ setting: s, number: s.id === family ? 1 : worlds.playthroughs[s.id].number, record: worlds.playthroughs[s.id] ?? null }))
        .sort((a, b) => a.number - b.number);
}

export function startingPointsOf(worlds, family) {
    return Object.values(worlds.startingPoints).filter((p) => p.family === family)
        .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

// The family's name: the world it began with, or what its records remember.
export function familyNameOf(worlds, family, settings) {
    return settings.find((s) => s.id === family)?.name
        ?? Object.values(worlds.playthroughs).find((p) => p.family === family && p.familyName)?.familyName
        ?? Object.values(worlds.startingPoints).find((p) => p.family === family && p.familyName)?.familyName
        ?? 'World';
}

export function nextPlaythroughNumber(worlds, family) {
    const used = Object.values(worlds.playthroughs).filter((p) => p.family === family).map((p) => p.number);
    return Math.max(1, ...used) + 1;
}

export const playthroughName = (familyName, number) => `${familyName} - Playthrough ${number}`;

// The chat keys of chats on `settingId`. `chats`: { [chatKey]: doc }.
export function chatsOn(chats, settingId) {
    return Object.entries(isObject(chats) ? chats : {}).filter(([, doc]) => doc?.settingId === settingId).map(([key]) => key);
}

// The story has not begun while nothing has answered the user's first
// message (a greeting before it is fine). `chat`: SillyTavern's messages.
export function storyNotBegun(chat) {
    const list = Array.isArray(chat) ? chat : [];
    const first = list.findIndex((m) => m?.is_user);
    return first < 0 || !list.slice(first + 1).some((m) => m && !m.is_user && !m.is_system);
}

// "char:<avatar>:<chatId>" / "group:<groupId>:<chatId>" -> { kind, owner, chatId } or null.
export function parseChatKey(chatKey) {
    const m = /^(char|group):([^:]*):(.+)$/.exec(String(chatKey ?? ''));
    return m ? { kind: m[1], owner: m[2], chatId: m[3] } : null;
}

// Which stored chat a deleted chat was: the key for `owner` when there is
// one, else the only key with that chat id. -> chatKey or null.
export function deletedChatKey(keys, chatId, { kind = 'char', owner = '' } = {}) {
    const exact = `${kind}:${owner}:${chatId}`;
    if (keys.includes(exact)) return exact;
    const same = keys.filter((k) => parseChatKey(k)?.chatId === chatId && parseChatKey(k)?.kind === kind);
    return same.length === 1 ? same[0] : null;
}
