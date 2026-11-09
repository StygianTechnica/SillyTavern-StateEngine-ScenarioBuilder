// Detained: jailed, or held by authorities or a side, for a time. Not dead -
// the sibling of src/state/death.js. Someone detained is marked in that chat
// and taken out of the scene, and neither the director, the story's reading
// nor State Engine's tracker puts them back. They come out when the story
// frees them (the director's RELEASED line), when the user does (Release, or
// bringing them into the scene), when the reply that held them is taken
// back, or when their faction gets them out: a faction with someone inside
// has them free after FREE_AFTER_DAYS of story time, sooner if its scheme to
// free them (src/world/model.js startRescue) is done - never if the user
// drops the scheme. Those are the world's own moves: no extra model call.
//
// The record is the chat document's `detained` list; the guard is in
// setCanonical (src/state/canonical.js).

import { deadIds } from './death.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const lower = (text) => clean(text).toLowerCase();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const DETAINED_LIMIT = 100;
// How long a faction takes to get one of its own out, in story days.
export const FREE_AFTER_DAYS = 5;

export function normalizeDetained(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(isObject).map((d) => ({
        id: clean(d.id),
        name: clean(d.name).slice(0, 120),
        // Who holds them and why ("the city police, for the museum job").
        how: clean(d.how).slice(0, 200),
        at: clean(d.at),
        source: d.source === 'user' || d.source === 'world' ? d.source : 'director',
        // The chat message of the reply that held them: taking it back undoes it.
        reply: Number.isInteger(d.reply) && d.reply >= 0 ? d.reply : null,
        wasHere: d.wasHere === 'castIds' ? 'castIds' : '',
        day: Number.isInteger(d.day) ? d.day : null,
        // The story day their faction has them out by; null: only the story
        // or the user frees them.
        freeDay: Number.isInteger(d.freeDay) ? d.freeDay : null,
        freedBy: clean(d.freedBy).slice(0, 120),
        schemeId: clean(d.schemeId),
    })).filter((d) => d.id && !seen.has(d.id) && seen.add(d.id)).slice(-DETAINED_LIMIT);
}

export const detainedIds = (doc) => new Set((doc?.detained ?? []).map((d) => d.id));
export const isDetained = (doc, id) => (doc?.detained ?? []).some((d) => d.id === id);
export const withoutDetained = (ids, held) => (ids ?? []).filter((id) => !held.has(id));

// Those a reply from message `fromIndex` on detained: they go when the chat
// is taken back to before it. The user's own stay.
export const detainedFrom = (list, fromIndex) => (list ?? []).filter((d) => d.source === 'director' && d.reply !== null && d.reply >= fromIndex);

export function detainedByName(list, name) {
    const key = lower(name);
    return (list ?? []).find((d) => lower(d.name) === key) ?? null;
}

// What the director and the narrator are told. recentText: the latest
// messages - only those they mention are listed; the rest cost tokens and
// invite the model to bring them up. -> text, or '' when there is no one.
export function detainedText(doc, { max = 6, about = () => '', recentText = null } = {}) {
    const dead = deadIds(doc);
    const mentioned = (d) => [clean(d.name), clean(d.name).split(/[\s,]+/)[0]].filter((n) => n.length >= 3)
        .some((n) => new RegExp(`(^|[^\\p{L}])${escape(n)}(?=$|[^\\p{L}])`, 'iu').test(String(recentText)));
    const list = (doc?.detained ?? []).filter((d) => !dead.has(d.id) && (recentText === null || mentioned(d))).slice(-max);
    if (!list.length) return '';
    return `${list.map((d) => { const who = clean(about(d.id)); return `${d.name}${who ? `, ${who}` : ''}${d.how ? ` (held: ${d.how})` : ''}`; }).join('; ')}.`;
}

