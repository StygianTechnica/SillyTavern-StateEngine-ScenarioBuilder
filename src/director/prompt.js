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

import { creatureLabel } from '../library/creature-form.js';
import { WEATHER_VALUES } from '../store/schema.js';
import { lookLines } from '../library/world-options.js';
import { shortTitle } from '../validate/drift.js';
import { unknownsLines } from './perspective.js';

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
    // A known place inside a longer name ("Niamh's fortress gate chamber"
    // is Niamh's fortress gate): the longest such name wins.
    const within = ranked
        .map((p) => ({ p, len: Math.max(0, ...[p.name, ...(p.aliases ?? p.base?.aliases ?? [])].map(bareName).filter((n) => n.length >= 5 && target.includes(n)).map((n) => n.length)) }))
        .filter((x) => x.len > 0)
        .sort((a, b) => b.len - a.len)[0];
    if (within) return within.p;
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

// A name as compared across the library: case, a leading article, quotes
// and a possessive aside ("The Bleakfast" = "bleakfast").
const sameNameKey = (name) => clean(name).toLowerCase().replace(/^["“”]+|["“”]+$/g, '').replace(/[’']s$/, '').replace(/["'’]/g, '').trim().replace(/^(the|a|an)\s+/, '');

// The library entry - of ANY type - already called `name` (its name or an
// alias), or null. The director never makes a second thing of the same
// name: "The Bleakfast", an event it was shown, is not a new place.
// known: [{ id, type?, name, aliases }].
export function knownAs(name, known) {
    const key = sameNameKey(name);
    if (!key) return null;
    return (known ?? []).find((e) => [e.name, ...(e.aliases ?? e.base?.aliases ?? [])].some((n) => typeof n === 'string' && sameNameKey(n) === key)) ?? null;
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
export function alsoRelevant(entries, { recentText = '', sceneIds = [], covered = new Set(), typeLabel = (t) => t, placeName = () => '' } = {}, max = 10) {
    const scene = new Set(sceneIds);
    const out = [];
    for (const e of entries ?? []) {
        if (!clean(e?.name) || covered.has(e.id) || covered.has(clean(e.name).toLowerCase()) || scene.has(e.id)) continue;
        const named = [e.name, ...(e.aliases ?? e.base?.aliases ?? [])].some((n) => mentionedWhole(recentText, n));
        const record = e.base ?? e;
        const tied = Object.entries(record).some(([k, v]) => k !== 'id' && (Array.isArray(v) ? v : [v]).some((x) => typeof x === 'string' && scene.has(x)));
        if (!named && !tied) continue;
        // Whether it is somewhere else (an item kept at a far-off place):
        // the narrator is told only that it is not here - never where, which
        // may be a secret (who knows it is the secrets' business).
        const at = Object.entries(record).filter(([k]) => k !== 'id').flatMap(([, v]) => (Array.isArray(v) ? v : [v])).find((x) => typeof x === 'string' && x.startsWith('loc_') && !scene.has(x));
        const where = at && e.type !== 'location' ? clean(placeName(at)) : '';
        out.push({ name: clean(e.name), type: typeLabel(e.type), description: cut(record.description ?? e.description ?? '', 140), why: named ? 'named in the chat' : 'tied to this place or someone here', ...(where ? { where } : {}), rank: named ? 0 : 1 });
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
        list('Ways on', [...(loc.places ?? []), ...(loc.routes ?? []).map((r) => ({ name: r.name, description: [r.travel && `${r.travel} away`, r.note].filter(Boolean).join(', ') })), ...(loc.partOf ? [{ name: `back out to ${clean(loc.partOf.name)}` }] : [])]);
        list('Further on', (loc.further ?? []).map((f) => ({ name: f.name, description: `by way of ${clean(f.via)}` })));
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
        for (const x of relevantEntries) lines.push(`- ${clean(x.name)}${clean(x.type) ? ` (${clean(x.type).toLowerCase()})` : ''}${clean(x.where) ? ' - kept somewhere else, not here' : ''}${clean(x.description) ? `: ${bare(x.description)}` : ''}`);
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
            clean(c.voice) && `voice and mannerisms: ${cut(c.voice, 200)}`,
            clean(c.goals) && `wants: ${cut(c.goals, 200)}`,
            clean(c.gifts) && cut(c.gifts, 220),
            clean(c.mood) && `mood: ${clean(c.mood)}`,
            clean(c.intent) && `intends: ${cut(c.intent, 160)}`,
            clean(c.thought) && `thinking: ${cut(c.thought, 160)}`,
            ...(c.relations ?? []).map((r) => cut(r, 140)),
            ...(c.knows ?? []).map((k) => `knows: ${cut(k, 160)}`),
            ...[...(c.sworn ?? []), ...(c.owed ?? [])].map((k) => cut(k, 160)),
        ].filter(Boolean).map(bare);
        lines.push(`- ${clean(c.name)}${c.provisional ? ' (no name yet - known by this description)' : ''}${bits.length ? `: ${bits.join('; ')}` : ''}`);
    }
    if (cast.length && cast.every((c) => c.player)) lines.push('- No one else is here.');
    // The creatures: those in the scene act; those that only live here are
    // not seen until the story brings them in (an ENTERS line).
    const creatures = (loc?.creatures ?? []).filter((x) => clean(x?.name));
    if (creatures.length) {
        section('CREATURES HERE (they act by instinct and nature, not by plans or speeches)');
        for (const x of creatures.slice(0, 10)) {
            const bits = [
                cut(x.description, 300),
                clean(x.traits) && `traits: ${cut(x.traits, 160)}`,
                clean(x.danger) && `danger: ${clean(x.danger)}`,
                clean(x.state) && `now: ${cut(x.state, 160)}`,
            ].filter(Boolean).map(bare);
            const where = x.active === false ? ' [lives here - lurking, unseen; not in the scene unless the story brings it in]' : ' [in the scene]';
            // A kind in numbers ("3 Zombies"), one being by its name.
            const label = x.active === false ? clean(x.name) : creatureLabel(x.name, { form: x.form, count: x.count });
            const kind = x.form === 'kind' ? ' (a kind - its numbers count down as they fall)' : '';
            lines.push(`- ${label}${where}${kind}${bits.length ? `: ${bits.join('; ')}` : ''}`);
        }
    }
    // Gods, spirits and forces that bear on this reply (src/library/powers.js).
    if (clean(input.powersText)) {
        section('POWERS AT WORK (gods and forces with no body - never here in person; they act through omens, a voice, visions or dreams, and blessings on those tied to them)');
        lines.push(String(input.powersText).trim());
    }
    // Who has died in this story (src/state/death.js).
    if (clean(input.deadText)) { section('THE DEAD (gone for good - they can be mourned, remembered or spoken of, never shown alive, speaking or acting - unless the latest chat itself brings one back: RISES)'); lines.push(clean(input.deadText)); }
    // The fight as Scenario Builder keeps it (src/director/fight.js).
    if (clean(input.fightFacts)) { section('THE FIGHT SO FAR'); lines.push(clean(input.fightFacts)); }
    // A structured event under way - its current stage only (src/events/).
    if (clean(input.eventFacts)) { section('THE EVENT (a fixed programme - this stage only)'); lines.push(clean(input.eventFacts)); }
    if (input.secrets?.length) {
        section('SECRETS AND OATHS (people act only on what they know)');
        for (const r of input.secrets.slice(0, 8)) lines.push(`- ${r}`);
    }
    const unknown = unknownsLines(input.unknowns);
    if (unknown.length) { section(unknown[0]); lines.push(...unknown.slice(1)); }
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
    // Far away, or not seen in a long while (src/director/whereabouts.js).
    const away = (input.elsewhere ?? []).filter((c) => clean(c?.name) && !absentSet.has(clean(c.name).toLowerCase()));
    if (away.length) {
        section('ELSEWHERE (far from here or long out of the story - they cannot turn up in this scene; they can be thought of or talked about, and send word only if the story has set that up)');
        lines.push(`- ${away.slice(0, 16).map((c) => `${clean(c.name)}${clean(c.lastAt) ? ` (last at ${clean(c.lastAt)})` : ''}`).join('; ')}`);
    }
    return lines.join('\n').trim();
}

