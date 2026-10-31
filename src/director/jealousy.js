// Jealousy - the director's cues for hearts (docs/ROADMAP.md, Jealousy).
// A model left to itself rarely has someone react when the one they love
// flirts with another in front of them, or when a promise of love is
// broken - and when it does, the hurt is gone by the next reply. Here code
// works out who is bound to whom, so the director is told who would mind
// and how it lasts:
//
//   bonds       who loves, is devoted to, or is promised to whom - from the
//               relationships the user wrote (lover, spouse, betrothed...),
//               the story's (Archivist: a romantic tie, or devoted +3), and
//               vows of love (oaths: "swore to marry her", "to be faithful").
//   watch       those here bound to someone else here, with a third person
//               around: if the one they love shows warmth to someone else,
//               they notice, and it shows - in their own way.
//   grievances  what was seen (the director's JEALOUS line), a vow of love
//               broken (an oath's status), or word that may reach someone
//               away (ROMANCE): kept in the chat and fading over in-game
//               days - slower for someone jealous by nature - so the next
//               scenes still carry it, until it is talked out (SOOTHED).
//
// On and off: the director setting `jealousy` is the default; a character's
// own (meta.jealousy) overrides it either way - 'jealous' (quick to it, slow
// to let go: jealous even when the chat's default is off) or 'never'. The
// player character is never jealous for the story: only the others react.
// No extra model call - lines in the director's prompt, and three report
// lines back. Pure: the runner is src/director/run.js.
//
// chat document: hearts: { grievances: [grievance], vowsSeen: [knowledgeId] }
//   grievance = { id, who, whoName, over, overName, rival, rivalName, what, kind: 'seen' | 'vow' | 'word',
//                 strength: 1 | 2 | 3, day, turn, soothed }

export const JEALOUSY_MODES = Object.freeze(['', 'jealous', 'never']);
export const JEALOUSY_LABELS = Object.freeze({ '': 'As the chat decides', jealous: 'Jealous by nature - quick to it, slow to let go', never: 'Never jealous' });
export const STRENGTH_WORDS = Object.freeze({ 1: 'stung', 2: 'hurt', 3: 'wounded and angry' });

const GRIEVANCE_LIMIT = 30;
const VOWS_LIMIT = 100;
// In-game days a grievance lasts, by kind and strength; doubled for
// someone jealous by nature.
const LASTS = { seen: { 1: 1, 2: 4, 3: 10 }, vow: { 1: 21, 2: 21, 3: 30 }, word: { 1: 7, 2: 10, 3: 14 } };

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const cut = (v, n) => clean(v).slice(0, n);
const unstop = (t) => clean(t).replace(/[.!?…]+$/, '');
const lower = (t) => clean(t).toLowerCase();

const ROMANTIC = /\b(?:lovers?|in love|loves?|beloved|sweetheart|spouses?|wife|husband|wed|wedded|married|marry|betrothed|betroth\w*|fianc[ée]e?|engaged|paramour|mistress|consort|courting|courtship|crush|romance|romantic|darling|girlfriend|boyfriend|intended|amour|infatuat\w*|smitten|partner in life|bride|groom|suitor)\b/i;
const FAMILY = /\b(?:brothers?|sisters?|siblings?|mother|father|parents?|sons?|daughters?|child(?:ren)?|cousins?|uncle|aunt|niece|nephew|grand\w*|kin|family|twins?|mentor|teacher|student|apprentice)\b/i;
const VOW = /\b(?:marry|wed|faithful|fidelity|forsak\w*|betroth\w*|engag\w*|only (?:you|one)|my heart|be yours|be mine|true to (?:you|him|her|them)|love (?:you|him|her|them)|never love|no other|hand in marriage)\b/i;

export const isRomantic = (text) => ROMANTIC.test(str(text)) && !FAMILY.test(str(text));
export const isVowOfLove = (text) => VOW.test(str(text));

export const jealousyOf = (entry) => (JEALOUSY_MODES.includes(entry?.meta?.jealousy) ? entry.meta.jealousy : '');

// Whether someone can be jealous: their own setting first, else the chat's.
export const canBeJealous = (mode, globalOn) => (mode === 'jealous' ? true : mode === 'never' ? false : globalOn === true);

