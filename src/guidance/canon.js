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
