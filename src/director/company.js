// Company - who the player character wants around. The story keeps
// pushing the same people at the player: those it thinks are close, those
// the card leans on. Archivist's relationships can read a man who hates
// being hovered over as their devoted student. What the player character
// feels is better told by State Engine's own reading of them - the mood
// runtime field on their character object - taken after every reply,
// against who was there:
//
//   sour   Annoyed, Angry, Disgusted, Bored: a mark against each person
//          present, two against someone the thought names.
//   warm   Happy, Loving, Playful, Excited: a mark for them.
//
// Over the last WINDOW replies, someone with marks against them again and
// again is "less of": the director and the day plan bring them in only
// when the story needs them, keep them brief, and when the scene wants
// someone to arrive, bring someone the player is glad of, or someone new.
// Someone with marks for them is "more welcome". The user can say so
// outright, either way, and that wins. No extra model call. Pure: the
// runner is src/validate/reconcile.js (taking the mood), src/planner/run.js
// (the director's and day plan's lines) and src/ui/gm-plan.js (the card).
//
// chat document: company: { samples: [sample], choices: { [id]: { name, choice } } }
//   sample = { key, turn, kind: 'sour' | 'warm', mood, present: [{ id, name }], named: [id] }
//   choice = 'less' (keep them away) | 'fine' (never kept away by the tally)

export const SOUR_MOODS = Object.freeze(['annoyed', 'angry', 'disgusted', 'bored']);
export const WARM_MOODS = Object.freeze(['happy', 'loving', 'playful', 'excited']);
export const CHOICES = Object.freeze(['less', 'fine']);
// Replies the tally looks back over: older moods have faded.
export const WINDOW = 30;
// Marks against someone before they are "less of" - and at least this many
// sour replies with them, so one bad scene with them named twice is not it.
const LESS_AT = 3;
const LESS_TIMES = 2;
const MORE_AT = 2;
const SAMPLE_LIMIT = 60;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function emptyCompany() {
    return { samples: [], choices: {} };
}

function normalizeSample(s) {
    if (!isObject(s) || !clean(s.key) || !['sour', 'warm'].includes(s.kind)) return null;
    const present = (Array.isArray(s.present) ? s.present : []).filter((p) => isObject(p) && clean(p.id)).map((p) => ({ id: clean(p.id), name: clean(p.name).slice(0, 120) }));
    return {
        key: clean(s.key),
        turn: Number.isInteger(s.turn) ? s.turn : 0,
        kind: s.kind,
        mood: clean(s.mood).slice(0, 40),
        present,
        named: (Array.isArray(s.named) ? s.named : []).map(clean).filter((id) => present.some((p) => p.id === id)),
    };
}

export function normalizeCompany(v) {
    const c = isObject(v) ? v : {};
    const choices = isObject(c.choices) ? Object.fromEntries(Object.entries(c.choices)
        .filter(([id, x]) => clean(id) && isObject(x) && CHOICES.includes(x.choice))
        .map(([id, x]) => [id, { name: clean(x.name).slice(0, 120), choice: x.choice }])) : {};
    return { samples: (Array.isArray(c.samples) ? c.samples : []).map(normalizeSample).filter(Boolean).slice(-SAMPLE_LIMIT), choices };
}

export function moodKind(mood) {
    const m = clean(mood).toLowerCase();
    return SOUR_MOODS.includes(m) ? 'sour' : WARM_MOODS.includes(m) ? 'warm' : '';
}

