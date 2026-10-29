// The world meanwhile - its prompts and the reader for their answers (pure;
// docs/DESIGN - THE WORLD MEANWHILE.md §6-7). The world's part (worldPart)
// tells a pass what has happened that others would react to, who might
// care, and the schemes under way. At the Quiet level it rides on the DAY
// pass, which answers with a "world" object beside its moments (src/
// planner/prompts.js buildDayPrompt); at Lively and Turbulent it is the
// WORLD pass of its own (buildWorldPrompt).

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const cut = (v, n) => { const t = clean(v); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const texts = (v, max) => list(v).map((x) => clean(typeof x === 'string' ? x : x?.text)).filter(Boolean).slice(0, max);

const WAYS = ['rumour', 'news', 'trace', 'approach', 'arrival', 'happening', 'hook'];
const STATUSES = ['under way', 'stalled', 'done', 'failed', 'dropped'];
const VISIBILITIES = ['hidden', 'traces', 'rumoured', 'public'];
const ABOUT = ['seeks', 'watches', 'opposes', 'helps', 'none'];

// One stakeholder for the prompt: { name, type, why: [text], role, goals,
// personality, where }.
function stakeholderLine(s) {
    const facts = [
        clean(s.role) ? `role: ${cut(s.role, 120)}` : '',
        clean(s.goals) ? `goals: ${cut(s.goals, 200)}` : '',
        clean(s.personality) ? `nature: ${cut(s.personality, 120)}` : '',
        clean(s.where) ? `last seen: ${cut(s.where, 80)}` : '',
    ].filter(Boolean).join('; ');
    return `- ${clean(s.name)} (${s.type === 'faction' ? 'faction' : 'person'})${s.why?.length ? ` - ${s.why.map(clean).join('; ')}` : ''}${facts ? `. ${facts}` : ''}`;
}

function schemeLine(s, day, userName) {
    const next = s.steps[s.done];
    const due = s.status === 'stalled' ? 'stalled' : s.nextDay === null || s.nextDay <= day ? 'next step due today' : `next step in ${s.nextDay - day} day${s.nextDay - day === 1 ? '' : 's'}`;
    return `- [${s.id}] ${s.names.join(', ') || 'someone'}: ${s.aim}${s.motive ? ` (because ${s.motive.replace(/^because\s+/i, '')})` : ''}. Steps: ${s.steps.map((t, i) => `${i + 1}. ${t}${i < s.done ? ' (done)' : ''}`).join(' ')}${next ? '' : ' - all done'}. ${s.visibility}${s.heard ? `; ${userName} has learned of it - they may react to that` : ''}; ${due}.`;
}

// The ways a scheme may surface, as the prompt names them.
function waysOf({ surfacing = 'all', canonOnly = false } = {}) {
    if (surfacing === 'talk') return { list: ['rumour', 'news'], words: 'a rumour people pass on, or news' };
    const ways = ['rumour', 'news', 'trace', 'approach', 'arrival', 'happening', ...(canonOnly ? [] : ['hook'])];
    return {
        list: ways,
        words: [
            'a rumour people pass on', 'news', 'a trace someone could find at a place', 'someone coming to find them (approach)',
            'someone arriving nearby without seeking them yet (arrival)', 'a happening set for a later day (in_days 1 or more)',
            ...(canonOnly ? [] : ['a quest they could take up (hook - give it a name)']),
        ].join(', '),
    };
}

// input: { ripples: [{ id, text }], stakeholders: [stakeholder], schemes:
//   [scheme] (open ones), day, daysPassed, limits: the stir (world/model.js
//   stirOf: { start, surface, press }), aim: { word, lean } | null,
//   surfacing: 'all' | 'talk' | 'log', canonOnly, userName, ownPass (the
//   WORLD pass, not riding on the DAY pass) }
// -> { text, field, shape } - text: the prompt's WORLD section; field: the
//   JSON the DAY answer adds after its own fields; shape: the WORLD pass's
//   answer. text is '' when there is nothing to move.
export function worldPart(input) {
    const userName = clean(input.userName) || 'the player';
    const ripples = list(input.ripples);
    const people = list(input.stakeholders);
    const schemes = list(input.schemes);
    if (!ripples.length && !schemes.length && !people.length) return { text: '', field: '', shape: '' };
    const days = Number.isInteger(input.daysPassed) && input.daysPassed > 1 ? input.daysPassed : 1;
    const parts = [`THE WORLD MEANWHILE (off scene: people who are not with ${userName} pursue their own ends${days > 1 ? `; ${days} days have passed since the world last moved` : ''})`];
    if (ripples.length) parts.push('What has happened that others would react to:', ...ripples.map((r) => `- [${r.id}] ${clean(r.text)}`));
    if (people.length) parts.push(`Who might care (none of them is in the scene):`, ...people.map(stakeholderLine));
    if (schemes.length) parts.push('Schemes under way:', ...schemes.map((s) => schemeLine(s, input.day, userName)));
    const ways = waysOf(input);
    const limits = input.limits ?? {};
    const surface = limits.surface ?? 1;
    const start = limits.start ?? 1;
    const aim = limits.press === 'quiet' ? ''
        : input.aim?.word === 'build' ? `The story wants to build${input.aim.lean ? ` (${input.aim.lean})` : ''}: schemes may press harder, and what surfaces may bring trouble closer.`
            : input.aim?.word === 'ease' ? 'The story wants to ease: schemes go on quietly, and only good or neutral things surface.' : '';
    parts.push(
        `For each scheme whose next step is due, say what that step did off scene${days > 1 ? ' over these days' : ''}, and when the next one comes. Close a scheme the story has overtaken (done, failed or dropped).`,
        start <= 0 ? 'Start no new scheme today.'
            : `Start ${start === 1 ? 'at most one new scheme' : `at most ${start} new schemes`}, only for someone listed above who has a real reason - one of the happenings, or their own goals - and only what they could plausibly do from where they are, with travel taking its time. None is needed if nobody would act.`,
        `A scheme acts on the world around ${userName} - it may watch, seek, help or work against them - but it never decides what ${userName} does, knows or feels.`,
        input.surfacing === 'log' || surface <= 0 ? `Nothing surfaces for ${userName} today: leave every "surface" empty.`
            : `Let at most ${surface} of them surface where ${userName} could come across it - ${ways.words}.${input.ownPass ? '' : ` If someone comes to find ${userName} today, make that one of the day's moments too.`}`,
        aim,
    );
    const wayList = input.surfacing === 'log' || surface <= 0 ? 'none' : `${ways.list.join('|')}|none`;
    const shape = `{"schemes":[{"id":"<the [s...] id of a scheme under way, or empty for a new one>","who":["<names of those behind it>"],"aim":"<what they want>","motive":"<why>","from":"<the [r...] id it grows out of, or 'goal'>","steps":["<for a new scheme: three to five steps, each one sentence with where it happens>"],"done":<how many of its steps are done now>,"next_in_days":<days until its next step>,"about_player":"seeks|watches|opposes|helps|none","visibility":"hidden|traces|rumoured|public","status":"under way|stalled|done|failed|dropped","log":"<what happened off scene, one sentence in the past tense>","surface":{"way":"${wayList}","text":"<what ${userName} could hear, find or meet, one sentence>","where":"<a place name, or empty for anywhere>","in_days":0${ways.list.includes('hook') ? ',"name":"<a hook\'s quest name>"' : ''}}}]}`;
    return { text: parts.filter(Boolean).join('\n'), field: ` "world":${shape}`, shape };
}

// The WORLD pass (Lively and Turbulent): the world's part on its own.
// input: { dossier, messages: [{ name, text, isUser }], userName, dateText,
//   story: { shape, act, beat } | null, world: worldPart(...) }
export function buildWorldPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const system = [
        'You are the game master of an ongoing roleplay, working in private on the world beyond the scene. Another writer narrates the story; you decide what the people and factions who are not in it are doing.',
        `${userName} is the player character, played by a human: never decide what ${userName} says, does, thinks or feels. Plan what others do; ${userName} reacts as they please.`,
        'Use only the people, places, factions and happenings given, or ones that grow plainly out of them. People know only what they have learned, and act as the story has shown them.',
        'Answer with JSON only - no prose before or after it.',
    ].join(' ');
    const chat = list(input.messages).slice(-4).map((m) => `${clean(m.name) || (m.isUser ? userName : 'Narrator')}: ${cut(m.text, 500)}`).join('\n\n');
    const story = input.story && (clean(input.story.beat) || clean(input.story.shape))
        ? [clean(input.story.shape) ? `- The story's shape: ${clean(input.story.shape)}${clean(input.story.act) ? `, now in "${clean(input.story.act)}"` : ''}.` : '', clean(input.story.beat) ? `- The beat now: ${clean(input.story.beat)}` : ''].filter(Boolean).join('\n') : '';
    const parts = [clean(input.dossier), '', 'THE LATEST CHAT (where the story is now)', chat || '(the story has not started yet)'];
    if (story) parts.push('', 'WHERE THE STORY IS GOING (let the world serve it, without forcing it)', story);
    parts.push('', `TODAY${clean(input.dateText) ? ` - ${clean(input.dateText)}` : ''}`, input.world?.text ?? '', '', 'Answer in this JSON shape:', input.world?.shape ?? '{"schemes":[]}');
    return { system, prompt: parts.join('\n') };
}