// input: the guidance input plus { messages: [{ name, text, isUser }],
//   userName, previousNote, memories, limits, allowCreate, canonOnly }
// -> { system, prompt }
export function buildDirectorPrompt(input) {
    const userName = clean((input.cast ?? []).find((c) => c.player)?.name) || clean(input.userName) || 'the player';
    const creating = input.allowCreate && !input.canonOnly;
    // Where the scene is, pinned: the model must not rename it or slide it
    // into somewhere the notes mention (a faction's home, another town).
    const path = (input.location?.path ?? []).map(clean).filter(Boolean);
    const here = path[path.length - 1] ?? '';
    const system = [
        'You are the game master of an ongoing roleplay. You do not write the story yourself: another writer (the narrator) writes the next reply.',
        'Your job is to brief that narrator before it writes, in plain narrative prose, so its reply is grounded in the actual state of the scene and moves the story forward sensibly.',
        `${userName} is the player character, played by a human. Never decide or suggest what ${userName} says, does, thinks, feels or will do next, and do not describe the scene through ${userName}'s eyes; brief the narrator on the other characters and the world, which react to ${userName}.`,
        `${userName} is never the subject of your sentences - not even a small gesture, a glance or a passing thought ("${userName} tightens his grip", "${userName}'s thoughts drift" are forbidden). Write what the others do to, at or around ${userName} instead ("Graxx fixes his gaze on ${userName}").`,
        input.ahead ? `You are writing ahead: ${userName}'s next message is not known yet. Never assume or guess what ${userName} will say or do; brief the narrator on what the others want and will do next, and what the world does next, so the reply can follow whatever ${userName} does.` : '',
        'Never contradict the facts you are given. Only use what fits the world\'s rules.',
        here ? `The scene is at ${here}${path.length > 1 ? ` (${path.join(' > ')})` : ''}: call it by that name. Other places named in these notes - a faction's home, another settlement, somewhere the story only talked about - are elsewhere; the scene never moves there or takes their name unless a MOVE line takes it there.` : '',
        'Something that is somewhere else - a far-off place, an object kept elsewhere, a goal that needs a journey - can be talked about, worried over or planned for, but it cannot be reached, found or used in this scene until the story actually travels there. Keep the people busy with what is in front of them here.',
        `Never loop: each reply must change something that stays changed - ground taken or lost, someone down, a foe broken, a turn in the plan. Do not answer ${userName} with the same threat again (fresh waves of the same enemies, "one more time", "it is not over yet"). A fight or ordeal builds to a turn and then ends within a few replies - the enemy breaks, flees, falls or wins - and when ${userName} has spent everything or is down, the others carry it through or the story moves on; never press ${userName} to push past their limits again.`,
        'People act as the story has shown them: never give someone a betrayal, an attack or a hidden scheme the story has not set up.',
        `In a fight, a contest or any clash, you are the referee for everyone but ${userName}: decide how each action between the others turns out and state it as settled - who strikes, whether it lands, what it does (a wound, a crack in armour, a limb that will not bear weight, ground given), and what the one struck does in answer. "Varyn's blade finds the joint behind its knee; the leg buckles and it lurches sideways" - never "Varyn may try to strike its joints". An opponent here acts every reply - it attacks, presses, shrugs off a blow or uses what it is - it is never a still target. For a blow aimed at ${userName}, say what it is and what it threatens as it comes; how ${userName} meets it is ${userName}'s to say.`,
        'People know only what they saw, heard or were told: what happens inside someone - thoughts, dreams, visions, unspoken feelings - is theirs alone; others see only outward signs and learn the rest only if told. A secret stays hidden from those who do not know it - they never act on it, hint at it or guess it - unless the story reveals it in front of them; an oath binds those who swore it.',
        clean(input.overview?.gmStyle) ? `How the user wants this story run - follow it: ${cut(input.overview.gmStyle, 800)}` : '',
    ].filter(Boolean).join(' ');

    // General to immediate: the world, the scene, then the latest chat and
    // the last briefing, then what to write.
    const recent = (input.messages ?? []).slice(-8).map((m) => `${clean(m.name) || (m.isUser ? userName : 'Narrator')}: ${cut(m.text, input.messageChars ?? 900)}`).join('\n\n');
    // The planner's private plan (src/planner/): after the world, before the chat.
    const plan = String(input.gmPlan ?? '').trim();
    const parts = [dossierText(input), ...(plan ? ['', plan] : []), '', 'THE LATEST CHAT', recent || '(the story has not started yet)'];
    if (clean(input.previousNote)) parts.push('', 'YOUR LAST BRIEFING (move on from it; do not repeat what has already happened)', cut(input.previousNote, 1200));
    // With no one but the player present there are no people to brief on:
    // the world itself must answer, or the reply has nothing to do.
    const castHere = (input.cast ?? []).filter((c) => clean(c?.name));
    // State Engine's tracker having someone else here means the cast is behind, not empty.
    const alone = !input.othersTracked && castHere.some((c) => c.player) && castHere.every((c) => c.player);
    const people = alone
        ? 'No NPCs are present, so the reply is not empty: the world itself reacts. Brief the narrator ONLY on the environment, the weather, sounds, smells, distant movement, creatures acting independently (the ones here, or ones the latest chat shows coming) and divine or supernatural forces - including what they do in answer to the latest message. Do not describe or suggest anything the player character does, thinks or feels. If the chat shows creatures or people arriving that are not listed as here, name them with an ENTERS line below. Someone may turn up only if the story calls for it - do not invent a companion just to have someone to talk to.'
        : `what the people around ${userName} want, feel toward one another and are likely to do about it - woven together, not person by person. Give each of them an agenda of their own and show it moving: in this reply at least one of them takes the initiative - starts something, presses their own plan, pursues what they want, or acts on someone else - without waiting to be asked. They answer ${userName} only as far as it serves their own aims.`;
    // Creatures in the scene act too, NPCs or not - by their nature, unasked.
    const activeCreatures = (input.location?.creatures ?? []).filter((x) => clean(x?.name) && x.active !== false).map((x) => creatureLabel(x.name, { form: x.form, count: x.count }));
    const creatureTask = activeCreatures.length
        ? `The creatures in the scene (${activeCreatures.join(', ')}) act on their own in this reply, by their nature and without waiting to be provoked: a predator stalks, tests and strikes; a scavenger circles; the undead press in; a frightened animal bolts or turns at bay; a mount shies. Say what each does now and how it changes the scene - a dangerous one that is active is never just background; it closes in, attacks, blocks the way or forces a choice. They act on instinct and hunger, not on plans, speeches or schemes the story has not set up, and act on ${userName} only from the outside.`
        : '';
    parts.push(
        '',
        'START WITH THE FORMAT LINES: write them first, at the very top of your reply, each on its own line, before the briefing. They are filled in only when they apply. Replace each <...> with the real value; never copy a <...> or an example, and never write "none" for a line that does not apply - leave the line out entirely.',
    );
    if (input.askNow) {
        parts.push(
            '',
            'The story\'s clock is only now starting. On its own line, the time of day it is in the story as of the latest message - dawn, morning, midday, afternoon, evening, night or late night, or a clock time like 21:30 - from what the messages say or show (light, meals, lamps, sleep); "unknown" if they give no clue:',
            'NOW | <dawn, morning, midday, afternoon, evening, night, late night or a clock time>',
        );
    }
    if (input.timeKeeping !== false) {
        parts.push(
            '',
            'On its own line, how much in-story time this reply will cover from the latest message on:',
            'TIME | <how long, e.g. 5 minutes> | <why>',
            'A few minutes for talk; longer when people travel, wait, work or sleep, or when the scene moves on (a duration like "2 hours" or "3 days", or a time of day like "the next morning"). A journey takes its travel time - to somewhere further on, the time of every way on it passes along. Follow any time skip the latest message asks for - waking someone for the next watch, or sleeping, means hours have passed (to dawn, or "the next morning", when the night is late).',
            '',
            `Only if the story needs the weather to change now (a storm rolling in that the plot calls for), a line naming the new weather from these: ${WEATHER_VALUES.join(', ')}.`,
            'WEATHER | <values from the list> | <why>',
        );
    }
    parts.push(
        '',
        `On its own line, a title of two to five words for the scene as it now stands - ${clean(input.scene?.title) && !isPlaceholder(input.scene.title) ? `keep "${clean(input.scene.title)}" unless the scene has moved on` : 'it has none yet'}:`,
        'SCENE | <a title of two to five words>',
        `And one sentence on what is going on in the scene as this reply begins - what the others are doing, and where (never what ${userName} does):`,
        'SITUATION | <one sentence: who of the others is doing what, and where>',
        '',
        `The scene always follows ${userName}. Only if the latest message takes ${userName} somewhere else - leaving the room, walking out, going to another place - never write LEAVES for ${userName}; write a line naming where the scene is now, who goes along with ${userName} (or "none"), and whether it is indoors or outdoors. Everyone else stays behind.`,
        `A journey goes straight to where ${userName} is heading, even when it is further on: the MOVE line names that place, not a road or a stop on the way, and the TIME line covers the whole journey. A journey where nothing happens passes in a few sentences that sum up the road. ${input.travelAtNight ? 'The party travels on through the night when the journey runs past dusk: the TIME line covers the whole of it.' : 'If it runs on past dusk, the party makes camp for the night and goes on in the morning: the TIME line covers the night as well (to "the next morning", or later).'} Stop somewhere on the way only when the latest message stops there, or for a real turn in the story (an ambush, a discovery, someone met) - never to drag the trip out with talk.`,
        'MOVE | <the place the scene is in now> | <who goes along, comma-separated, or none> | <indoors or outdoors>',
        '',
        'If someone or something known - a person, or a creature such as the zombies - arrives or leaves in this reply, a line for each. ENTERS also for anyone the latest chat shows in the scene who is not under WHO IS HERE (someone who came back, or was there all along). For creatures of a kind, say how many (ENTERS | 3 zombies; LEAVES | 2 zombies):',
        'ENTERS | <name>',
        'LEAVES | <name>',
        '',
        `While there is a fight, a line for every fighter but ${userName} - each foe, and each ally who fights - saying how they stand once this reply is done. The condition is one of: unhurt, hurt, wounded, badly wounded, failing, down, fled (or won, for a foe that has beaten the others). It never gets better unless the story heals it, and blows that land make it worse: a foe struck again and again does not stay unhurt. Leave these lines out when no one is fighting:`,
        'FIGHT | <name> | <condition> | <foe or ally>',
        '',
        `If someone other than ${userName} dies in this reply - killed, not just beaten, wounded or knocked out - a line for each, with how in a few words; for creatures of a kind, how many fell (DIES | 2 zombies | cut down by Varyn). The dead stay dead:`,
        'DIES | <name> | <how>',
        ...(clean(input.deadText) ? [
            '',
            `Only if the latest chat itself brings back someone under THE DEAD - resurrected, raised as undead, revived, or shown never to have died - or a power under POWERS AT WORK brings them back in this reply in its own way (with its POWER line, and the price it demands - bringing back the dead is never free), a line for each. Never on your own, and never because it would suit the story:`,
            'RISES | <name> | <how, a few words>',
        ] : []),
        ...(clean(input.powersText) ? [
            '',
            `A power under POWERS AT WORK may act in this reply - and one whose own champion calls on it does answer - never in person: a sign, a voice, a vision or dream to someone tied to it, or a blessing on its champion (a surge of strength, a ward, a miracle that turns a fight). A power acts only within its own nature and domain, in its own way (a god of fire and chaos restores with flame and ember - it never raises the undead, which is death's work). Anyone may call on a power; it answers only as its nature and the story warrant, or stays silent. A power answering a call - above all from someone not its own - may demand a price or a favour in return, sometimes a dire one; the one who called decides whether to pay. It never acts for ${userName} or decides what ${userName} does. If one acts, a line (the price only when it demands one, naming who owes it):`,
            'POWER | <its name> | <what it did, a few words> | <its price, e.g. Remus must bring it the sword>',
        ] : []),
        '',
        'If the latest chat gives a name to someone listed with "no name yet", a line for each (only the name the story gives - never one of your own):',
        'RENAME | <the descriptive name> | <the name the story gives>',
    );
    if (/\[m\d+\]/.test(plan)) {
        parts.push(
            '',
            'For a coming moment from the GM PLAN that this reply plays out, or that can no longer happen where the story has gone, a line each (its id as given, e.g. m2):',
            'BEAT | <moment id> | done | <how it plays out, a few words>',
            'BEAT | <moment id> | skipped | <why, a few words>',
        );
    }
    if (creating) {
        parts.push(
            '',
            'Anything your briefing relies on that the facts above do not have - a place the characters are about to go to, a person, creature or group about to matter, a piece of lore or history, an event that is happening or coming - give it its details, mention it in the briefing, and add one line per thing (at most two). The last part says what it is TIED to: a person, place, faction or thread named above (by name), or the message that brought it up:',
            'NEW location | <name> | <one-sentence description that says where it is - a room or part of the place the scene is in names that place> | <tied to>',
            'NEW character | <name> | <one-sentence description> | <here or nearby> | <tied to>',
            'Someone who takes part in the scene - speaks, acts, is spoken to, or is singled out by a description - but has no name yet is a character too: give them a short descriptive name from how the story describes them ("The Eyepatched Man", "The Heavyset Man") and add the word unnamed as the last part. Background crowds ("several others", "the guards") are not.',
            'NEW character | <descriptive name, e.g. The Eyepatched Man> | <one-sentence description> | here | unnamed',
            'Someone the latest chat gives a name to - introduced, described, sent for or picked for a task ("Kael and Arin will go with you") - and who is not listed above is a character too, here or not: add them with what the chat says of them, "nearby" when they are not in the scene. This is not inventing; they already exist in the story.',
            'NEW creature | <name> | <one-sentence description> | <tied to>',
            'A named animal - a pet, a mount, a hound, a beast companion - is a creature, however dear to someone. Only one that talks and thinks like a person (a sentient familiar, a dragon, a bound spirit) is a character.',
            'NEW faction | <name> | <one-sentence description> | <tied to>',
            'A faction is a group with a name of its own (the Graveborn Compact, the Ravagers) - never a sentence about who serves, follows or worships whom: that is a relationship, not a new thing.',
            'NEW lore | <name> | <one-sentence description> | <tied to>',
            'NEW event | <name> | <one-sentence description> | <tied to>',
            'NEW quest | <name> | <what it asks of the characters> | <tied to>',
            'NEW scene | <name> | <one-sentence description> | <tied to>',
            'Items are different: a named item takes on weight and pulls the story toward it. Describe ordinary objects in the prose only. Add an item only when it is a real plot point or something an open thread needs, and say which:',
            'NEW item | <name> | <one-sentence description> | <the thread or plot point it serves>',
            'Most replies need no NEW lines. Never add something at random or just for colour, and never add something that already exists above. Only when the story needs a new plot point may you invent one - and then it must grow out of what is above (tie it to a person, place, faction or thread by name), fit the setting and its rules, and be named in your briefing.',
        );
    } else {
        parts.push('', 'Use only the places, people, creatures, factions, lore, events, quests and items named above; do not invent new named ones.');
    }
    // Format lines first: a reply that runs long or drifts into telling the
    // story is cut off at the end, and the lines must survive that.
    parts.push(
        '',
        'THEN WRITE THE BRIEFING',
        `After the format lines, in a few paragraphs of natural prose (no headings, lists or tables), tell the narrator where things stand ${input.ahead ? `as ${userName}'s turn comes` : `now that ${userName} has spoken`}${alone ? `. ${people}` : `, and ${people}`}${creatureTask ? ` ${creatureTask}` : ''} Let the place come through in a few concrete details of what can be seen, heard or smelled, and anything here that matters now. Draw on everything above that bears on this moment - factions, lore, events, threads and the other entries - but fold each into the narrative in a few words where it matters; never list them, and leave out what does not touch this moment. Vary how you open; do not start with a stock phrase.`,
        'If someone not here (OTHERS WHO COULD TURN UP) has a plan that will matter soon, say in a sentence what they are doing about it off-screen.',
        ...(unknownsLines(input.unknowns).length ? ['Where someone here does not know something that bears on this moment (WHAT EACH PERSON DOES NOT KNOW), say so plainly in the briefing, with what they did see instead (e.g. "Varyn did not see the vision - he only saw Remus sleep restlessly"), so the narrator never has them speak of it.'] : []),
        `End with a paragraph that begins "Next:" saying where this reply should probably go - one or two natural developments driven by what the other characters want${activeCreatures.length ? ' and what the creatures here do' : ''}, as direction rather than a script, leaning toward an open thread when it fits. In a fight, "Next:" names what the opponents do and how each exchange between the others ends (the arrow takes it in the shoulder; the blow to its knee drops it to one knee) - never "will likely" or "may try".`,
        'This is a briefing, not the story: never write the reply itself - no lines of dialogue in quotes, no narrating it as it happens. Say what people want and are likely to do - and in a fight, what they do and how it turns out - and let the narrator write it.',
        'Keep it under 400 words in all.',
    );
    return { system, prompt: parts.join('\n') };
}

