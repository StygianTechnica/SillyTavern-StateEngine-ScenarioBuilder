// The other side's operation - the pure half (the runner is src/ops/run.js;
// the plan is written by src/ops/generate.js). A rival faction pulling a
// heist, a raid, an ambush or a break-in where the story is: the GM plays
// them. Without a plan of their own the story waited on the player - the
// Medina Syndicate's museum heist had no one in charge, no crew, no way in
// and nothing it was after, so nothing happened unless Cyril made it.
//
// An operation is the other side's plan, kept by Scenario Builder: who
// leads it and where, the crew - each with a skill and a post - what they
// are after, how they came (a vehicle) and got in, the steps they carry out
// in order, and when they pull out. The director sees all of it (THE OTHER
// SIDE), plays them, and says with an OPERATION line how the step went.
// The guardrails, the same as a structured event's (src/events/model.js):
//   - they do not wait: a step the director does not report done or held
//     is done anyway once its replies run out (pace) - the story moves;
//   - a step held three times (the player's side in the way) and they pull
//     out; so they do when their breaking point is reached - enough of the
//     crew down, caught, dead or fled, or the leader down on site;
//   - pulling out lasts one reply, then it is over - so is the last step
//     done (they got away with it);
//   - keyed to the reply count (doc.turn): a swipe or a regenerated
//     briefing applies the same reply again from where it began.
// They do not know who is against them unless the plan says so or the story
// shows it (OPERATION | spotted).
//
// op = {
//   id, side, sideId,            the faction (its library entry, if any)
//   leader: { name, objectId, where }   where: on site or not ("in the van")
//   aim,                         what they are after, one sentence
//   placeId, placeName,          where it is happening
//   vehicle, entry,              how they came, how they got in
//   crew: [{ name, objectId, skill, post, state, where }]   state: CREW_STATES;
//                                where: the spot they are at now (from their post, then CREW lines)
//   hands, handsOut,             unnamed hands the story showed, and how many of them are out of it
//   tapped,                      the player's side holds one of their radios and hears them
//   quiet: [name], checkIn,      theirs gone quiet unbeknown to them, and the reply the leader calls them
//   suspicious,                  they know something is wrong (not who)
//   steps: [{ text, status }]    status: 'pending' | 'current' | 'done'
//   current,                     index of the step under way
//   withdraw: [text],            the conditions they pull out on
//   breakAt,                     crew out of it before they pull out
//   aware, against,              they know of `against` (the player's side)
//   status,                      OP_STATUSES
//   pace,                        replies a step may take before it is done anyway
//   stepTurn, held,              the reply the step began; times it was held
//   startedTurn, endedTurn, endText,
//   log: [{ turn, text }],       what happened, for the user (the last LOG_KEPT)
//   at: { turn, before }         the reply last applied, and the op before it
// }

