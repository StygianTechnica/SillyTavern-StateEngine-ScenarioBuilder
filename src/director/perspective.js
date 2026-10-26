// Perspective: what each person in the scene does NOT know. People know
// only what they witnessed or were told, but the director reads every
// memory and the narrator reads the director, so a companion ends up
// talking about a vision the player character had in their sleep, or about
// a power they never saw. Archivist records who witnessed each memory
// (witness_ids; a private inner experience - a dream, vision, thought - is
// witnessed only by the one who had it), so for each person present other
// than the player the director is given a short list of the memories that
// matter now and that this person was not there for.
//
// Older memories have no witnesses recorded (Archivist asked for them as
// optional until 2026-10-19). Of those, only one that reads as a person's
// inner experience ("Remus had a vivid vision of...") is used - as private
// to that person - and only while no later memory shows it was told or
// shared. The rest cannot say who was not there and are left out.
//
// No model call: the memories come from Archivist's API
// (window.StateEngineArchivist.getAllMemories) and are picked here. The
// picking is pure and tested; run.js reads the memories and passes them in.

import { estimateTokens } from '../guidance/budget.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

export const PERSPECTIVE_PER_PERSON = 3;
export const PERSPECTIVE_TOKENS = 600;
// Only the newest memories are looked at: a person who joined late was not
// there for most of the story, and what is far back rarely comes up.
export const PERSPECTIVE_WINDOW = 80;

const IMPORTANCE = { high: 3, medium: 2, low: 1 };
const STOP = new Set(['about', 'after', 'again', 'against', 'before', 'being', 'their', 'there', 'these', 'those', 'which', 'while', 'where', 'would', 'could', 'should', 'other', 'into', 'from', 'with', 'that', 'this', 'what', 'when', 'them', 'they', 'were', 'have', 'been', 'said', 'tells', 'told']);
const TOLD = /\b(?:tell|tells|told|telling|talk(?:s|ed)? about|mention(?:s|ed)?|explain(?:s|ed)?|reveal(?:s|ed)?|confess(?:es|ed)?|describ(?:e|es|ed)|shar(?:e|es|ed)|recount(?:s|ed)?|confid(?:e|es|ed)|admit(?:s|ted)?|learn(?:s|ed|t)?|hears? about|heard about)\b/i;
// What a private experience is - the same word in a later memory someone
// takes part in means they know of it.
const INNER = /\b(vision|dream|nightmare|premonition|voice in (?:his|her|their) head)/i;
// An older memory with no witnesses recorded that reads as one person's
// inner experience: "Remus had a vivid vision of the temple", "Remus
// dreamed of...", "Remus silently broods". Only when it does not also say
// it was spoken of.
const INNER_LEGACY = /^\s*(?:had|has|saw|sees|experienced|experiences|suffered)\s+(?:(?:a|an|another|the|more|several|some|his|her|their)\s+)?(?:[\p{L}-]+\s+){0,2}(?:visions?|dreams?|nightmares?|premonitions?)\b|^\s*(?:dream(?:s|ed|t)|wonder(?:s|ed)|suspect(?:s|ed)|silently|privately|secretly|inwardly)\b/iu;

// The distinctive words of a text (five letters or more, not common ones,
// not the names of the people here - those are in nearly every memory).
function wordsOf(text, skip = new Set()) {
    return new Set((clean(text).toLowerCase().match(/\p{L}{5,}/gu) ?? []).filter((w) => !STOP.has(w) && !skip.has(w)));
}
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };

// Where a memory sits in the story: its source message number, else its
// creation time, else its place in the list.
function orderOf(memory, i) {
    const n = /#(\d+)@/.exec(String(memory?.source_message_id ?? ''))?.[1];
    if (n !== undefined) return Number(n);
    const t = Date.parse(memory?.created_at ?? '');
    return Number.isFinite(t) ? t / 1e9 : i;
}

