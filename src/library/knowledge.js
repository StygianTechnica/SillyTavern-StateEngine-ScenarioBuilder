// Secrets and oaths - who knows what, and who is bound to what (spec 9.4,
// knowledge boundaries). Pure: no SillyTavern imports.
//
// Two sources, merged:
//   - the user's own, kept in the setting document (`knowledge`): a secret
//     ("Remus is Elyon's champion") with who knows it, or an oath, vow or
//     pledge with who swore it and to whom;
//   - the story's, from Archivist's compiled memory (world.secret with
//     known_by, world.promise with made_by / made_to) - read-only (SB-005).
// The guidance gives each person present what THEY know and what they have
// sworn, and the scene a rule for each secret: who here must not know it.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const lower = (text) => clean(text).toLowerCase();
const sentence = (text) => { const t = clean(text); return !t ? '' : /[.!?…]$/.test(t) ? t : `${t}.`; };
const andList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export const KNOWLEDGE_KINDS = Object.freeze(['secret', 'oath', 'belief']);
// Oaths: standing (pending), kept, broken, released. Secrets: kept,
// revealed (no longer a secret), disproven. Beliefs: held, dispelled (the
// truth is out to everyone).
export const OATH_STATUSES = Object.freeze(['pending', 'kept', 'broken', 'released']);
export const SECRET_STATUSES = Object.freeze(['kept', 'revealed', 'disproven']);
export const BELIEF_STATUSES = Object.freeze(['held', 'dispelled']);
export const statusesOf = (kind) => (kind === 'oath' ? OATH_STATUSES : kind === 'belief' ? BELIEF_STATUSES : SECRET_STATUSES);

const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

// A stored item, made safe: { id, kind, text, knownBy, madeBy, madeTo,
// status, about, heldBy, everyone, truth, reaction }.
// A belief - something many hold that is not so ("Cyril Moriarty is
// dead"): `about` the people it is about, whose coming shakes it; held by
// everyone or by `heldBy` (people, or factions - their members); `knownBy`
// those who know the truth, `truth` what it is, `reaction` what holders
// may take the sight for ("a ghost, a clone"); `bySight` whether seeing
// them shows the truth.
export function normalizeKnowledgeItem(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const kind = KNOWLEDGE_KINDS.includes(r.kind) ? r.kind : 'secret';
    const statuses = statusesOf(kind);
    return {
        id: clean(r.id),
        kind,
        text: clean(r.text).slice(0, 600),
        knownBy: ids(r.knownBy),
        madeBy: ids(r.madeBy),
        madeTo: ids(r.madeTo),
        status: statuses.includes(r.status) ? r.status : statuses[0],
        about: ids(r.about),
        heldBy: ids(r.heldBy),
        everyone: r.everyone === true,
        truth: clean(r.truth).slice(0, 300),
        reaction: clean(r.reaction).slice(0, 200),
        // Whether meeting its subject shows it is not so (they are alive);
        // off for one the sight does not undo (a disguise, a hidden illness).
        bySight: r.bySight !== false,
    };
}

// Who has seen a belief shaken in a chat: { [beliefId]: { [personId]:
// turn } } - the turn they first met its subject. Kept with the chat:
// another playthrough has its own.
export function normalizeBeliefsSeen(v) {
    const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    if (!isObj(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([k, m]) => k && isObj(m)).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).filter(([p, t]) => p && Number.isInteger(t)))]));
}

// Archivist's compiled secrets and promises in the same shape, people as
// { id, name } (an id when Archivist linked them to a library object).
// compiled: getCompiledMemory()'s world ({ secret: [...], promise: [...] }).
export function storyKnowledge(world) {
    const people = (list) => (Array.isArray(list) ? list : []).filter((e) => e && (e.id || clean(e.name))).map((e) => ({ id: e.id ?? null, name: clean(e.name) }));
    const out = [];
    for (const w of world?.secret ?? []) {
        if (!clean(w?.text) && !clean(w?.name)) continue;
        out.push({ id: `story:${w.id}`, source: 'story', kind: 'secret', text: clean(w.text) || clean(w.name), knownBy: people(w.known_by), madeBy: [], madeTo: [], status: SECRET_STATUSES.includes(w.status) ? w.status : 'kept' });
    }
    for (const w of world?.promise ?? []) {
        if (!clean(w?.text) && !clean(w?.name)) continue;
        out.push({ id: `story:${w.id}`, source: 'story', kind: 'oath', text: clean(w.text) || clean(w.name), knownBy: [], madeBy: people(w.made_by), madeTo: people(w.made_to), status: OATH_STATUSES.includes(w.status) ? w.status : 'pending' });
    }
    return out;
}

// The user's items with people as { id, name }; nameOf(id) -> name.
export function authoredKnowledge(items, nameOf = () => '') {
    const people = (list) => ids(list).map((id) => ({ id, name: clean(nameOf(id)) })).filter((p) => p.name);
    return (items ?? []).map(normalizeKnowledgeItem).filter((k) => k.text).map((k) => ({ ...k, source: 'yours', knownBy: people(k.knownBy), madeBy: people(k.madeBy), madeTo: people(k.madeTo), about: people(k.about), heldBy: people(k.heldBy) }));
}

