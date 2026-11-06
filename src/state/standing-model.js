// A person's standing in the story (docs/ROADMAP.md "Reputation from the
// story"): how the people who saw them at it see them now. Assassins Inc:
// Doc, the "resident genius", jumped to one wild theory about Cyril's
// implant after another without measuring anything, and was laughed off
// every time - yet Adam and the others still hung on her word.
//
// Standing is held by others, not a fact about the person: those who saw
// it (Archivist's witnesses, the people in the scene) see them so, and
// people who never heard keep the old picture. Finding it costs no call:
// Archivist's memories and the user's posts are read here for a pattern -
// shown wrong, lashing out, a botched job; or proven right, a rescue, an
// apology - and a pattern is offered in Review for the user to decide.
// Never the player character's (their standing is the user's to write).
// Pure: the runners are src/state/standing.js.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

export const MIN_LEVEL = -3;
export const MAX_LEVEL = 3;
// How they are seen, by level.
export const LEVEL_WORDS = Object.freeze({
    '-3': 'discredited', '-2': 'not taken seriously', '-1': 'doubted', 0: 'as their description says',
    1: 'well thought of', 2: 'trusted', 3: 'admired',
});
export const levelWord = (level) => LEVEL_WORDS[String(clamp(level))] ?? LEVEL_WORDS[0];
const clamp = (n) => Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(Number(n) || 0)));

// Marks in a row that make a pattern worth offering.
export const PATTERN = 2;
const MARKS_KEPT = 12;
const SEEN_KEPT = 20000;

// ---- reading the story

const IDEA = String.raw`(?:theor(?:y|ies)|ideas?|claims?|suggestions?|guess(?:es)?|conclusions?|speculation|notions?|hunch(?:es)?|diagnos(?:is|es)|explanations?|analysis|assessment|plan)`;
const DERIDED = String.raw`(?:stupid|ridiculous|absurd|nonsense|idiotic|asinine|harebrained|half-baked|baseless|wild|crazy|insane|unhinged|ludicrous|laughable|dumb|silly|far-fetched|wrong|mistaken|groundless)`;
const LAUGHED = String.raw`(?:laughed|laughs|laughing|scoffed|scoffs|scoffing|snorted|snorts|brushed|brushes|waved|waves|shrugged|shrugs|rolled (?:his|her|their) eyes)`;

