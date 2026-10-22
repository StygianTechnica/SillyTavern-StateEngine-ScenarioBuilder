// Death is remembered (docs/ROADMAP.md, Combat). Someone who dies in a story
// is marked dead in that chat, taken out of the scene, and never brought
// back by the director, the story's reading, State Engine's tracker or the
// review - unless the story itself brings them back (the director's RISES
// line: resurrected, raised as undead), the user does (Bring back), or the
// reply they died in is taken back (deleted, swiped or edited - their death
// goes with it). They can still be mourned, remembered and spoken of.
//
// The record is the chat document's `dead` list. The guard is in
// setCanonical (src/state/canonical.js): a cast change from anyone but the
// user never puts a dead character back. The director reports deaths with a
// DIES line (src/director/prompt.js); the user marks them on the sheet.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const DEAD_LIMIT = 200;
const SCENE_KEYS = Object.freeze(['castIds', 'creatureIds']);

export function normalizeDead(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(isObject).map((d) => ({
        id: clean(d.id),
        name: clean(d.name).slice(0, 120),
        // How they died, in a few words ("cut down by the Eternal Champion").
        how: clean(d.how).slice(0, 200),
        at: clean(d.at),
        // Who said so: the director (from the story) or the user.
        source: d.source === 'user' ? 'user' : 'director',
        // The chat message (SillyTavern's index) of the reply they died in -
        // a story death only; taking that reply back undoes it.
        reply: Number.isInteger(d.reply) && d.reply >= 0 ? d.reply : null,
        // Where in the scene they were when they died ('castIds' or
        // 'creatureIds'), so an undone death puts them back.
        wasHere: SCENE_KEYS.includes(d.wasHere) ? d.wasHere : '',
    })).filter((d) => d.id && !seen.has(d.id) && seen.add(d.id)).slice(-DEAD_LIMIT);
}

export const deadIds = (doc) => new Set((doc?.dead ?? []).map((d) => d.id));
export const isDead = (doc, id) => (doc?.dead ?? []).some((d) => d.id === id);

// The cast with the dead taken out. -> ids
export const withoutDead = (ids, dead) => (ids ?? []).filter((id) => !dead.has(id));

// The story deaths a reply from message `fromIndex` on brought about - those
// that go when the chat is taken back to before it. The user's own stay.
export const deathsFrom = (dead, fromIndex) => (dead ?? []).filter((d) => d.source === 'director' && d.reply !== null && d.reply >= fromIndex);

// Whether the story already shows someone dead: a sentence that names them
// (full or first name) with a word of death - "Varyn's lifeless form",
// "Kael held Varyn's bleeding body", "Varyn was dead". A death the director
// only reported later stands when the story before that reply shows it.
const DEATH_WORDS = /\b(dead|died|dies|death|killed|slain|slew|lifeless|corpse|body|perished|murdered|no longer breath(?:ing|ed)|breathed (?:his|her|their) last|lay still)\b/i;
export function shownDeadIn(name, text) {
    const names = [clean(name), clean(name).split(/[\s,]+/)[0]].filter((n) => n.length >= 3);
    const sentences = String(text ?? '').split(/(?<=[.!?…])\s+|\n+/);
    return sentences.some((s) => DEATH_WORDS.test(s) && names.some((n) => new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'iu').test(s)));
}

// The dead person a RISES line names. -> their record or null.
export function deadByName(dead, name) {
    const key = clean(name).toLowerCase();
    return (dead ?? []).find((d) => d.name.toLowerCase() === key) ?? null;
}

// What the director and the narrator are told: the most recent deaths, each
// with who they were (`about(id)`: "champion of Ferunox") - out of the cast,
// a dead person's ties are otherwise forgotten, and a small model fills the
// gap with whatever the scene is full of. -> text, or '' when no one has died.
export function deadText(doc, { max = 8, about = () => '' } = {}) {
    const list = (doc?.dead ?? []).slice(-max);
    if (!list.length) return '';
    return `${list.map((d) => { const who = clean(about(d.id)); return `${d.name}${who ? `, ${who}` : ''}${d.how ? ` (${d.how})` : ''}`; }).join('; ')}.`;
}