// The director's sentences with the player character as their subject
// ("Remus tightens his grip", "As the rain falls, Remus's thoughts drift",
// "Remus and Varyn hold the gate") taken out: whatever the director is
// told, a small model narrates the player character now and then, and the
// narrator copies what it reads. Sentences where others act on them stay
// ("Graxx fixes his gaze on Remus"). `names`: how the player character is
// called (callNames). Paragraph breaks are kept.
export function withoutPlayerActions(text, names) {
    const list = [...new Set((names ?? []).map((n) => clean(n)).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
    if (!list.length) return String(text ?? '');
    const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const who = `(?:${list.map(esc).join('|')})`;
    // Optional lead-in ("As the rain falls, " / "Meanwhile, "), then the
    // player character (or "X and Y") as the subject, or their thoughts,
    // eyes, hands...
    const subject = new RegExp(`^["'*\\s]*(?:[^.!?,;:]{0,120},\\s+)?(?:(?:${who})(?:['\u2019]s\\s+\\w+)?|\\w+\\s+and\\s+${who}|${who}\\s+and\\s+\\w+)\\b(?!['\u2019])`, 'iu');
    // Their inner life, told through a lead-in: "But for Remus, the battle
    // brought fear", "To Remus, it felt...", "Inside Remus's mind, ...".
    const inner = new RegExp(`^["'*\\s]*(?:(?:but|and|yet|still)\\s+)?(?:for|to|within|inside|in)\\s+${who}(?:['\u2019]s\\s+\\w+)?\\s*,`, 'iu');
    // A sentence that only continues one just dropped ("His visions had
    // prepared him", "He turns to Niamh") goes with it.
    const pronoun = /^["'*\s]*(?:he|she|they|his|her|their|him|them)\b/i;
    return String(text ?? '').split(/(\n\s*\n)/).map((para) => {
        if (/^\n/.test(para)) return para;
        const sentences = para.match(/[^.!?…]+(?:[.!?…]+["'”)\]]*|$)\s*/g) ?? [para];
        let dropping = false;
        return sentences.filter((s) => {
            const t = s.trim();
            const drop = subject.test(t) || inner.test(t) || (dropping && pronoun.test(t));
            dropping = drop;
            return !drop;
        }).join('').trim();
    }).filter((p, i, all) => !(p === '' && /^\n/.test(all[i + 1] ?? '\n'))).join('').replace(/\n{3,}/g, '\n\n').trim();
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

// A line of quoted speech: four words or more between quotes. A briefing
// may quote a name ("the Blackened Bridge"), not dialogue.
const spoken = (text) => (text.match(/["“][^"“”\n]*["”]/g) ?? []).filter((q) => q.trim().split(/\s+/).length >= 4).length;
// The end of a sentence, with any closing quote or bracket.
const SENTENCE_END = /[.!?…]+["'”’)\]]*(?=\s|$)/g;

// A briefing that went wrong, made usable: a small model runs out of
// room mid-sentence, or tells the story (dialogue and all) instead of
// briefing it - the God War chat's #452 did both. Cut off: the unfinished
// sentence at the end goes (a last paragraph with no sentence end at all is
// kept - that is a missing full stop, not a cut). Narrated: two or more lines
// of dialogue; the paragraphs that hold dialogue go, since the narrator
// would copy them as its script, and what is left says where things stand.
// -> { text, flaws: ['cut off', 'narrated'] }.
export function tidyBriefing(note) {
    let text = String(note ?? '').trim();
    const flaws = [];
    if (!text) return { text, flaws };
    if (!/[.!?…]["'”’)\]]*$/.test(text)) {
        const lastPara = text.split(/\n\s*\n/).at(-1);
        const ends = [...lastPara.matchAll(SENTENCE_END)];
        if (ends.length) {
            const last = ends.at(-1);
            text = text.slice(0, text.length - lastPara.length + last.index + last[0].length).trim();
            flaws.push('cut off');
        }
    }
    if (spoken(text) >= 2) {
        flaws.push('narrated');
        const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        const plain = paragraphs.filter((p) => !spoken(p));
        if (plain.length) text = plain.join('\n\n');
        else {
            const sentences = text.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g) ?? [];
            const quiet = sentences.filter((s) => !/["“”]/.test(s)).join('').trim();
            if (quiet) text = quiet;
        }
    }
    return { text, flaws };
}

// A value the model copied from the format instead of filling in: a
// <...> placeholder, "none", or one of the words the format used to show.
const PLACEHOLDER = /^(?:none|n\/?a|null|nothing|no|-+|—|same|unchanged|unknown|not applicable|(?:place|location) ?names?|name of (?:the )?(?:place|location)|names?|name, name|the debt comes due)$/i;
export function isPlaceholder(value) {
    const v = clean(value).replace(/^["'*]+|["'*.]+$/g, '');
    // "[Place name]", "place_name", "Place-Name" are the same template words.
    const bare = clean(v.replace(/^[[({]+|[\])}]+$/g, '').replace(/[_-]+/g, ' '));
    return !v || /[<>]/.test(v) || PLACEHOLDER.test(v) || PLACEHOLDER.test(bare);
}

// A format line, whether or not it could be read - never left in the prose.
const FORMAT_LINE = /^\s*(?:[-*]\s*)?\**(?:TIME|SCENE|SITUATION|WEATHER|NOW|MOVE|ENTERS|ENTERED|ENTERING|ENTER|ARRIVES|ARRIVED|LEAVES|LEFT|LEAVING|LEAVE|EXITS|EXITED|FIGHT|DIES|DIED|RISES|ROSE|REVIVED|REVIVES|POWER|NEW|RENAME|BEAT)\b\**\s*:?\s*(?:[a-z]+\s*)?\|/i;

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
    const beats = [];
    const fights = [];
    const deaths = [];
    const risings = [];
    const powers = [];
    for (const line of text.split('\n')) {
        // POWER | <name> | <what it did> | <its price, if any> (src/library/powers.js)
        const pw = line.match(/^\s*(?:[-*]\s*)?\**POWER\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*([^|]*?)\s*)?$/i);
        if (pw) {
            const name = clean(pw[1]).replace(/^["'*]+|["'*.]+$/g, '');
            const price = isPlaceholder(pw[3]) ? '' : clean(pw[3]).replace(/^(?:price|cost|demands?)\s*[:\-–]\s*/i, '');
            if (name && !isPlaceholder(name) && !/^(none|-)$/i.test(name) && powers.length < 3) powers.push({ name, what: isPlaceholder(pw[2]) ? '' : clean(pw[2]), price: /^(none|nothing|-)$/i.test(price) ? '' : price });
            continue;
        }
        // RISES | <name> | <how> - back from the dead (src/state/death.js)
        const rs = line.match(/^\s*(?:[-*]\s*)?\**(?:RISES|ROSE|REVIVED|REVIVES)\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?$/i);
        if (rs) {
            const name = clean(rs[1]).replace(/^["'*]+|["'*.]+$/g, '');
            if (name && !isPlaceholder(name) && !/^(none|no one|nobody|-)$/i.test(name) && risings.length < 4) risings.push({ name, how: isPlaceholder(rs[2]) ? '' : clean(rs[2]) });
            continue;
        }
        // DIES | <name> | <how> (src/state/death.js)
        const dd = line.match(/^\s*(?:[-*]\s*)?\**DIE[SD]\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?$/i);
        if (dd) {
            const name = clean(dd[1]).replace(/^["'*]+|["'*.]+$/g, '');
            if (name && !isPlaceholder(name) && !/^(none|no one|nobody|-)$/i.test(name) && deaths.length < 6) deaths.push({ name, how: isPlaceholder(dd[2]) ? '' : clean(dd[2]) });
            continue;
        }
        // FIGHT | <name> | <condition> | <foe or ally> (src/director/fight.js)
        const fg = line.match(/^\s*(?:[-*]\s*)?\**FIGHT\**\s*:?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?$/i);
        if (fg) {
            const name = clean(fg[1]).replace(/^["'*]+|["'*.]+$/g, '');
            if (name && !isPlaceholder(name) && !isPlaceholder(fg[2]) && !/^(none|no one|nobody|-)$/i.test(name) && fights.length < 8) fights.push({ name, condition: clean(fg[2]), side: clean(fg[3]) });
            continue;
        }
        const bt = line.match(/^\s*(?:[-*]\s*)?\**BEAT\**\s*:?\s*\|\s*\[?(m\d+)\]?\s*\|\s*(done|skipped)\s*(?:\|\s*(.*?)\s*)?$/i);
        if (bt) {
            if (!beats.some((b) => b.id === bt[1].toLowerCase())) beats.push({ id: bt[1].toLowerCase(), status: bt[2].toLowerCase(), note: bt[3] && !isPlaceholder(bt[3]) ? clean(bt[3]) : '' });
            continue;
        }
        const t = line.match(/^\s*(?:[-*]\s*)?\**TIME\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*(.*?)\s*)?$/i);
        if (t) {
            if (!time && !isPlaceholder(t[1])) time = { text: clean(t[1]).replace(/^["']|["']$/g, ''), why: clean(t[2]) };
            continue;
        }
        const sc = line.match(/^\s*(?:[-*]\s*)?\**SCENE\**\s*:?\s*\|\s*(.+?)\s*$/i);
        if (sc) {
            if (!scene && !isPlaceholder(sc[1])) scene = shortTitle(clean(sc[1]));
            continue;
        }
        const st = line.match(/^\s*(?:[-*]\s*)?\**SITUATION\**\s*:?\s*\|\s*(.+?)\s*$/i);
        if (st) {
            if (!situation && !isPlaceholder(st[1])) situation = clean(st[1]).replace(/^["'*]+|["'*]+$/g, '').slice(0, 300);
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
            if (!now && !isPlaceholder(nw[1])) now = clean(nw[1]).replace(/^["'*]+|["'*.]+$/g, '');
            continue;
        }
        const mv = line.match(/^\s*(?:[-*]\s*)?\**MOVE\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*([^|]*?)\s*)?$/i);
        if (mv) {
            // "Still inside the gate, indoors" is the gate.
            const place = cleanPlaceName(mv[1]);
            if (!move && place && !isPlaceholder(place)) {
                const along = /^(none|no one|nobody|alone|-)?$/i.test(clean(mv[2])) ? [] : clean(mv[2]).split(/,| and /i).map((n) => clean(n).replace(/^["'*]+|["'*.]+$/g, '')).filter((n) => n && !isPlaceholder(n));
                const io = clean(mv[3]).toLowerCase();
                move = { place, along, indoor: /^in/.test(io) ? true : /^out/.test(io) ? false : null };
            }
            continue;
        }
        const rn = line.match(/^\s*(?:[-*]\s*)?\**RENAME\**\s*:?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*$/i);
        if (rn) {
            const from = clean(rn[1]).replace(/^["'*]+|["'*.]+$/g, '');
            const to = clean(rn[2]).replace(/^["'*]+|["'*.]+$/g, '');
            if (from && to && !isPlaceholder(from) && !isPlaceholder(to) && from.toLowerCase() !== to.toLowerCase()) renames.push({ from, to });
            continue;
        }
        // A small model bends the word ("ENTERED | ...", "LEFT | ...").
        const step = line.match(/^\s*(?:[-*]\s*)?\**(ENTERS|ENTERED|ENTERING|ENTER|ARRIVES|ARRIVED|LEAVES|LEFT|LEAVING|LEAVE|EXITS|EXITED)\**\s*:?\s*\|\s*([^|]+?)\s*(?:\|.*)?$/i);
        if (step) {
            const name = clean(step[2]).replace(/^["'*]+|["'*]+$/g, '');
            if (name && !isPlaceholder(name) && !/^(none|no one|nobody|-)$/i.test(name)) (/^(ENTER|ARRIV)/i.test(step[1]) ? enters : leaves).push(name);
            continue;
        }
        const m = line.match(/^\s*(?:[-*]\s*)?\**NEW\**\s*:?\s*([a-z]+)\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*([^|]*?)\s*)?(?:\|\s*([^|]*?)\s*)?$/i);
        if (m) {
            const kind = newKind(m[1]);
            const name = clean(m[2]).replace(/^["'*]+|["'*]+$/g, '');
            if (kind && name && !isPlaceholder(name) && !seen.has(name.toLowerCase()) && created.length < MAX_NEW) {
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
        // A format line that could not be read ("NEW | none") is dropped too.
        if (FORMAT_LINE.test(line)) continue;
        keep.push(line);
    }
    text = keep.join('\n')
        .replace(/^\s*(?:#+\s*)?(?:\**)?(?:gm\s+)?(?:briefing|note|director'?s note)(?:\**)?\s*:?\s*$/gim, '')
        .replace(/^\s*here(?:'s| is) (?:the|my|your) briefing[^\n]*\n/i, '')
        .replace(/^\s*#+\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    const tidy = tidyBriefing(text);
    text = tidy.text;
    // A briefing cut off or told as story lost its "Next:" end; any other
    // paragraph is not direction.
    const parts = tidy.flaws.length && !MARKER.test(text) ? { summary: text, direction: '' } : splitNote(text);
    return { note: text, ...parts, flaws: tidy.flaws, created, time, weather, scene, situation, move, now, enters: [...new Set(enters)], leaves: [...new Set(leaves)], renames, beats, fights, deaths, risings, powers };
}

// The first library entry `text` names that nothing the scene stands on
// mentions - the user's own messages, where the scene is, who is here -
// or ''. A scene title or situation that names one ("besieging
// Redhaven's breach point" while the scene is at Niamh's Fortress) is the
// model drifting, and is not taken. known: [{ name, aliases }];
// allowedText: what the scene stands on, as text.
export function strayName(text, { known = [], allowedText = '' } = {}) {
    const t = String(text ?? '');
    if (!clean(t)) return '';
    for (const e of known ?? []) {
        for (const n of [e?.name, ...(e?.aliases ?? e?.base?.aliases ?? [])]) {
            const name = clean(n);
            if (name.length < 4 || !mentionedWhole(t, name)) continue;
            if (!mentionedWhole(allowedText, name)) return name;
        }
    }
    return '';
}

// A MOVE line's place as a place name: lead-ins and tags the model adds
// ("Still inside", "Back to the", ", indoors", "(outdoors)") come off.
export function cleanPlaceName(text) {
    let t = clean(text).replace(/^["'*]+|["'*.]+$/g, '');
    t = t.replace(/\s*[,;(-]\s*(?:indoors?|outdoors?|inside|outside)\)?\s*$/i, '').trim();
    t = t.replace(/^(?:(?:still|now|back|right)\s+)?(?:(?:in|inside|within|into|at|to|toward|towards|near|by|outside|on|onto|up|down)\s+)+/i, '').trim();
    return t;
}

// Words that describe the land rather than name a place (lower case only:
// "The Wilderness" may be a name), and -ing words that are nouns, not a
// description ("the old landing", "the crossing").
const SCENERY = /\b(?:(?:into|in|to|toward|towards) the distance|as far as|the horizon|landscape|terrain|expanse|surroundings|scenery|wilderness)\b/;
const NOT_PARTICIPLE = new Set(['landing', 'crossing', 'building', 'clearing', 'dwelling', 'mooring', 'lodging', 'king', 'spring', 'ring', 'wing', 'string', 'evening', 'morning', 'ceiling', 'awning', 'opening', 'offering', 'gathering', 'meeting', 'thing', 'nothing', 'something', 'everything']);
const SENTENCE_WORDS = /\b(?:is|are|was|were|be|leans?|leaning|stands?|standing|sits?|sitting|waits?|waiting|walks?|walking|remains?|stays?|still|while|where|who|with)\b/i;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whether a MOVE place could name a new location: a short name, not a
// sentence about someone ("Remus leans against a pole inside the gate").
// A name that is a way to somewhere rather than a place: "Eastern Road to
// the Broken Bridge", "the trail toward Liston", "the path between the
// ruin and the bridge". Such a stop on the way is never made - a journey
// goes to where it is going (an in-between place with its own name, "the
// Ashen Ford", is still a place). -> { to } (the place it leads to, or ''
// when it runs between two), or null.
const WAY_WORDS = 'road|path|trail|track|way|route|highway|pass|passage|journey|journeying|ride|riding|march|marching|trek|trekking|crossing|walk|walking|travel|travelling|traveling|heading|headed|bound|en route|on the way|on our way|on their way';
export function routeName(name) {
    const n = clean(name).replace(/^["'*]+|["'*.]+$/g, '');
    if (new RegExp(`\\b(?:${WAY_WORDS})s?\\s+between\\s+.+\\s+and\\s+.+$`, 'iu').test(n)) return { to: '' };
    const m = n.match(new RegExp(`^(?:(?:the|a|an|on|along)\\s+)*(?:[\\p{L}'’-]+\\s+){0,2}(?:${WAY_WORDS})s?\\s+(?:to|toward|towards|for|into)\\s+(.+)$`, 'iu'));
    return m ? { to: clean(m[1]) } : null;
}

export function looksLikePlaceName(name, playerNames = []) {
    const n = clean(name);
    if (!n || n.length > 60 || /[,;:!?]/.test(n)) return false;
    if (n.split(/\s+/).length > 6) return false;
    if (SENTENCE_WORDS.test(n)) return false;
    // The scenery, not a place: "Barren plains stretching into the distance",
    // "rocky terrain rising ahead".
    if (SCENERY.test(n) || n.split(/\s+/).slice(1).some((w) => /^[a-z][a-z'’-]*ing$/.test(w) && !NOT_PARTICIPLE.has(w))) return false;
    // Something being done on the way: "Riding towards the Blackened Bridge",
    // "Crossing into the wastes" ("Sterling Keep" is still a name).
    if (/^\p{L}+ing\s+(?:to|toward|towards|into|through|across|along|past|over|up|down|from|near|beside|around|out|for|back)\b/iu.test(n) && !NOT_PARTICIPLE.has(n.split(/\s+/)[0].toLowerCase())) return false;
    if (routeName(n)) return false;
    return !(playerNames ?? []).some((p) => clean(p).length >= 3 && new RegExp(`(^|[^\\p{L}])${escapeRe(clean(p))}(?=$|[^\\p{L}])`, 'iu').test(n));
}

// Whether `text` names a creature: every distinctive word of one of its
// names, a word stem allowed ("skeletal warriors" names "Skeleton
// Warriors", "a zombie" names "zombies").
export function creatureNamedIn(text, creature) {
    const said = String(text ?? '').toLowerCase();
    if (!said.trim()) return false;
    const stems = (w) => [w, ...(w.length >= 6 ? [w.slice(0, -2), w.slice(0, -3)] : []), ...(w.endsWith('s') && w.length >= 5 ? [w.slice(0, -1)] : [])];
    return [creature?.name, ...(creature?.aliases ?? creature?.base?.aliases ?? [])].some((n) => {
        const words = String(n ?? '').toLowerCase().split(/[^a-z0-9'À-ɏ]+/).filter((w) => w.length >= 4 && !STOP.has(w));
        return words.length > 0 && words.every((w) => stems(w).some((s) => new RegExp(`(^|[^a-z])${escapeRe(s)}`).test(said)));
    });
}

// Where a place the director adds belongs: inside the place the scene is
// in (or one it is part of) only when its name, description or tie names
// that place - a room of the fortress says so. A place the story is only
// heading for (a temple far to the north) goes under the top of the
// current region instead, never inside the room the scene happens to be in.
// chain: the scene's place and the places it is in, nearest first:
// [{ id, names: [name, aliases...] }]. -> a parent id, or null.
export function parentForNewPlace(item, chain = []) {
    const text = [item?.name, item?.description, item?.why].map(clean).filter(Boolean).join(' ');
    for (const place of chain ?? []) {
        if ((place.names ?? []).some((n) => clean(n).length >= 4 && mentionedWhole(text, n))) return place.id;
    }
    return chain?.length ? chain[chain.length - 1].id : null;
}

// The library place a new item's own words put it in ("hidden in the
// graveyard near the ruined temple"), the longest name named first - or
// null. places: [{ id, name, aliases }].
export function placeNamedIn(item, places = []) {
    const text = [item?.name, item?.description, item?.why].map(clean).filter(Boolean).join(' ');
    let best = null;
    for (const p of places ?? []) {
        for (const n of [p.name, ...(p.aliases ?? [])]) {
            const name = clean(n);
            if (name.length >= 4 && mentionedWhole(text, name) && (!best || name.length > best.len)) best = { id: p.id, len: name.length };
        }
    }
    return best?.id ?? null;
}

// Whether a NEW person, creature, faction or item has a name, not a sentence
// about one ("Maziel serves Morvath, god of Death" is a relationship, not a
// faction): no linking verb (only those that never name a group - "the
// Iron Guards" stays), at most seven words. Quests, events and scenes
// are titled with phrases ("Find the stolen ledger") and are not checked.
const SENTENCE_VERBS = /\b(serve|serves|served|serving|worship|worships|worshipped|follow|follows|followed|obey|obeys|obeyed|is|are|was|were|has|have|had|belongs|belonged|betrays|betrayed|swore|swears|becomes|became)\b/i;
export function namesSomething(name, kind) {
    if (['quest', 'event', 'scene', 'lore'].includes(kind)) return true;
    const n = clean(name).replace(/^the\s+/i, '');
    if (!n) return false;
    if (n.split(/\s+/).length > 7) return false;
    return !SENTENCE_VERBS.test(n);
}

// The place a sentence names, as a short name: "Remus is in the infirmary
// now, resting from his injuries" -> "Infirmary". A name that is already
// short is only cleaned. -> the name, or '' when no place can be read.
const AFTER_PLACE = /\s+(?:now|again|still|once more|for now|for the night|for a while|tonight|today|where|while|who|which|with|as|after|before|until|since|because|and|but|to|resting|sleeping|waiting|recovering)\b.*$/i;
export function placeNameFrom(text, playerNames = []) {
    const whole = clean(text).replace(/^["'*]+|["'*.!]+$/g, '');
    if (!whole) return '';
    if (looksLikePlaceName(whole, playerNames)) return cleanPlaceName(whole);
    // The first clause, the phrase after its first "in/at/on..." there.
    const clause = whole.split(/\s*[,;:()]\s*|\s+[-–—]\s+/)[0];
    const at = clause.match(/\b(?:in|inside|within|into|at|on|onto|to|toward|towards|near|outside|beneath|under)\s+/i);
    if (!at) return '';
    let name = clause.slice(at.index + at[0].length).replace(AFTER_PLACE, '').trim();
    // "the infirmary" -> "Infirmary", "the Great Hall" -> "Great Hall".
    name = name.replace(/^(?:the|a|an)\s+/i, '');
    name = name.replace(/^(?:his|her|their|its|our|my|your)\s+/i, '');
    if (!name) return '';
    name = name[0].toUpperCase() + name.slice(1);
    return looksLikePlaceName(name, playerNames) ? name : '';
}

// Whether `name` is one of a place's names, give or take "the", a plural
// and a possessive ("the walls" is "Wall"; "Niamh's fortress" is
// "Niamh's Fortress"). Never a part of a longer name.
export function samePlaceName(name, place) {
    const key = (n) => String(n ?? '').toLowerCase().replace(/[’']s\b/g, '').replace(/^(?:the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/s\b/g, '');
    const k = key(name);
    return !!k && [place?.name, ...(place?.aliases ?? place?.base?.aliases ?? [])].some((n) => key(n) === k);
}