// Whether a person ({ id, name, aliases? }) is one of `people`.
function isOneOf(person, people) {
    const names = new Set([person.name, ...(person.aliases ?? [])].map(lower).filter(Boolean));
    return people.some((p) => (p.id && person.id && p.id === person.id) || (p.name && names.has(lower(p.name))));
}

// What the people present know and are bound to, and the rules the scene
// keeps: knowledge (both sources), cast: [{ id, name, aliases?, player? }].
// Beliefs (opts): seen - the chat's beliefsSeen; turn - the chat's turn;
// memberships - Map(personId -> [factionId]), for a belief a faction holds.
// -> { members: Map(id -> { knows, sworn, owed, believes: [text] }),
//      rules: [text], newlySeen: [{ beliefId, personId }] }  (only what
//      touches someone present; revealed or disproven secrets, released
//      oaths and dispelled beliefs are no longer kept). newlySeen: holders
//      meeting a belief's subject for the first time - the caller records
//      them, and from the next turn they know the truth.
export function sceneKnowledge(knowledge, cast, { seen = {}, turn = 0, memberships = new Map() } = {}) {
    const present = (cast ?? []).filter((c) => clean(c?.name));
    const members = new Map(present.map((c) => [c.id ?? c.name, { knows: [], sworn: [], owed: [], believes: [] }]));
    const rules = [];
    const newlySeen = [];
    const nameList = (people) => andList(people.map((p) => p.name));
    for (const k of knowledge ?? []) {
        if (k.kind === 'belief') {
            if (k.status !== 'held') continue;
            const rule = beliefRule(k, present, { seen: seen?.[k.id] ?? {}, turn, memberships, members, newlySeen });
            if (rule) rules.push(rule);
            continue;
        }
        if (k.kind === 'secret') {
            if (k.status !== 'kept') continue;
            const knowers = present.filter((c) => isOneOf(c, k.knownBy));
            // About someone here, or known by someone here.
            const about = present.filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => clean(n).length >= 3 && lower(k.text).includes(lower(n))));
            if (!knowers.length && !about.length) continue;
            for (const c of knowers) members.get(c.id ?? c.name)?.knows.push(sentence(k.text));
            const unaware = present.filter((c) => !c.player && !isOneOf(c, k.knownBy));
            if (unaware.length) {
                rules.push(`Secret: ${sentence(k.text)} ${k.knownBy.length ? `Only ${nameList(k.knownBy)} ${k.knownBy.length === 1 ? 'knows' : 'know'} it.` : 'Few know it.'} ${nameList(unaware)} ${unaware.length === 1 ? 'does' : 'do'} not know it: they never act on it, hint at it or guess it unless it is revealed in front of them.`);
            }
            continue;
        }
        // An oath, vow or pledge.
        if (k.status === 'released' || k.status === 'kept') continue;
        const swearers = present.filter((c) => isOneOf(c, k.madeBy));
        const owed = present.filter((c) => isOneOf(c, k.madeTo));
        if (!swearers.length && !owed.length) continue;
        const to = k.madeTo.length ? ` to ${nameList(k.madeTo)}` : '';
        const by = k.madeBy.length ? `${nameList(k.madeBy)} swore${to}` : `An oath${to}`;
        const state = k.status === 'broken' ? ' - and broke it' : '';
        for (const c of swearers) members.get(c.id ?? c.name)?.sworn.push(`${sentence(`${k.madeTo.length ? `Swore to ${nameList(k.madeTo)}: ` : 'Has sworn: '}${k.text}${state}`)}`);
        for (const c of owed) members.get(c.id ?? c.name)?.owed.push(sentence(`${k.madeBy.length ? `${nameList(k.madeBy)} swore to them: ` : 'Is owed: '}${k.text}${state}`));
        rules.push(sentence(`Oath: ${by}: ${k.text}${state}. It binds them - they honour it, or strain against it knowing what breaking it costs`));
    }
    return { members, rules, newlySeen };
}

