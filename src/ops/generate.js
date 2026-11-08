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
import { JOB } from './detect.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

// One of the side's people, for the prompt: rank, and whether the story
// ties them to this job or they head it all.
const personLine = (p) => {
    const notes = [clean(p.rank), p.tied ? (p.away ? 'named in the story with this job - ordered it from afar' : 'named in the story with this job') : '', p.head && !p.tied ? 'the head of it all - rarely on a job in person' : '',
        p.away ? `stays out of the field - never on a job's crew, never named in a step${p.tied ? '' : '; at most ordered it'}` : ''].filter(Boolean);
    return `- ${clean(p.name)}${notes.length ? ` (${notes.join('; ')})` : ''}${clean(p.description) ? `: ${cut(p.description, 100)}` : ''}`;
};

// Its people, those the request or the story names first (marked tied):
// whoever the story ties to the job leads it, not the faction's head
// (Serlos Medina was put in charge of Enrique's museum heist for being the
// Patriarch). text: the request and the story. A first name of four
// letters or more will do ("Enrique's heist"), unless two of them share it.
export function tiedFirst(people = [], text = '') {
    const t = String(text ?? '');
    // A short nickname ("Ice") only as written, capital and all - never "ice".
    const said = (n, min = 4, within = t) => {
        const name = clean(n);
        return name.length >= min && new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, name.length < 5 ? 'u' : 'iu').test(within);
    };
    const firstOf = (p) => clean(p.name).split(/[\s"']+/)[0];
    // Someone kept off-site (the sheet's "In person") comes up in the story
    // for all sorts - Bartin the family scion as much as Enrique, whose heist
    // it is: they are tied only by a sentence naming them with the job
    // ("Enrique's heist", "Enrique's men are heading for the vault").
    const sentences = t.split(/(?<=[.!?…])\s+|\n+/);
    const withJob = (n, min) => sentences.some((x) => (JOB.test(x) || new RegExp(`${clean(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'s\\s+(?:men|crew|team|operatives|people|thugs|job|operation|plan|lieutenants?|goons|hired)`, 'i').test(x)) && said(n, min, x));
    const marked = people.map((p) => {
        const first = firstOf(p);
        const firstOk = first.length >= 4 && people.filter((o) => firstOf(o) === first).length === 1;
        const by = p.away ? withJob : said;
        return { ...p, tied: !!p.tied || by(p.name, 4) || (firstOk && by(first, 4)) || (p.aliases ?? []).some((a) => by(a, 3)) };
    });
    return [...marked.filter((p) => p.tied), ...marked.filter((p) => !p.tied)];
}

const SYSTEM ='You are a game master planning the opposition in a roleplay: a rival group\'s operation, from their side. You answer in exactly the lines asked for - no preamble, no commentary.';

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
        people.length ? `# Its people (take the leader and crew from these where they fit)\n${people.map(personLine).join('\n')}` : '',
        clean(input?.placeName) ? `# Where it happens\n${clean(input.placeName)}${places.length ? ` - its parts: ${places.join(', ')}` : ''}` : '',
        clean(input?.story) ? `# The story so far (most recent last)\n${cut(input.story, 2400)}` : '',
        clean(input?.request) ? `# What they are doing\n${cut(input.request, 400)}` : '',
        '# Your task',
        `Plan ${clean(side.name)}'s operation as their leader would: a real plan with a crew, a way in and a way out, that runs whether or not anyone gets in its way.`,
        `- ${player}${against.length ? ` and ${against.join(' and ')}` : ''} ${against.length ? 'are' : 'is'} against them. ${input?.aware ? 'They know it.' : 'They do not know it: they plan for guards, locks, police and bad luck, not for them - no step is a trap or an ambush for them.'} Never plan what ${player} does.${input?.aware ? '' : ` What they are after is at the place and has nothing to do with ${player}: not ${player}, nothing ${player} owns, carries or is made of - they do not know ${player} exists.`}`,
        '- Who orders it and who runs it are often two people. Someone of standing - a boss, a power broker, the head of it all - orders it and keeps well away (at home, at a party, with an alibi), and a trusted lieutenant leads it on site. Someone of no great standing may lead their own job in person.',
        people.some((p) => p.tied) ? `- ${people.filter((p) => p.tied).map((p) => clean(p.name)).join(' or ')} ${people.filter((p) => p.tied).length > 1 ? 'are' : 'is'} named in the story with this job: they ordered it or lead it, as their standing says - not the head of it all in their place.` : '',
        '- The head of it all is never one of the crew, unless the story says so. Nor is anyone marked as staying out of the field: belonging to the side does not make someone a crew hand.',
        '- Two to six crew, each on a CREW line of their own with what they are good at and where they are posted: everyone named in a step is on a CREW line (the one who ordered it is not).',
        '- Three to six steps in order, from getting in to getting away with it; the last step is the getaway. If the story so far has already played a step, end its line with "| done".',
        '- One to three conditions they pull out on, and how many crew down before they cut their losses.',
        clean(input?.story) ? '- Keep to what the story has shown: people already seen are part of the crew, and a way in the story showed is the way they came.' : '',
        input?.canonOnly
            ? '- Use only the people listed; for more hands, describe them ("two hired drivers") without names.'
            : '- Take the leader and crew from its people where they fit; otherwise invent them, each with a name that fits the setting.',
        input?.canonOnly || !poolLine(input?.pool) ? '' : `- ${poolLine(input.pool)}`,
        '# Reply\nExactly these lines:',
        'ORDERED BY: <who set it in motion> | <where they are while it happens, e.g. at home with an alibi - or "leads it in person">',
        'LEADER: <who runs it on site> | <where they are during it, e.g. in the van outside>',
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
    // A field the model marked "| done" (ENTRY: ... | done) keeps its text.
    const one = (re) => unquote(pick(re).split(sep).filter((x) => !/^done\.?$/i.test(clean(x))).join(' - '));
    const [leaderName = '', leaderWhere = ''] = pick(/^(?:leader|on site|field leader)\s*[:\-–]\s*(.+)$/i).split(sep);
    const [bossName = '', bossWhere = ''] = pick(/^(?:ordered(?:\s+by)?|boss|mastermind|behind it)\s*[:\-–]\s*(.+)$/i).split(sep);
    const aim = one(/^(?:aim|target|goal)\s*[:\-–]\s*(.+)$/i);
    const vehicle = one(/^vehicle\s*[:\-–]\s*(.+)$/i);
    const entry = one(/^(?:entry|breach|way in)\s*[:\-–]\s*(.+)$/i);
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
    // The one who ordered it leading in person is just the leader.
    const inPerson = !clean(bossName) || /\bin person\b|^(?:on site|here|leads? it)/i.test(clean(bossWhere)) || unquote(bossName).toLowerCase() === unquote(leaderName).toLowerCase();
    return {
        side: clean(side),
        boss: inPerson ? { name: '', where: '', objectId: '' } : { name: unquote(bossName), where: unquote(bossWhere), objectId: '' },
        leader: { name: unquote(leaderName) || (inPerson ? unquote(bossName) : ''), where: unquote(leaderWhere), objectId: '' },
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
        ...(plan.boss?.name ? [`ORDERED BY: ${plan.boss.name}${plan.boss.where ? ` | ${plan.boss.where}` : ''}`] : []),
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
        ...(plan.boss?.name ? { boss: { ...plan.boss, objectId: plan.boss.objectId || find(plan.boss.name) } } : {}),
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
    const people = [plan.leader, ...(plan.boss?.name ? [plan.boss] : []), ...plan.crew].map((p) => ({ kind: 'character', name: p.objectId || !isPersonName(p.name) ? '' : p.name, description: '' }));
    const out = swapInvented(people.filter((p) => p.name), pool, opts);
    if (!out.swaps.length) return { plan, used: out.used, swaps: [] };
    const fix = (text) => applySwaps(text, out.swaps);
    return {
        plan: {
            ...plan,
            leader: { ...plan.leader, name: fix(plan.leader.name), where: fix(plan.leader.where) },
            ...(plan.boss?.name ? { boss: { ...plan.boss, name: fix(plan.boss.name), where: fix(plan.boss.where) } } : {}),
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

// Whether text names any of `names` (the player character, their side).
export const aboutThem = (text, names = []) => names.map(clean).filter((n) => n.length >= 3).some((n) => wordRe(n).test(String(text ?? '')));

// Words that start a clause, never a name.
const NOT_NAMES = new Set(['the', 'then', 'while', 'once', 'after', 'before', 'when', 'if', 'they', 'he', 'she', 'it', 'their', 'his', 'her', 'its', 'one', 'two', 'three', 'both', 'all', 'each', 'everyone', 'someone', 'meanwhile', 'finally', 'next', 'first', 'last', 'with', 'from', 'into', 'inside', 'outside', 'at', 'in', 'on', 'as', 'and', 'but', 'so', 'get', 'go', 'take', 'grab', 'drive', 'leave', 'use', 'make', 'set', 'cut', 'open', 'disable', 'enter', 'wait', 'meet', 'load', 'police', 'security', 'guards', 'guard', 'staff', 'crew', 'team', 'leader', 'boss', 'nobody', 'no']);

// The people a plan's steps have doing something: a capitalized name as
// the subject of a verb - "Tadam cracks", "Tiago remotely opens",
// "Delvin and Raquelo begin". -> [name], in order.
export function stepActors(text = '') {
    const out = [];
    const NAME = '\\p{Lu}[\\p{Ll}\'-]+(?:\\s\\p{Lu}[\\p{Ll}\'-]+)?';
    const lead = '(?:^|[.;:,]\\s*|\\b(?:and|while|then|as|once|after|before|when)\\s+)';
    // "Tadam cracks", "Tiago remotely opens"; "Delvin and Raquelo begin".
    const one = new RegExp(`${lead}(${NAME})()()(?=\\s+(?:\\p{Ll}+ly\\s+)?\\p{Ll}+s\\b)`, 'gmu');
    const many = new RegExp(`${lead}(${NAME})(?:\\s*,\\s*(${NAME}))?\\s*,?\\s+and\\s+(${NAME})(?=\\s+(?:\\p{Ll}+ly\\s+)?\\p{Ll}{2,}\\b)`, 'gmu');
    const t = String(text ?? '');
    for (const m of [...t.matchAll(many), ...t.matchAll(one)].sort((a, b) => a.index - b.index)) {
        for (const name of [m[1], m[2], m[3]].filter(Boolean)) {
            if (NOT_NAMES.has(name.split(/\s/)[0].toLowerCase())) continue;
            if (!out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
        }
    }
    return out;
}

// A plan of fewer than three steps that crammed several into one line
// ("Search the storerooms while Tadam cracks the locks. Denisia creates a
// diversion") gets each sentence as a step of its own, so it has a pace.
export function splitSteps(steps = []) {
    if (steps.length >= 3) return steps;
    const out = [];
    for (const s of steps) {
        const parts = s.status === 'done' ? [s.text] : String(s.text ?? '').split(/(?<=[.;!])\s+(?=\p{Lu})|;\s*/u).map(clean).map((t) => t.replace(/[.;]+$/, '')).filter((t) => t.length >= 8);
        if (parts.length <= 1) { out.push(s); continue; }
        parts.forEach((text, i) => out.push({ ...s, text, status: i === 0 ? s.status : s.status === 'current' ? 'pending' : s.status }));
    }
    return out.slice(0, 6);
}

const GETAWAY =/\b(?:get(?:s|ting)?\s+away|getaway|escape|flee|leave|drive\s+(?:off|away)|exfil\w*|slip\s+(?:out|away)|make\s+off|pull\s+out|back\s+to\s+(?:the\s+)?(?:van|car|ship|base|hideout)|vanish)/i;
const wordRe = (name) => new RegExp(`(^|[^\\p{L}\\p{N}])${clean(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'giu');

// The plan held to what a small model skips (it wrote no CREW lines, put
// the Patriarch on the job, ended at "grab the pieces" and pulled out "if
// engaged by Cyril", whom they did not know was there). opts:
//   people: [{ name, aliases, head, tied }] the side's own;
//   against: [name] the player character and their side; aware.
// -> the plan: crew named in its steps added; the head of it all off the
//    crew (and from leading, unless the story ties them to it - then they
//    ordered it); a getaway step at the end; the player's side not named
//    while they are unknown to them; a breaking point of at least half the crew.
export function shapePlan(plan, { people = [], against = [], aware = false, placeName = '', fallbackAim = '' } = {}) {
    if (!plan) return plan;
    let p = { ...plan, crew: [...(plan.crew ?? [])], steps: [...(plan.steps ?? [])], withdraw: [...(plan.withdraw ?? [])], boss: plan.boss ?? { name: '', where: '', objectId: '' } };
    const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
    const firstOf = (n) => clean(n).split(/[\s"']+/)[0];
    const callNames = (person) => {
        const first = firstOf(person.name);
        const shared = people.filter((o) => firstOf(o.name) === first).length > 1;
        return [person.name, ...(first.length >= 4 && !shared ? [first] : []), ...(person.aliases ?? [])].filter((n) => clean(n).length >= 3);
    };
    const isOf = (name, person) => callNames(person).some((n) => same(n, name) || same(firstOf(name), n));
    const named = (text, person) => callNames(person).some((n) => wordRe(n).test(text));
    // The head of it all: never on the crew; never leading unless the story ties them to the job.
    for (const head of people.filter((x) => x.head)) {
        p.crew = p.crew.filter((c) => !isOf(c.name, head));
        if (isOf(p.leader.name, head) && !head.tied) {
            if (!p.boss.name) p.boss = { name: p.leader.name, where: 'keeps well away while it happens', objectId: p.leader.objectId ?? '' };
            p.leader = { name: p.crew[0]?.name ?? '', where: p.crew[0]?.post ?? '', objectId: p.crew[0]?.objectId ?? '' };
        }
        // Whose job the story says it is ordered it - not the head in
        // their place (Serlos credited with Enrique's museum heist).
        const owner = people.find((x) => x.tied && !x.head && !isOf(p.leader.name, x) && !p.crew.some((c) => isOf(c.name, x)));
        if (owner && p.boss.name && isOf(p.boss.name, head) && !head.tied) p.boss = { ...p.boss, name: owner.name, objectId: owner.objectId ?? '' };
    }
    // Those their sheet keeps out of the field (a family scion, a boss who
    // sends their people): never crew, never leading on site, and their
    // name out of the steps - one of the crew does it.
    for (const away of people.filter((x) => x.away)) {
        p.crew = p.crew.filter((c) => !isOf(c.name, away));
        if (isOf(p.leader.name, away)) {
            if (!p.boss.name) p.boss = { name: p.leader.name, where: 'keeps well away while it happens', objectId: p.leader.objectId ?? '' };
            p.leader = { name: p.crew[0]?.name ?? '', where: p.crew[0]?.post ?? '', objectId: p.crew[0]?.objectId ?? '' };
        }
        if (p.boss.name && isOf(p.boss.name, away)) continue;
        const names = callNames(away);
        p.steps = p.steps.map((s) => ({ ...s, text: names.reduce((t, n) => t.replace(wordRe(n), (_m, pre) => `${pre}one of the crew`), s.text).replace(/^one of/, 'One of') }));
    }
    // Their own people the steps name are crew, when no CREW line has them.
    const onCrew = (person) => p.crew.some((c) => isOf(c.name, person)) || isOf(p.leader.name, person) || (p.boss.name && isOf(p.boss.name, person));
    const stepsText = p.steps.map((s) => s.text).join('\n');
    for (const person of people) {
        if (person.head || person.away || onCrew(person) || !named(stepsText, person)) continue;
        p.crew.push({ name: person.name, skill: '', post: '', objectId: person.objectId ?? '' });
    }
    // ...and so are new hands the steps name doing something ("Tadam cracks
    // display case locks", "Delvin and Raquelo begin searching") - a plan
    // with no CREW lines had none, and nobody to count down.
    const steps = splitSteps(p.steps);
    p.steps = steps;
    const notThem = [p.leader.name, p.boss.name, plan.side, ...against].map(clean).filter(Boolean);
    for (const name of stepActors(p.steps.map((s) => s.text).join('\n'))) {
        if (notThem.some((n) => same(n, name) || same(firstOf(n), name)) || p.crew.some((c) => same(c.name, name) || same(firstOf(c.name), name))) continue;
        if (people.some((x) => (x.head || x.away) && isOf(name, x))) continue;
        const known = people.find((x) => isOf(name, x));
        p.crew.push({ name: known?.name ?? name, skill: '', post: '', objectId: known?.objectId ?? '' });
    }
    p.crew = p.crew.slice(0, 8);
    // It ends in getting away.
    const last = p.steps[p.steps.length - 1];
    if (last && !GETAWAY.test(last.text) && p.steps.length < 8) p.steps.push({ text: 'Get away with it the way they came', status: 'pending' });
    // Those they do not know are there are not in their plan.
    if (!aware) {
        const them = against.map(clean).filter((n) => n.length >= 3);
        // "Cyril's eye" is just "the eye"; "engaged by Cyril" is "engaged by anyone unexpected".
        const possessive = (n) => new RegExp(`(^|[^\\p{L}\\p{N}])${clean(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['’]s?(?=\\s)`, 'giu');
        const blank = (text) => them.reduce((t, n) => t.replace(possessive(n), (_m, pre) => `${pre}the`).replace(wordRe(n), (_m, pre) => `${pre}anyone unexpected`), String(text ?? ''));
        p.withdraw = p.withdraw.map(blank);
        p.steps = p.steps.map((s) => ({ ...s, text: blank(s.text).replace(/^the\b/, 'The') }));
        // What they came for is never the player character's - they do not
        // know he exists (they set out to steal Cyril's prosthetic eye).
        if (aboutThem(p.aim, against)) p.aim = clean(fallbackAim) || `Whatever is most worth taking at ${clean(placeName) || 'the place'}`;
    }
    p.breakAt = Math.min(Math.max(p.breakAt ?? 1, Math.ceil(p.crew.length / 2), 1), Math.max(1, p.crew.length));
    if (!p.boss.name) delete p.boss;
    return p;
}
