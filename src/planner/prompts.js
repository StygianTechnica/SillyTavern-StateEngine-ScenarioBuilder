// The GM planner's background passes - prompts and answer readers (pure;
// docs/DESIGN - GM PLANNER.md §4). Each pass asks for JSON; src/planner/
// run.js reads the reply (generate/prompt.js readModelJson) and hands the
// object to the matching read*() here, which keeps only what fits.
//
//   DAY      plans one in-game day: moments, agendas, off-screen moves,
//            and which queued requests they answer
//   CHECK    keeps the day's plan in step with the story: moments done or
//            gone, new ones (for queued requests)
//   INSPIRE  distils an inspiration text into motifs - never its plot

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const cut = (v, n) => { const t = clean(v); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const texts = (v, max) => list(v).map((x) => clean(typeof x === 'string' ? x : x?.text)).filter(Boolean).slice(0, max);

function rules(userName) {
    return [
        `${userName} is the player character, played by a human: never plan what ${userName} says, does, thinks or feels, and never make a moment depend on ${userName} choosing it. Plan what the world and the other characters do; ${userName} reacts as they please.`,
        'Use only the people, places, factions and threads given, or ones that grow plainly out of them. People know only what they have learned.',
        'Answer with JSON only - no prose before or after it.',
    ].join(' ');
}

function recentText(messages, userName) {
    return list(messages).slice(-8).map((m) => `${clean(m.name) || (m.isUser ? userName : 'Narrator')}: ${cut(m.text, 700)}`).join('\n\n') || '(the story has not started yet)';
}

function requestsText(requests) {
    return list(requests).map((r) => `- [${r.id}] ${clean(r.text)} (${r.urgency === 'soon' ? 'soon' : r.urgency === 'today' ? 'today' : 'whenever it fits'})`).join('\n');
}

// input: { dossier (dossierText), dateText, dayPart, userName, messages,
//   requests: [{ id, text, urgency }], motifs: [text], gmStyle,
//   previous: { moments, offscreen } | null, rest: true when re-planning
//   the rest of a day already under way }
export function buildDayPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const system = [
        'You are the game master of an ongoing roleplay, planning ahead in private. Another writer narrates the story; before each reply you brief it.',
        `Now you plan ${input.rest ? 'the rest of this in-game day' : 'one in-game day'}: a handful of things that could happen, what the people who matter want and will do, and what goes on off-screen. The plan is a set of opportunities, not a script - the player may go anywhere, and the plan bends.`,
        rules(userName),
        clean(input.gmStyle) ? `How the user wants this story run - follow it: ${cut(input.gmStyle, 600)}` : '',
    ].filter(Boolean).join(' ');
    const parts = [clean(input.dossier), '', 'THE LATEST CHAT', recentText(input.messages, userName)];
    if (input.previous?.moments?.length) {
        parts.push('', 'WHAT WAS PLANNED BEFORE (and how it went)');
        for (const m of input.previous.moments) parts.push(`- ${m.text} - ${m.status}${m.note ? `: ${m.note}` : ''}`);
    }
    if (input.requests?.length) parts.push('', `WHAT THE USER WOULD LIKE TO SEE (fit these in where they are natural; each id is the request's)`, requestsText(input.requests));
    if (input.motifs?.length) parts.push('', 'MOTIFS FROM THE USER\'S INSPIRATION (echo them as images and turns of fate, never as literal events)', input.motifs.map((m) => `- ${clean(m)}`).join('\n'));
    parts.push(
        '',
        `PLAN ${input.rest ? 'THE REST OF THE DAY' : 'THE DAY'}${clean(input.dateText) ? ` - ${clean(input.dateText)}` : ''}${clean(input.dayPart) ? `, starting ${clean(input.dayPart)}` : ''}`,
        'Two to five moments, in the order they could happen: something someone does, an arrival, news, a discovery, a complication, a quiet beat. Each grows out of what is above, moves a thread, a person\'s agenda or a request along, and leaves the player free to respond. Vary them: not every moment is a crisis.',
        'Answer in this JSON shape:',
        '{"moments":[{"text":"<what happens, one sentence>","when":"<morning|midday|afternoon|evening|night|any time>","trigger":"<the condition, e.g. \'if the scene is at the forge\'; empty if none>","ties":["<names of the people, places, factions or threads it involves>"],"droppable":true}],',
        ' "agendas":[{"who":"<a person who matters today, not the player>","wants":"<what they want>","will":"<what they will do about it>","hidden":"<what they hide, or empty>"}],',
        ' "offscreen":["<what a faction or absent person is doing meanwhile>"],',
        ' "requests":[{"request":"<request id>","moments":[<the number of each moment that answers it, from 1>]}]}',
    );
    return { system, prompt: parts.join('\n') };
}

function readMoment(m) {
    if (!isObject(m) || !clean(m.text)) return null;
    return { text: cut(m.text, 300), when: cut(m.when, 40), trigger: cut(m.trigger, 160), ties: texts(m.ties, 6), droppable: m.droppable !== false };
}

