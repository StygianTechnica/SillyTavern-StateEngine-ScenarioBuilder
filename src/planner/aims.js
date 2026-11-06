// What the player character's side is out to stop - and whose it is. The
// plan says "stop the art heist" once and "the heist" everywhere after
// (Assassins Inc: "The heist remains the top priority", "Cyril and Inji
// arrive at the Arcadia Museum for the heist", "they will pull it off in the
// end"), and a small model soon has White Cerberus planning the heist
// rather than stopping Enrique's. Read once from the plan's own words, it
// is told as one line wherever the plan goes. Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

const STOP = String.raw`(?:stop|stops|stopping|stopped|prevent(?:s|ed|ing)?|foil(?:s|ed|ing)?|thwart(?:s|ed|ing)?|disrupt(?:s|ed|ing)?|sabotag(?:e|es|ed|ing)|intercept(?:s|ed|ing)?|break(?:s|ing)? up|broke up|bust(?:s|ed|ing)?|head(?:s|ed|ing)? off|put(?:s|ting)? an end to|ruin(?:s|ed|ing)?|derail(?:s|ed|ing)?)`;
// A line may start with one ("Stop Enrique's heist"): the case-blind flag
// would let a lowercase word pass for a name, so each word's first letter
// takes either case instead.
const STOP_ANY = STOP.replace(/\b([a-z])/g, (c) => `[${c.toUpperCase()}${c}]`);
// Specific kinds first; the vague ones only stand when nothing says more.
const SPECIFIC = ['heist', 'robbery', 'theft', 'burglary', 'break-in', 'raid', 'assassination', 'kidnapping', 'abduction', 'bombing', 'coup', 'ambush', 'invasion', 'ritual', 'sacrifice', 'smuggling run', 'massacre', 'uprising', 'hijacking', 'sale', 'auction', 'summoning'];
const VAGUE = ['operation', 'plot', 'scheme', 'plan', 'plans', 'deal', 'shipment', 'attack', 'job'];
const NOUN = `(${[...SPECIFIC, ...VAGUE].map((n) => n.replace(/[-\s]/g, '[-\\s]')).join('|')})`;
// Whose: a name ("Enrique's") or a group after "the" ("the cult's").
const OWNER = String.raw`(?:(?<name>\p{Lu}[\p{L}\p{N}-]+(?:\s+\p{Lu}[\p{L}\p{N}-]+){0,2})|[Tt]he\s+(?<group>[\p{Ll}-]+))['’]s`;
const MOD = String.raw`(?<mod>(?:[\p{Ll}-]+\s+){0,2}?)`;
const SKIP_MOD = new Set(['own', 'planned', 'upcoming', 'big', 'next', 'latest', 'whole', 'entire']);

const STOPPED = new RegExp(String.raw`\b${STOP_ANY}\s+(?:${OWNER}\s+|(?:the|a|an|this|that|their|his|her|its)\s+)${MOD}(?<noun>${NOUN.slice(1, -1)})\b`, 'gu');
const OWNED = new RegExp(String.raw`${OWNER}\s+${MOD}(?<noun>${NOUN.slice(1, -1)})\b`, 'gu');
const ownerOf = (g) => (g.name ? clean(g.name) : g.group ? `the ${clean(g.group)}` : '');

const nounOf = (n) => n.toLowerCase().replace(/\s+/g, ' ').replace(/^plans$/, 'plan');
const modOf = (m) => clean(m).toLowerCase().split(' ').filter((w) => w && !SKIP_MOD.has(w)).join(' ');

// texts: the plan's lines; player: the player character's names (their own
// job is never the foe's). -> [{ noun, mod, owner }], specific first.
export function opposedJobs(texts = [], { player = [] } = {}) {
    const all = (texts ?? []).map(clean).filter(Boolean);
    const mine = new Set((player ?? []).map((p) => clean(p).toLowerCase()).filter(Boolean));
    const isMine = (o) => !o || mine.has(o.toLowerCase()) || [...mine].some((p) => p.split(' ')[0] === o.toLowerCase().split(' ')[0]);
    const found = new Map();
    for (const t of all) {
        for (const m of t.matchAll(STOPPED)) {
            const noun = nounOf(m.groups.noun);
            const said = ownerOf(m.groups);
            const owner = isMine(said) ? '' : said;
            if (said && !owner) continue;
            const prev = found.get(noun) ?? { noun, mod: '', owner: '' };
            found.set(noun, { noun, mod: prev.mod || modOf(m.groups.mod), owner: prev.owner || owner });
        }
    }
    if (!found.size) return [];
    // Whose it is, from anywhere in the plan ("Enrique's heist plans").
    for (const t of all) {
        for (const m of t.matchAll(OWNED)) {
            const job = found.get(nounOf(m.groups.noun));
            const said = ownerOf(m.groups);
            if (job && !job.owner && !isMine(said)) job.owner = said;
        }
    }
    const jobs = [...found.values()];
    const specific = jobs.filter((j) => !VAGUE.includes(j.noun));
    // "Stop Enrique's operation" says nothing "stop his heist" does not.
    const kept = jobs.filter((j) => !VAGUE.includes(j.noun) || !specific.some((s) => !s.owner || !j.owner || s.owner === j.owner));
    return [...specific, ...kept.filter((j) => VAGUE.includes(j.noun))].filter((j, i, a) => a.indexOf(j) === i).slice(0, 3);
}

// The line: "the art heist is Enrique's - Cyril's side is out to stop it".
export function jobsLine(jobs = [], playerName = '') {
    if (!jobs?.length) return '';
    const who = clean(playerName) ? `${clean(playerName)}'s side` : "The player character's side";
    const parts = jobs.map((j) => {
        const name = `the ${j.mod ? `${j.mod} ` : ''}${j.noun}`;
        return j.owner
            ? `${name} is ${j.owner}'s - ${who} is out to stop it, never to carry it out; "the ${j.noun}" always means ${j.owner}'s, and their success is stopping it`
            : `${name} is the other side's - ${who} is out to stop it, never to carry it out; their success is stopping it`;
    });
    return `Whose job is whose: ${parts.join('. ')}.`;
}

// Those of them the recent text speaks of.
export function jobsTouched(jobs = [], text = '') {
    const t = String(text ?? '').toLowerCase();
    return (jobs ?? []).filter((j) => new RegExp(`\\b${j.noun.replace(/[-\s]/g, '[-\\s]')}s?\\b`).test(t) || (j.owner && t.includes(j.owner.toLowerCase())));
}

// The plan's own lines: what the user wants of the story, the outline's
// beats, what is settled, the day plan, the triggers.
export function planTexts(gm) {
    const out = [gm?.volume?.outlineWish];
    for (const act of gm?.outline?.acts ?? []) for (const b of act.beats ?? []) if (b.status !== 'skipped') out.push(b.text);
    for (const s of gm?.settled ?? []) out.push(s.text);
    for (const m of gm?.day?.moments ?? []) out.push(m.text);
    for (const a of gm?.day?.agendas ?? []) out.push(a.wants, a.will);
    for (const t of gm?.triggers ?? []) out.push(t.when, t.then);
    return out.map(clean).filter(Boolean);
}