// Whether a DETAINED line says something custody-like. "Held at gunpoint"
// and the like are a moment in a scene, not someone led away for a time.
const CUSTODY = /\b(?:arrest\w*|jail\w*|gaol\w*|prison\w*|imprison\w*|cell|cells|custody|captive\w*|captur\w*|detain\w*|locked (?:up|away|in)|brig|dungeon\w*|stockade|held|handcuff\w*|shackl\w*|manacl\w*|taken in|hauled (?:off|away|in)|led away|police|guards?|watch|warrant|authorities|magistrate|court)\b/i;
const ONLY_A_MOMENT = /\b(?:at (?:gun|knife|sword|spear|blade|wand)?\s*point|gunpoint|knifepoint|swordpoint|at bay|in (?:a|his|her|their) (?:grip|sights?))\b/i;
export const soundsHeld = (how) => CUSTODY.test(clean(how)) && !ONLY_A_MOMENT.test(clean(how));

// Who works to free them: their first faction that is not the one holding
// them. factions: the person's [{ id, name, aliases }]. -> a faction or null.
export function rescuerOf(factions = [], how = '') {
    const held = lower(how);
    return (factions ?? []).find((f) => ![f?.name, ...(f?.aliases ?? f?.base?.aliases ?? [])].map(lower).filter(Boolean).some((n) => held.includes(n))) ?? null;
}

// Who comes out now. schemes: the world's. A scheme done has them out at
// once; one given up (dropped or failed) means no one is working on it any
// more; one the user paused holds the date back. A scheme since forgotten
// leaves the date standing. today may be null (no clock).
// -> { out: [record], stopped: [id] }
export function dueToLeave(list, schemes = [], today = null) {
    const out = [];
    const stopped = [];
    for (const d of list ?? []) {
        const s = d.schemeId ? (schemes ?? []).find((x) => x.id === d.schemeId) : null;
        if (s?.status === 'done') out.push(d);
        else if (s && (s.status === 'dropped' || s.status === 'failed')) { if (d.freeDay !== null) stopped.push(d.id); } else if (!s?.held && d.freeDay !== null && Number.isInteger(today) && today >= d.freeDay) out.push(d);
    }
    return { out, stopped };
}

// What the story hears when a faction has them out.
export const outOfCustody = (d) => `${d.name} is out of custody${d.freedBy ? `, thanks to ${d.freedBy}` : ''}.`;

// Takes these people off the list, and ends the schemes to free them (kept
// as done, or forgotten when it never happened). Inside a chat-doc update.
export function freeInDoc(doc, ids, { forget = false } = {}) {
    const gone = new Set(ids ?? []);
    doc.detained = (doc.detained ?? []).filter((d) => !gone.has(d.id));
    const world = doc.gm?.world;
    if (!world?.schemes) return;
    const theirs = (s) => s.frees && gone.has(s.frees);
    if (forget) world.schemes = world.schemes.filter((s) => !theirs(s));
    else for (const s of world.schemes) if (theirs(s) && (s.status === 'under way' || s.status === 'stalled')) { s.status = 'done'; s.done = s.steps.length; }
}

// ---- runners (the chat document; never throw)

// Marks someone detained and takes them out of the scene. faction: who will
// work to free them ({ id, name }), if anyone; scheme: also start the world's
// scheme for it. -> true when they were marked now.
export async function markDetained(chatKey, { id, name = '', how = '', source = 'director', chatId = null, reply = null, faction = null, scheme = false } = {}) {
    try {
        if (!clean(id)) return false;
        const { getChatDoc, updateChatDoc } = await import('../store/chat-store.js');
        const { setCanonical } = await import('./canonical.js');
        const { newLocalId } = await import('../store/schema.js');
        const { startRescue } = await import('../world/model.js');
        const doc = getChatDoc(chatKey);
        if (isDetained(doc, id) || deadIds(doc).has(id)) return false;
        const wasHere = doc.canonical.castIds.includes(id) ? 'castIds' : '';
        const day = Number.isInteger(doc.canonical.day) ? doc.canonical.day : null;
        const freeDay = faction?.id && day !== null ? day + FREE_AFTER_DAYS : null;
        const at = new Date().toISOString();
        updateChatDoc(chatKey, (d) => {
            let schemeId = '';
            if (faction?.id && scheme) schemeId = startRescue(d.gm.world, { factionId: faction.id, factionName: clean(faction.name), personId: id, person: name, how, day, at, newId: newLocalId })?.id ?? '';
            d.detained = normalizeDetained([...(d.detained ?? []), { id, name, how, at, source, reply, wasHere, day, freeDay, freedBy: faction?.name ?? '', schemeId }]);
        });
        const now = getChatDoc(chatKey);
        if (now.canonical.castIds.includes(id)) setCanonical(chatKey, { castIds: now.canonical.castIds.filter((x) => x !== id) }, { chatId, source: source === 'user' ? 'user' : 'director', note: `${name || 'Someone'} detained${how ? ` - ${how}` : ''}` });
        return true;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not mark someone detained', err);
        return false;
    }
}