export function emptyHearts() {
    return { grievances: [], vowsSeen: [] };
}

function normalizeGrievance(g) {
    if (!isObject(g) || !clean(g.id) || !clean(g.who) || !clean(g.over)) return null;
    return {
        id: clean(g.id),
        who: clean(g.who),
        whoName: cut(g.whoName, 120),
        over: clean(g.over),
        overName: cut(g.overName, 120),
        rival: clean(g.rival),
        rivalName: cut(g.rivalName, 120),
        what: cut(g.what, 240),
        kind: ['seen', 'vow', 'word'].includes(g.kind) ? g.kind : 'seen',
        strength: [1, 2, 3].includes(g.strength) ? g.strength : 2,
        day: Number.isInteger(g.day) ? g.day : null,
        turn: Number.isInteger(g.turn) ? g.turn : 0,
        soothed: g.soothed === true,
    };
}

export function normalizeHearts(v) {
    const h = isObject(v) ? v : {};
    return {
        grievances: (Array.isArray(h.grievances) ? h.grievances : []).map(normalizeGrievance).filter(Boolean).slice(-GRIEVANCE_LIMIT),
        vowsSeen: (Array.isArray(h.vowsSeen) ? h.vowsSeen : []).filter((x) => typeof x === 'string' && x).slice(-VOWS_LIMIT),
    };
}

// ---------------------------------------------------------------- bonds

// Who is bound to whom. authored: [{ from, to, kind, note, mutual }] (the
// setting's relationships); story: [{ fromId, toId, type, polarity, text }]
// (Archivist's, one way each); oaths: knowledge items of kind 'oath' with
// people as { id, name } (library/knowledge.js); nameOf(id).
// -> [{ who, to, strength (1-3), romantic, label }] - one per pair and way,
//    the strongest kept.
export function bondsOf({ authored = [], story = [], oaths = [], nameOf = () => '' } = {}) {
    const found = new Map();
    const add = (who, to, strength, romantic, label) => {
        if (!who || !to || who === to) return;
        const key = `${who}|${to}`;
        const had = found.get(key);
        if (had && (had.strength > strength || (had.strength === strength && had.romantic >= romantic))) return;
        found.set(key, { who, to, strength, romantic, label });
    };
    for (const r of authored ?? []) {
        const text = `${str(r.kind)} ${str(r.note)}`;
        if (!isRomantic(text)) continue;
        add(r.from, r.to, 3, true, clean(r.kind) || 'lover');
        if (r.mutual) add(r.to, r.from, 3, true, clean(r.kind) || 'lover');
    }
    for (const r of story ?? []) {
        const text = `${str(r.type)} ${str(r.text)}`;
        const polarity = Number(r.polarity) || 0;
        if (FAMILY.test(text)) continue;
        if (ROMANTIC.test(text) && polarity >= 1) add(r.fromId, r.toId, Math.min(3, Math.max(2, polarity)), true, clean(r.type) || 'in love');
        else if (polarity >= 3) add(r.fromId, r.toId, 2, false, 'devoted');
    }
    for (const k of oaths ?? []) {
        if (k?.kind !== 'oath' || !isVowOfLove(k.text) || k.status === 'released') continue;
        // A vow of love binds both ways: the one who swore it, and the one it
        // was sworn to, who now counts on it.
        for (const by of k.madeBy ?? []) for (const to of k.madeTo ?? []) {
            if (!by?.id || !to?.id) continue;
            add(by.id, to.id, 3, true, 'sworn to');
            add(to.id, by.id, 3, true, `promised by ${by.name || nameOf(by.id) || 'them'}`);
        }
    }
    return [...found.values()];
}

// ---------------------------------------------------------------- grievances

// Whether a grievance still weighs on day `day`.
export function isLive(g, day, { prone = false } = {}) {
    if (g.soothed) return false;
    if (!Number.isInteger(day) || !Number.isInteger(g.day)) return true;
    const lasts = (LASTS[g.kind]?.[g.strength] ?? 4) * (prone ? 2 : 1);
    return day - g.day <= lasts;
}