function readLinks(v) {
    return list(v).filter(isObject).map((x) => ({ request: clean(x.request ?? x.id), moments: list(x.moments).map(Number).filter((n) => Number.isInteger(n) && n > 0) }))
        .filter((x) => x.request && x.moments.length);
}

// -> { moments, agendas, offscreen, requests } or null when nothing usable.
export function readDayPlan(json) {
    if (!isObject(json)) return null;
    const moments = list(json.moments).map(readMoment).filter(Boolean).slice(0, 6);
    if (!moments.length) return null;
    return {
        moments,
        agendas: list(json.agendas).filter((a) => isObject(a) && clean(a.who) && clean(a.wants))
            .map((a) => ({ who: cut(a.who, 60), wants: cut(a.wants, 200), will: cut(a.will, 200), hidden: cut(a.hidden, 200) })).slice(0, 6),
        offscreen: texts(json.offscreen, 4).map((t) => cut(t, 240)),
        requests: readLinks(json.requests),
    };
}

// input: { userName, messages, moments: [moment] (pending and done),
//   requests: [{ id, text, urgency }], dayPart }
export function buildCheckPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const system = [
        'You are the game master of an ongoing roleplay, keeping your private plan for the day in step with what has actually happened.',
        rules(userName),
    ].join(' ');
    const parts = ['THE LATEST CHAT', recentText(input.messages, userName), '', `TODAY'S PLAN${clean(input.dayPart) ? ` (it is now ${clean(input.dayPart)})` : ''}`];
    for (const m of list(input.moments)) parts.push(`- [${m.id}] ${m.text}${m.when ? ` (${m.when})` : ''} - ${m.status}`);
    if (input.requests?.length) parts.push('', 'WHAT THE USER WOULD LIKE TO SEE, NOT YET PLANNED (each id is the request\'s)', requestsText(input.requests));
    parts.push(
        '',
        'Which pending moments has the story already played out ("done"), and which can no longer happen or no longer fit where the story went ("skipped")? Leave the rest alone.',
        'Add a new moment only for a request above, or when the story has opened something the plan lacks (at most two).',
        'Answer in this JSON shape:',
        '{"done":[{"id":"<moment id>","how":"<a few words>"}],"skipped":[{"id":"<moment id>","why":"<a few words>"}],',
        ' "add":[{"text":"<what happens>","when":"<time of day or any time>","trigger":"<condition or empty>","ties":["<names>"],"droppable":true}],',
        ' "requests":[{"request":"<request id>","moments":[<number of each added moment that answers it, from 1>]}]}',
    );
    return { system, prompt: parts.join('\n') };
}

// -> { done: [{ id, how }], skipped: [{ id, why }], add: [moment], requests }
export function readCheck(json) {
    if (!isObject(json)) return { done: [], skipped: [], add: [], requests: [] };
    const ids = (v, key) => list(v).map((x) => (typeof x === 'string' ? { id: clean(x).toLowerCase(), [key]: '' } : isObject(x) ? { id: clean(x.id).toLowerCase(), [key]: cut(x[key], 160) } : null)).filter((x) => x?.id);
    return {
        done: ids(json.done, 'how'),
        skipped: ids(json.skipped, 'why'),
        add: list(json.add).map(readMoment).filter(Boolean).slice(0, 2),
        requests: readLinks(json.requests),
    };
}

// input: { title, text }
export function buildInspirePrompt(input) {
    const system = [
        'You help a game master find inspiration. The user has given a piece of writing - a story, a poem or song lyrics - to inspire a roleplay. It is not to be retold or quoted, and its events are not to happen in the story.',
        'Read it for what lies under the surface: its images, symbols, emotional tones and themes. Distil them into short motifs a storyteller could echo - a recurring image, a turn of fate, a mood - in a world of their own.',
        'Never quote the text; write every motif in your own words. Answer with JSON only.',
    ].join(' ');
    const prompt = [
        clean(input.title) ? `THE WRITING: ${clean(input.title)}` : 'THE WRITING',
        String(input.text ?? '').slice(0, 8000),
        '',
        'Give five to eight motifs, each a short phrase of your own (under 15 words): images, symbols, tensions and feelings to weave in symbolically.',
        'Answer in this JSON shape: {"motifs":["<motif>"]}',
    ].join('\n');
    return { system, prompt };
}

// -> [motif]
export function readInspiration(json, sourceText = '') {
    const source = clean(sourceText).toLowerCase();
    // A "motif" that copies a long run of the source is a quote: dropped.
    const quotes = (m) => {
        const w = m.toLowerCase().split(' ');
        for (let i = 0; i + 6 <= w.length; i++) if (source.includes(w.slice(i, i + 6).join(' '))) return true;
        return false;
    };
    return texts(isObject(json) ? json.motifs : json, 8).map((m) => cut(m, 120)).filter((m) => !quotes(m));
}