// Whether a line of text puts someone in the scene who cannot be there - a
// power (no body) or the dead - by any of their names ("Ferunox, the
// Sovereign of the Unbound Ember is still present in this scene").
export function placesTheAbsent(text, names = []) {
    const t = clean(text).toLowerCase();
    if (!/\b(present|here|in this scene|joined|arrives?|arrived)\b/.test(t)) return false;
    return names.some((n) => { const k = clean(n).toLowerCase(); return k.length >= 3 && t.includes(k); });
}

// ---- runners (the chat document; never throw)

// Marks someone dead in this chat and takes them out of the scene. `reply`:
// the message index of the reply they die in (a story death).
// -> true when they were marked now.
export async function markDead(chatKey, { id, name = '', how = '', source = 'director', chatId = null, reply = null } = {}) {
    try {
        if (!clean(id)) return false;
        const { getChatDoc, updateChatDoc } = await import('../store/chat-store.js');
        const { setCanonical } = await import('./canonical.js');
        if (isDead(getChatDoc(chatKey), id)) return false;
        const wasHere = SCENE_KEYS.find((key) => getChatDoc(chatKey).canonical[key].includes(id)) ?? '';
        updateChatDoc(chatKey, (d) => { d.dead = normalizeDead([...d.dead, { id, name, how, at: new Date().toISOString(), source, reply, wasHere }]); });
        const doc = getChatDoc(chatKey);
        // A person, or a creature that is one being (a pet, a mount).
        for (const key of SCENE_KEYS) {
            if (doc.canonical[key].includes(id)) {
                setCanonical(chatKey, { [key]: doc.canonical[key].filter((x) => x !== id) }, { chatId, source: source === 'user' ? 'user' : 'director', note: `${name || 'Someone'} died${how ? ` - ${how}` : ''}` });
            }
        }
        return true;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not mark a death', err);
        return false;
    }
}

// The user corrects how someone died ("killed by the Eternal Champion, not
// Maziel"). The death is then the user's: taking back the reply the director
// reported it in no longer undoes it.
export async function setDeathHow(chatKey, id, how) {
    try {
        const { updateChatDoc } = await import('../store/chat-store.js');
        updateChatDoc(chatKey, (d) => { d.dead = normalizeDead(d.dead.map((x) => (x.id === id ? { ...x, how: clean(how), source: 'user', reply: null } : x))); });
        return true;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not change how they died', err);
        return false;
    }
}

// Brings someone back (the user's choice): no longer dead in this chat.
// With `intoScene` ('castIds' | 'creatureIds') they are in the scene again.
export async function bringBack(chatKey, id, { intoScene = '', chatId = null, note = '' } = {}) {
    try {
        const { getChatDoc, updateChatDoc } = await import('../store/chat-store.js');
        updateChatDoc(chatKey, (d) => { d.dead = d.dead.filter((x) => x.id !== id); });
        if (SCENE_KEYS.includes(intoScene)) {
            const { setCanonical } = await import('./canonical.js');
            const list = getChatDoc(chatKey).canonical[intoScene];
            if (!list.includes(id)) setCanonical(chatKey, { [intoScene]: [...list, id] }, { chatId, source: 'revert', note: note || 'Back from the dead' });
        }
        return true;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not bring someone back', err);
        return false;
    }
}

// The chat was taken back to before message `fromIndex` (a reply deleted,
// swiped or edited): the deaths those replies brought about are undone, and
// whoever was in the scene when they died is back in it. -> names brought back
// `before`: the story before that message - a death it already shows
// (reported only later by the director) stands.
export async function undoDeathsFrom(chatKey, fromIndex, chatId = null, { before = '' } = {}) {
    try {
        const { getChatDoc } = await import('../store/chat-store.js');
        const back = [];
        for (const d of deathsFrom(getChatDoc(chatKey).dead, fromIndex)) {
            if (before && shownDeadIn(d.name, before)) continue;
            if (await bringBack(chatKey, d.id, { intoScene: d.wasHere, chatId, note: `${d.name}'s death was taken back with the reply` })) back.push(d.name);
        }
        return back;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not undo the deaths', err);
        return [];
    }
}