// A grievance noted: the same person over the same one and rival, still
// live, is made fresh and as strong as the stronger (no pile of copies).
export function addGrievance(hearts, g, { newId = () => `g${Math.random().toString(36).slice(2, 8)}` } = {}) {
    const next = normalizeGrievance({ ...g, id: g.id || newId() });
    if (!next) return null;
    const same = hearts.grievances.find((x) => !x.soothed && x.who === next.who && x.over === next.over && (x.rival || '') === (next.rival || '') && x.kind === next.kind);
    if (same) {
        Object.assign(same, { strength: Math.max(same.strength, next.strength), day: next.day ?? same.day, turn: next.turn, what: next.what || same.what });
        return same;
    }
    hearts.grievances = [...hearts.grievances, next].slice(-GRIEVANCE_LIMIT);
    return next;
}

// Vows of love newly broken: a grievance for each one they were sworn to
// (not the player character - only the others react), once per vow.
// oaths: knowledge items; -> how many were added.
export function noteBrokenVows(hearts, oaths, { day = null, turn = 0, playerId = '', newId } = {}) {
    let added = 0;
    const seen = new Set(hearts.vowsSeen);
    for (const k of oaths ?? []) {
        if (k?.kind !== 'oath' || k.status !== 'broken' || !k.id || seen.has(k.id) || !isVowOfLove(k.text)) continue;
        seen.add(k.id);
        const by = (k.madeBy ?? []).find((p) => p?.id);
        if (!by) continue;
        for (const to of (k.madeTo ?? []).filter((p) => p?.id && p.id !== playerId && p.id !== by.id)) {
            if (addGrievance(hearts, { who: to.id, whoName: to.name, over: by.id, overName: by.name, what: `${by.name || 'they'} broke a vow: ${unstop(k.text)}`, kind: 'vow', strength: 3, day, turn }, { newId })) added += 1;
        }
    }
    hearts.vowsSeen = [...seen].slice(-VOWS_LIMIT);
    return added;
}

// The director's SOOTHED line: what was between them is talked out, or
// made up for. -> how many were let go.
export function soothe(hearts, whoId, { overId = '' } = {}) {
    let n = 0;
    for (const g of hearts.grievances) if (!g.soothed && g.who === whoId && (!overId || g.over === overId)) { g.soothed = true; n += 1; }
    return n;
}

// ---------------------------------------------------------------- the director's HEARTS section

const ago = (n) => (!Number.isInteger(n) || n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);
const SIGNS = [
    'goes cold and quiet', 'turns sharp and sarcastic', 'clings, or competes for attention', 'confronts it head-on',
    'turns on the rival', 'pretends not to care and fails', 'hurts in private and lets it out later',
];

