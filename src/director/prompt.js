// The director: the "GM brain". Before the roleplay model replies, a
// background model reads the recent chat and the scene dossier (who is
// here, what they want, where they are, what is around them, the open
// quests, the factions at play, the lore that matters here, events and
// earlier scenes, the world's limits) and writes a short NARRATIVE note to the
// narrator: where things stand, how the people present are likely to act,
// what should probably happen next, and what to weave into the reply. When
// the scene needs something the library does not have yet - any kind of
// entry - it says so on NEW lines, each tied to what the setting already
// has, which the runner turns into library entries.
//
// Pure: no SillyTavern imports. The note itself is model output, so it is
// NOT deterministic (a recorded exception to SB-015); everything around it
// is.

import { WEATHER_VALUES } from '../store/schema.js';
import { lookLines } from '../library/world-options.js';
import { shortTitle } from '../validate/drift.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

// Without closing punctuation, for joining with semicolons.
const bare = (text) => clean(text).replace(/[.;,]+$/, '');

export const NEW_KINDS = Object.freeze({
    location: 'location', place: 'location', room: 'location',
    character: 'character', npc: 'character', person: 'character',
    item: 'item', object: 'item',
    creature: 'creature', monster: 'creature', beast: 'creature',
    faction: 'faction', group: 'faction', organization: 'faction', organisation: 'faction',
    lore: 'lore', legend: 'lore', history: 'lore',
    event: 'event', happening: 'event',
    quest: 'quest', mission: 'quest', task: 'quest',
    scene: 'scene',
});

// A NEW line's kind as a type id (every State Engine type, and the words a
// model uses for them - "mission", "npcs"), or null for anything else.
export function newKind(word) {
    const w = String(word ?? '').toLowerCase();
    return NEW_KINDS[w] ?? NEW_KINDS[w.replace(/s$/, '')] ?? null;
}
export const MAX_NEW = 2;

// Words too common to tie a new thing to the chat.
const STOP = new Set(['the', 'and', 'old', 'new', 'with', 'from', 'that', 'this', 'room', 'place', 'great', 'little', 'small', 'large', 'house', 'hall']);

