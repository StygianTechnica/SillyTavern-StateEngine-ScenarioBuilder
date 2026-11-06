// Changes the story makes to the world (docs/ROADMAP.md: "current
// descriptions updated from the story"). Archivist's memories say what
// happened; when one tells of a change to a place, a thing, a group or a
// person the library has - the docks burned, Graxx lost an eye, the shrine
// was rebuilt - Review asks "update the description?". One model call then
// writes the object's current description for this chat (src/state/
// narrative.js) from its description and what the story did to it - only
// when the user asks for it, or with settings.changes.auto. The setting's own
// description is never touched. Finding them costs no call: the memories are
// read and matched here (pure, tested; the runners are src/state/changes.js).


const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

// Every memory there is: a chat with more than were kept had its oldest
// read again on every scan - Assassins Inc's 1470 memories, and one about
// Cyril's implant offered (and, with auto, written) 40 times in a day.
const SEEN_KEPT = 20000;
// Memories whose change was used or turned down: never offered again.
const DONE_KEPT = 5000;
const SUGGESTIONS_KEPT = 40;
// A chat's first look takes in only its latest memories: the rest of the
// story is older than this feature, and a flood of questions helps no one.
export const FIRST_LOOK = 40;

// What a change is, by kind of thing. A place or thing is burned, broken,
// rebuilt; a person scarred, maimed, changed; a group broken up or taken over.
const PLACE = /\b(?:burn(?:s|ed|t)?(?:\s+down)?|burnt|in (?:flames|ruins|ashes)|destroy(?:s|ed)?|ruin(?:s|ed)|raze[ds]?|collaps(?:es|ed)|crumbl(?:es|ed)|flood(?:s|ed)|sack(?:s|ed)|loot(?:s|ed)|pillag(?:es|ed)|demolish(?:es|ed)|torn down|blown (?:up|apart)|wreck(?:s|ed)|sunk|sank|overrun|abandon(?:s|ed)|desecrat(?:es|ed)|defil(?:es|ed)|caved in|reduced to|lies? in ruins|rebuil(?:ds|t)|repair(?:s|ed)|restor(?:es|ed)|reopen(?:s|ed)|renovat(?:es|ed)|fortif(?:ies|ied)|cleans(?:es|ed)|reconsecrat(?:es|ed)|purif(?:ies|ied)|seal(?:s|ed) (?:off|up)|barricad(?:es|ed)|captur(?:es|ed)|seiz(?:es|ed)|taken over|occupied)\b/i;
const THING = /\b(?:broke|broken|shatter(?:s|ed)|crack(?:s|ed)|snapp?(?:s|ed)|bent|melt(?:s|ed)|burn(?:s|ed|t)|destroy(?:s|ed)|reforg(?:es|ed)|mend(?:s|ed)|repair(?:s|ed)|enchant(?:s|ed)|curs(?:es|ed)|bless(?:es|ed)|awaken(?:s|ed)|stain(?:s|ed) with|engrav(?:es|ed)|tarnish(?:es|ed)|corrupt(?:s|ed))\b/i;
const PERSON = /\b(?:scar(?:s|red)|maim(?:s|ed)|blind(?:s|ed)|crippl(?:es|ed)|disfigur(?:es|ed)|brand(?:s|ed)|tattoo(?:s|ed)|los(?:es|t) (?:an?|his|her|their) (?:eye|arm|hand|leg|foot|finger|ear|tongue|voice)|(?:arm|hand|leg|eye) (?:was |is )?(?:cut|hacked|torn) off|transform(?:s|ed) into|turn(?:s|ed) into an?|(?:was|is) cursed|(?:was|is) turned|ag(?:es|ed) (?:years|decades)|hair (?:turned|went) white|shav(?:es|ed) (?:his|her|their) head|cut (?:his|her|their) hair|now wears|wears now|crowned|promoted|knighted|exiled|enslaved|freed|ordained|disgraced)\b/i;
const GROUP = /\b(?:disband(?:s|ed)|scatter(?:s|ed)|wiped out|destroy(?:s|ed)|broken up|split|splinter(?:s|ed)|outlaw(?:s|ed)|banned|absorb(?:s|ed)|taken over|new (?:leader|master|head)|overthrown|routed|crushed|decimated)\b/i;
const BY_TYPE = { location: PLACE, item: THING, faction: GROUP, character: PERSON, creature: PERSON };
// Talk, plans and fears are not changes.
const NOT_YET = /\b(?:threaten(?:s|ed)?|plan(?:s|ned)? to|would|could|might|fear(?:s|ed)?|if |unless|wants? to|vow(?:s|ed)? to|intend(?:s|ed)? to|about to|almost|nearly|rumou?r)/i;

