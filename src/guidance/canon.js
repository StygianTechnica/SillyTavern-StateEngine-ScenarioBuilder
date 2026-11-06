// Continuity against the library, in code (no model call): the latest
// replies, and Archivist's notes read ahead of the chat, checked for what
// the library and the chat's state say cannot be.
//   - someone here tied to a faction they are not of (Dr. Adrigo Tole, of
//     Omicron Innovations, became "a consultant for White Cerberus" after
//     one reply's slip, and every prompt after read it back as fact);
//   - one of the dead speaking or acting.
// A hit is a correction in the next in-chat note - the reply is never
// rewritten. Subtler contradictions are for a model check (ROADMAP,
// "Continuity check by model"). Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const lower = (text) => clean(text).toLowerCase();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namesOf = (x) => [clean(x?.name), clean(String(x?.name ?? '').split(/[\s,]+/)[0]), ...(x?.aliases ?? []).map(clean)].filter((n) => n.length >= 3);
const sentences = (text) => String(text ?? '').split(/(?<=[.!?…])["”’']?\s+|\n+/).map(clean).filter(Boolean);

// Ways of saying someone works for, belongs to or serves a faction, just
// before its name.
const TIE = String.raw`(?:(?:consultant|agent|operative|member|employee|researcher|scientist|officer|leader|head|ally|associate|representative|envoy|liaison|contact|asset|spy|advisor|adviser|lieutenant|enforcer|servant|soldier|fixer|broker)s?\s+(?:for|of|with|to|at|from)|(?:works?|working|worked|serves?|serving|served|fights?|fighting|fought)\s+(?:for|with)|employed\s+by|loyal\s+to|(?:profits?|benefit|interests?|gain)\s+(?:for|of)|on\s+behalf\s+of)\s+(?:the\s+)?`;
const ROLE_AFTER = String.raw`(?:['’]s?)?\s+(?:own\s+)?(?:consultant|agent|operative|employee|researcher|scientist|officer|representative|envoy|liaison|asset|spy|advisor|adviser|lieutenant|enforcer|fixer|broker)\b`;
const NEGATED = /\b(?:not|never|no longer|isn['’]?t|wasn['’]?t|nor|former|ex-|pretend\w*|posing|pose[sd]? as|disguised|undercover)\b/i;

// The first place in `s` one of `names` is named, or -1.
function firstAt(s, names) {
    let at = -1;
    for (const n of names) {
        const m = new RegExp(String.raw`(?:^|[^\p{L}])(${escape(n)})(?=$|[^\p{L}])`, 'iu').exec(s);
        if (m && (at < 0 || m.index < at)) at = m.index + m[0].indexOf(m[1]);
    }
    return at;
}

// people: [{ name, aliases, factionIds, player }] - those here; factions:
// [{ id, name, aliases }]; texts: the replies and notes to read; others:
// more names (anyone in the library) that break a clause's link.
// -> [{ name, faction, theirs: [name] }], one per person and faction.
export function factionSlips(people = [], factions = [], texts = [], { others = [] } = {}) {
    const byId = new Map((factions ?? []).filter((f) => clean(f?.name)).map((f) => [f.id, f]));
    const everyone = [...new Set([...(people ?? []).flatMap(namesOf), ...(others ?? []).map(clean)].filter((n) => n.length >= 3))];
    const out = [];
    const seen = new Set();
    for (const p of people ?? []) {
        if (p?.player || !(p?.factionIds ?? []).length) continue;
        const own = namesOf(p);
        const theirs = p.factionIds.map((id) => byId.get(id)).filter(Boolean);
        const mine = new Set(theirs.flatMap((f) => [f.name, ...(f.aliases ?? [])]).map(lower));
        const strangers = everyone.filter((n) => !own.some((o) => lower(o) === lower(n)));
        for (const f of byId.values()) {
            if (p.factionIds.includes(f.id) || mine.has(lower(f.name))) continue;
            const key = `${lower(p.name)}|${f.id}`;
            if (seen.has(key)) continue;
            const fn = [f.name, ...(f.aliases ?? [])].map(clean).filter((n) => n.length >= 3);
            const hit = (texts ?? []).some((t) => sentences(t).some((s) => {
                const at = firstAt(s, own);
                if (at < 0) return false;
                return fn.some((n) => {
                    // "Tole, a consultant for White Cerberus": named, then tied,
                    // with no one else named between.
                    const tie = new RegExp(String.raw`${TIE}${escape(n)}\b`, 'i').exec(s.slice(at));
                    if (tie) {
                        const between = s.slice(at, at + tie.index);
                        if (!NEGATED.test(between + tie[0]) && firstAt(between, strangers) < 0 && between.length <= 90) return true;
                    }
                    // "the White Cerberus consultant, Tole" / "Tole, the White Cerberus agent"
                    const role = new RegExp(String.raw`\b${escape(n)}${ROLE_AFTER}`, 'i').exec(s);
                    if (role) {
                        const [from, to] = role.index < at ? [role.index + role[0].length, at] : [at, role.index];
                        const between = s.slice(from, to);
                        if (between.length <= 40 && firstAt(between, strangers) < 0 && !NEGATED.test(s.slice(Math.max(0, role.index - 30), role.index + role[0].length))) return true;
                    }
                    return false;
                });
            }));
            if (!hit) continue;
            seen.add(key);
            out.push({ name: clean(p.name), faction: clean(f.name), theirs: theirs.map((x) => clean(x.name)) });
        }
    }
    return out;
}

const ACTS = String.raw`(?:said|says|asked|asks|replied|replies|answered|answers|whispered|whispers|muttered|mutters|growled|growls|spoke|speaks|added|adds|continued|smiled|smiles|grinned|grins|laughed|laughs|nodded|nods|shrugged|shrugs|walked|walks|stepped|steps|stood|stands|sat|sits|turned|turns|leaned|leans|looked|looks|glanced|glances|reached|reaches|raised|raises|winked|winks|chuckled|chuckles|sighed|sighs)\b`;
const REMEMBERED = /\b(?:body|corpse|remains|ghost|spirit|memory|memories|remember\w*|recall\w*|grave|tomb|funeral|late|vision|dream\w*|portrait|photo\w*|recording|hologram|echo|once|used to|would have|had been|before (?:he|she|they) died)\b/i;
const RETURNED = /\b(?:alive|revived?|resurrect\w*|rose|risen|rises|raised from|back from the dead|breath(?:ed|ing)? again|heart (?:beat|started)|returned from death|not dead|never died|survived)\b/i;

// dead: [{ name, aliases?, how? }] - this chat's dead; text: the latest
// reply. -> [name] of the dead it has speaking or acting, unless it brings
// them back or only remembers them.
export function deadActing(dead = [], text = '') {
    const out = [];
    for (const d of dead ?? []) {
        const names = namesOf(d);
        const acts = sentences(text).some((s) => {
            if (RETURNED.test(s) || REMEMBERED.test(s)) return false;
            return names.some((n) => new RegExp(String.raw`(?:^|[^\p{L}])${escape(n)}(?:\s+\w+ly)?\s+${ACTS}`, 'iu').test(s));
        });
        if (acts && !RETURNED.test(text)) out.push(clean(d.name));
    }
    return [...new Set(out)];
}

// The corrections, for the in-chat note.
export function correctionText({ slips = [], dead = [] } = {}) {
    const lines = [];
    for (const s of slips) {
        const theirs = s.theirs.length ? ` - ${s.name} is of ${s.theirs.join(' and ')}` : '';
        lines.push(`Correction: ${s.name} is not of ${s.faction} and never was${theirs}. The story or its notes said otherwise by mistake; that does not stand. No one treats ${s.name} as one of ${s.faction}, and ${s.name} never speaks or acts as one of them.`);
    }
    for (const name of dead) {
        lines.push(`Correction: ${name} is dead. The last reply had ${name} speak or act by mistake; it does not stand. ${name} does nothing in this reply - only the living speak and act.`);
    }
    return lines.join(' ');
}

// Someone here written with the other gender's pronouns: a sentence that
// begins with them and, before anyone else is named, says his for her or
// her for him (Assassins Inc: "Galice stepped forward, his voice firm" -
// Adam's lines given to Galice, his pronoun and all). people: [{ name,
// aliases, gender 'f'|'m', player }]; others: every name in the library.
// -> [{ name, gender }]
const HIS = /\b(?:he|him|his|himself)\b/i;
const HERS = /\b(?:she|her|hers|herself)\b/i;
export function pronounSlips(people = [], text = '', { others = [] } = {}) {
    const out = [];
    const t = String(text ?? '').replace(/["“][^"”]*["”]/g, ' ');
    for (const p of people ?? []) {
        if (p.player || !['f', 'm'].includes(p.gender)) continue;
        const names = namesOf(p);
        // Everyone else, by first name too ("Inji" for Inji Miyama).
        const rest = [...new Set((others ?? []).flatMap((n) => [clean(n), clean(String(n ?? '').split(/[\s,]+/)[0])]).filter((n) => n.length >= 3 && !names.some((x) => lower(x) === lower(n))))];
        const wrong = p.gender === 'f' ? HIS : HERS;
        const slip = sentences(t).some((s) => {
            const at = firstAt(s, names);
            if (at !== 0) return false;
            // Up to the next person named: the pronouns there are theirs.
            const next = firstAt(s.slice(1), rest);
            const span = next < 0 ? s : s.slice(0, next + 1);
            return wrong.test(span);
        });
        if (slip) out.push({ name: clean(p.name), gender: p.gender });
    }
    return out;
}

// Someone here giving the orders when they do not lead and their leader is
// away (Galice "assigns roles for the operation" - Adam Miller's to give).
// people: [{ id, name, aliases, factionIds, player }]; leaders: Map
// factionId -> [{ id, name }]; texts: the latest reply and Archivist's
// notes. -> [{ name, leader, faction }]
const ORDERS = /\b(?:assign(?:s|ed|ing)?\s+(?:the\s+)?(?:roles|tasks|duties|positions|teams?)|(?:gives?|gave|giving|issues?|issued|barks?|barked)\s+(?:the\s+)?orders|ordered\s+(?:the\s+)?(?:team|everyone|them|us)|put(?:s|ting)?\s+\w+\s+in\s+charge|takes?\s+command|took\s+command|is\s+in\s+command)\b/i;
const ORDER_SAID = /\b(?:I expect (?:everyone|each of you|you all)|you(?:\s+and\s+[\p{Lu}][\p{L}]+)?\s+will\s+(?:be\s+)?(?:lead(?:ing)?|handle|take point|provide|cover)|(?:that's|that is) an order|you have your orders|let's move out)\b/iu;
export function commandSlips(people = [], leaders = new Map(), texts = []) {
    const out = [];
    const here = new Set((people ?? []).map((p) => p.id));
    for (const p of people ?? []) {
        if (p.player) continue;
        for (const fid of p.factionIds ?? []) {
            const heads = leaders.get(fid) ?? [];
            if (!heads.length || heads.some((h) => h.id === p.id || here.has(h.id))) continue;
            const names = namesOf(p);
            // Who says the words: the one the sentence before them starts
            // with, or - for a he / she - the one the sentence before that
            // started with ("He turned to Inji. 'You and Cyril will lead'"
            // is still Galice).
            const lastNamed = (before) => {
                const said = sentences(before).reverse();
                for (const s of said) {
                    const who = (people ?? []).find((q) => firstAt(s, namesOf(q)) === 0);
                    if (who) return who;
                    if (!/^(?:he|she|they)\b/i.test(s)) return null;
                }
                return null;
            };
            const gave = (texts ?? []).some((text) => {
                const raw = String(text ?? '');
                // Their own sentence says it, or their quoted words do.
                return sentences(raw.replace(/["“][^"”]*["”]/g, ' ')).map((s) => s.replace(/^[-*•]\s*/, '')).some((s) => firstAt(s, names) === 0 && ORDERS.test(s))
                    || [...raw.matchAll(/([^"“]{0,200})["“]([^"”]+)["”]/g)].some((m) => ORDER_SAID.test(m[2]) && lastNamed(m[1]) === p);
            });
            if (gave) out.push({ name: clean(p.name), leader: clean(heads[0].name), faction: fid });
        }
    }
    return out.filter((x, i, all) => all.findIndex((y) => y.name === x.name) === i);
}

export function pronounText(slips = [], commands = []) {
    const lines = [];
    for (const s of slips) lines.push(`Correction: ${s.name} is ${s.gender === 'f' ? 'a woman - she, her' : 'a man - he, him'}. The last reply slipped; write ${s.name} so.`);
    for (const c of commands) lines.push(`Correction: ${c.name} does not give the orders - ${c.leader} does, and ${c.leader} is not here. The last reply had ${c.name} give them by mistake. No one here takes ${c.leader}'s place: they keep to the orders ${c.leader} gave and settle the rest among equals.`);
    return lines.join(' ');
}

// Puts right someone's pronouns in a reply, only where they are plainly
// the one meant: a sentence that begins with them, up to the next person
// named, and a sentence that begins with a he / she right after one that
// began with them (no one of that gender named between). Galice, a woman,
// was "he" in 9 of the last 40 messages and the model followed the chat
// over every correction. person: { name, aliases, gender 'f'|'m' };
// others: [{ name, aliases, gender }]. -> { text, count }
const SWAP_TO_F = { he: 'she', him: 'her', his: 'her', himself: 'herself' };
const OBJECT_AFTER = /^(?:|that|to|and|or|but|in|on|with|for|as|at|from|by|into|again|back|off|up|down|out|away|over|a|an|the|this|these|those|now|then|here|there|before|after|if|when|while)$/i;
export function fixPronounsIn(text, person, others = []) {
    if (!['f', 'm'].includes(person?.gender)) return { text: String(text ?? ''), count: 0 };
    const names = namesOf(person);
    const rest = (others ?? []).filter((o) => clean(o?.name) && !names.some((n) => namesOf(o).some((m) => lower(m) === lower(n))));
    const restNames = rest.flatMap(namesOf);
    const sameGender = rest.filter((o) => o.gender && o.gender !== person.gender).flatMap(namesOf);
    let count = 0;
    const swap = (span) => span.replace(person.gender === 'f' ? /\b(he|him|his|himself)\b(\s*)([\p{L}'’-]*)/giu : /\b(she|her|hers|herself)\b(\s*)([\p{L}'’-]*)/giu, (all, w, sp, next) => {
        const lw = w.toLowerCase();
        const to = person.gender === 'f' ? SWAP_TO_F[lw] : { she: 'he', hers: 'his', herself: 'himself', her: OBJECT_AFTER.test(next) ? 'him' : 'his' }[lw];
        count++;
        return (w[0] === w[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to) + sp + next;
    });
    // Speech is left as it is: inside quotes, "he" may be anyone.
    const fixNarration = (s, fix) => s.split(/(["“][^"”]*["”])/).map((part, i) => (i % 2 ? part : fix(part))).join('');
    let theirs = false;
    const out = String(text ?? '').split(/(?<=[.!?…]["”’']?)(\s+)/).map((s) => {
        if (!s.trim()) return s;
        const plain = s.replace(/^[\s"“*_-]+/, '');
        const lead = s.slice(0, s.length - plain.length);
        if (firstAt(plain, names) === 0) {
            theirs = true;
            const next = firstAt(plain.slice(1), restNames);
            const end = next < 0 ? plain.length : next + 1;
            return lead + fixNarration(plain.slice(0, end), swap) + plain.slice(end);
        }
        const opens = /^(he|she|his|her|him)\b/i.exec(plain);
        const wrongOpen = opens && (person.gender === 'f' ? /^(?:he|his|him)$/i : /^(?:she|her)$/i).test(opens[1]);
        if (theirs && wrongOpen) {
            const next = firstAt(plain.slice(1), restNames);
            const end = next < 0 ? plain.length : next + 1;
            return lead + fixNarration(plain.slice(0, end), swap) + plain.slice(end);
        }
        // Someone else named: the next he / she may be theirs.
        theirs = theirs && firstAt(plain, restNames) < 0;
        return s;
    }).join('');
    return { text: out, count };
}

// Archivist's notes calling a pair close when the user wrote them as
// rivals or enemies: Assassins Inc's library has Zane and Inji as rivals
// ("compete lewdly over sexual conquests"), and the notes read before the
// chat said "Inji Miyama -> Zane: ally, close (+2)" - the narrator played
// them as best friends. authored: [{ a, b, kind, note }] for pairs here
// (names); notes: Archivist's text. -> [{ a, b, kind, note, said }]
const AGAINST = /\b(?:rival|enem|hostile|hate|distrust|resent|feud|grudge|nemes|compet|antagon|despise|loathe)/i;
const WARM = /\b(?:ally|allies|friend|close|best|partner|trust|devoted|loyal|support|teammate|confidant)\b|\(\+\d\)/i;
export function relationSlips(authored = [], notes = '') {
    const out = [];
    const lines = String(notes ?? '').split(/\n/).map(clean).filter((l) => /->|→/.test(l));
    for (const r of authored ?? []) {
        if (!AGAINST.test(`${r.kind} ${r.note ?? ''}`)) continue;
        const pair = [r.a, r.b].map((n) => namesOf({ name: n }));
        const said = lines.find((l) => {
            const [left, right = ''] = l.split(/->|→/);
            const head = right.split(':')[0] ?? '';
            const one = (side, names) => names.some((n) => firstAt(side, [n]) >= 0);
            const ab = (one(left, pair[0]) && one(head, pair[1])) || (one(left, pair[1]) && one(head, pair[0]));
            const rest = right.slice(head.length);
            return ab && WARM.test(rest) && !AGAINST.test(rest);
        });
        if (said) out.push({ a: clean(r.a), b: clean(r.b), kind: clean(r.kind), note: clean(r.note), said: said.replace(/^-\s*/, '') });
    }
    return out;
}

export function relationText(slips = []) {
    return slips.map((s) => `Correction: between ${s.a} and ${s.b} it is ${s.kind}${s.note ? ` - ${s.note}` : ''}; they are not allies or close friends, and notes that said so were wrong. They needle, compete and keep score with each other, whatever the job.`).join(' ');
}
