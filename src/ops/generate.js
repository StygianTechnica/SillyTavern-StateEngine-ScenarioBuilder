// The other side's operation - written (src/ops/model.js). One model call,
// only when an operation is made: the user asks in the GM Plan tab, or the
// director sees a rival group at work in the scene with no plan of its own
// (OPPOSED). It answers what a GM must know to run them: who leads it and
// from where, how many came and what each can do and where each is posted,
// what they are after, what they came in, how they got in, the steps they
// carry out, and when they give up. Their people are taken from the
// faction's own first; anyone new is named from the world's names. The
// story so far goes in, so a heist already under way is planned from where
// it stands (its steps already played marked done). The prompt and reader
// are pure (and tested).

import { poolLine, swapInvented, applySwaps } from '../naming/live.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

const SYSTEM = 'You are a game master planning the opposition in a roleplay: a rival group\'s operation, from their side. You answer in exactly the lines asked for - no preamble, no commentary.';

// input: { side: { name, description }, people: [{ name, rank, description }]
//   (the side's own), request, placeName, places: [name] (inside it),
//   against: [name] (the player character's side), playerName, aware,
//   overview, story (the recent chat), canonOnly, pool }
// -> { system, user, plain }
export function buildOpPrompt(input) {
    const side = input?.side ?? {};
    const people = (input?.people ?? []).filter((p) => clean(p?.name)).slice(0, 16);
    const places = (input?.places ?? []).map(clean).filter(Boolean).slice(0, 12);
    const against = (input?.against ?? []).map(clean).filter(Boolean);
    const player = clean(input?.playerName) || 'the player character';
    const user = [
        clean(input?.overview) ? `# The setting\n${cut(input.overview, 500)}` : '',
        `# The side you plan for\n${clean(side.name)}${clean(side.description) ? `: ${cut(side.description, 400)}` : ''}`,
        people.length ? `# Its people (take the leader and crew from these where they fit)\n${people.map((p) => `- ${clean(p.name)}${clean(p.rank) ? ` (${clean(p.rank)})` : ''}${clean(p.description) ? `: ${cut(p.description, 100)}` : ''}`).join('\n')}` : '',
        clean(input?.placeName) ? `# Where it happens\n${clean(input.placeName)}${places.length ? ` - its parts: ${places.join(', ')}` : ''}` : '',
        clean(input?.story) ? `# The story so far (most recent last)\n${cut(input.story, 2400)}` : '',
        clean(input?.request) ? `# What they are doing\n${cut(input.request, 400)}` : '',
        '# Your task',
        `Plan ${clean(side.name)}'s operation as their leader would: a real plan with a crew, a way in and a way out, that runs whether or not anyone gets in its way.`,
        `- ${player}${against.length ? ` and ${against.join(' and ')}` : ''} ${against.length ? 'are' : 'is'} against them. ${input?.aware ? 'They know it.' : 'They do not know it: they plan for guards, locks, police and bad luck, not for them - no step is a trap or an ambush for them.'} Never plan what ${player} does.`,
        '- Two to six crew, each with what they are good at and where they are posted; the leader may be on site or running it from nearby.',
        '- Three to six steps in order, from getting in to getting away with it; the last step is the getaway. If the story so far has already played a step, end its line with "| done".',
        '- One to three conditions they pull out on, and how many crew down before they cut their losses.',
        clean(input?.story) ? '- Keep to what the story has shown: people already seen are part of the crew, and a way in the story showed is the way they came.' : '',
        input?.canonOnly
            ? '- Use only the people listed; for more hands, describe them ("two hired drivers") without names.'
            : '- Take the leader and crew from its people where they fit; otherwise invent them, each with a name that fits the setting.',
        input?.canonOnly || !poolLine(input?.pool) ? '' : `- ${poolLine(input.pool)}`,
        '# Reply\nExactly these lines:',
        'LEADER: <name> | <where they are during it, e.g. in the van outside>',
        'AIM: <what they are after, one sentence>',
        'VEHICLE: <what they came in, or none>',
        'ENTRY: <how they got in, one sentence>',
        'CREW: <name> | <what they are good at> | <where they are posted>   (one line each)',
        'STEP: <what they do>   (one line each, in order)',
        'WITHDRAW: <a condition they pull out on>   (one line each)',
        'BREAK: <how many crew down before they pull out>',
    ].filter(Boolean).join('\n\n');
    return { system: SYSTEM, user, plain: true };
}