// The user says who holds them. It is then the user's: taking back the
// reply the director reported it in no longer undoes it.
export async function setDetainedHow(chatKey, id, how) {
    try {
        const { updateChatDoc } = await import('../store/chat-store.js');
        updateChatDoc(chatKey, (d) => { d.detained = normalizeDetained((d.detained ?? []).map((x) => (x.id === id ? { ...x, how: clean(how), source: 'user', reply: null } : x))); });
        return true;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not change who holds them', err);
        return false;
    }
}

// No longer detained. `intoScene`: they are in the scene again. forget: it
// never happened, so the scheme to free them goes too.
export async function release(chatKey, id, { intoScene = false, chatId = null, note = '', forget = false } = {}) {
    try {
        const { getChatDoc, updateChatDoc } = await import('../store/chat-store.js');
        updateChatDoc(chatKey, (d) => freeInDoc(d, [id], { forget }));
        if (intoScene) {
            const { setCanonical } = await import('./canonical.js');
            const list = getChatDoc(chatKey).canonical.castIds;
            if (!list.includes(id)) setCanonical(chatKey, { castIds: [...list, id] }, { chatId, source: 'revert', note: note || 'No longer detained' });
        }
        return true;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not release someone', err);
        return false;
    }
}

// The chat was taken back to before message `fromIndex`: those its replies
// detained are free again, and back in the scene if they were in it.
export async function undoDetainedFrom(chatKey, fromIndex, chatId = null) {
    try {
        const { getChatDoc } = await import('../store/chat-store.js');
        const back = [];
        for (const d of detainedFrom(getChatDoc(chatKey).detained, fromIndex)) {
            if (await release(chatKey, d.id, { intoScene: d.wasHere === 'castIds', chatId, forget: true, note: `${d.name}'s detention was taken back with the reply` })) back.push(d.name);
        }
        return back;
    } catch (err) {
        console.warn('[ScenarioBuilder] could not undo the detentions', err);
        return [];
    }
}

// Before a reply: those whose faction has got them out are out, and word of
// it goes on the agenda, from where it reaches the story when there is room
// (src/planner/model.js waitingHappening). They are not put in the scene.
// -> the names of those released.
export async function settleDetained(chatKey) {
    try {
        const { getChatDoc, updateChatDoc } = await import('../store/chat-store.js');
        const { newLocalId } = await import('../store/schema.js');
        const { addHappening } = await import('../planner/model.js');
        const doc = getChatDoc(chatKey);
        if (!doc.detained?.length) return [];
        const dead = deadIds(doc);
        const today = doc.canonical.day;
        const { out, stopped } = dueToLeave(doc.detained.filter((d) => !dead.has(d.id)), doc.gm?.world?.schemes ?? [], today);
        if (!out.length && !stopped.length) return [];
        updateChatDoc(chatKey, (d) => {
            d.detained = (d.detained ?? []).map((x) => (stopped.includes(x.id) ? { ...x, freeDay: null } : x));
            freeInDoc(d, out.map((x) => x.id));
            if (Number.isInteger(today)) for (const x of out) addHappening(d.gm, { id: newLocalId('ag'), text: outOfCustody(x), day: today, source: 'world', ties: [x.name, x.freedBy].filter(Boolean) });
        });
        return out.map((x) => x.name);
    } catch (err) {
        console.warn('[ScenarioBuilder] could not settle who is detained', err);
        return [];
    }
}
