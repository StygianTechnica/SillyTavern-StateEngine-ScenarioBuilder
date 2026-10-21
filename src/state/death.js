// Death is remembered (docs/ROADMAP.md, Combat). Someone who dies in a story
// is marked dead in that chat, taken out of the scene, and never brought
// back by the director, the story's reading, State Engine's tracker or the
// review - unless the user brings them back by hand (raised as undead,
// resurrected). They can still be mourned, remembered and spoken of.
//
// The record is the chat document's `dead` list. The guard is in
// setCanonical (src/state/canonical.js): a cast change from anyone but the
// user never puts a dead character back. The director reports deaths with a
// DIES line (src/director/prompt.js); the user marks them on the sheet.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const DEAD_LIMIT = 200;

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
    })).filter((d) => d.id && !seen.has(d.id) && seen.add(d.id)).slice(-DEAD_LIMIT);
}

export const deadIds = (doc) => new Set((doc?.dead ?? []).map((d) => d.id));
export const isDead = (doc, id) => (doc?.dead ?? []).some((d) => d.id === id);

// The cast with the dead taken out. -> ids
export const withoutDead = (ids, dead) => (ids ?? []).filter((id) => !dead.has(id));

// What the director and the narrator are told: the most recent deaths.
// -> text, or '' when no one has died.
export function deadText(doc, { max = 8 } = {}) {
    const list = (doc?.dead ?? []).slice(-max);
    if (!list.length) return '';
    return `${list.map((d) => `${d.name}${d.how ? ` (${d.how})` : ''}`).join('; ')}.`;
}

// ---- runners (the chat document; never throw)

// Marks someone dead in this chat and takes them out of the scene.
// -> true when they were marked now.
export async function markDead(chatKey, { id, name = '', how = '', source = 'director', chatId = null } = {}) {
    try {
        if (!clean(id)) return false;
        const { getChatDoc, updateChatDoc } = await import('../store/chat-store.js');
        const { setCanonical } = await import('./canonical.js');
        if (isDead(getChatDoc(chatKey), id)) return false;
        updateChatDoc(chatKey, (d) => { d.dead = normalizeDead([...d.dead, { id, name, how, at: new Date().toISOString(), source }]); });
        const doc = getChatDoc(chatKey);
        // A person, or a creature that is one being (a pet, a mount).
        for (const key of ['castIds', 'creatureIds']) {
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

// Brings someone back (the user's choice): no longer dead in this chat.
export async function bringBack(chatKey, id) {
    try {
        const { updateChatDoc } = await import('../store/chat-store.js');
        updateChatDoc(chatKey, (d) => { d.dead = d.dead.filter((x) => x.id !== id); });
        return true;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not bring someone back', err);
        return false;
    }
}
