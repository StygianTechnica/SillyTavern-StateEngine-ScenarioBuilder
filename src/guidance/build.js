// The guidance text (sb__guidance, spec 8.1 / 9.2) and the canonical state
// block (sb__state_block, SB-301), built from already-gathered inputs.
// Pure and deterministic (SB-015, SB-804) apart from the director note it is handed: no SillyTavern imports, no
// clock, no randomness - identical inputs give byte-identical text. The
// gathering (library, canonical state, runtime values) happens in
// src/guidance/sync.js.
//
// The text is for the roleplay model: setting-specific, current, never
// naming Scenario Builder (SB-302), starting with REFERENCE_HEADER
// (SB-303), and '' when there is nothing to say (SB-304).

import { REFERENCE_HEADER } from '../constants.js';
import { fitToBudget, estimateTokens } from './budget.js';
import { WORLD_TYPES, describeMagic, describeTech, lookLines } from '../library/world-options.js';
import { isPlaceholder } from '../director/prompt.js';
import { creatureLabel } from '../library/creature-form.js';
import { fightGuidance } from '../director/fight.js';
import { eventGuidance } from '../events/model.js';
import { povRule } from '../director/perspective.js';
import { intimacySection } from './intimacy.js';

const labelOf = (list, id) => list.find(([key]) => key === id)?.[1] ?? id;

// The sections, in display order, with their budget priority (higher =
// kept longer) and whether they are never dropped (SB-305). The text is
// NARRATIVE: prose addressed to the narrator, not lists of people, places
// and things. From the general to the immediate: the setting, its rules,
// the threads being followed, the scene as it is, then the game master's
// summary of where things stand and, last, where the reply should go
// (src/director/) - closest to the reply, where it weighs most.
export const SECTIONS = Object.freeze([
    // The world's premise (gods at war...) is what the rest stands on: it is
    // shortened after lore, the quests and the scene premise, not first.
    { key: 'overview', title: 'Setting', priority: 4, keep: false },
    { key: 'limits', title: 'World rules', priority: 6, keep: true },
    { key: 'quests', title: 'Threads followed', priority: 2, keep: false },
    { key: 'location', title: 'Scene', priority: 5, keep: true },
    { key: 'scene', title: 'Scene premise', priority: 3, keep: false },
    { key: 'lore', title: 'Lore', priority: 2, keep: false },
    { key: 'spoken', title: 'Spoken of, not here', priority: 6, keep: false },
    { key: 'corrections', title: 'Corrections', priority: 6, keep: true },
    { key: 'dead', title: 'The dead', priority: 7, keep: true },
    { key: 'protected', title: 'Never killed', priority: 7, keep: true },
    { key: 'secrets', title: 'Secrets and oaths', priority: 7, keep: true },
    { key: 'summary', title: 'Where things stand', priority: 7, keep: true },
    { key: 'style', title: 'How the story is run', priority: 8, keep: true },
    { key: 'direction', title: 'Where it should go', priority: 8, keep: true },
    { key: 'triggered', title: 'Set off by the story', priority: 9, keep: true },
    { key: 'fight', title: 'The fight', priority: 9, keep: true },
    { key: 'powers', title: 'A power answers', priority: 9, keep: true },
    { key: 'names', title: 'Names for anyone new', priority: 3, keep: false },
    { key: 'loop', title: 'Going in circles', priority: 9, keep: true },
    { key: 'event', title: 'The event', priority: 9, keep: true },
    { key: 'intimacy', title: 'Intimate scene', priority: 8, keep: true },
    { key: 'absent', title: 'Not in this scene', priority: 9, keep: true },
    { key: 'alone', title: 'No one else here', priority: 9, keep: true },
]);

