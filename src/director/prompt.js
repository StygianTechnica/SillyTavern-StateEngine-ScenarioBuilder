// The director: the "GM brain". Before the roleplay model replies, a
// background model reads the recent chat and the scene dossier (who is
// here, what they want, where they are, what is around them, the open
// quests, the world's limits) and writes a short NARRATIVE note to the
// narrator: where things stand, how the people present are likely to act,
// what should probably happen next, and what to weave into the reply. When
// the scene needs a place, person or thing the library does not have yet,
// it says so on NEW lines, which the runner turns into library entries.
//
// Pure: no SillyTavern imports. The note itself is model output, so it is
// NOT deterministic (a recorded exception to SB-015); everything around it
// is.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

// Without closing punctuation, for joining with semicolons.
const bare = (text) => clean(text).replace(/[.;,]+$/, '');

export const NEW_KINDS = Object.freeze({ location: 'location', place: 'location', room: 'location', character: 'character', npc: 'character', person: 'character', item: 'item', object: 'item' });
export const MAX_NEW = 3;

// The dossier as plain facts for the director (not for the roleplay
// model): the director needs everything, compactly.
export function dossierText(input) {
    const lines = [];
    const o = input.overview ?? {};
    if (clean(o.premise)) lines.push(`Premise: ${cut(o.premise, 400)}`);
    const meta = [['Tone', o.tone], ['Themes', o.themes], ['Era', o.era]].filter(([, v]) => clean(v)).map(([k, v]) => `${k}: ${clean(v)}`);
    if (meta.length) lines.push(meta.join('. '));
    if (input.limits?.length) lines.push(`World limits (never break these): ${input.limits.map(bare).join('; ')}.`);

    const loc = input.location;
    if (loc?.path?.length) {
        lines.push('', `LOCATION: ${loc.path.join(' > ')}${loc.indoor === true ? ' (indoors)' : loc.indoor === false ? ' (outdoors)' : ''}`);
        if (clean(loc.description)) lines.push(cut(loc.description, 700));
        if (clean(loc.conditions)) lines.push(`Conditions now: ${cut(loc.conditions, 200)}`);
        const env = Object.entries(loc.environment ?? {}).filter(([, e]) => e?.value).map(([k, e]) => `${k}: ${clean(e.value)}`);
        if (env.length) lines.push(env.join('. '));
        const list = (label, xs) => { if (xs?.length) lines.push(`${label}: ${xs.slice(0, 10).map((x) => `${clean(x.name)}${clean(x.description) ? ` (${cut(x.description, 90)})` : ''}`).join('; ')}`); };
        list('Items here', loc.items);
        list('Creatures here', loc.creatures);
        list('Places off it', loc.places);
        if (loc.partOf) lines.push(`Part of: ${clean(loc.partOf.name)}`);
    } else {
        lines.push('', 'LOCATION: not known yet.');
    }
    const ck = input.clock;
    if (ck) {
        lines.push(`TIME: ${[ck.dayPart && `${ck.dayPart}${ck.clock ? ` (${ck.clock})` : ''}`, ck.words, ck.season && `in ${ck.season}`].filter(Boolean).join(', ')}`);
        if (clean(input.weatherText)) lines.push(`Weather: ${clean(input.weatherText)}`);
        if (clean(ck.sky)) lines.push(`Sky: ${clean(ck.sky)}`);
        if (clean(ck.needs)) lines.push(clean(ck.needs));
        if (clean(ck.holiday)) lines.push(`Calendar: ${clean(ck.holiday)}`);
    } else {
        const when = [input.time?.day ? `day ${input.time.day}` : '', input.time?.dayPart ?? '', ...(input.weather ?? []), input.temperature ?? ''].map(clean).filter(Boolean);
        if (when.length) lines.push(`Time and weather: ${when.join(', ')}`);
    }
    if (clean(input.scene?.title) || clean(input.scene?.premise)) lines.push(`Scene: ${[clean(input.scene?.title), cut(input.scene?.premise, 300)].filter(Boolean).join(' - ')}`);

    const cast = (input.cast ?? []).filter((c) => clean(c?.name));
    lines.push('', cast.length ? 'PEOPLE PRESENT:' : 'PEOPLE PRESENT: not known yet.');
    for (const c of cast) {
        const bits = [
            clean(c.role), cut(c.description, 300),
            clean(c.personality) && `personality: ${cut(c.personality, 200)}`,
            clean(c.goals) && `wants: ${cut(c.goals, 200)}`,
            clean(c.mood) && `mood: ${clean(c.mood)}`,
            clean(c.intent) && `intends: ${cut(c.intent, 160)}`,
            clean(c.thought) && `thinking: ${cut(c.thought, 160)}`,
            ...(c.relations ?? []).map((r) => cut(r, 140)),
        ].filter(Boolean).map(bare);
        lines.push(`- ${clean(c.name)}${bits.length ? `: ${bits.join('; ')}` : ''}`);
    }
    const others = (input.nearby ?? []).filter((c) => clean(c?.name));
    if (others.length) {
        lines.push('', 'OTHERS WHO COULD TURN UP (not here now):');
        for (const c of others.slice(0, 12)) lines.push(`- ${clean(c.name)}${clean(c.role) ? ` (${clean(c.role)})` : ''}${clean(c.why) ? ` - ${clean(c.why)}` : ''}`);
    }
    const quests = (input.quests ?? []).filter((q) => clean(q.name));
    if (quests.length) {
        lines.push('', 'OPEN QUESTS (most important first):');
        for (const q of quests) lines.push(`- ${clean(q.name)}${q.priority ? ` [${q.priority}]` : ''}${clean(q.current) ? `: now - ${cut(q.current, 160)}` : ''}`);
    }
    if (input.memories?.length) {
        lines.push('', 'WHAT HAS HAPPENED BEFORE (memories):');
        for (const m of input.memories.slice(0, 12)) lines.push(`- ${cut(m, 220)}`);
    }
    if (input.corrections?.length) {
        lines.push('', 'FACTS THE STORY RECENTLY GOT WRONG (hold to the correction):');
        for (const t of input.corrections) lines.push(`- ${clean(t)}`);
    }
    return lines.join('\n').trim();
}