const none = (v) => /^(none|nothing|no|n\/a|-|on foot)$/i.test(clean(v));
const unquote = (s) => clean(s).replace(/^["'*]+|["'*.]+$/g, '');

// The answer -> a plan (src/ops/model.js startOp takes it), or null without
// an aim or steps. side: the faction's name, given.
export function readOpPlan(text, side = '') {
    const lines = String(text ?? '').split('\n').map((l) => l.replace(/[*`#]/g, '').replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
    const pick = (re) => clean(lines.map((l) => l.match(re)?.[1]).find(Boolean) ?? '');
    const all = (re) => lines.map((l) => l.match(re)?.[1]).filter(Boolean).map(clean);
    const sep = /\s*\|\s*/;
    const [leaderName = '', leaderWhere = ''] = pick(/^leader\s*[:\-–]\s*(.+)$/i).split(sep);
    const aim = unquote(pick(/^(?:aim|target|goal)\s*[:\-–]\s*(.+)$/i));
    const vehicle = unquote(pick(/^vehicle\s*[:\-–]\s*(.+)$/i));
    const entry = unquote(pick(/^(?:entry|breach|way in)\s*[:\-–]\s*(.+)$/i));
    const crew = all(/^crew\s*\d*\s*[:\-–]\s*(.+)$/i).map((l) => {
        const [name, skill = '', post = ''] = l.split(sep).map(unquote);
        return { name: name.replace(/\s*\(.*?\)\s*$/, ''), skill, post };
    }).filter((c) => c.name && !none(c.name));
    const steps = all(/^step\s*\d*\s*[:\-–]\s*(.+)$/i).map((l) => {
        const parts = l.split(sep);
        const done = parts.length > 1 && /^done\b/i.test(clean(parts[parts.length - 1]));
        return { text: unquote(done ? parts.slice(0, -1).join(' - ') : parts.join(' - ')), status: done ? 'done' : 'pending' };
    }).filter((s) => s.text);
    const withdraw = all(/^(?:withdraw|pull out|retreat)\s*\d*\s*[:\-–]\s*(.+)$/i).map(unquote).filter((w) => w && !none(w));
    const brk = parseInt(pick(/^break(?:ing point)?\s*[:\-–]\s*(\d+)/i), 10);
    if (!aim || !steps.length) return null;
    return {
        side: clean(side),
        leader: { name: unquote(leaderName), where: unquote(leaderWhere), objectId: '' },
        aim,
        vehicle: none(vehicle) ? '' : vehicle,
        entry: none(entry) ? '' : entry,
        crew: crew.slice(0, 8),
        steps: steps.slice(0, 8),
        withdraw: withdraw.slice(0, 4),
        breakAt: Number.isInteger(brk) && brk > 0 ? Math.min(brk, Math.max(1, crew.length)) : Math.max(1, Math.ceil(crew.length / 2)),
    };
}

// The plan as the lines it was read from - the GM Plan card edits these.
export function opPlanText(plan) {
    if (!plan) return '';
    return [
        `LEADER: ${plan.leader?.name ?? ''}${plan.leader?.where ? ` | ${plan.leader.where}` : ''}`,
        `AIM: ${plan.aim ?? ''}`,
        `VEHICLE: ${plan.vehicle || 'none'}`,
        `ENTRY: ${plan.entry ?? ''}`,
        ...(plan.crew ?? []).map((c) => `CREW: ${c.name} | ${c.skill ?? ''} | ${c.post ?? ''}`),
        ...(plan.steps ?? []).map((s) => `STEP: ${s.text}${s.status === 'done' ? ' | done' : ''}`),
        ...(plan.withdraw ?? []).map((w) => `WITHDRAW: ${w}`),
        `BREAK: ${plan.breakAt ?? 1}`,
    ].join('\n');
}

// The plan's people matched to library characters by name (or a nickname);
// those not found keep objectId ''.
export function matchPeople(plan, characters = []) {
    if (!plan) return plan;
    const key = (s) => clean(s).toLowerCase().replace(/^the\s+/, '');
    const find = (name) => {
        const k = key(name);
        if (!k) return '';
        return characters.find((c) => [c.name, ...(c.aliases ?? c.base?.aliases ?? [])].some((n) => key(n) === k))?.id
            ?? characters.find((c) => key(c.name).split(' ')[0] === k && k.length > 2)?.id ?? '';
    };
    return {
        ...plan,
        leader: { ...plan.leader, objectId: plan.leader.objectId || find(plan.leader.name) },
        crew: plan.crew.map((c) => ({ ...c, objectId: c.objectId || find(c.name) })),
    };
}

// A name for a person, not hands described ("two hired drivers", "Driver").
export const isPersonName = (name) => {
    const n = clean(name);
    if (!n || /^(?:a|an|the|two|three|four|five|six|some|several)\b/i.test(n) || /\d/.test(n)) return false;
    return /^\p{Lu}/u.test(n) && n.split(/\s+/).length <= 4;
};

// Invented names that are not the world's swapped for its own
// (src/naming/live.js). opts: { allowedText, known }. -> { plan, used, swaps }
export function swapOpNames(plan, pool, opts = {}) {
    if (!plan || !pool) return { plan, used: [], swaps: [] };
    const people = [plan.leader, ...plan.crew].map((p) => ({ kind: 'character', name: p.objectId || !isPersonName(p.name) ? '' : p.name, description: '' }));
    const out = swapInvented(people.filter((p) => p.name), pool, opts);
    if (!out.swaps.length) return { plan, used: out.used, swaps: [] };
    const fix = (text) => applySwaps(text, out.swaps);
    return {
        plan: {
            ...plan,
            leader: { ...plan.leader, name: fix(plan.leader.name), where: fix(plan.leader.where) },
            aim: fix(plan.aim),
            entry: fix(plan.entry),
            crew: plan.crew.map((c) => ({ ...c, name: fix(c.name), post: fix(c.post) })),
            steps: plan.steps.map((s) => ({ ...s, text: fix(s.text) })),
            withdraw: plan.withdraw.map(fix),
        },
        used: out.used,
        swaps: out.swaps,
    };
}

const key = (s) => clean(s).toLowerCase().replace(/^the\s+/, '');

// The side: a faction by name or id; or a person, standing for their
// faction (or for themselves). -> { faction, leader } (either may be null).
export function findSide(name, factions = [], characters = [], memberships = new Map()) {
    const k = key(name);
    if (!k) return { faction: null, leader: null };
    const named = (e) => [e.name, ...(e.aliases ?? e.base?.aliases ?? [])].some((n) => key(n) === k);
    const faction = factions.find((f) => f.id === name || named(f)) ?? factions.find((f) => key(f.name).includes(k) || k.includes(key(f.name)));
    if (faction) return { faction, leader: null };
    const person = characters.find(named);
    if (!person) return { faction: null, leader: null };
    const theirs = (memberships.get(person.id) ?? [])[0];
    return { faction: factions.find((f) => f.id === theirs) ?? null, leader: person };
}