// opts: { present: [{ id, name, player, personality }] (who is here),
// bonds (bondsOf), grievances (the chat's), modeOf(id) -> '' | 'jealous' |
// 'never', globalOn, day, userName, nameOf(id), max }.
// -> { text, report } - text: the HEARTS section ('' when nothing bears on
// this scene); report: whether to ask for the JEALOUS / ROMANCE / SOOTHED
// lines (which kinds apply).
export function heartsSection({ present = [], bonds = [], grievances = [], modeOf = () => '', globalOn = true, day = null, userName = 'the player', nameOf = () => '', max = 8 } = {}) {
    const here = new Map(present.filter((p) => p?.id).map((p) => [p.id, p]));
    const nameOfId = (id) => clean(here.get(id)?.name) || clean(nameOf(id));
    const playerIds = new Set(present.filter((p) => p.player).map((p) => p.id));
    const may = (id) => !playerIds.has(id) && canBeJealous(modeOf(id), globalOn);
    const lines = [];
    let watch = false;
    let word = false;
    // Watched: someone here bound to another here, with someone else around
    // who could come between them.
    for (const b of bonds) {
        if (!here.has(b.who) || !here.has(b.to) || !may(b.who)) continue;
        const others = [...here.keys()].filter((id) => id !== b.who && id !== b.to);
        if (!others.length) continue;
        const who = nameOfId(b.who);
        const to = b.to && playerIds.has(b.to) ? userName : nameOfId(b.to);
        const tie = b.romantic ? (b.label && !/^(?:in love|lover)$/i.test(b.label) ? `is in love with ${to} (${b.label})` : `is in love with ${to}`) : `is devoted to ${to}`;
        const prone = modeOf(b.who) === 'jealous';
        lines.push(`- ${who} ${tie}. If ${to} shows warmth, desire or favour to someone else here - flirting, a lingering touch, a kiss, choosing their company - ${who} notices, and it shows${b.romantic ? '' : ' if it fits what they are to each other'}${prone ? `. ${who} is jealous by nature: quick to it, slow to let go, and may act on it` : ''}.`);
        watch = true;
    }
    // Rivals: two here bound to the same one.
    const byTarget = new Map();
    for (const b of bonds.filter((x) => x.romantic && here.has(x.who) && may(x.who))) byTarget.set(b.to, [...(byTarget.get(b.to) ?? []), b.who]);
    for (const [to, whos] of byTarget) {
        if (whos.length < 2) continue;
        const names = whos.slice(0, 3).map(nameOfId);
        lines.push(`- ${names.join(' and ')} both want ${playerIds.has(to) ? userName : nameOfId(to) || 'the same one'}: rivals - watchful of each other, cutting, competing for attention${here.has(to) ? '' : ' even while they are away'}.`);
        watch = true;
    }
    // Away: someone bound to one who is here, who would mind what happens here.
    const away = bonds.filter((b) => b.romantic && !here.has(b.who) && here.has(b.to) && !playerIds.has(b.who) && canBeJealous(modeOf(b.who), globalOn));
    if (away.length && here.size > 1) {
        const items = away.slice(0, 3).map((b) => `${nameOf(b.who) || 'someone'} (${b.label || 'in love'}, toward ${playerIds.has(b.to) ? userName : nameOfId(b.to)})`);
        lines.push(`- Not here, but bound to someone who is: ${items.join('; ')}. They learn only what word reaches them.`);
        word = true;
    }
    // Still smarting: what was seen, a vow broken, word that may have reached them.
    const live = grievances.filter((g) => here.has(g.who) && may(g.who) && isLive(g, day, { prone: modeOf(g.who) === 'jealous' }));
    for (const g of live.slice(-4)) {
        const who = nameOfId(g.who) || g.whoName;
        const over = playerIds.has(g.over) ? userName : nameOfId(g.over) || g.overName;
        const rival = g.rival ? (playerIds.has(g.rival) ? userName : nameOfId(g.rival) || g.rivalName) : '';
        const when = ago(Number.isInteger(day) && Number.isInteger(g.day) ? day - g.day : 0);
        if (g.kind === 'word') {
            lines.push(`- Word may have reached ${who}: ${unstop(g.what)} (${when}). Whether ${who} has heard is for the story - someone here may let it slip, or ${who} may ask; once ${who} knows, it ${g.strength >= 3 ? 'wounds' : 'stings'}.`);
            continue;
        }
        const toward = [
            here.has(g.over) ? `toward ${over}: ${g.strength >= 3 ? 'hurt and angry - testing, accusing, or pulling away' : 'cooler, shorter, watching for more'}` : '',
            rival && here.has(g.rival) ? `toward ${rival}: ${g.strength >= 2 ? 'cold, cutting, competitive' : 'wary'}` : '',
        ].filter(Boolean).join('; ');
        lines.push(`- ${who} is still ${STRENGTH_WORDS[g.strength]} (${when}): ${unstop(g.what)}.${toward ? ` It colours how ${who} treats them - ${toward}.` : ''} It eases only when it is talked out, apologised for or made up for - not on its own between one reply and the next.`);
        watch = true;
    }
    if (!lines.length) return { text: '', report: { jealous: false, romance: false, soothed: false } };
    const head = `HEARTS (private - who is bound to whom, so jealousy is played true. It shows as each would show it: one ${SIGNS.slice(0, 4).join(', one ')}, one ${SIGNS.slice(4).join(', one ')}. A little flirting stings; a kiss, a night together or a broken promise wounds. It costs the relationship until it is mended. Never decide what ${userName} feels or does about it - only how the others take it)`;
    return { text: [head, ...lines.slice(0, max)].join('\n'), report: { jealous: watch, romance: word, soothed: live.length > 0 } };
}