// The library place a MOVE names: its name or an alias exactly, else one
// whose name holds every distinctive word of it ("the wall" -> "The Outer
// Wall"), places near the scene first (`nearIds`: ways on, the place it is
// in, its neighbours). -> the place, or null.
export function matchPlace(name, places, nearIds = []) {
    const bareName = (n) => String(n ?? '').toLowerCase().replace(/^(the|a|an)\s+/, '').trim();
    const target = bareName(name);
    if (!target) return null;
    const near = new Set(nearIds);
    const ranked = [...(places ?? [])].sort((a, b) => Number(near.has(b.id)) - Number(near.has(a.id)));
    const exact = ranked.find((p) => [p.name, ...(p.aliases ?? p.base?.aliases ?? [])].some((n) => bareName(n) === target));
    if (exact) return exact;
    const words = target.split(/[^a-z0-9'\u00c0-\u024f]+/).filter((w) => w.length >= 3 && !['the', 'and', 'of'].includes(w));
    if (!words.length) return null;
    return ranked.find((p) => words.every((w) => bareName(p.name).includes(w))) ?? null;
}

// Whether a new item matters enough to become a library entry: an item
// takes on weight with the model and pulls the scene toward it, so flavour
// stays in the prose. It must serve an open thread (its stated purpose or
// its name ties to one), or be something the player named outright in
// their latest message (every distinctive word of its name there).
export function itemMatters(item, { quests = [], latestUserText = '' } = {}) {
    const threads = (quests ?? []).map((q) => [q.name, q.current, q.description].filter(Boolean).join(' ')).filter(Boolean);
    if (clean(item.why) && threads.some((t) => mentionedIn(t, item.why) || mentionedIn(item.why, t))) return true;
    if (threads.some((t) => mentionedIn(item.name, t))) return true;
    const words = String(item.name ?? '').toLowerCase().split(/[^a-z0-9'\u00c0-\u024f]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    const said = String(latestUserText ?? '').toLowerCase();
    return words.length > 0 && words.every((w) => said.includes(w) || (w.endsWith('s') && said.includes(w.slice(0, -1))));
}

// Whether something the director wants to add is RELEVANT - never added
// at random. It must be one of:
//   - brought up by the recent chat (its name, or for a place its
//     description);
//   - an item: a plot point or open thread (itemMatters);
//   - TIED to the setting: its tie (the NEW line's last part) names a
//     person, place, faction or other entry the library has, or an open
//     thread - a plot point that grows out of what is already there.
// known: [{ id, name, aliases }] - the library's entries; quests: the open
// threads. -> { ok, tiedIds } (the entries the tie names).
export function relevance(item, { recentText = '', latestUserText = '', quests = [], known = [] } = {}) {
    const tie = clean(item.why);
    const tiedIds = tie ? (known ?? []).filter((e) => [e.name, ...(e.aliases ?? e.base?.aliases ?? [])].some((n) => clean(n).length >= 3 && mentionedWhole(tie, n))).map((e) => e.id) : [];
    const threadTie = !!tie && (quests ?? []).some((q) => clean(q.name) && (mentionedWhole(tie, q.name) || mentionedIn(q.name, tie)));
    if (item.kind === 'item') return { ok: itemMatters(item, { quests, latestUserText }) || tiedIds.length > 0 && threadTie, tiedIds };
    const named = mentionedIn(item.name, recentText) || (item.kind === 'location' && mentionedIn(item.description, recentText))
        || (item.provisional === true && echoes(item.name, recentText));
    return { ok: named || tiedIds.length > 0 || threadTie, tiedIds };
}

// Whether a descriptive name ("The Eyepatched Man") echoes the text ("a
// man with an eyepatch"): one of its distinctive words, or its stem, is there.
export function echoes(name, text) {
    const t = String(text ?? '').toLowerCase();
    const words = String(name ?? '').toLowerCase().split(/[^a-z0-9'\u00c0-\u024f]+/).filter((w) => w.length >= 4 && !['the', 'man', 'woman', 'person', 'figure', 'with'].includes(w));
    return words.some((w) => t.includes(w) || (w.length >= 6 && t.includes(w.slice(0, w.length - 2))) || (w.length >= 7 && t.includes(w.slice(0, w.length - 3))));
}

// `name` in `text` as whole words, case aside.
function mentionedWhole(text, name) {
    const n = clean(name).toLowerCase().replace(/^(the|a|an)\s+/, '');
    if (n.length < 3) return false;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(String(text ?? ''));
}

// Every other entry that bears on this moment, of any type: named in the
// recent chat, or tied to the scene (one of its fields or related ids
// holds the place, a place it is in, or someone present). `covered`: ids
// and lower-case names already in the dossier. Most relevant first (named
// before tied), at most `max`.
// entries: [{ id, type, name, aliases, description, base }]; typeLabel(type).
// -> [{ name, type, description, why }]
export function alsoRelevant(entries, { recentText = '', sceneIds = [], covered = new Set(), typeLabel = (t) => t } = {}, max = 10) {
    const scene = new Set(sceneIds);
    const out = [];
    for (const e of entries ?? []) {
        if (!clean(e?.name) || covered.has(e.id) || covered.has(clean(e.name).toLowerCase()) || scene.has(e.id)) continue;
        const named = [e.name, ...(e.aliases ?? e.base?.aliases ?? [])].some((n) => mentionedWhole(recentText, n));
        const record = e.base ?? e;
        const tied = Object.entries(record).some(([k, v]) => k !== 'id' && (Array.isArray(v) ? v : [v]).some((x) => typeof x === 'string' && scene.has(x)));
        if (!named && !tied) continue;
        out.push({ name: clean(e.name), type: typeLabel(e.type), description: cut(record.description ?? e.description ?? '', 140), why: named ? 'named in the chat' : 'tied to this place or someone here', rank: named ? 0 : 1 });
    }
    return out.sort((a, b) => a.rank - b.rank).slice(0, max).map(({ rank, ...x }) => x);
}

// Whether a new thing's name is tied to the recent chat: one of its
// distinctive words (4+ letters) appears there. The director may only add
// what the story has brought up - never something invented for colour.
export function mentionedIn(name, recentText) {
    const text = String(recentText ?? '').toLowerCase();
    const words = String(name ?? '').toLowerCase().split(/[^a-z0-9'\u00c0-\u024f]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    return words.some((w) => text.includes(w) || (w.endsWith('s') && text.includes(w.slice(0, -1))));
}

// Words that are titles, not names ("High Seer Maren" is Maren).
const TITLE_WORDS = new Set(['high', 'seer', 'lord', 'lady', 'sir', 'dame', 'king', 'queen', 'prince', 'princess', 'captain', 'father', 'mother', 'brother', 'sister', 'master', 'mistress', 'angel', 'saint', 'elder', 'the', 'old', 'young', 'great', 'doctor', 'general']);

// The ways a character is named in prose: their name, aliases, the part
// before a comma ("Lucen, Angel of Loyalty"), and their first and last
// names unless those are titles.
export function callNames(c) {
    const names = new Set();
    for (const raw of [c?.name, ...(c?.aliases ?? c?.base?.aliases ?? [])]) {
        const n = clean(raw);
        if (!n) continue;
        names.add(n);
        const head = clean(n.split(',')[0]);
        names.add(head);
        const words = head.split(/\s+/);
        for (const w of [words[0], words.at(-1)]) if (w && w.length >= 4 && !TITLE_WORDS.has(w.toLowerCase())) names.add(w);
    }
    return [...names].filter((n) => n.length >= 3);
}

// The characters `text` names, by whole words. -> [character]
export function peopleNamedIn(text, characters) {
    const t = String(text ?? '');
    const has = (n) => new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(t);
    return (characters ?? []).filter((c) => callNames(c).some(has));
}

// The dossier as plain facts for the director (not for the roleplay
// model), from the general to the immediate - the same order the guidance
// takes: the setting, its rules, the threads being followed, what has
// happened, then the scene as it is right now and the people in it. The
// director reads its way into the moment, and writes from there.
export function dossierText(input) {
    const lines = [];
    const section = (title) => { if (lines.length) lines.push(''); lines.push(title); };

    // The setting and its rules.
    const o = input.overview ?? {};
    const setting = [clean(o.premise) && cut(o.premise, 400), ...[['Tone', o.tone], ['Themes', o.themes], ['Era', o.era]].filter(([, v]) => clean(v)).map(([k, v]) => `${k}: ${clean(v)}.`), ...lookLines(o)].filter(Boolean);
    if (setting.length) { section('THE SETTING'); lines.push(setting.join(' ')); }
    if (input.limits?.length) { section('ITS RULES (never break these)'); lines.push(`${input.limits.map(bare).join('; ')}.`); }

    // The threads, and what has happened.
    const quests = (input.quests ?? []).filter((q) => clean(q.name));
    if (quests.length) {
        section('THREADS BEING FOLLOWED (most important first)');
        for (const q of quests) lines.push(`- ${clean(q.name)}${q.priority ? ` [${q.priority}]` : ''}${clean(q.current) ? `: now - ${cut(q.current, 160)}` : ''}`);
    }
    if (input.memories?.length) {
        section('WHAT HAS HAPPENED BEFORE');
        for (const m of input.memories.slice(0, 12)) lines.push(`- ${cut(m, 220)}`);
    }

    // The scene now: when, where, what is around.
    section('THE SCENE NOW');
    const ck = input.clock;
    if (ck) {
        lines.push(`When: ${[ck.dayPart && `${ck.dayPart}${ck.clock ? ` (${ck.clock})` : ''}`, ck.words, ck.season && `in ${ck.season}`].filter(Boolean).join(', ')}.`);
        if (clean(input.weatherText)) lines.push(clean(input.weatherText));
        if (clean(ck.sky)) lines.push(clean(ck.sky));
        if (clean(ck.holiday)) lines.push(clean(ck.holiday));
        if (clean(ck.needs)) lines.push(clean(ck.needs));
    } else {
        const when = [input.time?.day ? `day ${input.time.day}` : '', input.time?.dayPart ?? '', ...(input.weather ?? []), input.temperature ?? ''].map(clean).filter(Boolean);
        if (when.length) lines.push(`When: ${when.join(', ')}.`);
    }
    const loc = input.location;
    if (loc?.path?.length) {
        lines.push(`Where: ${loc.path.join(' > ')}${loc.indoor === true ? ' (indoors)' : loc.indoor === false ? ' (outdoors)' : ''}.`);
        if (clean(loc.description)) lines.push(cut(loc.description, 700));
        if (clean(loc.conditions)) lines.push(`Right now: ${cut(loc.conditions, 200)}`);
        const env = Object.entries(loc.environment ?? {}).filter(([, e]) => e?.value).map(([k, e]) => `${k}: ${clean(e.value)}`);
        if (env.length) lines.push(`${env.join('. ')}.`);
        const list = (label, xs) => { if (xs?.length) lines.push(`${label}: ${xs.slice(0, 10).map((x) => `${clean(x.name)}${clean(x.description) ? ` (${cut(x.description, 90)})` : ''}`).join('; ')}.`); };
        list('Here', loc.items);
        list('Creatures here', loc.creatures);
        list('Ways on', [...(loc.places ?? []), ...(loc.routes ?? []).map((r) => ({ name: r.name, description: [r.travel && `${r.travel} away`, r.note].filter(Boolean).join(', ') })), ...(loc.partOf ? [{ name: `back out to ${clean(loc.partOf.name)}` }] : [])]);
    } else {
        lines.push('Where: not known yet.');
    }
    if (clean(input.scene?.title) || clean(input.scene?.premise)) lines.push(`The scene: ${[clean(input.scene?.title), cut(input.scene?.premise, 300)].filter(Boolean).join(' - ')}`);
    if (input.corrections?.length) lines.push(`Hold to these (the story recently got them wrong): ${input.corrections.map((t) => bare(t)).join('; ')}.`);

    // The groups at play, what is known here, what is coming.
    const factions = (input.factions ?? []).filter((f) => clean(f?.name));
    if (factions.length) {
        section('FACTIONS AT PLAY');
        for (const f of factions.slice(0, 8)) {
            const bits = [cut(f.description, 200), clean(f.goals) && `wants: ${cut(f.goals, 160)}`, f.members?.length && `here: ${f.members.join(', ')}`, clean(f.why)].filter(Boolean).map(bare);
            lines.push(`- ${clean(f.name)}${bits.length ? `: ${bits.join('; ')}` : ''}`);
        }
    }
    const lore = (input.lore ?? []).filter((l) => clean(l?.name));
    if (lore.length) {
        section('LORE THAT MATTERS HERE');
        for (const l of lore.slice(0, 8)) lines.push(`- ${clean(l.name)}${clean(l.description) ? `: ${cut(l.description, 220)}` : ''}`);
    }
    const events = [...(input.eventObjects ?? []).filter((e) => clean(e?.name)).map((e) => `${clean(e.name)}${clean(e.description) ? `: ${cut(e.description, 180)}` : ''}${clean(e.when) ? ` (${clean(e.when)})` : ''}`), ...(input.events ?? []).map(clean).filter(Boolean)];
    if (events.length) {
        section('EVENTS (happening, planned or on the calendar)');
        for (const e of [...new Set(events)].slice(0, 8)) lines.push(`- ${e}`);
    }
    const relevantEntries = (input.relevant ?? []).filter((x) => clean(x?.name));
    if (relevantEntries.length) {
        section('ALSO RELEVANT (named in the chat, or tied to this place or the people here)');
        for (const x of relevantEntries) lines.push(`- ${clean(x.name)}${clean(x.type) ? ` (${clean(x.type).toLowerCase()})` : ''}${clean(x.description) ? `: ${bare(x.description)}` : ''}`);
    }
    const scenes = (input.scenes ?? []).filter((x) => clean(x?.name));
    if (scenes.length) {
        section('EARLIER SCENES IN THIS CHAT');
        for (const x of scenes.slice(-5)) lines.push(`- ${clean(x.name)}${clean(x.description) ? `: ${cut(x.description, 160)}` : ''}`);
    }

    // The people: who is here, then who could turn up.
    const cast = (input.cast ?? []).filter((c) => clean(c?.name));
    section(cast.length ? 'WHO IS HERE' : 'WHO IS HERE: not known yet.');
    for (const c of cast) {
        if (c.player) {
            lines.push(`- ${clean(c.name)}${clean(c.role) ? ` (${clean(c.role)})` : ''}: the player character, played by the human - never write for them.`);
            continue;
        }
        const bits = [
            clean(c.role), cut(c.description, 300),
            clean(c.personality) && `personality: ${cut(c.personality, 200)}`,
            clean(c.goals) && `wants: ${cut(c.goals, 200)}`,
            clean(c.mood) && `mood: ${clean(c.mood)}`,
            clean(c.intent) && `intends: ${cut(c.intent, 160)}`,
            clean(c.thought) && `thinking: ${cut(c.thought, 160)}`,
            ...(c.relations ?? []).map((r) => cut(r, 140)),
        ].filter(Boolean).map(bare);
        lines.push(`- ${clean(c.name)}${c.provisional ? ' (no name yet - known by this description)' : ''}${bits.length ? `: ${bits.join('; ')}` : ''}`);
    }
    if (cast.length && cast.every((c) => c.player)) lines.push('- No one else is here.');
    if (input.absent?.length) {
        section('TAKEN OUT OF THE SCENE BY THE PLAYER (they must not appear, speak or act in this reply)');
        lines.push(`- ${input.absent.map(clean).join(', ')}`);
    }
    const absentSet = new Set((input.absent ?? []).map((n) => clean(n).toLowerCase()));
    const others = (input.nearby ?? []).filter((c) => clean(c?.name) && !absentSet.has(clean(c.name).toLowerCase()));
    if (others.length) {
        section('OTHERS WHO COULD TURN UP (not here now)');
        for (const c of others.slice(0, 12)) lines.push(`- ${clean(c.name)}${clean(c.role) ? ` (${clean(c.role)})` : ''}${clean(c.why) ? ` - ${clean(c.why)}` : ''}`);
    }
    return lines.join('\n').trim();
}

// input: the guidance input plus { messages: [{ name, text, isUser }],
//   userName, previousNote, memories, limits, allowCreate, canonOnly }
// -> { system, prompt }
export function buildDirectorPrompt(input) {
    const userName = clean((input.cast ?? []).find((c) => c.player)?.name) || clean(input.userName) || 'the player';
    const creating = input.allowCreate && !input.canonOnly;
    const system = [
        'You are the game master of an ongoing roleplay. You do not write the story yourself: another writer (the narrator) writes the next reply.',
        'Your job is to brief that narrator before it writes, in plain narrative prose, so its reply is grounded in the actual state of the scene and moves the story forward sensibly.',
        `${userName} is the player character, played by a human. Never decide or suggest what ${userName} says, does, thinks, feels or will do next, and do not describe the scene through ${userName}'s eyes; brief the narrator on the other characters and the world, which react to ${userName}.`,
        'Never contradict the facts you are given. Only use what fits the world\'s rules.',
        clean(input.overview?.gmStyle) ? `How the user wants this story run - follow it: ${cut(input.overview.gmStyle, 800)}` : '',
    ].filter(Boolean).join(' ');

    // General to immediate: the world, the scene, then the latest chat and
    // the last briefing, then what to write.
    const recent = (input.messages ?? []).slice(-8).map((m) => `${clean(m.name) || (m.isUser ? userName : 'Narrator')}: ${cut(m.text, 900)}`).join('\n\n');
    const parts = [dossierText(input), '', 'THE LATEST CHAT', recent || '(the story has not started yet)'];
    if (clean(input.previousNote)) parts.push('', 'YOUR LAST BRIEFING (move on from it; do not repeat what has already happened)', cut(input.previousNote, 1200));
    // With no one but the player present there are no people to brief on:
    // the world itself must answer, or the reply has nothing to do.
    const castHere = (input.cast ?? []).filter((c) => clean(c?.name));
    // State Engine's tracker having someone else here means the cast is behind, not empty.
    const alone = !input.othersTracked && castHere.some((c) => c.player) && castHere.every((c) => c.player);
    const people = alone
        ? 'No NPCs are present, so the reply is not empty: the world itself reacts. Brief the narrator ONLY on the environment, the weather, sounds, smells, distant movement, creatures acting independently (the ones here, or ones the latest chat shows coming) and divine or supernatural forces - including what they do in answer to the latest message. Do not describe or suggest anything the player character does, thinks or feels. If the chat shows creatures or people arriving that are not listed as here, name them with an ENTERS line below. Someone may turn up only if the story calls for it - do not invent a companion just to have someone to talk to.'
        : `what the people around ${userName} want, feel toward one another and are likely to do about it - woven together, not person by person. Give each of them an agenda of their own and show it moving: in this reply at least one of them takes the initiative - starts something, presses their own plan, pursues what they want, or acts on someone else - without waiting to be asked. They answer ${userName} only as far as it serves their own aims.`;
    parts.push(
        '',
        'WRITE THE BRIEFING',
        `In a few paragraphs of natural prose (no headings, lists or tables), tell the narrator where things stand now that ${userName} has spoken${alone ? `. ${people}` : `, and ${people}`} Let the place come through in a few concrete details of what can be seen, heard or smelled, and anything here that matters now. Draw on everything above that bears on this moment - factions, lore, events, threads and the other entries - but fold each into the narrative in a few words where it matters; never list them, and leave out what does not touch this moment. Vary how you open; do not start with a stock phrase.`,
        'If someone not here (OTHERS WHO COULD TURN UP) has a plan that will matter soon, say in a sentence what they are doing about it off-screen.',
        'End with a paragraph that begins "Next:" saying where this reply should probably go - one or two natural developments driven by what the other characters want, as direction rather than a script, leaning toward an open thread when it fits.',
        'Keep it under 400 words in all.',
    );
    if (input.askNow) {
        parts.push(
            '',
            'The story\'s clock is only now starting. On its own line, the time of day it is in the story as of the latest message - dawn, morning, midday, afternoon, evening, night or late night, or a clock time like 21:30 - from what the messages say or show (light, meals, lamps, sleep); "unknown" if they give no clue:',
            'NOW | evening',
        );
    }
    if (input.timeKeeping !== false) {
        parts.push(
            '',
            'After the briefing, on its own line, how much in-story time this reply will cover from the latest message on:',
            'TIME | 5 minutes | why',
            'A few minutes for talk; longer when people travel, wait, work or sleep, or when the scene moves on (a duration like "2 hours" or "3 days", or a time of day like "the next morning"). A journey along one of the ways on takes its travel time. Follow any time skip the latest message asks for.',
            '',
            `Only if the story needs the weather to change now (a storm rolling in that the plot calls for), a line naming the new weather from these: ${WEATHER_VALUES.join(', ')}.`,
            'WEATHER | Rainy, Windy | why',
        );
    }
    parts.push(
        '',
        `On its own line, a title of two to five words for the scene as it now stands - ${clean(input.scene?.title) ? `keep "${clean(input.scene.title)}" unless the scene has moved on` : 'it has none yet'}:`,
        'SCENE | The debt comes due',
        'And one sentence on what is going on in the scene as this reply begins - who is doing what, and where:',
        'SITUATION | Remus and Varyn hold the gate while the dead mass below the wall.',
        '',
        `The scene always follows ${userName}. If the latest message takes ${userName} somewhere else - leaving the room, walking out, going to another place - never write LEAVES for ${userName}; write a line naming where the scene is now (one of the ways on when it fits), who goes along with ${userName} (or "none"), and whether it is indoors or outdoors. Everyone else stays behind.`,
        'MOVE | Place name | Name, Name | outdoors',
        '',
        'If someone or something known - a person, or a creature such as the zombies - arrives or leaves in this reply, a line for each. ENTERS also for anyone the latest chat shows in the scene who is not under WHO IS HERE (someone who came back, or was there all along):',
        'ENTERS | Name',
        'LEAVES | Name',
        '',
        'If the latest chat gives a name to someone listed with "no name yet", a line for each (only the name the story gives - never one of your own):',
        'RENAME | The Eyepatched Man | Korrin',
    );
    if (creating) {
        parts.push(
            '',
            'Anything your briefing relies on that the facts above do not have - a place the characters are about to go to, a person, creature or group about to matter, a piece of lore or history, an event that is happening or coming - give it its details, mention it in the briefing, and add one line per thing (at most two). The last part says what it is TIED to: a person, place, faction or thread named above (by name), or the message that brought it up:',
            'NEW location | Name | one-sentence description | tied to',
            'NEW character | Name | one-sentence description | here (or nearby) | tied to',
            'Someone who takes part in the scene - speaks, acts, is spoken to, or is singled out by a description - but has no name yet is a character too: give them a short descriptive name from how the story describes them ("The Eyepatched Man", "The Heavyset Man") and add the word unnamed as the last part. Background crowds ("several others", "the guards") are not.',
            'NEW character | The Eyepatched Man | a man with crooked teeth and an eyepatch | here | unnamed',
            'NEW creature | Name | one-sentence description | tied to',
            'NEW faction | Name | one-sentence description | tied to',
            'NEW lore | Name | one-sentence description | tied to',
            'NEW event | Name | one-sentence description | tied to',
            'NEW quest | Name | what it asks of the characters | tied to',
            'NEW scene | Name | one-sentence description | tied to',
            'Items are different: a named item takes on weight and pulls the story toward it. Describe ordinary objects in the prose only. Add an item only when it is a real plot point or something an open thread needs, and say which:',
            'NEW item | Name | one-sentence description | the thread or plot point it serves',
            'Most replies need no NEW lines. Never add something at random or just for colour, and never add something that already exists above. Only when the story needs a new plot point may you invent one - and then it must grow out of what is above (tie it to a person, place, faction or thread by name), fit the setting and its rules, and be named in your briefing.',
        );
    } else {
        parts.push('', 'Use only the places, people, creatures, factions, lore, events, quests and items named above; do not invent new named ones.');
    }
    return { system, prompt: parts.join('\n') };
}

// The briefing's two parts: the summary (where things stand, the people,
// what to show) and the direction (where this reply should go). Models do
// not always write the "Next:" marker as asked, so it is read leniently:
//   1. a marker at the start of a line or sentence - "Next:", "Next steps -",
//      "What happens next:", "Direction:", "Where this reply should go:",
//      "Going forward,", bold or not;
//   2. else, with two or more paragraphs, the last one;
//   3. else, in a single paragraph, from the first sentence in its second half
//      that reads as direction ("Then...", "Soon...", "This reply should...",
//      "Let...", "Have...") to the end.
// Otherwise there is no direction (the whole is the summary).
const MARKER = /(^|\n|(?<=[.!?…]["')\]]?[ \t]+))[ \t]*\**[ \t]*(?:next(?: steps?| up| beat)?|what (?:should |might |could )?happens? next|direction|where (?:this|the) (?:reply|scene|story) (?:should )?go(?:es)?(?: next)?|going forward|moving forward|from here)\**[ \t]*(?:[:\-–—]|,(?=\s))\**[ \t]*/i;
const CUE = /^(?:next|then|soon|before long|from here|shortly|presently|this reply should|the reply should|the narrator should|let\b|have\b|perhaps\b|it would be natural|a natural next)/i;

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function splitNote(note) {
    const text = String(note ?? '').trim();
    if (!text) return { summary: '', direction: '' };
    const m = text.match(MARKER);
    if (m) {
        const direction = text.slice(m.index + m[0].length).trim();
        const summary = text.slice(0, m.index).trim();
        if (direction) return { summary, direction: capitalize(direction) };
    }
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length >= 2) return { summary: paragraphs.slice(0, -1).join('\n\n'), direction: paragraphs.at(-1) };
    const sentences = text.match(/[^.!?…]+(?:[.!?…]+["')\]]?|$)\s*/g) ?? [text];
    for (let i = Math.max(1, Math.floor(sentences.length / 2)); i < sentences.length; i++) {
        if (CUE.test(sentences[i].trim())) {
            return { summary: sentences.slice(0, i).join('').trim(), direction: capitalize(sentences.slice(i).join('').trim()) };
        }
    }
    return { summary: text, direction: '' };
}

// The model's reply -> { note, summary, direction, created: [{ kind, name, description, here }],
//   time: { text, why } | null, enters: [name], leaves: [name] }.
// Lenient: strips fences, headings and preambles; NEW lines may appear
// anywhere and are removed from the note.
export function parseDirectorNote(raw) {
    let text = String(raw ?? '').replace(/```[a-z]*\n?/gi, '').replace(/\r/g, '');
    const created = [];
    const seen = new Set();
    const keep = [];
    let time = null;
    let weather = null;
    let scene = '';
    let situation = '';
    let move = null;
    let now = '';
    const renames = [];
    const enters = [];
    const leaves = [];
    for (const line of text.split('\n')) {
        const t = line.match(/^\s*(?:[-*]\s*)?\**TIME\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*(.*?)\s*)?$/i);
        if (t) {
            if (!time) time = { text: clean(t[1]).replace(/^["']|["']$/g, ''), why: clean(t[2]) };
            continue;
        }
        const sc = line.match(/^\s*(?:[-*]\s*)?\**SCENE\**\s*:?\s*\|\s*(.+?)\s*$/i);
        if (sc) {
            if (!scene) scene = shortTitle(clean(sc[1]));
            continue;
        }
        const st = line.match(/^\s*(?:[-*]\s*)?\**SITUATION\**\s*:?\s*\|\s*(.+?)\s*$/i);
        if (st) {
            if (!situation) situation = clean(st[1]).replace(/^["'*]+|["'*]+$/g, '').slice(0, 300);
            continue;
        }
        const wx = line.match(/^\s*(?:[-*]\s*)?\**WEATHER\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*(.*?)\s*)?$/i);
        if (wx) {
            const values = wx[1].split(/[,/]| and /i).map((v) => clean(v).toLowerCase()).map((v) => WEATHER_VALUES.find((w) => w.toLowerCase() === v)).filter(Boolean);
            if (!weather && values.length) weather = { values: [...new Set(values)], why: clean(wx[2]) };
            continue;
        }
        const nw = line.match(/^\s*(?:[-*]\s*)?\**NOW\**\s*:?\s*\|\s*(.+?)\s*$/i);
        if (nw) {
            if (!now) now = clean(nw[1]).replace(/^["'*]+|["'*.]+$/g, '');
            continue;
        }
        const mv = line.match(/^\s*(?:[-*]\s*)?\**MOVE\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*([^|]*?)\s*)?$/i);
        if (mv) {
            const place = clean(mv[1]).replace(/^["'*]+|["'*.]+$/g, '');
            if (!move && place) {
                const along = /^(none|no one|nobody|alone|-)?$/i.test(clean(mv[2])) ? [] : clean(mv[2]).split(/,| and /i).map((n) => clean(n).replace(/^["'*]+|["'*.]+$/g, '')).filter(Boolean);
                const io = clean(mv[3]).toLowerCase();
                move = { place, along, indoor: /^in/.test(io) ? true : /^out/.test(io) ? false : null };
            }
            continue;
        }
        const rn = line.match(/^\s*(?:[-*]\s*)?\**RENAME\**\s*:?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*$/i);
        if (rn) {
            const from = clean(rn[1]).replace(/^["'*]+|["'*.]+$/g, '');
            const to = clean(rn[2]).replace(/^["'*]+|["'*.]+$/g, '');
            if (from && to && from.toLowerCase() !== to.toLowerCase()) renames.push({ from, to });
            continue;
        }
        const step = line.match(/^\s*(?:[-*]\s*)?\**(ENTERS|LEAVES)\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|.*)?$/i);
        if (step) {
            const name = clean(step[2]).replace(/^["'*]+|["'*]+$/g, '');
            if (name) (step[1].toUpperCase() === 'ENTERS' ? enters : leaves).push(name);
            continue;
        }
        const m = line.match(/^\s*(?:[-*]\s*)?\**NEW\**\s*:?\s*([a-z]+)\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*([^|]*?)\s*)?(?:\|\s*([^|]*?)\s*)?$/i);
        if (m) {
            const kind = newKind(m[1]);
            const name = clean(m[2]).replace(/^["'*]+|["'*]+$/g, '');
            if (kind && name && !seen.has(name.toLowerCase()) && created.length < MAX_NEW) {
                seen.add(name.toLowerCase());
                // A character's fourth part says where they are; its fifth, and
                // every other kind's fourth, what it is tied to.
                const isPerson = kind === 'character';
                const where = isPerson && /^(here|nearby|elsewhere|later|present|away)\b/i.test(clean(m[4])) ? clean(m[4]) : '';
                const why = clean(isPerson ? (where ? m[5] : m[4]) : m[4]);
                // "unnamed": known by a description until the story names them.
                const provisional = isPerson && /^(unnamed|no name|nameless|provisional)\b/i.test(why);
                created.push({ kind, name, description: clean(m[3]), here: isPerson ? !/nearby|elsewhere|later|away/i.test(where) : true, why: provisional ? '' : why, ...(provisional ? { provisional: true } : {}) });
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
    return { note: text, ...splitNote(text), created, time, weather, scene, situation, move, now, enters: [...new Set(enters)], leaves: [...new Set(leaves)], renames };
}