// input: the guidance input plus { messages: [{ name, text, isUser }],
//   userName, previousNote, memories, limits, allowCreate, canonOnly }
// -> { system, prompt }
export function buildDirectorPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const creating = input.allowCreate && !input.canonOnly;
    const system = [
        'You are the game master of an ongoing roleplay. You do not write the story yourself: another writer (the narrator) writes the next reply.',
        'Your job is to brief that narrator before it writes, in plain narrative prose, so its reply is grounded in the actual state of the scene and moves the story forward sensibly.',
        `Never decide what ${userName} says, does, thinks or feels; ${userName} is played by a human.`,
        'Never contradict the facts you are given. Only use what fits the world limits.',
    ].join(' ');

    const recent = (input.messages ?? []).slice(-8).map((m) => `${clean(m.name) || (m.isUser ? userName : 'Narrator')}: ${cut(m.text, 900)}`).join('\n\n');
    const parts = [
        'THE SCENE AS IT STANDS',
        dossierText(input),
        '',
        'THE LATEST CHAT',
        recent || '(the story has not started yet)',
    ];
    if (clean(input.previousNote)) parts.push('', 'YOUR PREVIOUS BRIEFING (update it; do not repeat what has already happened)', cut(input.previousNote, 1200));
    parts.push(
        '',
        'WRITE THE BRIEFING',
        `Address the narrator directly ("In this reply..."), in three to five paragraphs of flowing prose - no headings, no bullet lists, no tables. Cover, in this order:`,
        `1. Where things stand right now, in a sentence or two, picking up from ${userName}'s latest message.`,
        '2. The people present: what each one wants at this moment, how they feel about the others, and how they are likely to react to what just happened. Weave this together; do not list them.',
        '3. What should probably happen next: one or two natural developments the reply could move toward, offered as direction rather than a script, nudging gently toward an open quest when it fits.',
        '4. What to show: a few concrete sensory details of this place (what can be seen, heard, smelled) and any item or feature that matters now.',
        'Keep it under 400 words.',
    );
    if (input.timeKeeping !== false) {
        parts.push(
            '',
            'Then, on its own line, say how much in-story time this reply will cover, from the latest message on:',
            'TIME | 5 minutes | why',
            'A few minutes for talk; longer when people travel, wait, work or sleep, or when the scene moves on (use a duration like "2 hours" or "3 days", or a time of day like "the next morning"). Follow any time skip the latest message asks for.',
        );
    }
    parts.push(
        '',
        'If someone known arrives or leaves in this reply, add a line for each:',
        'ENTERS | Name',
        'LEAVES | Name',
    );
    if (creating) {
        parts.push(
            '',
            'If the scene clearly needs something the facts above do not have - a room or place off this location that someone is about to enter, a person who should appear, an item about to be used - invent it so it fits, mention it in the briefing, and after the briefing add one line per new thing (at most three):',
            'NEW location | Name | one-sentence description',
            'NEW character | Name | one-sentence description | here (or nearby)',
            'NEW item | Name | one-sentence description',
            'Add NEW lines only when they are needed now. Never add something that already exists above.',
        );
    } else {
        parts.push('', 'Use only places, people and items named above; do not invent new named ones.');
    }
    return { system, prompt: parts.join('\n') };
}