export const DEFAULT_SECTIONS = Object.freeze(Object.fromEntries(SECTIONS.map((s) => [s.key, true])));

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// Shortens `text` to at most `max` characters, at a word boundary.
export function truncate(text, max) {
    const t = clean(text);
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

const sentence = (text) => {
    const t = clean(text);
    return !t ? '' : /[.!?…]$/.test(t) ? t : `${t}.`;
};
const lower = (text) => clean(text).toLowerCase();
const unstop = (text) => clean(text).replace(/[.!?]+$/, '');
const firstLower = (text) => { const t = clean(text); return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t; };
const firstUpper = (text) => { const t = clean(text); return t ? t[0].toUpperCase() + t.slice(1) : t; };
// "a, b and c" / "a, b or c"
const joinWith = (word) => (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`);
const andList = joinWith('and');
const orList = joinWith('or');

export function timeText(time) {
    if (!time || (!time.dayPart && !time.day)) return '';
    const parts = [];
    if (time.day) parts.push(`day ${time.day}`);
    if (time.dayPart) parts.push(time.dayPart);
    return parts.join(', ');
}

// The director's briefing, in its two parts. `director` is { summary,
// direction } (or, from an older record, one text: the summary).
function directorPart(director, part) {
    const d = typeof director === 'string' ? { summary: director, direction: '' } : (director ?? {});
    const text = String(d[part] ?? '').trim();
    return text ? { full: text, compact: '' } : null;
}

// Story triggers the story has set off (src/triggers/): an order for this
// reply, given to the narrator directly so it holds even when the
// director's briefing failed or left it out.
function triggeredSection(lines) {
    const list = (lines ?? []).map((l) => clean(String(l).replace(/^-\s*/, ''))).filter(Boolean);
    if (!list.length) return null;
    return { full: `The story has set this off - it happens in this reply: ${list.join(' ')}`, compact: '' };
}

// People the user took out of the scene by hand (while that holds): an
// order, last of all, so the reply does not write them back in.
function absentSection(absent) {
    const names = (absent ?? []).map(clean).filter(Boolean);
    if (!names.length) return null;
    return { full: `${andList(names)} ${names.length === 1 ? 'is' : 'are'} not in this scene: leave ${names.length === 1 ? 'them' : 'them'} out of this reply entirely - no lines, no actions, no presence.`, compact: '' };
}

// When the player character has no one else in the scene (everyone left,
// or the dead have not been put in it yet), a reply that only answers
// other people has nothing to say. Here the world answers instead. The
// text never names the player character: naming them invites the model
// to write for them. -> the text, or '' when someone else is present.
export function aloneText(input) {
    const list = (input.cast ?? []).filter((c) => clean(c?.name));
    if (!list.some((c) => c.player) || list.some((c) => !c.player)) return '';
    // State Engine's tracker has someone else here: the cast is behind, not empty.
    if (input.othersTracked) return '';
    const creatures = (input.location?.creatures ?? []).filter((x) => clean(x.name) && x.active !== false).map((x) => creatureLabel(x.name, { form: x.form, count: x.count }));
    const lines = [
        'When no NPCs are present, the reply is not empty. The world itself reacts. Describe ONLY:',
        '- what the latest action did - its consequences, what changed because of it',
        '- what there is to notice here - a detail, something out of place, something that was not there before',
        '- the environment',
        '- the weather',
        '- sounds',
        '- smells',
        '- distant movement',
        `- creatures acting independently${creatures.length ? ` (here: ${andList(creatures)})` : ''}`,
        '- divine or supernatural forces',
        'Never add actions, words, thoughts or feelings for the player character: the reply stops where their next choice begins.',
    ];
    return lines.join('\n');
}

function aloneSection(input) {
    const text = aloneText(input);
    return text ? { full: text, compact: '' } : null;
}

// The world's hard limits (what does not exist), its own section so it
// stands right after the setting and is never dropped.
function limitsSection(overview, only = '') {
    const o = overview ?? {};
    // The world's "these bloodlines and no others" (src/library/bloodlines.js onlyRule).
    const limits = [...describeMagic(o.magic).limits, ...describeTech(o.tech).limits, clean(only)].filter(Boolean).map((l) => sentence(l));
    // How the world looks - kept with the limits, which are never dropped,
    // so a post-apocalyptic "fortress" is never a storybook castle.
    const look = lookLines(o).map((l) => sentence(l));
    const text = [limits.length ? `Never break the world's limits. ${limits.join(' ')}` : '', look.join(' ')].filter(Boolean).join(' ');
    return text ? { full: text, compact: '' } : null;
}

function overviewSection(overview) {
    const o = overview ?? {};
    const lines = [];
    const world = o.worldType ? labelOf(WORLD_TYPES, o.worldType).toLowerCase() : '';
    const kind = [clean(o.tone) && lower(o.tone), world].filter(Boolean).join(' ');
    const opening = kind || clean(o.era) ? `This is a ${kind ? `${kind} ` : ''}story${clean(o.era) ? ` set in ${unstop(firstLower(o.era))}` : ''}.` : '';
    const intro = [opening, clean(o.premise) ? sentence(truncate(o.premise, 400)) : '', clean(o.themes) ? `Its themes are ${unstop(lower(o.themes))}.` : ''].filter(Boolean).join(' ');
    if (intro) lines.push(intro);
    const magic = describeMagic(o.magic);
    const tech = describeTech(o.tech);
    const how = [...magic.lines, ...tech.lines].map((l) => sentence(truncate(l, 360)));
    if (how.length) lines.push(how.join(' '));
    if (clean(o.rules)) lines.push(`Society and law: ${sentence(truncate(o.rules, 400))}`);
    if (!lines.length) return null;
    return { full: lines.join('\n'), compact: clean(o.premise) ? sentencesUpTo(o.premise, 250) : '' };
}

// The opening sentences of a text, whole, up to about `max` characters - a
// shortened premise reads as a premise, not as a sentence cut off with
// "...". Only a first sentence longer than `max` is cut.
export function sentencesUpTo(text, max) {
    const all = clean(text).match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
    if (!all.length) return '';
    const out = [];
    for (const one of all) {
        if (out.length && [...out, one].join(' ').length > max) break;
        out.push(one);
    }
    const kept = out.join(' ');
    return kept.length > max * 1.5 ? sentence(truncate(kept, max)) : sentence(kept);
}

function locationSection(input) {
    const loc = input.location;
    const time = timeText(input.time);
    const head = [];
    if (loc?.path?.length) {
        const [here, ...up] = [...loc.path].reverse();
        const inOut = loc.indoor === true ? ', indoors' : (loc.indoor === false ? ', out of doors' : '');
        head.push(`The scene is set in ${here}${up.length ? `, in ${up.join(', ')}` : ''}${inOut}.`);
    }
    const ck = input.clock;
    if (ck) {
        // The clock: part of day, the hour, the date and the season, then the
        // weather as one sentence.
        const hour = ck.dayPart ? `${ck.dayPart}${ck.clock ? ` (about ${ck.clock})` : ''}` : ck.clock;
        const date = [ck.words, ck.season ? `in ${ck.season}` : ''].filter(Boolean).join(', ');
        if (hour || date) head.push(`It is ${[hour, date].filter(Boolean).join(' on ')}.`);
        if (input.weatherText) head.push(input.weatherText);
    } else {
        const when = [
            time ? `it is ${input.time.dayPart && input.time.day ? `${input.time.dayPart} on day ${input.time.day}` : time}` : '',
            input.weather?.length ? `the weather is ${andList(input.weather.map(lower))}` : '',
            input.temperature ? `the air is ${lower(input.temperature)}` : '',
        ].filter(Boolean);
        if (when.length) head.push(`${firstUpper(when.join('; '))}.`);
    }
    if (!head.length) return null;

    const lines = [head.join(' ')];
    const body = [];
    if (loc?.description) body.push(sentence(truncate(loc.description, 700)));
    if (clean(loc?.conditions)) body.push(`At the moment, ${sentence(firstLower(truncate(loc.conditions, 200)))}`);
    const env = loc?.environment ?? {};
    if (env.lighting?.value) body.push(`The light: ${sentence(lower(env.lighting.value))}`);
    if (env.climate?.value) body.push(`The climate is ${sentence(lower(env.climate.value))}`);
    if (env.rules?.value) body.push(`Local custom here: ${sentence(env.rules.value)}`);
    // Who is about here, when it is more than humans (src/library/bloodlines.js).
    if (clean(loc?.whoIsAbout)) body.push(sentence(clean(loc.whoIsAbout)));
    // How the bloodlines of those here are seen in this place (bloodlines.js seenHereLine).
    if (clean(loc?.seenHere)) body.push(sentence(clean(loc.seenHere)));
    if (body.length) lines.push(body.join(' '));
    // The sky, the hour's needs and the calendar's occasions.
    const hourLines = [ck?.sky, ck?.needs, ck?.holiday].filter((x) => clean(x));
    if (hourLines.length) lines.push(hourLines.map(sentence).join(' '));
    // What is here and where one can go from here.
    const named = (list, max) => (list ?? []).slice(0, max).map((x) => `${clean(x.name)}${clean(x.description) ? ` (${unstop(truncate(x.description, 110))})` : ''}`);
    const around = [];
    const lying = (loc?.items ?? []).filter((x) => !x.carriedBy);
    const carried = (loc?.items ?? []).filter((x) => x.carriedBy);
    // Named items carry weight with the model; offered as what is here,
    // not as things the reply should reach for.
    if (lying.length) around.push(`Also here, should the scene turn to them: ${andList(named(lying, 8))}.`);
    // By name: what they are is in the people's own lines and the story.
    if (carried.length) around.push(`Carried by those present: ${andList(carried.slice(0, 8).map((x) => clean(x.name)))}.`);
    // Creatures in the scene, a kind with its numbers ("3 Zombies"); those
    // that only live here are not in it until the story brings them in.
    const inScene = (loc?.creatures ?? []).filter((x) => x.active !== false).map((x) => ({ ...x, name: creatureLabel(x.name, { form: x.form, count: x.count }) }));
    const lurking = (loc?.creatures ?? []).filter((x) => x.active === false);
    if (inScene.length) around.push(`Also here: ${andList(named(inScene, 6))}.`);
    if (lurking.length) around.push(`Living hereabouts, unseen unless the story brings them in: ${andList(lurking.slice(0, 4).map((x) => clean(x.name)))}.`);
    // A place saved under a template word ("Place name") is not a way on.
    const real = (list) => (list ?? []).filter((x) => !isPlaceholder(x?.name));
    // Ways on by name, a road with its travel time and note - not each place's
    // description, which the reply here does not need.
    const roads = real(loc?.routes).slice(0, 8).map((r) => { const how = [clean(r.travel), clean(r.note)].filter(Boolean).join(', '); return `${clean(r.name)}${how ? ` (${how})` : ''}`; });
    const ways = [...real(loc?.places).slice(0, 8).map((x) => clean(x.name)), ...roads];
    const out = loc?.partOf ? `back out to ${clean(loc.partOf.name)}` : '';
    if (ways.length) around.push(`From here one can go to ${orList(ways)}${out ? `, or ${out}` : ''}.`);
    else if (out) around.push(`From here one can go ${out}.`);
    // The way the party gets about now (horses, a car), when the story gave
    // it one - the journey times above lead with it.
    if (clean(loc?.travelMode) && roads.length) around.push(`The party gets about ${clean(loc.travelMode)}.`);
    if (around.length) lines.push(around.join(' '));
    if (loc?.path?.length) lines.push('Let what the characters see, hear and smell here colour the reply, and keep them in this place unless the story moves them.');
    return { full: lines.join('\n'), compact: [head.join(' '), loc?.description ? sentence(truncate(loc.description, 200)) : ''].filter(Boolean).join(' ') };
}

function loreSection(lore) {
    const list = (lore ?? []).filter((l) => clean(l?.name));
    if (!list.length) return null;
    const line = (l) => `${clean(l.name)}${clean(l.description) ? `: ${unstop(truncate(l.description, 220))}` : ''}.`;
    return {
        full: ['Worth remembering here:', ...list.slice(0, 6).map(line)].join(' '),
        compact: `Worth remembering here: ${andList(list.slice(0, 6).map((l) => clean(l.name)))}.`,
    };
}

// People the chat speaks of who are not here (src/guidance/spoken.js):
// their side and role, so what is said of them fits who they are.
function spokenSection(spoken) {
    const list = (spoken ?? []).filter((p) => clean(p?.name));
    if (!list.length) return null;
    const line = (p) => {
        const bits = [
            p.sides?.length ? `of ${andList(p.sides)}` : '',
            clean(p.role) ? unstop(truncate(p.role, 110)).replace(/^(A|An|The)(?=\s)/, (w) => w.toLowerCase()).replace(/^[A-Z](?=[a-z])/, (w) => w.toLowerCase()) : '',
        ].filter(Boolean).join(', ');
        const stances = (p.stances ?? []).length ? `; ${andList(p.stances)}` : '';
        return `${clean(p.name)} - ${bits || 'known in this setting'}${stances}.`;
    };
    const rule = 'Someone away keeps who they are and whose side they are on: what is said of them fits that, and they are never made an attacker, enemy or ally of a side the story has not shown them turn to.';
    return {
        full: ['Spoken of, but not here:', ...list.map(line), rule].join(' '),
        compact: `Spoken of, but not here: ${list.map((p) => (p.sides?.length ? `${clean(p.name)} (of ${andList(p.sides)})` : clean(p.name))).join('; ')}. They keep their side while away.`,
    };
}

function sceneSection(scene) {
    const title = clean(scene?.title);
    const premise = clean(scene?.premise);
    if (!title && !premise) return null;
    const full = [title ? `The current scene: ${unstop(title)}.` : '', premise ? sentence(truncate(premise, 400)) : ''].filter(Boolean).join(' ');
    return { full, compact: title ? `The current scene: ${unstop(title)}.` : sentence(truncate(premise, 120)) };
}

// ---------------------------------------------------------------- cast

// One line per character present, for sb__cast (its own output, so it can
// be placed above the guidance). The player character's line says only who
// they are: nothing about what they want, feel or mean to do, which a model
// would take as a cue to write for them.
function castLine(c) {
    // The bloodline with the name: "Kiri (elf)".
    const name = `${clean(c.name)}${clean(c.bloodline) ? ` (${clean(c.bloodline)})` : ''}`;
    // Nicknames, codenames, titles - and who uses them (sync: knownAsText).
    const knownAs = clean(c.knownAs) ? unstop(truncate(c.knownAs, 300)) : '';
    if (c.player) {
        const who = [clean(c.bloodline), clean(c.role)].filter(Boolean).join(', ');
        return `- ${clean(c.name)}${who ? ` (${who})` : ''}: the player character, played by the user.${clean(c.age) ? ` ${firstUpper(unstop(c.age))}.` : ''}${knownAs ? ` ${knownAs}.` : ''}`;
    }
    const bits = [];
    if (clean(c.role)) bits.push(firstUpper(unstop(c.role)));
    if (clean(c.description)) bits.push(unstop(truncate(c.description, 160)));
    if (clean(c.lineageNote)) bits.push(firstUpper(unstop(truncate(c.lineageNote, 120))));
    // Their age for their kind (src/library/bloodlines.js ageLine).
    if (clean(c.age)) bits.push(firstUpper(unstop(c.age)));
    if (knownAs) bits.push(knownAs);
    if (clean(c.personality)) bits.push(unstop(truncate(c.personality, 90)));
    if (clean(c.voice)) bits.push(`Voice: ${unstop(firstLower(truncate(c.voice, 120)))}`);
    if (clean(c.goals)) bits.push(`Wants: ${unstop(firstLower(truncate(c.goals, 110)))}`);
    if (clean(c.gifts)) bits.push(firstUpper(unstop(truncate(c.gifts, 200))));
    const now = [clean(c.mood) ? lower(unstop(c.mood)) : '', clean(c.intent) ? `means to ${unstop(firstLower(truncate(c.intent, 100))).replace(/^to /i, '')}` : ''].filter(Boolean);
    if (now.length) bits.push(`Now: ${now.join(', ')}`);
    if (clean(c.condition)) bits.push(unstop(truncate(c.condition, 80)));
    for (const r of c.relations ?? []) bits.push(firstUpper(unstop(truncate(r, 90))));
    // What they know that others may not, and what binds them.
    for (const k of c.knows ?? []) bits.push(`Knows: ${unstop(truncate(k, 160))}`);
    // What they hold true that is not (src/library/knowledge.js, beliefs).
    for (const k of c.believes ?? []) bits.push(`Believes: ${unstop(truncate(k, 160))}`);
    for (const k of [...(c.sworn ?? []), ...(c.owed ?? [])]) bits.push(unstop(truncate(k, 160)));
    return `- ${name}${bits.length ? `: ${bits.join('. ')}.` : ''}`;
}

// sb__cast: who is present. '' when nobody is known to be.
export function buildCast(input) {
    const list = (input.cast ?? []).filter((c) => clean(c?.name));
    if (!list.length && !(input.absent ?? []).length) return '';
    const others = list.filter((c) => !c.player);
    const player = list.find((c) => c.player);
    const lines = ['Additional Context-Characters present:', ...list.map(castLine)];
    // What the bloodlines present look like and how they live in this world.
    const kinds = (input.bloodlines?.present ?? []).map(clean).filter(Boolean);
    if (kinds.length) lines.push(`Bloodlines present - ${kinds.map((k) => truncate(k, 260)).join(' ')}`);
    const absent = (input.absent ?? []).map(clean).filter(Boolean);
    if (absent.length) lines.push(`Not here: ${andList(absent)}. ${absent.length === 1 ? 'They are' : 'They are'} elsewhere now; do not write ${absent.length === 1 ? 'them' : 'them'} into this reply.`);
    if (others.length) lines.push(`Write ${others.length === 1 ? clean(others[0].name) : 'each of them'} true to what they want and how they feel. ${others.length === 1 ? 'They pursue their' : 'Each pursues their'} own aims: in this reply ${others.length === 1 ? 'they take' : 'at least one of them takes'} the initiative - starting something, pressing a plan, acting on someone - instead of only reacting.${player ? ` Never write ${clean(player.name)}'s words, actions, thoughts or feelings.` : ''}`);
    else if (player) lines.push(aloneText(input));
    return `${REFERENCE_HEADER}\n${lines.join('\n')}`;
}

function castParagraph(c) {
    const name = clean(c.name);
    const role = clean(c.role);
    const article = /^(the|a|an|my|his|her|their)\s/i.test(role) ? '' : 'the ';
    const kind = clean(c.bloodline);
    const bits = [`${name}${kind ? ` (${kind})` : ''}${role ? `, ${article}${firstLower(role)},` : ''} is here.`];
    if (clean(c.description)) bits.push(sentence(truncate(c.description, 320)));
    if (clean(c.lineageNote)) bits.push(sentence(firstUpper(truncate(c.lineageNote, 160))));
    if (clean(c.age)) bits.push(sentence(firstUpper(c.age)));
    if (clean(c.personality)) bits.push(`By temperament: ${sentence(firstLower(truncate(c.personality, 200)))}`);
    if (clean(c.voice)) bits.push(`How ${name} talks and moves: ${sentence(firstLower(truncate(c.voice, 240)))}`);
    if (clean(c.goals)) bits.push(`What ${name} wants: ${sentence(firstLower(truncate(c.goals, 200)))}`);
    if (clean(c.gifts)) bits.push(`What ${name} can do: ${sentence(firstLower(truncate(c.gifts, 220)))}`);
    const now = [
        clean(c.mood) ? `feels ${unstop(lower(c.mood))}` : '',
        clean(c.intent) ? `means to ${unstop(firstLower(truncate(c.intent, 160))).replace(/^to /i, '')}` : '',
    ].filter(Boolean);
    if (now.length) bits.push(`Right now ${name} ${now.join(' and ')}.`);
    if (clean(c.thought)) bits.push(`On ${name}'s mind: ${sentence(firstLower(truncate(c.thought, 140)))}`);
    if (clean(c.condition)) bits.push(`Condition: ${sentence(truncate(c.condition, 120))}`);
    if (c.relations?.length) bits.push(c.relations.map((r) => sentence(firstUpper(truncate(r, 120)))).join(' '));
    return bits.join(' ');
}

function castSection(cast) {
    const list = (cast ?? []).filter((c) => clean(c?.name));
    if (!list.length) return null;
    const names = list.map((c) => `${clean(c.name)}${clean(c.role) ? ` (${clean(c.role)})` : ''}`);
    return {
        full: [...list.map(castParagraph), 'Play each of them true to what they want and how they feel: they act on their own intentions, not only in answer to others.'].join('\n'),
        compact: `Present: ${andList(names)}.`,
    };
}

// Active quests, most important first (spec 9.2 item 6, SB-433), as the
// threads the story is following.
function questsSection(quests) {
    const list = (quests ?? []).filter((q) => clean(q.name));
    if (!list.length) return null;
    const line = (q, compact) => {
        const what = [q.priority ? `${q.priority}-priority` : '', q.type ? lower(q.type) : '', 'quest'].filter(Boolean).join(' ');
        let text = `${clean(q.name)}, a ${what}`;
        text += q.current ? `: next, ${unstop(firstLower(truncate(q.current, 140)))}.` : '.';
        if (compact) return text;
        if (q.progress) text += ` ${sentence(firstUpper(q.progress))}`;
        if (q.description) text += ` ${sentence(truncate(q.description, 180))}`;
        const m = q.mission;
        if (m && (m.giver || m.difficulty)) text += ` A ${m.difficulty ? `${m.difficulty} ` : ''}job${m.giver ? ` from ${clean(m.giver)}` : ''}${m.reward && !lower(q.description).includes(lower(m.reward)) ? `, paying ${unstop(m.reward)}` : ''}.`;
        if (clean(q.completion)) text += ` It is done when ${unstop(firstLower(truncate(q.completion, 160)))}.`;
        return text;
    };
    const lead = 'The story is following these threads; let them shape what the characters care about, without forcing them:';
    return { full: [lead, ...list.map((q) => line(q, false))].join('\n'), compact: [lead, ...list.map((q) => line(q, true))].join('\n') };
}

// A correction written before names were checked may hold an object id:
// the model never reads one, so such a line is left out.
const HOLDS_ID = /\b[a-z]{3}_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i;

function correctionsSection(corrections) {
    const list = [...new Set((corrections ?? []).map(clean).filter((c) => c && !HOLDS_ID.test(c)))];
    if (!list.length) return null;
    return { full: `Recent replies got some facts wrong. Hold to these: ${list.map(sentence).join(' ')}`, compact: '' };
}

// The narrator's standing rule for clashes: an attack between the others is
// carried through to its result in the reply, never left hanging ("Varyn
// aims for its joints" and then nothing) - the director's briefing can be
// vague, and the narrator settles it. Only with a direction to follow.
export const OUTCOMES = 'Carry every action of the other characters and creatures through to its result in this reply: a blow lands or misses, and what it does; an opponent hits back, presses or gives ground. Never leave an attack between them hanging. Only what the player character does is left to the player.';
const withOutcomes = (part) => (part ? { ...part, full: `${part.full}

${OUTCOMES}` } : part);

// Perspective (the narrator's standing rule, at no cost).
export const PERSPECTIVE = 'People know only what they saw, heard or were told in the story. What happens inside someone - their thoughts, dreams, visions, memories and unspoken feelings - is theirs alone: others see only outward signs (a restless sleep, a far-off look) and learn the rest only if told, in the scene.';

const BUILDERS = {
    summary: (input) => directorPart(input.director, 'summary'),
    absent: (input) => absentSection(input.absent),
    triggered: (input) => triggeredSection(input.triggered),
    // Who has died in this story (src/state/death.js).
    dead: (input) => (clean(input.dead) ? { full: `Dead and gone in this story - they can be mourned, remembered or spoken of, but never written alive, speaking or acting: ${clean(input.dead)}`, compact: '' } : null),
    // Who here cannot be killed (src/director/combat.js).
    protected: (input) => (clean(input.protected) ? { full: `Never killed in this story: ${clean(input.protected)}`, compact: '' } : null),
    // Each fighter's condition, kept from reply to reply (src/director/fight.js).
    fight: (input) => (fightGuidance(input.fight) ? { full: fightGuidance(input.fight), compact: '' } : null),
    // The story going in circles, or the player asking whether it is over.
    loop: (input) => (clean(input.loop) ? { full: clean(input.loop), compact: '' } : null),
    // A god called on by its champion answers (src/library/powers.js).
    powers: (input) => (clean(input.powersNarrator) ? { full: clean(input.powersNarrator), compact: '' } : null),
    // Rolled names for anyone the narrator brings in (src/naming/live.js; off by default).
    names: (input) => (clean(input.names) ? { full: clean(input.names), compact: '' } : null),
    // A structured event's stage under way, never what comes next (src/events/).
    event: (input) => (eventGuidance(input.event) ? { full: eventGuidance(input.event), compact: '' } : null),
    intimacy: (input) => intimacySection(input),
    alone: (input) => aloneSection(input),
    direction: (input) => withOutcomes(directorPart(input.director, 'direction')),
    // The user's own standing instructions (the front page).
    style: (input) => (clean(input.overview?.gmStyle) ? { full: `How this story is run: ${sentence(truncate(input.overview.gmStyle, 800))}`, compact: '' } : null),
    limits: (input) => limitsSection(input.overview, input.bloodlines?.only),
    overview: (input) => overviewSection(input.overview),
    location: (input) => locationSection(input),
    scene: (input) => sceneSection(input.scene),
    quests: (input) => questsSection(input.quests),
    lore: (input) => loreSection(input.lore),
    spoken: (input) => spokenSection(input.spoken),
    corrections: (input) => correctionsSection(input.corrections),
    // What people can know - always: no one knows another's dreams, visions
    // or unspoken thoughts (Varyn knowing the vision Remus had asleep) - then
    // who here must not know a secret, and the oaths that bind those present.
    // The point of view the narration keeps (settings.director.pov) goes with it.
    secrets: (input) => {
        const pov = povRule(input.pov, (input.cast ?? []).find((c) => c.player)?.name);
        return (input.secrets ?? []).length || (input.cast ?? []).length || pov
            ? { full: [PERSPECTIVE, pov, ...(input.secrets ?? []).slice(0, 8)].filter(Boolean).join(' '), compact: [PERSPECTIVE, pov].filter(Boolean).join(' ') }
            : null;
    },
};

// input: { overview, location: { path, description, environment, indoor },
//   time: { day, dayPart }, weather, temperature, scene: { title, premise },
//   cast: [{ name, role, bloodline, lineageNote, description, mood, intent, condition, why }],
//   bloodlines: { only, present: [line] } (src/library/bloodlines.js),
//   corrections: [text], sections: { [key]: boolean }, budget }
// -> { text, tokens, sections: [{ key, title, mode, text, tokens, why }] }
//   mode: 'full' | 'compact' | 'dropped' (over budget) | 'off' (toggled
//   off) | 'empty' (nothing to say). `why` says what the section was built
//   from, for the preview (SB-314).
export function buildGuidance(input) {
    const toggles = { ...DEFAULT_SECTIONS, ...(input.sections ?? {}) };
    const built = SECTIONS.map((s) => ({ ...s, on: toggles[s.key] !== false, content: toggles[s.key] !== false ? BUILDERS[s.key](input) : null }));
    // Prose paragraphs, no headings: the narrator reads it as a briefing.
    const titled = (s, text) => text;
    const candidates = built.filter((s) => s.on && s.content).map((s) => ({
        key: s.key,
        priority: s.priority,
        keep: s.keep,
        full: titled(s, s.content.full),
        compact: s.content.compact ? titled(s, s.content.compact) : '',
    }));
    const fitted = fitToBudget(candidates, input.budget, estimateTokens(`${REFERENCE_HEADER}\n`));
    const byKey = new Map(fitted.sections.map((s) => [s.key, s]));
    const parts = fitted.sections.map((s) => s.text).filter(Boolean);
    const text = parts.length ? `${REFERENCE_HEADER}\n${parts.join('\n\n')}` : '';

    const why = {
        overview: 'The setting overview.',
        limits: 'The world\'s magic and technology limits.',
        summary: "The game master's summary of where things stand, written before this reply from the recent chat and the scene.",
        direction: "The game master's direction: what should probably happen in this reply.",
        style: 'Your own instructions for running the story (the front page: How the game master runs this story).',
        absent: 'People you took out of the scene by hand, for the next few replies.',
        dead: 'Who has died in this story (marked by the director or by you on their sheet); they never come back.',
        protected: 'Who here cannot be killed - a plot device or unkillable on their sheet, or spared by the chat\'s "Who can die" - outside a fight as well as in one.',
        loop: 'The story going in circles (replies repeating themselves), or the player asking whether a task is over: end it or turn it.',
        powers: 'A power (a god, a spirit) called on by its champion, or over its dead champion: the narrator is told it answers.',
        fight: 'The fight the director keeps: each fighter but the player character, their condition from reply to reply, and when it ends.',
        event: 'A structured event under way (an arena, set up in the GM Plan): the stage now, and never who comes next.',
        triggered: 'Story triggers the story has just set off (Story triggers in the GM Plan): played in this reply, and on a swipe of it.',
        alone: 'Shown when the player character is the only one present: the world, its creatures and the consequences carry the reply.',
        location: input.location?.path?.length ? `Canonical location, its path and inherited environment; canonical time and weather.` : 'Canonical time and weather.',
        scene: 'The canonical scene title and premise.',
        corrections: 'Adjustments made by validation, kept for a few replies.',
        secrets: 'Secrets and oaths touching those present - yours (on the sheets) and the story\'s (Archivist).',
        quests: (input.quests ?? []).map((q) => `${q.name}: ${q.why ?? 'active'}`).join('; ') || 'Active quests.',
        spoken: 'Library characters the last few messages name who are not in the scene: their factions, role and stance toward factions - so the story does not recast them while they are away.',
        lore: (input.lore ?? []).filter((l) => l.why).map((l) => `${l.name}: ${l.why}`).join('; ') || 'Lore named in the last few messages, tied to someone they name, or tied to this place or the people present.',
    };
    return {
        text,
        tokens: text ? estimateTokens(text) : 0,
        sections: built.map((s) => {
            const fit = byKey.get(s.key);
            const mode = !s.on ? 'off' : !s.content ? 'empty' : fit.mode;
            return { key: s.key, title: s.title, mode, text: fit?.text ?? '', tokens: fit?.text ? estimateTokens(fit.text) : 0, why: why[s.key] };
        }),
    };
}

// The guidance in six parts, each its own output variable (so each can be
// placed, read and tuned on its own in Curator), in the order the whole
// takes: [variable, header, section keys]. Built from buildGuidance()'s
// fitted sections, so together they keep to the same token budget.
export const GUIDANCE_PARTS = Object.freeze([
    ['guidance_setting', 'THE SETTING', ['overview']],
    ['guidance_rules', 'WORLD RULES', ['limits']],
    ['guidance_threads', 'THREADS BEING FOLLOWED', ['quests']],
    ['guidance_scene', 'THE SCENE NOW', ['location', 'scene', 'lore', 'spoken', 'secrets', 'corrections', 'dead', 'protected']],
    ['guidance_summary', 'WHERE THINGS STAND', ['summary']],
    ['guidance_direction', 'WHERE THIS REPLY SHOULD GO', ['style', 'direction', 'loop', 'triggered', 'fight', 'powers', 'event', 'intimacy', 'absent', 'alone', 'names']],
]);

// buildGuidance()'s result -> { [variable]: text } ('' for an empty part).
export function guidanceParts(built) {
    const textOf = new Map((built?.sections ?? []).map((s) => [s.key, s.text]));
    const out = {};
    for (const [variable, header, keys] of GUIDANCE_PARTS) {
        const body = keys.map((k) => textOf.get(k)).filter(Boolean).join('\n\n');
        out[variable] = body ? `${header} (reference only - do not continue)\n${body}` : '';
    }
    return out;
}

// sb__state_block: the canonical state as text, a line per value, empty
// lines omitted, '' when there is nothing (SB-301) - in the style of State
// Engine's own se__state_block, but from canonical values only.
// input: { locationPath: [names], time, weather, temperature, indoor,
//          sceneTitle, castNames }
export function buildStateBlock(input) {
    const lines = [];
    if (input.locationPath?.length) lines.push(`Location: ${input.locationPath.join(' > ')}`);
    if (input.indoor === true) lines.push('Indoors: yes');
    else if (input.indoor === false) lines.push('Indoors: no');
    const time = timeText(input.time);
    if (time) lines.push(`Time: ${time}`);
    if (input.weather?.length) lines.push(`Weather: ${input.weather.join(', ')}`);
    if (input.temperature) lines.push(`Temperature: ${input.temperature}`);
    if (clean(input.sceneTitle)) lines.push(`Scene: ${clean(input.sceneTitle)}`);
    if (input.castNames?.length) lines.push(`Present: ${input.castNames.join(', ')}`);
    return lines.length ? `${REFERENCE_HEADER}\n${lines.join('\n')}` : '';
}