// Each: a pattern with {N} for the person's name, the kind, the sign.
const SAYINGS = [
    // Shown wrong - the professional's worst.
    { kind: 'shown wrong', sign: -1, re: String.raw`{N}(?:'s|’s)\s+(?:\w+\s+){0,2}${IDEA}\s+(?:was|were|proved|proves|turned out|turns out|is|are)\s+(?:to be\s+)?(?:completely\s+|totally\s+|utterly\s+|just\s+)?${DERIDED}` },
    { kind: 'shown wrong', sign: -1, re: String.raw`${LAUGHED}\s+(?:off|at|away|aside)?\s*{N}(?:'s|’s)\s+(?:\w+\s+){0,2}${IDEA}` },
    { kind: 'shown wrong', sign: -1, re: String.raw`(?:dismissed|dismisses|dismissing|debunked|debunks|disproved|disproves|refuted|refutes|shot down|shoots down)\s+{N}(?:'s|’s)\s+(?:\w+\s+){0,2}${IDEA}` },
    { kind: 'shown wrong', sign: -1, re: String.raw`{N}(?:'s|’s)\s+(?:${DERIDED}\s+){1,2}(?:\w+\s+){0,1}${IDEA}` },
    { kind: 'shown wrong', sign: -1, re: String.raw`{N}\s+(?:was|were|had been|is|turned out to be|proved)\s+(?:not\s+|never\s+)?(?:completely\s+|totally\s+|dead\s+)?(?:wrong|mistaken)` },
    { kind: 'shown wrong', sign: -1, re: String.raw`{N}\s+(?:jumped|jumps|jumping|leapt|leaped|leaps)\s+to\s+(?:a\s+|another\s+|wild\s+|absurd\s+|the wrong\s+)*conclusions?` },
    { kind: 'shown wrong', sign: -1, re: String.raw`(?:called|calling|calls)\s+{N}(?:'s|’s)?\s+(?:\w+\s+){0,2}${DERIDED}` },
    // Conduct.
    { kind: 'lashing out', sign: -1, re: String.raw`{N}\s+(?:lashed out|lashes out|overreacted|overreacts|lost (?:her|his|their) temper|loses (?:her|his|their) temper|flew into a rage|threw a tantrum|slapped|struck|attacked)` },
    { kind: 'a botched job', sign: -1, re: String.raw`{N}\s+(?:botched|botches|bungled|bungles|blew (?:the|their|our) cover|blows (?:the|their|our) cover|messed up|screwed up|failed to)` },
    { kind: 'a betrayal', sign: -1, re: String.raw`{N}\s+(?:betrayed|betrays|sold out|sells out|double-crossed|double-crosses)` },
    // The other way.
    { kind: 'proven right', sign: 1, re: String.raw`{N}(?:'s|’s)\s+(?:\w+\s+){0,2}${IDEA}\s+(?:was|were|proved|turned out)\s+(?:to be\s+)?(?:right|correct|spot on|true|accurate)` },
    { kind: 'proven right', sign: 1, re: String.raw`{N}\s+(?:was|were|had been|proved|turned out to be)\s+(?:right|correct|spot on)` },
    { kind: 'came through', sign: 1, re: String.raw`{N}\s+(?:(?:saved|saves|rescued|rescues)(?!\s+(?:\w+\s+){0,2}(?:the\s+)?(?:trouble|time|effort|bother|hassle))|came through|comes through|pulled (?:it|them|him|her) off|nailed it)` },
    { kind: 'made amends', sign: 1, re: String.raw`{N}\s+(?:apologi[sz]ed|apologi[sz]es|made amends|makes amends|owned up|admitted (?:she|he|they) (?:was|were) wrong)` },
];
// Plans, fears and talk are not conduct.
const NOT_DONE = /\b(?:would|could|might|if |unless|wants? to|threaten(?:s|ed)? to|about to|almost|nearly|afraid|worried|wonder(?:s|ed)? if|what if)\b/i;
const NEGATED = /\b(?:not|never|n't|no longer)\b/i;

const namesOf = (p) => [...new Set([clean(p?.name), ...(p?.aliases ?? []).map(clean)])].filter((n) => n.length >= 3);

// The mark `text` makes on `person` ({ name, aliases }), or null. others:
// everyone else's names - one named between them and the words is the one
// it is about.
// Regexes made once and kept: built for every sentence, name and saying,
// a chat's first scan froze the page for seconds.
const CACHE = new Map();
const cached = (key, make) => {
    if (!CACHE.has(key)) {
        if (CACHE.size > 4000) CACHE.clear();
        CACHE.set(key, make());
    }
    return CACHE.get(key);
};
const wordRe = (n) => cached(`w:${n}`, () => new RegExp(String.raw`\b${escape(n)}\b`, 'i'));
const namesRe = (names) => {
    const list = [...new Set(names)].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
    return list.length ? cached(`n:${list.join('|')}`, () => new RegExp(String.raw`\b(?:${list.map(escape).join('|')})\b`, 'gi')) : null;
};
const sayingsFor = (name) => cached(`s:${name}`, () => SAYINGS.map((s) => ({ ...s, rx: new RegExp(s.re.replace('{N}', String.raw`\b${escape(name)}`), 'i') })));
// Whether the text names them at all - a plain look, before any regex.
const mentions = (text, p) => {
    const low = String(text ?? '').toLowerCase();
    return [...namesOf(p), clean(p?.name).split(' ')[0]].some((n) => n.length >= 3 && low.includes(n.toLowerCase()));
};

export function markIn(text, person, { others = [] } = {}) {
    if (!mentions(text, person)) return null;
    const own = new Set(namesOf(person).map((n) => n.toLowerCase()));
    const rest = namesRe((others ?? []).map(clean).filter((n) => !own.has(n.toLowerCase())));
    const naming = (part) => !!rest && (part.match(rest) ?? []).some((n) => !own.has(n.toLowerCase()));
    // Speech is what people say, not what happened... except a post's own
    // words of scorn are the player character's judgment; kept.
    for (const sentence of clean(text).split(/(?<=[.!?])\s+/)) {
        if (NOT_DONE.test(sentence)) continue;
        for (const name of namesOf(person)) {
            for (const s of sayingsFor(name)) {
                const m = sentence.match(s.rx);
                if (!m) continue;
                const inner = m[0].slice(name.length);
                if (naming(inner)) continue;
                // "Doc was not wrong" turns it round.
                const sign = NEGATED.test(inner) ? -s.sign : s.sign;
                return { kind: sign === s.sign ? s.kind : (sign < 0 ? 'shown wrong' : 'proven right'), sign, text: cut(sentence, 220) };
            }
        }
    }
    return null;
}

// Scorn for someone's thinking, as the user's posts put it: "It wasn't the
// first time Doc or Galice sprang to ridiculous conclusions", "She was a
// stupid woman who made ridiculous assumptions", "she and Doc would be
// disciplined for their stupidity". Whoever the sentence names before the
// scorn - a list of names counts for each - or a she / he / they standing
// for the one last named of that gender. people: [{ id, name, aliases,
// gender: 'f'|'m'|'' , player }]. speech: false leaves out what is said
// aloud ("you're an idiot" - to whom?). -> [{ id, text }]
const SCORN = new RegExp(String.raw`\b(?:stupid(?:ity)?|idiot(?:s|ic)?|ridiculous|absurd(?:ity)?|nonsense|moronic|morons?|asinine|harebrained|half-baked|baseless|ludicrous|laughable|nosy|dumb|(?:sprang|springs?|springing|leapt|leaped|leaps?|leaping|jump(?:ed|s|ing)?)\s+to\s+(?:\w+\s+){0,2}conclusions?|wild\s+(?:theor(?:y|ies)|guess(?:es)?|conclusions?|speculation)|${DERIDED}\s+(?:assumptions?|conclusions?|theor(?:y|ies)|claims?|ideas?))\b`, 'i');
const PRONOUN = { f: /\b(?:she|her)\b/i, m: /\b(?:he|him|his)\b/i, they: /\b(?:they|them|their)\b/i };
// post: the user's own - a he / she of the player character's gender
// with no one else of it named in the sentence is the player character
// ("He didn't want to look stupid" is Cyril, not the last man named).
export function scornIn(text, people = [], { speech = true, post = false } = {}) {
    const t = speech ? clean(text) : clean(String(text ?? '').replace(/["“][^"”]*["”]/g, ' '));
    // No scorn, nothing to find; and only those the text names at all
    // (and the player character, for a "he" that is theirs).
    if (!SCORN.test(t)) return [];
    const list = (people ?? []).filter((p) => clean(p?.name) && (p.player || mentions(t, p)));
    const callNames = (p) => [...namesOf(p), clean(p.name).split(' ')[0]].filter((n) => n.length >= 3);
    const at = (s, p) => Math.min(...callNames(p).map((n) => { const i = s.search(wordRe(n)); return i < 0 ? Infinity : i; }));
    const player = list.find((p) => p.player);
    let last = { f: null, m: null, they: [] };
    const out = [];
    for (const s of t.split(/(?<=[.!?])\s+/)) {
        const named = list.map((p) => ({ p, i: at(s, p) })).filter((x) => x.i < Infinity).sort((a, b) => a.i - b.i);
        const hit = s.match(SCORN);
        if (hit && !/\?\s*$/.test(s)) {
            // The one mentioned nearest before the scorn is the one it is
            // about - "why Adam didn't call her out for the stupid things"
            // is her, not Adam - with any joined to them by and / or ("Doc
            // or Galice sprang to ridiculous conclusions").
            const before = s.slice(0, hit.index);
            const refs = named.filter((x) => x.i < hit.index).map((x) => {
                const len = (s.slice(x.i).match(/^[\p{L}'’.-]+(?:\s+\p{Lu}[\p{L}'’-]*)*/u)?.[0] ?? '').replace(/['’]s$/, '').length;
                return { i: x.i, end: x.i + len, who: [x.p], name: true };
            });
            for (const m of before.matchAll(/\b(she|her|he|him|his|they|them|their)\b/gi)) {
                const w = m[1].toLowerCase();
                const g = /^(she|her)$/.test(w) ? 'f' : /^(he|him|his)$/.test(w) ? 'm' : 'they';
                let who = [];
                if (g === 'they') who = last.they.length >= 2 ? last.they : [];
                else if (post && player?.gender === g && !named.some((x) => x.p.gender === g && !x.p.player)) who = [player];
                else {
                    const here = named.filter((x) => x.i < m.index && x.p.gender === g).at(-1)?.p;
                    who = here ? [here] : last[g] ? [last[g]] : [];
                }
                refs.push({ i: m.index, end: m.index + m[0].length, who, name: false });
            }
            refs.sort((a, b) => a.i - b.i);
            const near = refs.at(-1);
            const who = near ? [...near.who] : [];
            if (near?.name) {
                for (let k = refs.length - 2; k >= 0; k--) {
                    const gap = s.slice(refs[k].end, refs[k + 1].i);
                    if (!refs[k].name || !/^\s*(?:,|and|or|&|,\s*and|,\s*or)\s*$/i.test(gap)) break;
                    who.push(...refs[k].who);
                }
            }
            for (const p of new Set(who)) if (!p.player) out.push({ id: p.id, text: cut(s, 220) });
        }
        if (named.length) {
            last.they = named.map((x) => x.p);
            for (const { p } of named) if (p.gender === 'f' || p.gender === 'm') last[p.gender] = p;
        }
    }
    return out.filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i);
}

// What the story says of each person. items: [{ key, text, witnesses:
// [id], post: true for the user's own }] - Archivist's memories and the
// user's posts; people: [{ id, name, aliases, gender, player }]; seen: keys
// already read. -> { found: { [personId]: [{ key, kind, sign, text, by }] },
// seen }
export function standingMarks(items, { people = [], seen = [] } = {}) {
    const known = new Set(seen ?? []);
    const others = (people ?? []).filter((p) => !p.player);
    const everyone = (people ?? []).flatMap(namesOf);
    const found = {};
    for (const item of items ?? []) {
        const key = clean(item?.key);
        if (!key || known.has(key) || !clean(item?.text)) continue;
        const by = (p) => [...new Set((item.witnesses ?? []).filter((id) => id && id !== p.id))];
        const marked = new Set();
        for (const p of others) {
            const mark = markIn(item.text, p, { others: everyone });
            if (!mark) continue;
            marked.add(p.id);
            (found[p.id] ??= []).push({ key, ...mark, by: by(p) });
        }
        for (const s of scornIn(item.text, people, { speech: !item.post, post: !!item.post })) {
            if (marked.has(s.id)) continue;
            const p = others.find((x) => x.id === s.id);
            if (p) (found[p.id] ??= []).push({ key, kind: 'shown wrong', sign: -1, text: s.text, by: by(p) });
        }
    }
    return { found, seen: [...new Set([...(items ?? []).map((i) => clean(i?.key)).filter(Boolean)])].slice(-SEEN_KEPT) };
}

// ---- the chat's record (doc.standing)

export function emptyStanding() {
    return { seen: [], started: false, people: {} };
}

function normalizePerson(p) {
    const v = isObject(p) ? p : {};
    const marks = (Array.isArray(v.marks) ? v.marks : []).filter(isObject).map((m) => ({
        key: clean(m.key), kind: clean(m.kind), sign: m.sign > 0 ? 1 : -1, text: cut(m.text, 220),
        by: (Array.isArray(m.by) ? m.by : []).filter((x) => typeof x === 'string'), status: ['open', 'used', 'dismissed'].includes(m.status) ? m.status : 'open',
    })).filter((m) => m.key).slice(-MARKS_KEPT);
    return {
        name: cut(v.name, 80),
        level: clamp(v.level),
        line: cut(v.line, 300),
        by: (Array.isArray(v.by) ? v.by : []).filter((x) => typeof x === 'string'),
        marks,
        at: clean(v.at),
    };
}

export function normalizeStanding(value) {
    const v = isObject(value) ? value : {};
    const people = {};
    for (const [id, p] of Object.entries(isObject(v.people) ? v.people : {})) if (clean(id)) people[id] = normalizePerson(p);
    return {
        seen: (Array.isArray(v.seen) ? v.seen : []).filter((k) => typeof k === 'string').slice(-SEEN_KEPT),
        started: v.started === true,
        people,
    };
}

// New marks taken in (each once).
export function addMarks(standing, found) {
    const out = normalizeStanding(standing);
    for (const [id, marks] of Object.entries(found ?? {})) {
        const p = out.people[id] ?? normalizePerson({});
        const have = new Set(p.marks.map((m) => m.key));
        for (const m of marks) if (!have.has(m.key)) p.marks.push({ ...m, status: 'open' });
        p.marks = p.marks.slice(-MARKS_KEPT);
        out.people[id] = p;
    }
    return out;
}

// The pattern waiting on the user for a person: their open marks, when
// they lean one way by PATTERN or more. -> { sign, marks } | null
export function openPattern(person) {
    const open = (person?.marks ?? []).filter((m) => m.status === 'open');
    const net = open.reduce((n, m) => n + m.sign, 0);
    if (Math.abs(net) < PATTERN) return null;
    const sign = net < 0 ? -1 : 1;
    if (clamp((person?.level ?? 0) + sign) === clamp(person?.level ?? 0)) return null;
    // A bigger pattern is a bigger step: two marks one, five or more two
    // (Doc's six went only to "doubted").
    const steps = Math.abs(net) >= 5 ? 2 : 1;
    return { sign, steps, marks: open.filter((m) => m.sign === sign) };
}

// The user's word on it: the level moves one step (sign), those who saw it
// hold it, and the open marks are settled. Or by hand, without marks.
export function moveStanding(person, sign, { by = [], line = null, at = new Date().toISOString(), steps = 1 } = {}) {
    const p = normalizePerson(person);
    const open = p.marks.filter((m) => m.status === 'open' && m.sign === sign);
    p.level = clamp(p.level + sign * Math.max(1, Math.min(3, Math.round(steps) || 1)));
    p.by = [...new Set([...p.by, ...by, ...open.flatMap((m) => m.by)])];
    for (const m of p.marks) if (m.status === 'open') m.status = m.sign === sign ? 'used' : 'dismissed';
    if (line !== null) p.line = cut(line, 300);
    if (p.level === 0) { p.line = ''; p.by = []; }
    p.at = at;
    return p;
}

// Everyone with a pattern waiting. -> [{ id, name, sign, marks }]
export function openPatterns(standing) {
    return Object.entries(standing?.people ?? {}).map(([id, p]) => ({ id, name: clean(p?.name), ...(openPattern(normalizePerson(p)) ?? {}) })).filter((x) => x.sign && x.name);
}

export function dismissPattern(person) {
    const p = normalizePerson(person);
    for (const m of p.marks) if (m.status === 'open') m.status = 'dismissed';
    return p;
}

// ---- what the story is told

const PRONOUNS = { f: ['she', 'her', 'her'], m: ['he', 'him', 'his'] };

// The line for someone in the scene, when anyone here holds their standing
// (or no one in particular is named - then everyone who knows them does).
// person: their record; name; gender 'f'|'m'|''; here: [{ id, name }] the
// others present (not them). -> '' when it does not show here.
export function standingText(person, { name = '', gender = '', here = [] } = {}) {
    const p = normalizePerson(person);
    if (!p.level || !clean(name)) return '';
    const holders = p.by.length ? (here ?? []).filter((x) => p.by.includes(x.id)).map((x) => clean(x.name)).filter(Boolean) : (here ?? []).map((x) => clean(x.name)).filter(Boolean);
    if (!holders.length) return '';
    const [they, them, their] = PRONOUNS[gender] ?? ['they', 'them', 'their'];
    const who = holders.length === 1 ? holders[0] : `${holders.slice(0, -1).join(', ')} and ${holders.at(-1)}`;
    const seen = p.line ? p.line.replace(/[.!]+$/, '') : `${levelWord(p.level)}`;
    const acts = p.level <= -2
        ? `they do not take ${their} word as fact: they check what ${they} claims, ask someone else first and give the real work to others, and ${name} is not the one the scene turns to`
        : p.level === -1
            ? `they weigh what ${they} says less and look for proof before going along with ${them}`
            : p.level === 1
                ? `they listen when ${they} speaks and take ${their} word seriously`
                : `they trust ${their} judgment, turn to ${them} first and back ${them} when it counts`;
    return `How ${who} see${holders.length === 1 ? 's' : ''} ${name} now: ${seen} - ${acts}.`;
}

// For the planner: who has lost standing, so they get fewer moments.
export function sidelinedText(list = []) {
    const low = (list ?? []).filter((x) => x.level <= -2 && clean(x.name)).map((x) => clean(x.name));
    if (!low.length) return '';
    return `Not taken seriously now: ${low.join(', ')} - give ${low.length === 1 ? 'them' : 'each'} fewer moments and never the lead or the answer others wait on.`;
}