// One belief in a scene. Holders: everyone, or those it names, or members
// of the factions it names - never one who knows the truth, never its
// subject, never the player (whose mind is theirs). With its subject here,
// a holder meeting them for the first time is shocked this turn - and
// knows the truth from then on (the caller records newlySeen). Without
// the subject, holders simply believe it. -> the scene's rule, or ''.
function beliefRule(k, present, { seen, turn, memberships, members, newlySeen }) {
    // A sight that does not undo it (a disguise): it is simply believed.
    const subjects = k.bySight === false ? [] : present.filter((c) => isOneOf(c, k.about ?? []));
    const heldIds = new Set((k.heldBy ?? []).map((p) => p.id).filter(Boolean));
    const holds = (c) => !c.player && !isOneOf(c, k.knownBy ?? []) && !isOneOf(c, k.about ?? [])
        && (k.everyone || isOneOf(c, k.heldBy ?? []) || (memberships.get(c.id) ?? []).some((f) => heldIds.has(f)));
    const holders = present.filter(holds);
    const truth = k.truth ? sentence(k.truth) : '';
    for (const c of present.filter((x) => !x.player && isOneOf(x, k.knownBy ?? []))) members.get(c.id ?? c.name)?.knows.push(`Not so, though most believe it: ${sentence(k.text)}${truth ? ` The truth: ${truth}` : ''}`);
    const shocked = [];
    for (const c of holders) {
        const key = c.id ?? c.name;
        const at = seen[key];
        if (subjects.length && at === undefined) { newlySeen.push({ beliefId: k.id, personId: key }); shocked.push(c); continue; }
        if (subjects.length && at === turn) { shocked.push(c); continue; }
        // Seen before, in this chat: they know better now.
        if (at !== undefined) members.get(key)?.knows.push(`Not so, though they believed it: ${sentence(k.text)} They have seen it for themselves.`);
        else members.get(key)?.believes.push(sentence(k.text));
    }
    if (!subjects.length || (!shocked.length && !k.everyone)) return '';
    const who = andList(subjects.map((s) => s.name));
    const sight = `${k.reaction ? ` They may take it for ${k.reaction.replace(/[.!?…]$/, '')}.` : ''}`;
    if (!shocked.length) {
        // Everyone believes it, and those here have met them already: only
        // anyone else about - a passer-by, a guard - is startled.
        return sentence(`Belief: ${sentence(k.text)} Most people believe it. Anyone else here who knew of ${who} - a passer-by, a guard, someone in the crowd - is startled to see them`);
    }
    const believers = andList(shocked.map((c) => c.name));
    return `Belief: ${sentence(k.text)} ${believers} ${shocked.length === 1 ? 'believes' : 'believe'} it - and ${who} ${subjects.length === 1 ? 'is' : 'are'} here. Seeing it with their own eyes shocks them: they react to it now, before the scene goes on - disbelief, fear, suspicion, whatever fits who they are.${sight}${k.everyone ? ` Anyone else here who knew of ${who} is just as startled.` : ''} From now on they know it is not so.`;
}

// The items that touch an entry (it knows, swore, is owed, or a secret
// names it) - for its sheet. entry: { id, name, aliases }.
export function knowledgeOf(entry, knowledge) {
    if (!entry) return [];
    const me = { id: entry.id, name: entry.name, aliases: entry.aliases ?? entry.base?.aliases ?? [] };
    return (knowledge ?? []).filter((k) => isOneOf(me, k.knownBy) || isOneOf(me, k.madeBy) || isOneOf(me, k.madeTo) || isOneOf(me, k.about ?? []) || isOneOf(me, k.heldBy ?? [])
        || [me.name, ...me.aliases].some((n) => clean(n).length >= 3 && lower(k.text).includes(lower(n))));
}

// A bargain the story shows a power (or anyone) making - "Elyon will give
// Varyn back once Remus passes the trials" - kept as a pending oath, sworn
// by the one who promises to the one it is promised to, so the director
// hears of it until the story fulfils or breaks it (src/director/run.js,
// BARGAIN lines). -> a knowledge item, or null.
export function bargainItem({ what, price } = {}, { byIds = [], toIds = [] } = {}) {
    const text = clean(what);
    if (!text) return null;
    return { kind: 'oath', text: `${text}${clean(price) ? ` - the price: ${clean(price).replace(/[.!]+$/, '')}` : ''}`, knownBy: [], madeBy: ids(byIds), madeTo: ids(toIds), status: 'pending' };
}

// Whether `item` is a bargain already kept: the same promiser, and most of
// the same words for what was promised (the director rewords it).
const words = (text) => new Set(lower(text).split(/[^a-z0-9'’]+/).filter((w) => w.length >= 4));
export function sameBargain(existing, item) {
    const promised = (k) => lower(k.text).split(' - the price:')[0];
    return (existing ?? []).some((k) => {
        if (k.kind !== 'oath' || k.status !== 'pending') return false;
        if (!k.madeBy.some((id) => item.madeBy.includes(id)) && (k.madeBy.length || item.madeBy.length)) return false;
        const a = words(promised(k));
        const b = words(promised(item));
        if (!a.size || !b.size) return promised(k) === promised(item);
        const shared = [...b].filter((w) => a.has(w)).length;
        return shared / Math.min(a.size, b.size) >= 0.5;
    });
}

// The pending oaths the return of `name` from the dead fulfils: those that
// promise it (their text names them). -> [item].
export function fulfilledByReturn(knowledge, name) {
    const n = lower(name);
    const first = n.split(/\s+/)[0];
    if (!n) return [];
    const names = (text) => { const t = lower(text); return t.includes(n) || (first.length >= 4 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)); };
    return (knowledge ?? []).filter((k) => k.kind === 'oath' && k.status === 'pending' && names(k.text.split(' - the price:')[0]));
}
