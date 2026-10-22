// Structured events - generated (docs/DESIGN - STRUCTURED EVENTS.md, section
// 6). The user gives loose guidance ("a tournament in the capital, five
// rounds") and one model call fills the Event card's form from the setting:
// entrants and opponents from the library where they fit, a crawl's rooms
// (the dungeon's own places first), the opening, the close, a prize. The
// user looks it over before it is set up. One call, only when asked (or
// when the user takes up a planner's event idea). The prompt and reader are
// pure (and tested); the runner never throws.

import { LOG_PREFIX } from '../constants.js';
import { emptyForm, emptyRoom } from './setup.js';
import { KIND_LABEL } from './model.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

const SYSTEM = 'You are a game master\'s assistant for a roleplay. You plan one structured event - a contest or an expedition - in exactly the lines asked for, no preamble, no commentary.';

const KIND_TASK = {
    arena: [
        'An arena: opponents sent out one after another, each fought until beaten. Three to six opponents, weakest first, the last the hardest.',
        'OPPONENT: <name> - one line per opponent, in the order they come out',
    ],
    tournament: [
        'A tournament: the player character and rival entrants in a bracket; the winners go on to a grand final. Three to eleven rivals, each with how hard they are to beat: minor, standard, strong or deadly.',
        'ENTRANT: <name> | <minor|standard|strong|deadly> - one line per rival entrant (not the player character)\nBETWEEN: <how long between rounds, e.g. "two hours", "the next morning"; or "none">',
    ],
    crawl: [
        'A dungeon crawl: rooms the party goes through, each with what waits there (foes, or none), what it looks like, what treasure there is, and for a puzzle or trap what the story must show to get past it. Four to eight rooms; the first is the way in; mark the last, the deepest, FINAL.',
        'ROOM: <name> | foes: <who or what waits there, or none> | here: <one sentence: what it is like> | treasure: <or none> | puzzle: <what must happen to get past, or none> | leads to: <names of the rooms it opens onto> | <FINAL for the last room only>',
    ],
    programme: [
        'A programme: a fixed sequence of parts - ceremonies, contests, rests - like a festival or a trial. Four to ten parts, in order.',
        'STEP: moment: <title> - <what happens>  /  STEP: bout: <who is fought> - <what it is about>  /  STEP: wait: <until when, e.g. noon>',
    ],
};

// -> { system, user, plain }
// input: { kind, request, overview, placeName, playerName, candidates:
//   [{ name, type, description }], rooms: [name] (a crawl's dungeon's own
//   places), canonOnly }
export function buildEventPrompt(input) {
    const kind = KIND_TASK[input?.kind] ? input.kind : 'arena';
    const [task, format] = KIND_TASK[kind];
    const candidates = (input?.candidates ?? []).filter((c) => clean(c?.name)).slice(0, 30);
    const rooms = (input?.rooms ?? []).map(clean).filter(Boolean).slice(0, 20);
    const user = [
        clean(input?.overview) ? `# The setting\n${cut(input.overview, 600)}` : '',
        clean(input?.placeName) ? `# Where it is held\n${clean(input.placeName)}` : '',
        `# Who it is for\n${clean(input?.playerName) || 'The player character'} - the one who takes part. Never decide what they think, feel, say or choose.`,
        candidates.length ? `# People and creatures the setting has (use them where they fit)\n${candidates.map((c) => `- ${clean(c.name)}${clean(c.type) ? ` (${clean(c.type)})` : ''}${clean(c.description) ? `: ${cut(c.description, 90)}` : ''}`).join('\n')}` : '',
        rooms.length ? `# The places inside the dungeon already (use them as rooms, in a sensible order)\n${rooms.map((r) => `- ${r}`).join('\n')}` : '',
        clean(input?.request) ? `# What the user wants\n${cut(input.request, 500)}` : '',
        '# Your task',
        `Plan ${KIND_LABEL[kind] === 'arena' ? 'an arena' : `a ${KIND_LABEL[kind]}`}. ${task}`,
        input?.canonOnly
            ? '- Use only people, creatures and places listed above; invent none.'
            : '- Take people and creatures from the list where they fit; otherwise invent ones that fit the setting, each with a name (a kind of creature may be a number and a kind: "3 ghouls").',
        '# Reply\nExactly these lines:',
        'NAME: <the event\'s name>',
        'OPENING: <one or two sentences: how it begins>',
        'CLOSE: <one sentence: how it ends for the winner>',
        'PRIZE: <what winning brings, or none>',
        format,
    ].filter(Boolean).join('\n\n');
    return { system: SYSTEM, user, plain: true };
}

const none = (v) => /^(none|nothing|no|n\/a|-|empty)$/i.test(clean(v));