// The report lines the director is asked for (src/director/prompt.js).
export function heartsFormat(report, userName = 'the player') {
    if (!report) return [];
    const out = [];
    if (report.jealous) out.push(
        `If the latest chat shows someone under HEARTS seeing the one they love show warmth, desire or favour to another (${userName} included), a line for each one it touches - and the briefing shows how they take it:`,
        'JEALOUS | <who is jealous> | <the one they love> | <the rival> | <what they saw, a few words> | <stung, hurt or wounded>',
    );
    if (report.romance) out.push(
        'If the latest chat shows romance between someone here and another - flirting, a kiss, more - where someone NOT here (listed under HEARTS) would mind, a line; word of it may reach them later:',
        'ROMANCE | <one> | <the other> | <what happened, a few words>',
    );
    if (report.soothed) out.push(
        'If the latest chat shows someone still smarting under HEARTS truly reconciled - it is talked out, apologised for or made up for - a line:',
        'SOOTHED | <who> | <how, a few words>',
    );
    return out;
}

const STRENGTHS = { stung: 1, sting: 1, hurt: 2, wounded: 3, angry: 3, fury: 3, furious: 3, 'wounded and angry': 3 };
export const strengthOf = (word, fallback = 2) => STRENGTHS[lower(word).replace(/[^a-z ]/g, '').trim()] ?? (/wound|fur|rage|angr/i.test(str(word)) ? 3 : /sting|bit|little/i.test(str(word)) ? 1 : fallback);

// The director's JEALOUS / ROMANCE lines taken in. ctx: { resolve(name) ->
// id | null, nameOf(id), present: ids here, bonds, modeOf, globalOn,
// playerId, day, turn, newId }. -> { added: [grievance], word: [{ who, over,
// rival, what }] (people away who would mind - for the world meanwhile) }
export function takeHearts(hearts, { jealous = [], romance = [], soothed = [] } = {}, ctx = {}) {
    const { resolve = () => null, nameOf = () => '', present = [], bonds = [], modeOf = () => '', globalOn = true, playerId = '', day = null, turn = 0, newId } = ctx;
    const here = new Set(present);
    const added = [];
    const word = [];
    const may = (id) => id && id !== playerId && canBeJealous(modeOf(id), globalOn);
    for (const j of jealous ?? []) {
        const who = resolve(j.who);
        const over = resolve(j.over);
        const rival = resolve(j.rival);
        if (!may(who) || !over || who === over || !here.has(who)) continue;
        const bond = bonds.find((b) => b.who === who && b.to === over);
        const strength = strengthOf(j.how, bond?.romantic ? 2 : 1);
        const g = addGrievance(hearts, { who, whoName: nameOf(who), over, overName: nameOf(over), rival: rival ?? '', rivalName: rival ? nameOf(rival) : clean(j.rival), what: j.what || `saw ${nameOf(over)} with ${nameOf(rival) || clean(j.rival) || 'someone else'}`, kind: 'seen', strength, day, turn }, { newId });
        if (g) added.push(g);
    }
    for (const r of romance ?? []) {
        const a = resolve(r.one);
        const b = resolve(r.other);
        if (!a || !b || a === b) continue;
        for (const [over, rival] of [[a, b], [b, a]]) {
            for (const bond of bonds.filter((x) => x.romantic && x.to === over && x.who !== rival && !here.has(x.who) && may(x.who))) {
                const what = `${nameOf(over)} and ${nameOf(rival)}${r.what ? ` - ${unstop(r.what)}` : ''}`;
                const g = addGrievance(hearts, { who: bond.who, whoName: nameOf(bond.who), over, overName: nameOf(over), rival, rivalName: nameOf(rival), what, kind: 'word', strength: /kiss|bed|night|made love|embrac/i.test(str(r.what)) ? 3 : 2, day, turn }, { newId });
                if (g) { added.push(g); word.push({ who: bond.who, over, rival, what }); }
            }
        }
    }
    for (const s of soothed ?? []) {
        const who = resolve(s.who);
        if (who) soothe(hearts, who);
    }
    return { added, word };
}

// For the GM Plan tab and a person's sheet: what is live, in words.
export function grievanceLine(g, { day = null } = {}) {
    const when = ago(Number.isInteger(day) && Number.isInteger(g.day) ? day - g.day : 0);
    return `${g.whoName || 'Someone'} - ${g.kind === 'word' ? 'may hear of it' : STRENGTH_WORDS[g.strength]} over ${g.overName || 'someone'}${g.rivalName ? ` and ${g.rivalName}` : ''}: ${unstop(g.what)} (${when})`;
}