// Whether `text` names `name`: any word of it (three letters or more) as a
// whole word.
function names(text, name) {
    const words = clean(name).match(/[\p{L}\p{N}'’-]{3,}/gu) ?? [];
    return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(clean(text)));
}

// The player character's mood after a reply. key: the reply (a swipe of
// it replaces its sample); present: [{ id, name }] the others in the scene.
// -> the company, changed or not. Moods neither sour nor warm leave no mark.
export function noteMood(company, { key, turn, mood, thought = '', present = [] }) {
    const kind = moodKind(mood);
    const samples = company.samples.filter((s) => s.key !== clean(key));
    const others = present.filter((p) => p?.id);
    if (!clean(key) || !kind || !others.length) return { ...company, samples };
    const sample = normalizeSample({ key, turn, kind, mood, present: others, named: others.filter((p) => names(thought, p.name)).map((p) => p.id) });
    return { ...company, samples: [...samples, sample].slice(-SAMPLE_LIMIT) };
}

// id -> { id, name, sour, warm, score, standing: 'less' | 'more' | '', choice }
// over the last WINDOW replies, everyone the tally or the user has a word on.
export function standings(company, turn) {
    const out = new Map();
    const at = (id, name) => {
        if (!out.has(id)) out.set(id, { id, name: name || '', sour: 0, warm: 0, score: 0, standing: '', choice: '' });
        const x = out.get(id);
        if (!x.name && name) x.name = name;
        return x;
    };
    for (const s of company.samples) {
        if (Number.isInteger(turn) && turn - s.turn >= WINDOW) continue;
        for (const p of s.present) {
            const x = at(p.id, p.name);
            const weight = s.named.includes(p.id) ? 2 : 1;
            if (s.kind === 'sour') { x.sour += 1; x.score += weight; } else { x.warm += 1; x.score -= weight; }
        }
    }
    for (const [id, c] of Object.entries(company.choices)) at(id, c.name).choice = c.choice;
    for (const x of out.values()) {
        x.standing = x.choice === 'less' ? 'less'
            : x.choice !== 'fine' && x.score >= LESS_AT && x.sour >= LESS_TIMES ? 'less'
                : x.score <= -MORE_AT ? 'more' : '';
    }
    return out;
}

// The user's word on someone: 'less', 'fine' or '' (the tally decides).
export function chooseFor(company, id, name, choice) {
    const choices = { ...company.choices };
    if (CHOICES.includes(choice)) choices[id] = { name: clean(name), choice };
    else delete choices[id];
    return { ...company, choices };
}

// The director's (and day plan's) lines, or '' when no one stands out.
export function companyLines(company, { turn, player = '' }) {
    const who = clean(player) || 'the player character';
    const all = [...standings(company, turn).values()].filter((x) => x.name);
    const less = all.filter((x) => x.standing === 'less').map((x) => x.name);
    const more = all.filter((x) => x.standing === 'more').map((x) => x.name);
    if (!less.length) return '';
    const lines = [`COMPANY (private - who ${who} wants around, from how ${who} has felt with them; never say it)`];
    lines.push(`- Less of: ${less.join(', ')}. ${who} has been put out with ${less.length === 1 ? 'them' : 'each of them'} again and again. Bring them in only when the story truly needs them - not to fill a scene, not to check on ${who}. When they are here, keep them brief and give them their own reason to go. They do not follow ${who} around or turn up scene after scene.`);
    lines.push(more.length
        ? `- When a scene wants someone to come along, prefer those ${who} is glad of - ${more.join(', ')} - or someone new who belongs at the place and has a reason to seek ${who} out.`
        : `- When a scene wants someone to come along, bring someone new who belongs at the place and has a reason to seek ${who} out.`);
    return lines.join('\n');
}

// The people who could turn up (src/director/whereabouts.js whoCouldTurnUp
// near), in the order the director should reach for them: someone who came
// looking; someone the player is glad of; then the longest out of a scene
// first - a regular of the place not seen in a while, or one who belongs
// here and has never been seen, before those who were here a moment ago;
// those kept away last, and marked so. seen: lastSeen() (id -> { index });
// total: the history's length. -> a new list; each entry may get keepAway
// and its why told.
const A_WHILE = 20;
export function rankNearby(nearby, { company, turn, seen = new Map(), total = 0, player = '' } = {}) {
    const who = clean(player) || 'the player character';
    const by = company ? standings(company, turn) : new Map();
    const away = (id) => (seen.has(id) ? total - seen.get(id).index : Infinity);
    const rank = (c) => (/^came looking/.test(c.why ?? '') ? 0 : by.get(c.id)?.standing === 'more' ? 1 : by.get(c.id)?.standing === 'less' ? 3 : 2);
    return (nearby ?? []).map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || (rank(a.c) === 2 ? away(b.c.id) - away(a.c.id) : 0) || a.i - b.i).map(({ c }) => {
        const standing = by.get(c.id)?.standing ?? '';
        const note = standing === 'less' ? `${who} has had enough of them - only if the story needs them`
            : standing === 'more' ? `someone ${who} is glad of`
                : away(c.id) >= A_WHILE ? (seen.has(c.id) ? 'not in a scene for a while' : 'not seen in the story yet') : '';
        return { ...c, ...(standing === 'less' ? { keepAway: true } : {}), why: [clean(c.why), note].filter(Boolean).join('; ') };
    });
}
