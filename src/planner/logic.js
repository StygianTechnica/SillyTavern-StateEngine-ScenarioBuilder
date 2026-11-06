// The story's logic, for the outline: who believes what is not so, what
// only some know, what is settled, whose job is whose, and the turns the
// user asked for - one short section, never trimmed - and a check of the
// beats still to come against it before an outline is kept. Pure.
//
// Assassins Inc's outline, written by an 8B model with the secrets trimmed
// out of its prompt, had the team raid "Enrique's fortress during the art
// auction" (Enrique's own auction, the heist they were to stop), Enrique
// "enraged by Cyril's interference" (he believes Cyril dead), "Enrique
// discovers Cyril" a beat before the meeting with Bartin that needed it
// kept from him, "Adam meets with Bartin" where the user asked that Adam
// arrange a meeting between Cyril and Bartin, and a finale of Cyril torn
// between White Cerberus and a family he has spent chapters fighting.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => { const t = clean(text); return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}...`; };
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const andList = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const namesOf = (people) => list(people).map((p) => clean(typeof p === 'string' ? p : p?.name)).filter(Boolean);

// The sentences of the user's wish: each a turn they asked for.
export function wishTurns(wish = '') {
    return clean(wish).split(/(?<=[.!?])\s+(?=[A-Z"“])/).map(clean).filter((s) => s.length > 8).slice(0, 8);
}

// knowledge: allKnowledge() items (people as { name }); settled: [text];
// jobs: the aims line (src/planner/aims.js); wish: the user's steer.
// -> [lines] ('' parts left out), headed.
export function storyLogicLines({ knowledge = [], settled = [], jobs = '', wish = '' } = {}) {
    const out = [];
    const who = [];
    for (const k of list(knowledge)) {
        if (!clean(k?.text)) continue;
        const knowers = namesOf(k.knownBy);
        if (k.kind === 'belief' && k.status === 'held') {
            const holders = k.everyone ? ['most people'] : namesOf(k.heldBy).filter((n) => !knowers.includes(n));
            who.push(`${holders.length ? andList(holders) : 'Some'} believe "${clean(k.text)}" - it is not so${knowers.length ? ` (${andList(knowers)} know${knowers.length === 1 ? 's' : ''} the truth)` : ''}. Until a beat of its own shows them learning otherwise, they act as if it were true: no beat has them act on the truth.`);
        } else if (k.kind === 'secret' && k.status === 'kept') {
            who.push(`Only ${knowers.length ? andList(knowers) : 'a few'} know${knowers.length === 1 ? 's' : ''}: ${clean(k.text)}. No one else acts on it until a beat of its own reveals it.`);
        }
    }
    if (who.length) out.push('WHO KNOWS WHAT (no one acts on what they do not know)', ...who.slice(0, 8).map((l) => `- ${l}`));
    const done = list(settled).map(clean).filter(Boolean).slice(0, 8);
    if (done.length) out.push('SETTLED (true - no beat undoes it)', ...done.map((t) => `- ${t}`));
    if (clean(jobs)) out.push(clean(jobs));
    const turns = wishTurns(wish);
    if (turns.length) out.push('WHAT THE USER ASKED FOR, TURN BY TURN (each is in the outline, with the people it names in the parts it gives them - who arranges, who meets, who does it)', ...turns.map((t, i) => `${i + 1}. ${t}`));
    return out;
}

// Labels for the beats of a read outline, so the check can name new beats
// that have no id yet: "2.3" is act 2, beat 3.
export function beatLabels(outline) {
    const out = [];
    list(outline?.acts).forEach((a, i) => list(a.beats).forEach((b, j) => out.push({ label: `${i + 1}.${j + 1}`, act: i, index: j, beat: b })));
    return out;
}

// The beats the check may change: still to come, not the user's own.
// Active too when the outline is newly written.
export function checkable(b, { lockedIds = [], writing = false } = {}) {
    return !lockedIds.includes(b.id) && (b.status === 'pending' || (writing && b.status === 'active'));
}

// input: { userName, logic: [lines], outline (read), lockedIds, writing,
//   storySoFar } -> { system, prompt }
export function buildOutlineCheckPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const system = [
        'You check a story outline a game master wrote, before it is kept. You fix its mistakes of logic and fact - you do not restyle it, and you leave alone every beat that is right.',
        `${userName} is the player character: never write what ${userName} does, thinks or feels. Answer with JSON only.`,
    ].join(' ');
    const parts = [];
    const sofar = clean(input.storySoFar);
    if (sofar) parts.push('THE STORY SO FAR', cut(sofar, 2500), '');
    if (list(input.logic).length) parts.push('THE STORY\'S LOGIC', ...input.logic, '');
    parts.push('THE OUTLINE (each beat with its label; [fixed] beats are done, under way or the user\'s - never change them, but the others must fit them)');
    let act = -1;
    for (const { label, act: a, beat } of beatLabels(input.outline)) {
        if (a !== act) { act = a; parts.push(`Act ${a + 1}: ${clean(input.outline.acts[a].title)}`); }
        parts.push(`- [${label}] ${clean(beat.text)}${checkable(beat, input) ? '' : ` [fixed: ${beat.status}${list(input.lockedIds).includes(beat.id) ? ', the user\'s' : ''}]`}`);
    }
    parts.push(
        '',
        'Check every beat that is not [fixed], against all of the above:',
        '1. Knowledge: no one acts on what they do not know. Someone who believes a person dead is never angered by that person, never hunts or finds them, never sets a trap for them - unless an earlier beat of its own has them learn the truth.',
        '2. Sense: whose things are whose. No one robs, raids, sabotages or breaks into their own operation, event, home or people; a side never works against itself. A place an event is held is the place of whoever holds it.',
        '3. The user\'s turns: each turn under WHAT THE USER ASKED FOR is in the outline, with the people it names in the parts it gives them (if Adam is to arrange a meeting between two others, the beat is Adam arranging it - never Adam meeting them himself). Fix the beat that should carry it.',
        '4. Order: no beat spoils a later one. A reveal, a discovery or a death that a later beat needs to have not happened yet comes after it, or not at all.',
        `5. The ending: the last beats grow out of what the story has shown of ${userName} - their loyalties, wants and enemies as the story so far shows them. A choice between sides is only one ${userName} has shown real pull toward; an ending that rests on a loyalty or bond the story never showed is replaced with one that grows out of what it did show.`,
        '6. Whose job is whose and what is settled hold in every beat.',
        `Fix a beat by rewriting it in one sentence: keep what it is for, fix only what is wrong. Drop a beat only when no rewrite can save it (it spoils a later beat, or repeats one). Never add beats. A fixed beat is still what the world and the others do around ${userName}.`,
        'Answer in this JSON shape (empty lists when nothing is wrong):',
        '{"fixes":[{"beat":"<label>","problem":"<what was wrong, a few words>","text":"<the beat, fixed>"}],"drops":[{"beat":"<label>","why":"<a few words>"}]}',
    );
    return { system, prompt: parts.join('\n') };
}

// -> { fixes: [{ label, problem, text }], drops: [{ label, why }] }
export function readOutlineCheck(json) {
    if (!isObject(json)) return { fixes: [], drops: [] };
    const label = (x) => clean(x?.beat ?? x?.label ?? x?.id).replace(/^\[|\]$/g, '');
    return {
        fixes: list(json.fixes).filter(isObject).map((x) => ({ label: label(x), problem: cut(x.problem, 160), text: cut(x.text, 300) })).filter((x) => x.label && x.text),
        drops: list(json.drops).filter(isObject).map((x) => ({ label: label(x), why: cut(x.why, 160) })).filter((x) => x.label),
    };
}

// The check applied to a read outline: only checkable beats change; an act
// never loses its last beat. playerLed(text) -> true for a beat the player
// character would lead (left as it was). -> { outline, changed: [text] }
export function applyOutlineCheck(outline, check, { lockedIds = [], writing = false, playerLed = () => false } = {}) {
    if (!outline) return { outline, changed: [] };
    const next = { ...outline, acts: outline.acts.map((a) => ({ ...a, beats: a.beats.map((b) => ({ ...b })) })) };
    const byLabel = new Map(beatLabels(next).map((x) => [x.label, x]));
    const changed = [];
    for (const f of check?.fixes ?? []) {
        const at = byLabel.get(f.label);
        if (!at || !checkable(at.beat, { lockedIds, writing }) || clean(f.text) === clean(at.beat.text) || playerLed(f.text)) continue;
        changed.push(`${at.beat.text} -> ${f.text}${f.problem ? ` (${f.problem})` : ''}`);
        at.beat.text = f.text;
    }
    const dropped = new Set();
    for (const d of check?.drops ?? []) {
        const at = byLabel.get(d.label);
        if (!at || !checkable(at.beat, { lockedIds, writing })) continue;
        const act = next.acts[at.act];
        if (act.beats.filter((b) => !dropped.has(b)).length <= 1) continue;
        dropped.add(at.beat);
        changed.push(`dropped: ${at.beat.text}${d.why ? ` (${d.why})` : ''}`);
    }
    for (const a of next.acts) a.beats = a.beats.filter((b) => !dropped.has(b));
    return { outline: next, changed };
}

// The beats still to come whose words are new since the outline before:
// a review that changed none needs no check.
export function newBeatsToCome(outline, before = []) {
    const old = new Set(list(before).map((b) => clean(b.text).toLowerCase()));
    return beatLabels(outline).filter(({ beat }) => beat.status === 'pending' && !old.has(clean(beat.text).toLowerCase())).length;
}