// The person an older, witness-less memory is the inner experience of, or
// null. people: [{ id, name }]; a person is known by full name or first name.
function legacyOwner(text, people) {
    if (TOLD.test(text)) return null;
    for (const p of people) {
        const calls = [...new Set([clean(p.name), clean(p.name).split(' ')[0]])].filter((c) => c.length > 1);
        for (const call of calls) {
            if (!text.toLowerCase().startsWith(call.toLowerCase())) continue;
            const rest = text.slice(call.length).replace(/^['’]s\b/, '');
            if (/^\s/.test(rest) && INNER_LEGACY.test(rest)) return p.id;
        }
    }
    return null;
}

const GROUP = /\b(?:the group|everyone|the others|all of them|the party|the companions)\b/i;

// Whether `personId` learned of memory `x` by `later` memories: one at the
// same message or after that they take part in (as a witness; for a memory
// with no witnesses, as someone it names) and that is about the same thing -
// the same kind of inner experience, or enough of the same words (fewer
// when it says someone told or explained it). A memory with no witnesses
// that tells of the same experience ("...a vision, which he described") or
// has the whole group take it in counts for everyone: who heard is not
// known, so no one is said not to know.
function learnedOf(x, personId, all) {
    const inner = x.private ? INNER.exec(x.text)?.[1]?.toLowerCase() : '';
    return all.some((m) => {
        if (m === x || m.order < x.order) return false;
        const same = inner && m.text.toLowerCase().includes(inner);
        if (same && !m.tracked && (TOLD.test(m.text) || GROUP.test(m.text))) return true;
        if (!(m.tracked ? m.witnesses.includes(personId) : m.entities.includes(personId))) return false;
        return same || overlap(x.words, m.words) >= Math.min(TOLD.test(m.text) ? 2 : 3, Math.max(1, x.words.size - 1));
    });
}

// -> [{ id, name, unknown: [text] }] for each person present other than the
// player, most important first, at most `perPerson` each and `maxTokens`
// in all. memories: Archivist records; cast: [{ id, name, player }];
// recentText: the latest chat (what is being talked about counts more);
// nameOf(id): a name for a witness id (for "private to ..."); told: what
// the player told whom in the chat ({ [memoryKey]: [personId] }, toldInChat).
export function unknownsFor(memories, { cast = [], recentText = '', nameOf = () => '', perPerson = PERSPECTIVE_PER_PERSON, maxTokens = PERSPECTIVE_TOKENS, window = PERSPECTIVE_WINDOW, told = {} } = {}) {
    const here = (cast ?? []).filter((c) => c?.id && clean(c.name));
    const people = here.filter((c) => !c.player);
    if (!people.length || !Array.isArray(memories) || !memories.length) return [];
    const sceneIds = new Set(here.map((c) => c.id));
    const names = new Set(here.flatMap((c) => clean(c.name).toLowerCase().split(' ')));
    const recentWords = wordsOf(recentText, names);

    // Who witnessed each memory: as recorded, or - for an older memory with
    // none recorded - its owner alone when it reads as an inner experience.
    // Other unrecorded memories cannot say who was not there.
    const all = memories
        .map((m, i) => {
            const text = clean(m?.text);
            if (!text) return null;
            const tracked = Array.isArray(m.witness_ids) && m.witness_ids.length > 0;
            const owner = tracked ? null : legacyOwner(text, here);
            return {
                memory: m, text, order: orderOf(m, i), tracked, words: wordsOf(text, names), entities: m.entity_ids ?? [],
                witnesses: tracked ? m.witness_ids : (owner ? [owner] : null),
                private: tracked ? m.private === true : !!owner,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);
    const recent = all.slice(-window).filter((x) => x.witnesses);

    const score = (x) => (IMPORTANCE[x.memory.importance] ?? 2) * 2
        + (x.private ? 2 : 0)
        + Math.min(3, overlap(x.words, recentWords))
        + (recent.indexOf(x) / Math.max(1, recent.length)) * 2;

    const out = [];
    const shown = new Set();
    let tokens = 0;
    for (const person of people) {
        const picked = recent
            // About someone in the scene (or witnessed by them), not low
            // importance, and not something this person was there for.
            .filter((x) => x.memory.importance !== 'low' && !x.witnesses.includes(person.id))
            .filter((x) => x.entities.some((id) => sceneIds.has(id)) || x.witnesses.some((id) => sceneIds.has(id)))
            .filter((x) => !learnedOf(x, person.id, all) && !(told?.[memoryKey(x.memory)] ?? []).includes(person.id))
            .sort((a, b) => score(b) - score(a))
            // One line per private experience (two memories of one vision).
            .filter((x, i, list) => !x.private || list.findIndex((y) => y.private && y.witnesses[0] === x.witnesses[0] && INNER.exec(y.text)?.[1]?.toLowerCase() === INNER.exec(x.text)?.[1]?.toLowerCase() && Math.abs(y.order - x.order) <= 2) === i)
            .slice(0, perPerson)
            .map((x) => {
                const owner = x.private ? clean(nameOf(x.witnesses[0])) : '';
                return `${cut(x.text, 200).replace(/[.;,]+$/, '')}${owner ? ` (private to ${owner})` : ''}`;
            });
        // Each memory is shown once, with everyone who does not know it
        // (unknownsLines), so it costs its text once and a name each time.
        const kept = [];
        for (const text of picked) {
            const cost = (shown.has(text) ? 0 : estimateTokens(`- ${text} - not known to `)) + estimateTokens(`${person.name}, `);
            if (tokens + cost > maxTokens) break;
            tokens += cost;
            shown.add(text);
            kept.push(text);
        }
        if (kept.length) out.push({ id: person.id, name: clean(person.name), unknown: kept });
    }
    return out;
}

// The dossier section, or [] when no one is missing anything: each memory
// once, most important first, with who does not know it.
export function unknownsLines(unknowns) {
    const who = new Map();
    for (const u of unknowns ?? []) for (const text of u?.unknown ?? []) who.set(text, [...(who.get(text) ?? []), u.name]);
    if (!who.size) return [];
    return [
        'WHAT EACH PERSON DOES NOT KNOW (they did not witness it and were not told - they must not mention, hint at or act on it. "Private" is someone\'s own dream, vision or thought: others saw at most the outward signs)',
        ...[...who].map(([text, names]) => `- ${text} - not known to ${names.join(', ')}.`),
    ];
}

// A memory's key: Archivist's id, else the start of its text.
export const memoryKey = (m) => clean(m?.id) || clean(m?.text).slice(0, 80);

// What the player character has told the people with them, in their own
// messages: a message that speaks of a memory (enough of its distinctive
// words, or the same kind of inner experience and one of them) and reads as
// telling (a telling word, or speech in quotes) is heard by everyone present.
// Only the player's words count - the narrator letting something slip is the
// very thing this guards against. memories: Archivist records; messages:
// [{ text, isUser }]; cast: [{ id, name, player }].
// -> { [memoryKey]: [personId] } for what was told (empty when nothing).
export function toldInChat(memories, { messages = [], cast = [] } = {}) {
    const listeners = (cast ?? []).filter((c) => c?.id && !c.player).map((c) => c.id);
    const said = (messages ?? []).filter((m) => m?.isUser && clean(m.text)).map((m) => clean(m.text));
    if (!listeners.length || !said.length || !Array.isArray(memories)) return {};
    const names = new Set((cast ?? []).flatMap((c) => clean(c?.name).toLowerCase().split(' ')));
    const out = {};
    for (const m of memories.slice(-PERSPECTIVE_WINDOW)) {
        const text = clean(m?.text);
        if (!text) continue;
        const words = wordsOf(text, names);
        const inner = INNER.exec(text)?.[1]?.toLowerCase() ?? '';
        const heard = said.some((s) => {
            if (!TOLD.test(s) && !/["“”«»]/.test(s)) return false;
            const shared = overlap(words, wordsOf(s, names));
            return shared >= Math.min(3, Math.max(1, words.size - 1)) || (inner && s.toLowerCase().includes(inner) && shared >= 1);
        });
        if (heard) out[memoryKey(m)] = listeners;
    }
    return out;
}

// What has been told, kept per chat (doc.perspectiveTold), with more added.
export function mergeTold(told = {}, more = {}) {
    const out = { ...told };
    for (const [key, ids] of Object.entries(more ?? {})) out[key] = [...new Set([...(out[key] ?? []), ...ids])];
    const keys = Object.keys(out);
    // The newest few hundred are plenty: the window looks at 80 memories.
    return keys.length > 400 ? Object.fromEntries(keys.slice(-400).map((k) => [k, out[k]])) : out;
}

// How many of a chat's memories say who was present - older chats were
// extracted before Archivist asked for it, and Archivist's "Rebuild memories
// from chat" fills it in. -> { total, witnessed }
export function witnessCoverage(memories) {
    const list = (Array.isArray(memories) ? memories : []).filter((m) => clean(m?.text));
    return { total: list.length, witnessed: list.filter((m) => Array.isArray(m.witness_ids) && m.witness_ids.length > 0).length };
}

// ---- point of view (settings.director.pov)

export const POV_MODES = Object.freeze(['free', 'limited', 'second', 'omniscient']);

// The narrator's rule for the point of view, '' for 'free' (the narrator's
// own habit). player: the player character's name.
export function povRule(pov, player = '') {
    const who = clean(player) || 'the player character';
    if (pov === 'limited') return `Point of view: third person, close on ${who}. Show only what ${who} can see, hear and sense; the others' thoughts and feelings show only in what they say and do, and what happens out of ${who}'s sight is not shown until ${who} learns of it.`;
    if (pov === 'second') return `Point of view: second person - "you" is ${who}. Show only what you can see, hear and sense; the others' thoughts and feelings show only in what they say and do, and nothing out of your sight is shown.`;
    if (pov === 'omniscient') return `Point of view: an all-seeing narrator - it may show what the others think and feel and what happens out of ${who}'s sight. Even so, each character acts only on what they themselves know.`;
    return '';
}

// The same for the director, so its briefing fits the narration.
export function povBrief(pov, player = '') {
    const who = clean(player) || 'the player character';
    if (pov === 'limited' || pov === 'second') return `The narration stays with ${who}'s senses: brief what the others visibly say and do and what ${who} could notice; their hidden thoughts and anything happening out of ${who}'s sight are for you to keep track of, not for the narrator to show.`;
    if (pov === 'omniscient') return 'The narration is all-seeing: you may point the narrator to what the others think and feel, or to something happening elsewhere, when it serves the story.';
    return '';
}