export const CHANGE_TYPES = Object.freeze(Object.keys(BY_TYPE));

const key = (m) => clean(m?.id) || clean(m?.text).slice(0, 80);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const callNames = (e) => [...new Set([clean(e.name), ...(e.aliases ?? []).map(clean), clean(e.name).replace(/^the\s+/i, '')])].filter((n) => n.length > 2);

// Whether `text` tells of a change to `entry`: a change word of its kind
// within a few words of one of its names, and not something only feared or
// planned. -> the matching sentence, or ''.
// others: the names of everyone and everything else the library has - the
// change must be this one's, not theirs. Assassins Inc: a line about Cyril
// within six words of Inji had Inji's current description say his body
// "now hosts Cyril Moriarty's consciousness".
export function changeIn(text, entry, { others = [] } = {}) {
    const re = BY_TYPE[entry?.type];
    if (!re) return '';
    const own = new Set(callNames(entry).map((n) => n.toLowerCase()));
    const names = (others ?? []).map(clean).filter((n) => n.length > 2 && !own.has(n.toLowerCase()));
    const naming = (part) => names.some((n) => new RegExp(`\\b${escape(n)}\\b`, 'i').test(part));
    for (const sentence of clean(text).split(/(?<=[.!?])\s+/)) {
        const hit = re.exec(sentence);
        if (!hit || NOT_YET.test(sentence)) continue;
        for (const name of callNames(entry)) {
            const at = sentence.search(new RegExp(`\\b${escape(name)}\\b`, 'i'));
            if (at < 0) continue;
            const between = at < hit.index ? sentence.slice(at + name.length, hit.index) : sentence.slice(hit.index + hit[0].length, at);
            if (between.split(/\s+/).filter(Boolean).length > 6) continue;
            // Someone else between them, or right after the change word
            // ("Inji freed Cyril", "Inji, with Cyril, scarred"): theirs.
            if (naming(between)) continue;
            if (at < hit.index && naming(sentence.slice(hit.index + hit[0].length).split(/\s+/).slice(0, 4).join(' '))) continue;
            return sentence;
        }
    }
    return '';
}

// New changes from memories not looked at before. entries: the library's
// world objects [{ id, type, name, aliases }]; seen: memory keys already read.
// -> { found: [{ objectId, name, type, texts, keys }], seen: [key] (every
// memory now read) }
export function changesFrom(memories, { entries = [], seen = [], first = false } = {}) {
    const list = (Array.isArray(memories) ? memories : []).filter((m) => clean(m?.text));
    const known = new Set(seen ?? []);
    const fresh = list.filter((m) => !known.has(key(m)));
    const look = first ? fresh.slice(-FIRST_LOOK) : fresh;
    const byId = new Map();
    const candidates = (entries ?? []).filter((e) => e?.id && BY_TYPE[e.type]);
    const everyone = candidates.flatMap(callNames);
    for (const m of look) {
        const named = new Set(m.entity_ids ?? []);
        for (const e of candidates) {
            const sentence = changeIn(m.text, e, { others: everyone });
            if (!sentence) continue;
            // The memory is about it, or names it outright.
            if (named.size && !named.has(e.id) && !callNames(e).some((n) => new RegExp(`\\b${escape(n)}\\b`, 'i').test(m.text))) continue;
            const got = byId.get(e.id) ?? { objectId: e.id, name: e.name, type: e.type, texts: [], keys: [] };
            if (!got.texts.includes(sentence)) got.texts.push(cut(sentence, 300));
            got.keys.push(key(m));
            byId.set(e.id, got);
        }
    }
    // Every memory now there has been read; those gone are let go.
    return { found: [...byId.values()], seen: [...new Set(list.map(key))].slice(-SEEN_KEPT) };
}

// ---- the chat's list (doc.changes)

export function emptyChanges() {
    return { seen: [], started: false, suggestions: [], done: [] };
}