function readSurface(v) {
    if (!isObject(v)) return null;
    const way = clean(v.way).toLowerCase();
    if (!WAYS.includes(way) || !clean(v.text)) return null;
    const n = Number(v.in_days);
    return { way, text: cut(v.text, 300), where: cut(v.where, 120), inDays: Number.isFinite(n) ? Math.round(n) : 0, name: cut(v.name, 80) };
}

// The "world" object of a DAY answer, or a WORLD pass's answer.
// -> { schemes: [...] } or null.
export function readWorld(json) {
    if (!isObject(json)) return null;
    const schemes = list(json.schemes).filter(isObject).map((s) => {
        const status = clean(s.status).toLowerCase();
        const visibility = clean(s.visibility).toLowerCase();
        const about = clean(s.about_player ?? s.aboutPlayer).toLowerCase();
        const done = Number(s.done);
        const next = Number(s.next_in_days);
        return {
            id: clean(s.id).replace(/^\[|\]$/g, ''),
            who: texts(s.who, 4).map((t) => cut(t, 80)),
            aim: cut(s.aim, 200),
            motive: cut(s.motive, 200),
            from: cut(s.from, 80).replace(/^\[|\]$/g, ''),
            steps: texts(s.steps, 5).map((t) => cut(t, 200)),
            done: Number.isFinite(done) ? Math.max(0, Math.round(done)) : null,
            inDays: Number.isFinite(next) ? Math.round(next) : 1,
            aboutPlayer: ABOUT.includes(about) ? about : '',
            visibility: VISIBILITIES.includes(visibility) ? visibility : '',
            status: STATUSES.includes(status) ? status : '',
            log: cut(s.log, 300),
            surface: readSurface(s.surface),
        };
    }).filter((s) => s.id || (s.aim && s.who.length));
    return schemes.length ? { schemes: schemes.slice(0, 10) } : null;
}
