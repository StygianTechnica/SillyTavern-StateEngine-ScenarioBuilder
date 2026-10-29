// The world meanwhile - its part of the DAY pass's prompt and the reader for
// its answer (pure; docs/DESIGN - THE WORLD MEANWHILE.md §6-7). At the Quiet
// level the world costs no call of its own: the DAY pass, planning the new
// in-game day, is also told what has happened that others would react to,
// who might care, and the schemes under way, and answers with a "world"
// object beside its moments (src/planner/prompts.js buildDayPrompt).

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const cut = (v, n) => { const t = clean(v); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const texts = (v, max) => list(v).map((x) => clean(typeof x === 'string' ? x : x?.text)).filter(Boolean).slice(0, max);

const SURFACE_WAYS = ['rumour', 'news', 'trace', 'approach'];
const STATUSES = ['under way', 'stalled', 'done', 'failed', 'dropped'];
const VISIBILITIES = ['hidden', 'traces', 'rumoured', 'public'];
const ABOUT = ['seeks', 'watches', 'opposes', 'helps', 'none'];

// One stakeholder for the prompt: { name, type, why: [text], role, goals,
// personality, faction }.
function stakeholderLine(s) {
    const facts = [
        clean(s.role) ? `role: ${cut(s.role, 120)}` : '',
        clean(s.goals) ? `goals: ${cut(s.goals, 200)}` : '',
        clean(s.personality) ? `nature: ${cut(s.personality, 120)}` : '',
        clean(s.where) ? `last seen: ${cut(s.where, 80)}` : '',
    ].filter(Boolean).join('; ');
    return `- ${clean(s.name)} (${s.type === 'faction' ? 'faction' : 'person'})${s.why?.length ? ` - ${s.why.map(clean).join('; ')}` : ''}${facts ? `. ${facts}` : ''}`;
}

function schemeLine(s, day) {
    const next = s.steps[s.done];
    const due = s.status === 'stalled' ? 'stalled' : s.nextDay === null || s.nextDay <= day ? 'next step due today' : `next step in ${s.nextDay - day} day${s.nextDay - day === 1 ? '' : 's'}`;
    return `- [${s.id}] ${s.names.join(', ') || 'someone'}: ${s.aim}${s.motive ? ` (because ${s.motive.replace(/^because\s+/i, '')})` : ''}. Steps: ${s.steps.map((t, i) => `${i + 1}. ${t}${i < s.done ? ' (done)' : ''}`).join(' ')}${next ? '' : ' - all done'}. ${s.visibility}; ${due}.`;
}

// input: { ripples: [{ id, text }], stakeholders: [stakeholder], schemes:
//   [scheme] (open ones), day, daysPassed, limits: { start, surface },
//   aim: { word, lean } | null, surfacing: 'all' | 'talk' | 'log', userName }
// -> { text, field } - text: the prompt's WORLD section; field: the JSON
//   the answer adds (after the day plan's own fields).
export function worldPart(input) {
    const userName = clean(input.userName) || 'the player';
    const ripples = list(input.ripples);
    const people = list(input.stakeholders);
    const schemes = list(input.schemes);
    if (!ripples.length && !schemes.length && !people.length) return { text: '', field: '' };
    const days = Number.isInteger(input.daysPassed) && input.daysPassed > 1 ? input.daysPassed : 1;
    const parts = [`THE WORLD MEANWHILE (off scene: people who are not with ${userName} pursue their own ends${days > 1 ? `; ${days} days have passed since the world last moved` : ''})`];
    if (ripples.length) parts.push('What has happened that others would react to:', ...ripples.map((r) => `- [${r.id}] ${clean(r.text)}`));
    if (people.length) parts.push(`Who might care (none of them is in the scene):`, ...people.map(stakeholderLine));
    if (schemes.length) parts.push('Schemes under way:', ...schemes.map((s) => schemeLine(s, input.day)));
    const ways = input.surfacing === 'talk' ? 'a rumour people pass on, or news' : 'a rumour people pass on, news, a trace someone could find at a place, or someone coming to find them (an approach)';
    const aim = input.aim?.word === 'build' ? `The story wants to build${input.aim.lean ? ` (${input.aim.lean})` : ''}: schemes may press harder, and what surfaces may bring trouble closer.`
        : input.aim?.word === 'ease' ? 'The story wants to ease: schemes go on quietly, and only good or neutral things surface.' : '';
    parts.push(
        `For each scheme whose next step is due, say what that step did off scene${days > 1 ? ' over these days' : ''}, and when the next one comes. Close a scheme the story has overtaken (done, failed or dropped).`,
        `Start ${input.limits?.start === 1 ? 'at most one new scheme' : `at most ${input.limits?.start ?? 1} new schemes`}, only for someone listed above who has a real reason - one of the happenings, or their own goals - and only what they could plausibly do from where they are, with travel taking its time. None is needed if nobody would act.`,
        `A scheme acts on the world around ${userName} - it may watch, seek, help or work against them - but it never decides what ${userName} does, knows or feels.`,
        input.surfacing === 'log' ? `Nothing surfaces for ${userName} today: leave every "surface" empty.`
            : `Let at most ${input.limits?.surface ?? 1} of them surface where ${userName} could come across it - ${ways}. If someone comes to find ${userName} today, make that one of the day's moments too.`,
        aim,
    );
    const field = ` "world":{"schemes":[{"id":"<the [s...] id of a scheme under way, or empty for a new one>","who":["<names of those behind it>"],"aim":"<what they want>","motive":"<why>","from":"<the [r...] id it grows out of, or 'goal'>","steps":["<for a new scheme: three to five steps, each one sentence with where it happens>"],"done":<how many of its steps are done now>,"next_in_days":<days until its next step>,"about_player":"seeks|watches|opposes|helps|none","visibility":"hidden|traces|rumoured|public","status":"under way|stalled|done|failed|dropped","log":"<what happened off scene, one sentence in the past tense>","surface":{"way":"${input.surfacing === 'talk' ? 'rumour|news' : 'rumour|news|trace|approach'}|none","text":"<what ${userName} could hear, find or meet, one sentence>","where":"<a place name, or empty for anywhere>","in_days":0}}]}`;
    return { text: parts.filter(Boolean).join('\n'), field };
}

function readSurface(v) {
    if (!isObject(v)) return null;
    const way = clean(v.way).toLowerCase();
    if (!SURFACE_WAYS.includes(way) || !clean(v.text)) return null;
    const n = Number(v.in_days);
    return { way, text: cut(v.text, 300), where: cut(v.where, 120), inDays: Number.isFinite(n) ? Math.round(n) : 0 };
}

// The "world" object of a DAY answer. -> { schemes: [...] } or null.
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
    return schemes.length ? { schemes: schemes.slice(0, 8) } : null;
}