// The answer -> a form (src/events/setup.js) for `kind`, or null without a
// name or anything to run.
export function readEventSetup(text, kind = 'arena') {
    const lines = String(text ?? '').split('\n').map((l) => l.replace(/[*`#]/g, '').trim()).filter(Boolean);
    const pick = (re) => clean(lines.map((l) => l.match(re)?.[1]).find(Boolean) ?? '').replace(/^["']|["']$/g, '');
    const all = (re) => lines.map((l) => l.match(re)?.[1]).filter(Boolean).map(clean);
    const form = emptyForm(kind);
    form.name = pick(/^name\s*[:\-–]\s*(.+)$/i).slice(0, 100);
    form.intro = pick(/^(?:opening|intro(?:duction)?)\s*[:\-–]\s*(.+)$/i);
    form.close = pick(/^close\s*[:\-–]\s*(.+)$/i);
    const prize = pick(/^prize\s*[:\-–]\s*(.+)$/i);
    form.prize = none(prize) ? '' : prize;
    if (form.kind === 'arena') form.opponents = all(/^opponent\s*\d*\s*[:\-–]\s*(.+)$/i).join('\n');
    if (form.kind === 'tournament') {
        form.entrants = all(/^entrant\s*\d*\s*[:\-–]\s*(.+)$/i).join('\n');
        const between = pick(/^between\s*[:\-–]\s*(.+)$/i);
        form.between = none(between) ? '' : between;
    }
    if (form.kind === 'programme') form.steps = all(/^step\s*\d*\s*[:\-–]\s*(.+)$/i).join('\n');
    if (form.kind === 'crawl') {
        form.rooms = all(/^room\s*\d*\s*[:\-–]\s*(.+)$/i).map((line) => {
            const parts = line.split('|').map(clean);
            const field = (re) => {
                const v = clean(parts.map((p) => p.match(re)?.[1]).find(Boolean) ?? '');
                return none(v) ? '' : v;
            };
            return {
                ...emptyRoom(),
                name: parts[0].replace(/^name\s*:\s*/i, '').slice(0, 80),
                threats: field(/^(?:foes?|threats?|enemies)\s*:\s*(.+)$/i),
                note: field(/^(?:here|note|looks?)\s*:\s*(.+)$/i),
                loot: field(/^(?:treasure|loot)\s*:\s*(.+)$/i),
                clearWhen: field(/^(?:puzzle|trap|clear(?:ed)? when)\s*:\s*(.+)$/i),
                leadsTo: field(/^(?:leads? to|ways?|exits?)\s*:\s*(.+)$/i),
                final: parts.slice(1).some((p) => /^final\b/i.test(p)),
            };
        }).filter((r) => r.name);
        if (form.rooms.length && !form.rooms.some((r) => r.final)) form.rooms[form.rooms.length - 1].final = true;
    }
    const empty = { arena: !form.opponents, tournament: !form.entrants, programme: !form.steps, crawl: !form.rooms.length }[form.kind];
    return form.name && !empty ? form : null;
}

// The crawl's rooms matched to the dungeon's own places by name.
export function matchRooms(form, places = []) {
    if (form?.kind !== 'crawl') return form;
    const key = (s) => clean(s).toLowerCase().replace(/^the\s+/, '');
    return { ...form, rooms: form.rooms.map((r) => ({ ...r, placeId: r.placeId || places.find((p) => key(p.name) === key(r.name))?.id || '' })) };
}

// Fills a form from loose guidance. options: { kind, request, placeId }.
// -> the form, or null. Never throws.
export async function generateEventForm(chatId, settingId, { kind = 'arena', request = '', placeId = '' } = {}) {
    try {
        const lib = await import('../library/library.js');
        const characters = await lib.listEntries(chatId, settingId, 'character').catch(() => []);
        const creatures = await lib.listEntries(chatId, settingId, 'creature').catch(() => []);
        const places = await lib.listEntries(chatId, settingId, 'location').catch(() => []);
        const playerId = lib.playerIdOf(settingId, characters);
        const player = characters.find((c) => c.id === playerId);
        const parents = lib.getParents(settingId);
        const inside = kind === 'crawl' && placeId ? places.filter((p) => parents[p.id] === placeId) : [];
        const overview = lib.getOverview(settingId);
        const prompt = buildEventPrompt({
            kind,
            request,
            overview: [overview.premise, overview.tone && `Tone: ${overview.tone}.`].filter(Boolean).join(' '),
            placeName: places.find((p) => p.id === placeId)?.name ?? '',
            playerName: player?.name ?? SillyTavern.getContext().name1,
            candidates: [...characters.filter((c) => c.id !== playerId).slice(0, 18).map((e) => ({ ...e, type: 'character' })), ...creatures.slice(0, 12).map((e) => ({ ...e, type: 'creature' }))].map((e) => ({ name: e.name, type: e.type, description: e.description })),
            rooms: inside.map((p) => p.name),
            canonOnly: lib.isCanonOnly(settingId),
        });
        const { askReliably } = await import('../generate/run.js');
        const result = await askReliably(prompt, (_p, text) => {
            const values = readEventSetup(text, kind);
            return values ? { values, dropped: [], error: null } : { values: {}, dropped: [], error: 'no NAME line, or nothing to run' };
        }, 900);
        if (result.error) {
            console.warn(LOG_PREFIX, `could not write the ${kind}: ${result.error}`);
            return null;
        }
        return matchRooms({ ...result.values, placeId }, inside);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not generate the event', err);
        return null;
    }
}
