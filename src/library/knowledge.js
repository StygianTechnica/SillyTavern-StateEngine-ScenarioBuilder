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

export const KNOWLEDGE_KINDS = Object.freeze(['secret', 'oath']);
// Oaths: standing (pending), kept, broken, released. Secrets: kept,
// revealed (no longer a secret), disproven.
export const OATH_STATUSES = Object.freeze(['pending', 'kept', 'broken', 'released']);
export const SECRET_STATUSES = Object.freeze(['kept', 'revealed', 'disproven']);

const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

// A stored item, made safe: { id, kind, text, knownBy, madeBy, madeTo, status }.
export function normalizeKnowledgeItem(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const kind = KNOWLEDGE_KINDS.includes(r.kind) ? r.kind : 'secret';
    const statuses = kind === 'oath' ? OATH_STATUSES : SECRET_STATUSES;
    return {
        id: clean(r.id),
        kind,
        text: clean(r.text).slice(0, 600),
        knownBy: ids(r.knownBy),
        madeBy: ids(r.madeBy),
        madeTo: ids(r.madeTo),
        status: statuses.includes(r.status) ? r.status : statuses[0],
    };
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
    return (items ?? []).map(normalizeKnowledgeItem).filter((k) => k.text).map((k) => ({ ...k, source: 'yours', knownBy: people(k.knownBy), madeBy: people(k.madeBy), madeTo: people(k.madeTo) }));
}

// Whether a person ({ id, name, aliases? }) is one of `people`.
function isOneOf(person, people) {
    const names = new Set([person.name, ...(person.aliases ?? [])].map(lower).filter(Boolean));
    return people.some((p) => (p.id && person.id && p.id === person.id) || (p.name && names.has(lower(p.name))));
}

// What the people present know and are bound to, and the rules the scene
// keeps: knowledge (both sources), cast: [{ id, name, aliases?, player? }].
// -> { members: Map(id -> { knows: [text], sworn: [text], owed: [text] }),
//      rules: [text] }  (only what touches someone present; revealed or
//      disproven secrets and released oaths are no longer kept)
export function sceneKnowledge(knowledge, cast) {
    const present = (cast ?? []).filter((c) => clean(c?.name));
    const members = new Map(present.map((c) => [c.id ?? c.name, { knows: [], sworn: [], owed: [] }]));
    const rules = [];
    const nameList = (people) => andList(people.map((p) => p.name));
    for (const k of knowledge ?? []) {
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
    return { members, rules };
}

// The items that touch an entry (it knows, swore, is owed, or a secret
// names it) - for its sheet. entry: { id, name, aliases }.
export function knowledgeOf(entry, knowledge) {
    if (!entry) return [];
    const me = { id: entry.id, name: entry.name, aliases: entry.aliases ?? entry.base?.aliases ?? [] };
    return (knowledge ?? []).filter((k) => isOneOf(me, k.knownBy) || isOneOf(me, k.madeBy) || isOneOf(me, k.madeTo)
        || [me.name, ...me.aliases].some((n) => clean(n).length >= 3 && lower(k.text).includes(lower(n))));
}
