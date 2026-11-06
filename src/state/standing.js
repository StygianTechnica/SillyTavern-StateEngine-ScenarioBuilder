// Standing from the story - the runners (the pure half, and the why:
// src/state/standing-model.js). No model call. Never throw.

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { getSettingDoc } from '../store/setting-store.js';
import { standingMarks, addMarks, moveStanding, dismissPattern, normalizeStanding } from './standing-model.js';

export * from './standing-model.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const text = (v) => (typeof v === 'string' ? v : '');

// The people standing is kept for: the library's characters, the player
// character marked (their own standing is never kept; their posts and
// pronouns still count), with each one's he / she.
async function peopleOf(chatId, settingId) {
    const lib = await import('../library/library.js');
    const { personGender } = await import('../naming/classify.js');
    const characters = await lib.listEntries(chatId, settingId, 'character').catch(() => []);
    const playerId = lib.playerIdOf(settingId, characters);
    const powers = getSettingDoc(settingId)?.entries ?? {};
    return characters.filter((c) => powers[c.id]?.power?.on !== true).map((c) => {
        const base = c.base ?? {};
        const g = personGender({ name: c.name, own: [c.description, base.description], more: [text(base.personality), text(c.personality)] });
        return { id: c.id, name: c.name, aliases: c.aliases ?? base.aliases ?? [], gender: g, player: c.id === playerId };
    });
}

// Who was in the scene at chat message `index`: the presence record (by
// name) near it, else the cast now.
function presentAt(doc, people, index) {
    const near = Object.entries(doc.present ?? {}).filter(([, i]) => Math.abs(i - index) <= 4).map(([n]) => n);
    const ids = people.filter((p) => [p.name, ...p.aliases].some((n) => near.includes(clean(n).toLowerCase()))).map((p) => p.id);
    return ids.length ? ids : [...(doc.canonical?.castIds ?? [])];
}

let scanning = false;

// After a reply (and when Archivist's memories change): what people did,
// taken in; a pattern waits in Review. -> how many people have one open.
export async function scanStanding(chatId, chatKey, settingId) {
    if (scanning || !settingId) return 0;
    const { getSettings } = await import('../settings.js');
    if (getSettings().standing?.suggest === false) return 0;
    scanning = true;
    try {
        const people = await peopleOf(chatId, settingId);
        if (!people.length) return 0;
        const doc = getChatDoc(chatKey);
        const memories = typeof window.StateEngineArchivist?.getAllMemories === 'function' ? await window.StateEngineArchivist.getAllMemories() : [];
        const items = (Array.isArray(memories) ? memories : []).map((m) => ({ key: clean(m?.id), text: m?.text, witnesses: m?.witness_ids ?? [] }));
        const chat = SillyTavern.getContext().chat ?? [];
        chat.forEach((m, i) => {
            if (!m?.is_user || m.is_system || typeof m.mes !== 'string') return;
            // The post as it stands: an edit is read again.
            items.push({ key: `post:${i}:${m.mes.length}:${m.mes.slice(0, 24)}`, text: m.mes, witnesses: presentAt(doc, people, i), post: true });
        });
        const { found, seen } = standingMarks(items, { people, seen: doc.standing.seen });
        updateChatDoc(chatKey, (d) => {
            const s = addMarks(d.standing, found);
            // Each named, for Review and the planner.
            for (const p of people) if (s.people[p.id]) s.people[p.id].name = p.name;
            d.standing = { ...s, seen, started: true };
        });
        const n = Object.keys(found).length;
        if (n) console.info(LOG_PREFIX, `what ${people.filter((p) => found[p.id]).map((p) => p.name).join(', ')} did in the story was noted for their standing`);
        return n;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read standing from the story', err);
        return 0;
    } finally {
        scanning = false;
    }
}

// The user moves someone's standing a step (sign -1 or 1): by hand, or
// taking the pattern Review offers. by: who holds it ([] = all who know
// them).
export function setStanding(chatKey, personId, sign, { by = [], line = null, name = '', steps = 1 } = {}) {
    updateChatDoc(chatKey, (d) => {
        const s = normalizeStanding(d.standing);
        s.people[personId] = { ...moveStanding(s.people[personId], sign, { by, line, steps }), ...(clean(name) ? { name: clean(name) } : {}) };
        d.standing = s;
    });
}

export function setStandingLine(chatKey, personId, line) {
    updateChatDoc(chatKey, (d) => {
        const s = normalizeStanding(d.standing);
        const p = s.people[personId] ?? moveStanding({}, 0);
        p.line = clean(line).slice(0, 300);
        s.people[personId] = p;
        d.standing = s;
    });
}

export function dismissStanding(chatKey, personId) {
    updateChatDoc(chatKey, (d) => {
        const s = normalizeStanding(d.standing);
        if (s.people[personId]) s.people[personId] = dismissPattern(s.people[personId]);
        d.standing = s;
    });
}