function normalizeSuggestion(s) {
    if (!isObject(s) || !clean(s.id) || !clean(s.objectId)) return null;
    return {
        id: clean(s.id), objectId: clean(s.objectId), name: clean(s.name), type: clean(s.type),
        texts: (Array.isArray(s.texts) ? s.texts : []).map(clean).filter(Boolean).slice(-6),
        keys: (Array.isArray(s.keys) ? s.keys : []).map(clean).filter(Boolean).slice(-12),
        status: ['open', 'used', 'dismissed'].includes(s.status) ? s.status : 'open',
        draft: clean(s.draft).slice(0, 2000),
        at: clean(s.at),
    };
}

export function normalizeChanges(value) {
    const v = isObject(value) ? value : {};
    return {
        seen: (Array.isArray(v.seen) ? v.seen : []).filter((k) => typeof k === 'string').slice(-SEEN_KEPT),
        started: v.started === true,
        done: (Array.isArray(v.done) ? v.done : []).filter((k) => typeof k === 'string').slice(-DONE_KEPT),
        suggestions: (Array.isArray(v.suggestions) ? v.suggestions : []).map(normalizeSuggestion).filter(Boolean).slice(-SUGGESTIONS_KEPT),
    };
}

// The found changes taken into the list: added to the object's open
// suggestion, or a new one. -> the list.
export function addChanges(changes, found, { at = new Date().toISOString(), newId = () => `chg_${Math.random().toString(36).slice(2, 10)}` } = {}) {
    const out = normalizeChanges(changes);
    // What was used or turned down stays so - its memories offer nothing
    // again (also from suggestions older than were kept).
    const done = new Set([...out.done, ...out.suggestions.filter((s) => s.status !== 'open').flatMap((s) => s.keys)]);
    out.done = [...done].slice(-DONE_KEPT);
    for (const f0 of found ?? []) {
        const keys = (f0.keys ?? []).filter((k) => !done.has(k));
        if (!keys.length) continue;
        const f = { ...f0, keys };
        const open = out.suggestions.find((s) => s.objectId === f.objectId && s.status === 'open');
        if (open) {
            open.texts = [...new Set([...open.texts, ...f.texts])].slice(-6);
            open.keys = [...new Set([...open.keys, ...f.keys])].slice(-12);
            open.draft = '';
            open.at = at;
        } else out.suggestions.push(normalizeSuggestion({ id: newId(), ...f, status: 'open', at }));
    }
    out.suggestions = out.suggestions.slice(-SUGGESTIONS_KEPT);
    return out;
}

export const openChanges = (doc) => (doc?.changes?.suggestions ?? []).filter((s) => s.status === 'open');

// ---- writing the current description

const SYSTEM = 'You keep track of what a roleplay\'s story has changed about one thing in its world. You write only what is different about it NOW - a short note added after its description, which stays as it is - plain prose, no preamble, no commentary.';

// -> { system, user, plain }. input: { name, type, description, current,
// changes: [text], overview }
export function buildChangePrompt(input) {
    const user = [
        clean(input?.overview) ? `# The setting\n${cut(input.overview, 400)}` : '',
        `# ${clean(input?.name)}${clean(input?.type) ? ` (${clean(input.type)})` : ''} - its description\n${clean(input?.description) || '(none written)'}`,
        clean(input?.current) ? `# What the story had changed about it before
${clean(input.current)}` : '',
        `# What has happened to it in the story\n${(input?.changes ?? []).map((t) => `- ${clean(t)}`).join('\n')}`,
        '# Your task',
        `Write what is different about ${clean(input?.name) || 'it'} now: one to three sentences in the same style as the description. Its description stays and is read with your note, so do not repeat it or sum it up - only what the story changed, and what was changed before if it still holds. Only what the lines above say happened to ${clean(input?.name) || 'it'} itself - what happened to anyone else, or what the setting says of others, is not part of it. A passing mood, a moment or a scene is not a change - only what lasts (a scar, a lost eye, a burned wing, a new rank) - and never invent more damage, healing or detail. Say how it is, not the events that made it so.${input?.pronoun ? ` ${clean(input.name)} is ${input.pronoun === 'he' ? 'a man: he, him, his' : input.pronoun === 'she' ? 'a woman: she, her' : `${input.pronoun}`}.` : ''}`,
    ].filter(Boolean).join('\n\n');
    return { system: SYSTEM, user, plain: true };
}

// The answer, or '' when it is unusable.
export function readChangeAnswer(text) {
    const t = String(text ?? '').replace(/^\s*(?:current description|description|now)\s*:\s*/i, '').replace(/^["']|["']$/g, '').trim();
    return t.length >= 20 ? t.slice(0, 2000) : '';
}