// The model's reply -> { note, created: [{ kind, name, description, here }],
//   time: { text, why } | null, enters: [name], leaves: [name] }.
// Lenient: strips fences, headings and preambles; NEW lines may appear
// anywhere and are removed from the note.
export function parseDirectorNote(raw) {
    let text = String(raw ?? '').replace(/```[a-z]*\n?/gi, '').replace(/\r/g, '');
    const created = [];
    const seen = new Set();
    const keep = [];
    let time = null;
    const enters = [];
    const leaves = [];
    for (const line of text.split('\n')) {
        const t = line.match(/^\s*(?:[-*]\s*)?\**TIME\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*(.*?)\s*)?$/i);
        if (t) {
            if (!time) time = { text: clean(t[1]).replace(/^["']|["']$/g, ''), why: clean(t[2]) };
            continue;
        }
        const move = line.match(/^\s*(?:[-*]\s*)?\**(ENTERS|LEAVES)\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|.*)?$/i);
        if (move) {
            const name = clean(move[2]).replace(/^["'*]+|["'*]+$/g, '');
            if (name) (move[1].toUpperCase() === 'ENTERS' ? enters : leaves).push(name);
            continue;
        }
        const m = line.match(/^\s*(?:[-*]\s*)?\**NEW\**\s*:?\s*([a-z]+)\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*([^|]*?)\s*)?$/i);
        if (m) {
            const kind = NEW_KINDS[m[1].toLowerCase()];
            const name = clean(m[2]).replace(/^["'*]+|["'*]+$/g, '');
            if (kind && name && !seen.has(name.toLowerCase()) && created.length < MAX_NEW) {
                seen.add(name.toLowerCase());
                created.push({ kind, name, description: clean(m[3]), here: kind === 'character' ? !/nearby|elsewhere|later/i.test(m[4] ?? '') : true });
            }
            continue;
        }
        keep.push(line);
    }
    text = keep.join('\n')
        .replace(/^\s*(?:#+\s*)?(?:\**)?(?:gm\s+)?(?:briefing|note|director'?s note)(?:\**)?\s*:?\s*$/gim, '')
        .replace(/^\s*here(?:'s| is) (?:the|my|your) briefing[^\n]*\n/i, '')
        .replace(/^\s*#+\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return { note: text, created, time, enters: [...new Set(enters)], leaves: [...new Set(leaves)] };
}