export const OP_STATUSES = Object.freeze(['running', 'pulling out', 'got away', 'withdrew', 'stopped', 'ended']);
export const CREW_STATES = Object.freeze(['active', 'hurt', 'down', 'caught', 'fled', 'dead']);
const OUT = new Set(['down', 'caught', 'fled', 'dead']);
// Being watched without knowing it: no reason a crew is held.
const UNSEEN = /\b(?:surveil\w*|watch\w*|observ\w*|shadow(?:s|ed|ing)?|tail(?:s|ed|ing)?|follow\w*|track\w*|hid(?:e|es|den|ing)|lurk\w*|stealth\w*|unseen|unnoticed|undetected|stak\w* out|eavesdrop\w*|wait\w* in cover)\b/i;
// ...unless it is what they ran into: a guard watching the hall holds them.
const IN_THE_WAY = /\b(?:guards?|police|cops?|security|patrol\w*|locks?|locked|alarms?|cameras?|staff|janitor|night watch\w*|sensors?|dogs?)\b/i;
export const OP_REPORTS = Object.freeze(['done', 'held', 'spotted', 'suspicious', 'pulling out']);
export const DEFAULT_PACE = 2;
export const HELD_LIMIT = 3;
const MAX_CREW = 8;
const MAX_STEPS = 8;
const LOG_KEPT = 20;
const DONE_KEPT = 6;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 300) => clean(v).slice(0, max);
const int = (v, d = 0) => (Number.isInteger(v) ? v : d);
const sameName = (a, b) => {
    const x = clean(a).toLowerCase();
    const y = clean(b).toLowerCase();
    if (!x || !y) return false;
    if (x === y) return true;
    // "Serlos" for Serlos Medina; never a one-letter match.
    const first = (s) => s.replace(/^(?:the|a|an)\s+/, '').split(/[\s"']+/)[0];
    return first(x).length > 2 && (first(x) === y || first(y) === x);
};

export const isLive = (op) => !!op && (op.status === 'running' || op.status === 'pulling out');
export const crewOut = (op) => (op?.crew ?? []).filter((c) => OUT.has(c.state)).length + Math.max(0, op?.handsOut ?? 0);
// The crew and the unnamed hands the story showed.
export const crewTotal = (op) => (op?.crew ?? []).length + Math.max(0, op?.hands ?? 0);
// Whether the player's post takes up one of their radios to listen in
// (true), gets rid of it (false), or says nothing of it (null). By the
// sentence: "Rather than foolishly destroying the communicator ..., he
// listened in on the communications" listens; "he smashed the radio" does not.
const RADIO = /\b(?:comms?|communicators?|communications|radios?|earpieces?|headsets?|walkie[- ]talkies?|channels?|frequenc(?:y|ies)|transceivers?|comm[- ]?links?|commlinks?|sending stones?|speaking stones?)\b/i;
const LISTEN = /\b(?:listen\w*|monitor\w*|tap(?:s|ped|ping)?\s+(?:into|in)|tapped|eavesdrop\w*|tune[sd]?\s+in|kept|keeps?|pocket\w*|held on|holds? on|hang\w* on)\b/i;
const RID = /\b(?:destroy\w*|smash\w*|crush\w*|disabl\w*|br(?:eak|oke|oken)|switch\w* off|turn\w* off|toss\w*|threw|throws?|ditch\w*|wreck\w*)\b/i;
export function radioTaken(text = '') {
    let said = null;
    for (const s of String(text ?? '').split(/(?<=[.!?…])\s+|\n+/)) {
        if (!RADIO.test(s)) continue;
        if (LISTEN.test(s)) said = true;
        else if (RID.test(s)) said = false;
    }
    return said;
}

// Out of it before they pull out: the plan's number, and never under half
// of everyone - hands the story turned up included.
export const breakPoint = (op) => Math.max(1, op?.breakAt ?? 1, Math.ceil(crewTotal(op) / 2));
export const currentStep =(op) => (op && op.current >= 0 ? op.steps[op.current] ?? null : null);

function normalizeCrew(c) {
    if (!isObject(c) || !clean(c.name)) return null;
    return { name: str(c.name, 80), objectId: str(c.objectId, 80), skill: str(c.skill, 120), post: str(c.post, 120), state: CREW_STATES.includes(c.state) ? c.state : 'active', where: str(c.where, 120) };
}

export function normalizeOp(o) {
    if (!isObject(o) || !clean(o.side) || !clean(o.aim)) return null;
    const steps = (Array.isArray(o.steps) ? o.steps : []).filter((s) => isObject(s) && clean(s.text)).slice(0, MAX_STEPS)
        .map((s) => ({ text: str(s.text, 200), status: ['pending', 'current', 'done'].includes(s.status) ? s.status : 'pending' }));
    if (!steps.length) return null;
    const person = (x) => (isObject(x) ? { name: str(x.name, 80), objectId: str(x.objectId, 80), where: str(x.where, 120) } : { name: '', objectId: '', where: '' });
    const leader = person(o.leader);
    // Who ordered it, when not the one on site: away while it happens.
    const boss = person(o.boss);
    const crew = (Array.isArray(o.crew) ? o.crew : []).map(normalizeCrew).filter(Boolean).slice(0, MAX_CREW);
    const current = Math.min(Math.max(int(o.current, steps.findIndex((s) => s.status !== 'done')), -1), steps.length - 1);
    return {
        id: str(o.id, 40) || 'op',
        side: str(o.side, 100),
        sideId: str(o.sideId, 80),
        leader,
        boss,
        aim: str(o.aim, 300),
        placeId: str(o.placeId, 80),
        placeName: str(o.placeName, 120),
        vehicle: str(o.vehicle, 200),
        entry: str(o.entry, 200),
        crew,
        steps,
        current,
        withdraw: (Array.isArray(o.withdraw) ? o.withdraw : []).map((w) => str(w, 160)).filter(Boolean).slice(0, 4),
        breakAt: Math.max(1, int(o.breakAt, Math.max(1, Math.ceil(crew.length / 2)))),
        aware: o.aware === true,
        hands: Math.max(0, int(o.hands, 0)),
        handsOut: Math.min(Math.max(0, int(o.handsOut, 0)), Math.max(0, int(o.hands, 0))),
        tapped: o.tapped === true,
        quiet: (Array.isArray(o.quiet) ? o.quiet : []).map((q) => str(q, 80)).filter(Boolean).slice(0, 8),
        checkIn: Number.isInteger(o.checkIn) ? o.checkIn : null,
        suspicious: o.suspicious === true,
        against: str(o.against, 120),
        status: OP_STATUSES.includes(o.status) ? o.status : 'running',
        pace: Math.min(Math.max(int(o.pace, DEFAULT_PACE), 1), 6),
        stepTurn: int(o.stepTurn, 0),
        held: Math.max(0, int(o.held, 0)),
        startedTurn: int(o.startedTurn, 0),
        endedTurn: Number.isInteger(o.endedTurn) ? o.endedTurn : null,
        endText: str(o.endText, 200),
        log: (Array.isArray(o.log) ? o.log : []).filter((l) => isObject(l) && clean(l.text)).map((l) => ({ turn: int(l.turn, 0), text: str(l.text, 200) })).slice(-LOG_KEPT),
        at: isObject(o.at) && Number.isInteger(o.at.turn) ? { turn: o.at.turn, before: isObject(o.at.before) ? o.at.before : null } : null,
    };
}

export const normalizeOpsDone = (list) => (Array.isArray(list) ? list.map(normalizeOp).filter(Boolean) : []).slice(-DONE_KEPT);

// A plan (from the generator or typed in) set going from this reply.
// Steps the story already had are done; the first that is not is under way.
export function startOp(plan, turn, id = 'op') {
    const o = normalizeOp({ ...plan, id: plan?.id || id, status: 'running', startedTurn: turn, stepTurn: turn, held: 0, at: null, log: [] });
    if (!o) return null;
    let current = o.steps.findIndex((s) => s.status !== 'done');
    if (current < 0) current = o.steps.length - 1;
    o.steps = o.steps.map((s, i) => ({ ...s, status: i < current ? 'done' : i === current ? 'current' : 'pending' }));
    o.current = current;
    // Each starts at their post.
    o.crew = o.crew.map((c) => ({ ...c, where: c.where || c.post.replace(/^(?:posted|stationed)\s+/i, '') }));
    return o;
}

const note = (op, turn, text) => ({ ...op, log: [...op.log, { turn, text }].slice(-LOG_KEPT) });

function end(op, turn, status, text) {
    return note({ ...op, status, endedTurn: turn, endText: text, steps: op.steps.map((s) => (s.status === 'current' && status === 'got away' ? { ...s, status: 'done' } : s)) }, turn, text);
}

// Who in the crew (or the leader) a name from the story is.
export function crewIndex(op, name) {
    return (op?.crew ?? []).findIndex((c) => sameName(c.name, name));
}

// After a briefing: the director's OPERATION report ({ status, how } or
// null), the fight as it stands (fighters: [{ name, condition }]) and the
// deaths (DIES: [{ name }]) moved into the operation for reply `turn`. A
// reply applied before (a swipe) starts again from the operation as it was.
export function afterBriefing(op, { report = null, fighters = [], deaths = [], moves = [], lost = [] } = {}, turn = 0) {
    let o = normalizeOp(op);
    if (!o) return null;
    if (o.at?.turn === turn && o.at.before) o = normalizeOp(o.at.before) ?? o;
    if (!isLive(o)) return o;
    const before = { ...o, at: null };
    // The crew as the fight and the deaths leave them.
    const crew = o.crew.map((c) => ({ ...c }));
    for (const f of fighters ?? []) {
        const i = crewIndex(o, f.name);
        if (i < 0) continue;
        const cond = clean(f.condition).toLowerCase();
        if (cond === 'down' || cond === 'failing') crew[i].state = 'down';
        else if (cond === 'fled') crew[i].state = 'fled';
        else if (['hurt', 'wounded', 'badly wounded'].includes(cond) && crew[i].state === 'active') crew[i].state = 'hurt';
    }
    for (const d of deaths ?? []) {
        const i = crewIndex(o, d.name);
        if (i >= 0) crew[i].state = 'dead';
    }
    // Where each is now (CREW | name | where): the leader too.
    let leader = o.leader;
    for (const m of moves ?? []) {
        const where = str(m?.where, 120);
        if (!where) continue;
        const i = crewIndex({ crew }, m.name);
        if (i >= 0) crew[i].where = where;
        else if (leader.name && sameName(leader.name, m.name)) leader = { ...leader, where };
    }
    // Taken out of it with no fight line (LOST | who | how): one of the
    // crew by name, or one of their unnamed hands - "one operative" Cyril
    // took down in the storage room counted for nothing before.
    let { hands, handsOut } = o;
    const quiet = [...o.quiet];
    const lostNotes = [];
    for (const l of lost ?? []) {
        const how = clean(l?.how).toLowerCase();
        const state = /\b(?:dead|kill|killed|shot dead|slain|died)\b/.test(how) ? 'dead' : /\b(?:caught|captur|tied|cuffed|arrest|prisoner|zip-?tied|bound)\w*/.test(how) ? 'caught' : /\bfled|ran off|escap/.test(how) ? 'fled' : 'down';
        const i = crewIndex({ crew }, l?.who);
        if (i >= 0) {
            if (OUT.has(crew[i].state)) continue;
            crew[i].state = state;
            quiet.push(crew[i].name);
            lostNotes.push(`${crew[i].name} ${state}`);
        } else {
            hands += 1;
            handsOut += 1;
            quiet.push(clean(l?.where) ? `the one at ${clean(l.where)}` : 'one of the hands');
            lostNotes.push(`one of their hands ${state}${clean(l?.where) ? ` at ${clean(l.where)}` : ''}`);
        }
    }
    const fell = crew.filter((c, i) => OUT.has(c.state) && !OUT.has(o.crew[i].state) && !lostNotes.some((n) => n.startsWith(c.name))).map((c) => `${c.name} ${c.state === 'caught' ? 'caught' : c.state === 'dead' ? 'dead' : c.state === 'fled' ? 'fled' : 'down'}`);
    o = { ...o, crew, leader, hands, handsOut };
    if (fell.length || lostNotes.length) o = note(o, turn, `Out of it: ${[...fell, ...lostNotes].join(', ')}.`);
    // Gone quiet while they do not know anyone is here: the leader calls
    // them on the next reply (src/ops/model.js opFacts).
    if (!o.aware && !o.suspicious && lostNotes.length) o = { ...o, quiet: quiet.slice(-8), checkIn: o.checkIn ?? turn + 1 };
    const leaderOut = [...(fighters ?? []), ...(deaths ?? []).map((d) => ({ name: d.name, condition: 'down' }))]
        .some((f) => o.leader.name && sameName(o.leader.name, f.name) && ['down', 'failing', 'fled'].includes(clean(f.condition).toLowerCase()));
    const how = clean(report?.how);
    let said = OP_REPORTS.includes(report?.status) ? report.status : '';
    // A crew that does not know anyone is against them is not held by being
    // watched, shadowed or hidden from ("held: Zane's careful surveillance"
    // while they walked on to the access tunnel) - only by what they ran into.
    if (said === 'held' && !o.aware && UNSEEN.test(how) && !IN_THE_WAY.test(how)) said = '';
    // Held by nothing it can name is not held.
    if (said === 'held' && !how) said = '';
    if (said === 'spotted' && !o.aware) o = note({ ...o, aware: true, suspicious: false, checkIn: null }, turn, `They know they are not alone${how ? `: ${how}` : ''}.`);
    // The check-in: the leader called those gone quiet. No one could answer
    // (no radio of theirs in other hands) or the answer did not convince:
    // they know something is wrong - not who.
    if (!o.aware && o.checkIn !== null && turn >= o.checkIn) {
        const wrong = said === 'suspicious' || !o.tapped;
        o = { ...o, checkIn: null };
        if (wrong && !o.suspicious) o = note({ ...o, suspicious: true }, turn, `${o.quiet.join(', ') || 'Someone'} went quiet: they know something is wrong${how && said === 'suspicious' ? ` - ${how}` : ''}.`);
        else if (!wrong) o = note(o, turn, 'The check-in was answered: they suspect nothing yet.');
    } else if (said === 'suspicious' && !o.aware && !o.suspicious) {
        o = note({ ...o, suspicious: true }, turn, `They know something is wrong${how ? `: ${how}` : ''}.`);
    }

    // Pulling out took its reply: it is over.
    if (o.status === 'pulling out') return { ...end(o, turn, 'withdrew', `${o.side} pulled out${how ? `: ${how}` : '.'}`), at: { turn, before } };
    const broken = crewOut(o) >= breakPoint(o) || leaderOut;
    if (said === 'pulling out' || broken) {
        const why = said === 'pulling out' ? how || 'they cut their losses' : leaderOut ? `${o.leader.name} is down` : `${crewOut(o)} of the crew are out of it`;
        // Every one of them out: nobody left to pull out - they are stopped.
        if (crewTotal(o) && crewOut(o) >= crewTotal(o)) return { ...end(o, turn, 'stopped', `${o.side}'s crew was stopped: ${why}.`), at: { turn, before } };
        return { ...note({ ...o, status: 'pulling out' }, turn, `They pull out: ${why}.`), at: { turn, before } };
    }
    const step = currentStep(o);
    const overdue = turn - o.stepTurn >= o.pace - 1;
    if (said === 'held') {
        const held = o.held + 1;
        if (held >= HELD_LIMIT) return { ...note({ ...o, held, status: 'pulling out' }, turn, `Stopped at "${step.text}" too long: they pull out.`), at: { turn, before } };
        return { ...note({ ...o, held }, turn, `Held at "${step.text}"${how ? `: ${how}` : ''}.`), at: { turn, before } };
    }
    if (said === 'done' || overdue) {
        o = note(o, turn, `Done: ${step.text}${how ? ` - ${how}` : ''}.`);
        const next = o.current + 1;
        if (next >= o.steps.length) return { ...end(o, turn, 'got away', `${o.side} got what they came for: ${o.aim}`), at: { turn, before } };
        o = { ...o, current: next, stepTurn: turn + 1, held: 0, steps: o.steps.map((s, i) => ({ ...s, status: i < next ? 'done' : i === next ? 'current' : 'pending' })) };
    }
    return { ...o, at: { turn, before } };
}

// The plan changed by the user while it runs (the GM Plan card): the new
// leader, crew, steps and the rest; how far it has come is kept - each
// crew member's state by name, a step marked done is done, the first that
// is not is under way (begun now if that changed).
export function reviseOp(op, plan, turn) {
    const o = normalizeOp(op);
    if (!o || !plan) return o;
    const steps = (plan.steps ?? []).filter((s) => clean(s?.text));
    if (!steps.length) return o;
    let current = steps.findIndex((s) => s.status !== 'done');
    if (current < 0) current = steps.length - 1;
    const crew = (plan.crew ?? []).map((c) => {
        const was = o.crew.find((x) => sameName(x.name, c.name));
        return { ...c, objectId: c.objectId || was?.objectId || '', state: was?.state ?? 'active', where: was?.where || clean(c.post).replace(/^(?:posted|stationed)\s+/i, '') };
    });
    const moved = clean(steps[current].text) !== clean(currentStep(o)?.text);
    return normalizeOp(note({
        ...o,
        leader: { name: clean(plan.leader?.name), where: clean(plan.leader?.where), objectId: plan.leader?.objectId || (sameName(plan.leader?.name, o.leader.name) ? o.leader.objectId : '') },
        boss: { name: clean(plan.boss?.name), where: clean(plan.boss?.where), objectId: plan.boss?.objectId || (sameName(plan.boss?.name, o.boss.name) ? o.boss.objectId : '') },
        aim: clean(plan.aim) || o.aim,
        vehicle: clean(plan.vehicle),
        entry: clean(plan.entry),
        crew,
        steps: steps.map((s, i) => ({ text: s.text, status: i < current ? 'done' : i === current ? 'current' : 'pending' })),
        current,
        withdraw: plan.withdraw ?? o.withdraw,
        breakAt: plan.breakAt ?? o.breakAt,
        stepTurn: moved ? turn : o.stepTurn,
        held: moved ? 0 : o.held,
        at: null,
    }, turn, 'The user changed the plan.'));
}

// The user steps in: 'next' (the step is done), 'pull out', 'end'.
export function markOp(op, action, turn) {
    const o = normalizeOp(op);
    if (!isLive(o)) return o;
    if (action === 'end') return end(o, turn, 'ended', 'Ended by the user.');
    if (action === 'pull out') return note({ ...o, status: 'pulling out', at: null }, turn, 'The user had them pull out.');
    if (action === 'next') {
        const next = o.current + 1;
        if (next >= o.steps.length) return end(o, turn, 'got away', `${o.side} got what they came for: ${o.aim}`);
        return note({ ...o, current: next, stepTurn: turn, held: 0, at: null, steps: o.steps.map((s, i) => ({ ...s, status: i < next ? 'done' : i === next ? 'current' : 'pending' })) }, turn, 'The user moved them on a step.');
    }
    return o;
}

// One crew member's state set by hand (the GM Plan card).
export function setCrewState(op, index, state) {
    const o = normalizeOp(op);
    if (!o || !o.crew[index] || !CREW_STATES.includes(state)) return o;
    return { ...o, crew: o.crew.map((c, i) => (i === index ? { ...c, state } : c)) };
}

const crewLine = (c) => `- ${c.name}${c.skill ? ` - ${c.skill}` : ''}${c.post ? `; posted ${c.post.replace(/^(?:posted|stationed)\s+/i, '')}` : ''}${c.state !== 'active' ? ` (${c.state})` : ''}: ${OUT.has(c.state) ? 'out of it' : c.where ? `now at ${c.where}` : 'NOT PLACED YET - put them somewhere that fits their part, and report it'}`;

// THE OTHER SIDE, for the director: the whole plan - it plays them. An
// operation that ended last reply is said once, so it is not carried on.
// opts: turn; here (where the player character is), player (their name):
// so the briefing says plainly what they find there - the enemy was left
// to the player to place ("rodents scurry... distant echoes of Enrique's
// operatives" while Cyril searched the storage rooms).
export function opFacts(op, { turn = null, here = '', player = '' } = {}) {
    const o = normalizeOp(op);
    if (!o) return '';
    if (!isLive(o)) {
        return Number.isInteger(turn) && o.endedTurn === turn - 1 ? `${o.endText} Their operation is over: do not carry it on, and do not bring them back in this scene unless the story does.` : '';
    }
    const lines = [];
    const lead = o.leader.name ? `led by ${o.leader.name}${o.leader.where ? ` (${o.leader.where})` : ''}` : '';
    lines.push(`${o.side}${lead ? `, ${lead}` : ''}, at ${o.placeName || 'the scene'}. They are after: ${o.aim}`);
    if (o.boss.name) lines.push(`Ordered by ${o.boss.name}${o.boss.where ? ` (${o.boss.where})` : ''} - not here and never comes here: they keep their distance and hear how it goes only by word from the crew.`);
    if (o.vehicle || o.entry) lines.push([o.vehicle && `They came in ${o.vehicle.replace(/^(?:in|by)\s+/i, '')}.`, o.entry && `They got in ${o.entry.replace(/^(?:in\s+)?(?:by|through|via)\s+/i, (m) => m.toLowerCase())}.`].filter(Boolean).join(' '));
    if (o.crew.length) lines.push('The crew:', ...o.crew.map(crewLine));
    if (o.status === 'pulling out') {
        lines.push('THEY ARE PULLING OUT in this reply: they break off, grab what they can and get away - or try to - the way they came.');
    } else {
        const s = currentStep(o);
        const next = o.steps[o.current + 1];
        lines.push(`Their plan, step ${o.current + 1} of ${o.steps.length} now: ${s.text}.${next ? ` Next: ${next.text}.` : ' This is the last step: then they are gone.'}${o.held ? ` (Held up ${o.held} time${o.held > 1 ? 's' : ''} so far.)` : ''}`);
    }
    if (o.withdraw.length) lines.push(`They pull out if: ${o.withdraw.join('; ')}.`);
    if (o.hands) lines.push(`Besides the crew, ${o.hands} unnamed hand${o.hands > 1 ? 's' : ''} of theirs the story turned up${o.handsOut ? ` (${o.handsOut} out of it)` : ''}.`);
    if (crewTotal(o)) lines.push(`Out of it so far: ${crewOut(o)} of ${crewTotal(o)} (they break at ${breakPoint(o)}).`);
    // What the player character finds where they are.
    const pc = clean(player) || 'The player character';
    if (clean(here) && o.status !== 'pulling out') lines.push(`${pc} is at ${clean(here)}. By where each of them is, say plainly in the briefing what ${pc} finds there: any of theirs here or within earshot - at work, not waiting for anyone - the traces they left if they passed through, or that it is empty of them. Never leave it for the player to say where they are.`);
    // A radio of theirs in other hands.
    if (o.tapped) lines.push(`${pc}'s side holds one of their radios and hears their channel: put in the briefing one or two short lines of what the crew says on it in this reply - their real positions and progress, in their own words and codes.`);
    // The check-in.
    if (!o.aware && o.checkIn !== null && Number.isInteger(turn) && turn >= o.checkIn) {
        const who = o.quiet.join(', ') || 'those gone quiet';
        lines.push(`CHECK-IN in this reply: ${o.leader.name || 'their leader'} calls ${who} over their channel. ${o.tapped ? `${pc}'s side holds that radio and may answer: if no one answers, or the answer does not convince, say OPERATION | suspicious | <why>.` : 'No one answers: they know something is wrong.'}`);
    }
    if (!o.aware && o.suspicious) lines.push(`They know something is wrong - ${o.quiet.join(', ') || 'someone'} went quiet - but not who or what is behind it: they are wary, check on it, and may hurry the job or cut it short.`);
    lines.push(o.aware
        ? `They know ${o.against || 'someone'} is against them here, and act on it.`
        : `They do not know ${o.against || 'anyone'} is here against them, so nothing of theirs is set up for them - no trap, no ambush, no one lying in wait: they work to their plan, and are caught off guard if found. They learn otherwise only when the story shows them proof - one of the crew sees them, hears them, or finds clear signs of them. Something made to look like an accident or a malfunction is taken for one: they may check on it, curse it or work around it, but they do not know anyone did it.`);
    lines.push('You play them: they do not wait for anyone. In this reply they carry their step forward - or deal with what is in their way - by their skills and posts; each knows only what they can see or are told over their own channels. Whoever moves, or has no place yet, gets a CREW line saying where they are now.');
    return lines.join('\n');
}

// For the narrator: short, and only what bears on the reply.
export function opGuidance(op) {
    const o = normalizeOp(op);
    if (!isLive(o)) return '';
    if (o.status === 'pulling out') return `${o.side}'s people are pulling out now - breaking off and getting away the way they came.`;
    const unaware = o.aware ? '' : ` They do not know ${o.against || 'anyone'} is here: they are not waiting for them - no trap, no ambush - and are caught off guard if found.`;
    return `${o.side}'s people are at work here and do not wait for anyone: ${currentStep(o).text}. Show only what the others could see or hear of it; their plan stays theirs. Where the player character goes, show what the game master's briefing says is there - their people, their traces, or nothing.${unaware}`;
}
