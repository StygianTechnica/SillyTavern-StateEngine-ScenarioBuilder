// The GM planner's background passes - prompts and answer readers (pure;
// docs/DESIGN - GM PLANNER.md §4). Each pass asks for JSON; src/planner/
// run.js reads the reply (generate/prompt.js readModelJson) and hands the
// object to the matching read*() here, which keeps only what fits.
//
//   DAY      plans one in-game day: moments, agendas, off-screen moves,
//            and which queued requests they answer
//   CHECK    keeps the day's plan in step with the story: moments done or
//            gone, new ones (for queued requests); whether the outline's
//            beat has played out; a tension reading without Archivist
//   OUTLINE  writes or reviews the long-term outline along the story's
//            shape and tension (src/planner/shapes.js)
//   INSPIRE  distils an inspiration text into motifs - never its plot

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const cut = (v, n) => { const t = clean(v); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// A sentence to follow a comma: lower-case start, no closing stop.
const unstopFirst = (v) => { const t = clean(v).replace(/[.!?]+$/, ''); return t ? t.charAt(0).toLowerCase() + t.slice(1) : ''; };
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const texts = (v, max) => list(v).map((x) => clean(typeof x === 'string' ? x : x?.text)).filter(Boolean).slice(0, max);

function rules(userName) {
    return [
        `${userName} is the player character, played by a human: never plan what ${userName} says, does, thinks or feels, and never make a moment depend on ${userName} choosing it. Plan what the world and the other characters do; ${userName} reacts as they please.`,
        'Use only the people, places, factions and threads given, or ones that grow plainly out of them. People know only what they have learned.',
        'Call every place by its own name and never put one place inside another: a settlement or faction mentioned somewhere is not where the scene is. Something that is somewhere else - an object kept far away, a goal that needs a journey - cannot happen here until the story travels there.',
        'People act as the story has shown them: no betrayals, attacks or hidden schemes the story has not set up.',
        'Answer with JSON only - no prose before or after it.',
    ].join(' ');
}

function recentText(messages, userName) {
    return list(messages).slice(-8).map((m) => `${clean(m.name) || (m.isUser ? userName : 'Narrator')}: ${cut(m.text, 700)}`).join('\n\n') || '(the story has not started yet)';
}

// story: { shape, act, beat, next, aim: { word, lean, why } } -> lines.
function storyText(story) {
    if (!story) return '';
    return [
        clean(story.shape) ? `- The story's shape: ${clean(story.shape)}${clean(story.act) ? `, now in "${clean(story.act)}"` : ''}.` : '',
        clean(story.beat) ? `- The beat now: ${clean(story.beat)}` : '',
        clean(story.next) ? `- The beat after it: ${clean(story.next)}` : '',
        story.aim ? `- Tension: ${story.aim.word} (${story.aim.lean}) - ${clean(story.aim.why)}.` : '',
    ].filter(Boolean).join('\n');
}

function requestsText(requests) {
    return list(requests).map((r) => `- [${r.id}] ${clean(r.text)} (${r.urgency === 'soon' ? 'soon' : r.urgency === 'today' ? 'today' : 'whenever it fits'})`).join('\n');
}

// input: { dossier (dossierText), dateText, dayPart, userName, messages,
//   requests: [{ id, text, urgency }], motifs: [text], gmStyle,
//   previous: { moments, offscreen } | null, rest: true when re-planning
//   the rest of a day already under way, happenings: [{ id, text, when,
//   due: 'today' | 'tomorrow' }] (the agenda's, src/planner/model.js) }
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
    const story = storyText(input.story);
    if (story) parts.push('', 'WHERE THE STORY IS GOING (let today serve this beat and this aim, without forcing it)', story);
    const happenings = list(input.happenings).filter((x) => clean(x?.text));
    if (happenings.length) {
        parts.push('', 'ON THE CALENDAR (happenings set for these days: plan a moment for each one due today, and give that moment its id; one due tomorrow may be foreshadowed)');
        for (const x of happenings) parts.push(`- [${x.id}] ${clean(x.text)} - ${x.due === 'tomorrow' ? 'tomorrow' : 'today'}${clean(x.when) ? `, ${clean(x.when)}` : ''}`);
    }
    const happeningField = happenings.length ? ',"happening":"<the calendar id it plays out, or empty>"' : '';
    parts.push(
        '',
        `PLAN ${input.rest ? 'THE REST OF THE DAY' : 'THE DAY'}${clean(input.dateText) ? ` - ${clean(input.dateText)}` : ''}${clean(input.dayPart) ? `, starting ${clean(input.dayPart)}` : ''}`,
        ...(clean(input.place) ? [`The scene is at ${clean(input.place)}${clean(input.situation) ? `, where ${unstopFirst(input.situation)}` : ''}. The day starts from there and from what is going on now; moments elsewhere happen only if the story would plausibly go there today.`] : []),
        'Two to five moments, in the order they could happen: something someone does, an arrival, news, a discovery, a complication, a quiet beat. Each grows out of what is above, moves a thread, a person\'s agenda or a request along, and leaves the player free to respond. Vary them: not every moment is a crisis.',
        'Answer in this JSON shape:',
        `{"moments":[{"text":"<what happens, one sentence>","when":"<morning|midday|afternoon|evening|night|any time>","trigger":"<the condition, e.g. 'if the scene is at the forge'; empty if none>","ties":["<names of the people, places, factions or threads it involves>"],"droppable":true${happeningField}}],`,
        ' "agendas":[{"who":"<a person who matters today, not the player>","wants":"<what they want>","will":"<what they will do about it>","hidden":"<what they hide, or empty>"}],',
        ' "offscreen":["<what a faction or absent person is doing meanwhile>"],',
        ' "requests":[{"request":"<request id>","moments":[<the number of each moment that answers it, from 1>]}]}',
    );
    return { system, prompt: parts.join('\n') };
}

function readMoment(m) {
    if (!isObject(m) || !clean(m.text)) return null;
    const happening = clean(m.happening).replace(/^\[|\]$/g, '');
    return { text: cut(m.text, 300), when: cut(m.when, 40), trigger: cut(m.trigger, 160), ties: texts(m.ties, 6), droppable: m.droppable !== false, ...(happening ? { happening } : {}) };
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
//   requests: [{ id, text, urgency }], dayPart, beat (the outline's beat
//   now, to ask whether it has played out), askTension (no Archivist: the
//   pass reads the tension itself) }
export function buildCheckPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const system = [
        'You are the game master of an ongoing roleplay, keeping your private plan for the day in step with what has actually happened.',
        rules(userName),
    ].join(' ');
    const parts = ['THE LATEST CHAT', recentText(input.messages, userName), '', `TODAY'S PLAN${clean(input.dayPart) ? ` (it is now ${clean(input.dayPart)})` : ''}`];
    for (const m of list(input.moments)) parts.push(`- [${m.id}] ${m.text}${m.when ? ` (${m.when})` : ''} - ${m.status}`);
    if (input.requests?.length) parts.push('', 'WHAT THE USER WOULD LIKE TO SEE, NOT YET PLANNED (each id is the request\'s)', requestsText(input.requests));
    if (clean(input.beat)) parts.push('', 'THE STORY\'S BEAT NOW (from the long-term outline)', `- ${clean(input.beat)}`);
    parts.push(
        '',
        'Which pending moments has the story already played out ("done"), and which can no longer happen or no longer fit where the story went ("skipped")? Leave the rest alone.',
        'Add a new moment only for a request above, or when the story has opened something the plan lacks (at most two).',
    );
    if (clean(input.beat)) parts.push('Say whether the story has now played out the beat above ("beat_done": true), or not yet (false).');
    if (input.askTension) parts.push('Rate the story\'s tension as the latest chat leaves it, each from 0 (none) to 5 (unbearable): threat (danger to people), uncertainty (open questions, mistrust, the unknown) and emotional (what is at stake between people), with a few words on what drives it.');
    parts.push(
        'Answer in this JSON shape:',
        '{"done":[{"id":"<moment id>","how":"<a few words>"}],"skipped":[{"id":"<moment id>","why":"<a few words>"}],',
        ' "add":[{"text":"<what happens>","when":"<time of day or any time>","trigger":"<condition or empty>","ties":["<names>"],"droppable":true}],',
        ` "requests":[{"request":"<request id>","moments":[<number of each added moment that answers it, from 1>]}]${clean(input.beat) ? ',\n "beat_done":false' : ''}${input.askTension ? ',\n "tension":{"threat":0,"uncertainty":0,"emotional":0,"reason":"<what drives it>"}' : ''}}`,
    );
    return { system, prompt: parts.join('\n') };
}

const rating = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && v !== '' && v !== null ? Math.min(5, Math.max(0, n)) : null;
};

// A tension reading from a pass, or null.
function readTension(t) {
    if (!isObject(t)) return null;
    const r = { threat: rating(t.threat), uncertainty: rating(t.uncertainty), emotional: rating(t.emotional), reason: cut(t.reason, 200) };
    return [r.threat, r.uncertainty, r.emotional].some((v) => v !== null) ? r : null;
}

// -> { done: [{ id, how }], skipped: [{ id, why }], add: [moment], requests,
//      beatDone, tension }
export function readCheck(json) {
    if (!isObject(json)) return { done: [], skipped: [], add: [], requests: [], beatDone: false, tension: null };
    const ids = (v, key) => list(v).map((x) => (typeof x === 'string' ? { id: clean(x).toLowerCase(), [key]: '' } : isObject(x) ? { id: clean(x.id).toLowerCase(), [key]: cut(x[key], 160) } : null)).filter((x) => x?.id);
    return {
        done: ids(json.done, 'how'),
        skipped: ids(json.skipped, 'why'),
        add: list(json.add).map(readMoment).filter(Boolean).slice(0, 2),
        requests: readLinks(json.requests),
        beatDone: json.beat_done === true || json.beatDone === true,
        tension: readTension(json.tension),
    };
}

// input: { dossier, userName, messages, shape: { label, blurb, lean, acts:
//   [{ title, share, band }] }, outline (current, or null), tension:
//   { now, recent } (readings), motifs, gmStyle, rewrite (start over,
//   keeping only what is done and what the user locked), storySoFar (what
//   has happened: the user's note, Archivist's summary and major events,
//   threads and quests), underWay (the story is well past its beginning),
//   startAct: { index, title } (the user says the story is in this act now),
//   keepLocked (a rewrite keeps the user's locked beats; default true),
//   wish (the user's steer for a rewrite, or ''), newVolume: { number }
//   (the first outline of a new volume: it starts at its first act, growing
//   out of the volumes before) }
// How many beats an act gets at the user's pace (settings.planner.pacing):
// a gentle story gives each chapter room to breathe, a fast one gets on.
export function beatsPerAct(pacing) {
    return { gentle: 'four to six', brisk: 'three to four', fast: 'two to three' }[pacing] ?? 'two to four';
}

export function buildOutlinePrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const shape = input.shape;
    const writing = !input.outline || input.rewrite;
    const fresh = writing && !!input.newVolume;
    const joining = writing && !fresh && (input.underWay || !!input.startAct || !!String(input.storySoFar ?? '').trim());
    const system = [
        'You are the game master of an ongoing roleplay, keeping the long-term outline of the story in private. Another writer narrates; you steer through briefings. The outline is where the story could go - a direction, never a script: the player may take it anywhere, and the outline follows.',
        joining ? 'This story is already under way: you are taking over a game in progress. Never start it over or go back to its beginning - the outline begins where the story already is.' : '',
        rules(userName),
        clean(input.gmStyle) ? `How the user wants this story run - follow it: ${cut(input.gmStyle, 600)}` : '',
    ].filter(Boolean).join(' ');
    const parts = [clean(input.dossier)];
    const sofar = String(input.storySoFar ?? '').trim();
    if (sofar) parts.push('', 'THE STORY SO FAR (what has already happened - it matters more than how the setting describes the start)', sofar.slice(0, 6000));
    parts.push('', 'THE LATEST CHAT', recentText(input.messages, userName));
    parts.push('', `THE STORY'S SHAPE: ${clean(shape.label)} - ${clean(shape.blurb)}`, `It leans on ${shape.lean} tension. Its acts, in order (share of the story; target tension 0-5):`);
    for (const a of shape.acts) parts.push(`- ${a.title} (${Math.round(a.share * 100)}%; ${a.band[0]}-${a.band[1]})`);
    const t = input.tension?.now;
    if (t) parts.push('', 'THE STORY\'S TENSION NOW (0-5)', `- overall ${t.overall}${Number.isFinite(t.threat) ? `; threat ${t.threat}, uncertainty ${t.uncertainty}, emotional ${t.emotional}` : ''}${clean(t.reason) ? ` - ${clean(t.reason)}` : ''}`);
    const outline = input.outline;
    if (outline && !input.rewrite) {
        parts.push('', 'THE OUTLINE SO FAR (each beat has its id and status; [locked] beats are the user\'s - keep their words)');
        if (clean(outline.premise)) parts.push(`Premise: ${clean(outline.premise)}`);
        outline.acts.forEach((a, i) => {
            parts.push(`Act ${i + 1}: ${a.title}`);
            for (const b of a.beats) parts.push(`- [${b.id}] ${b.text} - ${b.status}${b.locked ? ' [locked]' : ''}`);
        });
    } else if (outline) {
        const keepLocked = input.keepLocked !== false;
        const keep = outline.acts.flatMap((a) => a.beats.filter((b) => (keepLocked && b.locked) || b.status === 'done'));
        if (keep.length) {
            parts.push('', `START THE OUTLINE OVER, BUT KEEP THESE (${keepLocked ? 'done, or the user\'s own' : 'what the story has done'} - same ids, same words)`);
            for (const b of keep) parts.push(`- [${b.id}] ${b.text} - ${b.status}${b.locked ? ' [locked]' : ''}`);
        }
    }
    if (input.motifs?.length) parts.push('', 'MOTIFS FROM THE USER\'S INSPIRATION (weave them in as recurring images, echoes and turns of fate - never as literal events or retold plot)', input.motifs.map((m) => `- ${clean(m)}`).join('\n'));
    if (fresh) {
        parts.push(
            '',
            `A NEW VOLUME - VOLUME ${input.newVolume.number}`,
            'The volumes before this one are finished (see the story so far). This is a new arc in the same world, with the same people and their history: it begins at the first act of the shape, now. Grow it out of where the last volume left things - its threads carried forward, the people\'s changed relationships, what was won and lost - without retelling it. Every beat starts "pending" except the first, which is "active".',
        );
    }
    if (joining) {
        const start = input.startAct;
        parts.push(
            '',
            'TAKING OVER A STORY IN PROGRESS',
            start
                ? `The user says the story is now in act ${start.index + 1}, "${clean(start.title)}". For the acts before it, write one or two beats each that sum up what has already happened, marked "done". In act ${start.index + 1}, mark "done" what has already happened in it, then the beat under way now "active", then what could come next "pending".`
                : 'Judge from the story so far and the latest chat which act of the shape the story is in now. For the acts it has already passed, write one or two beats each that sum up what has already happened, marked "done". In the current act, mark what has happened "done", the beat under way now "active", and what could come next "pending".',
            'The beats still to come grow out of where the story is now - its open threads and the people\'s agendas - not out of how the setting or the first messages introduced it.',
        );
    }
    parts.push(...steerLines(input.steer));
    if (clean(input.wish) && clean(input.wish) !== clean(input.steer)) parts.push('', 'WHAT THE USER WANTS FROM THIS OUTLINE (follow it)', `- ${cut(input.wish, 4000)}`);
    parts.push(
        '',
        outline && !input.rewrite ? 'REVIEW THE OUTLINE' : 'WRITE THE OUTLINE',
        `${outline && !input.rewrite ? 'Bring it up to date with the story: mark the beats the story has played out "done", the one under way "active", and any the story has made impossible "skipped". Rewrite or replace beats still to come if the story has moved somewhere better - keep each kept beat\'s id. Never add a new beat for something that has already happened. ' : ''}One act per act of the shape, in its order, ${beatsPerAct(input.pacing)} beats each. A beat is a turn in the story, loose enough to happen many ways ("the alliance is tested by a betrayal from within"), growing out of the threads, factions, frictions and people above. Everyday moments - a watch, a meal, waking, making camp, a stretch of road where nothing happens - are never beats, and nor is the journey itself: a beat is what happens where they arrive. Each beat happens in one place; two places are two beats, in the order the story will reach them (somewhere beyond the bridge comes after the bridge). Let each act's beats reach that act's target tension. Add a few seeds: small things to plant early so a later beat pays off.`,
        'Answer in this JSON shape:',
        '{"premise":"<what this story is about, two or three sentences>","themes":["<theme>"],',
        ' "acts":[{"title":"<act title>","beats":[{"id":"<the id of a beat kept from above, or empty for a new one>","text":"<the beat>","ties":["<names>"],"status":"pending|active|done|skipped"}]}],',
        ' "seeds":[{"text":"<what to plant>","payoff":"<the beat it pays off>"}],',
        ' "triggers":[{"when":"<a concrete thing the story will SHOW happening, for a beat of this act or the next>","then":"<what happens because of it>"}]}',
        'Triggers are optional (at most three): only for a beat that must follow from something the characters do ("when Remus opens his predecessor\'s tomb" -> "the corrupted champion rises and attacks"). Each "when" is watched in the story and the "then" is set off the moment it happens.',
    );
    return { system, prompt: parts.join('\n') };
}

// RECAP: the narrative of a finished volume, for the user (§5.1).
// input: { userName, number, shape (label), outline, chronicle: [{ day,
//   text }], summary (Archivist's story summary, or ''), events: [text]
//   (its major events in the volume), quests: [{ name, status }],
//   previous (the volumes before, short), closedEarly, words (a target) }
export function buildRecapPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const outline = input.outline;
    const system = [
        'You are the chronicler of an ongoing roleplay. A volume of the story has ended, and you write its recap for the person who plays it - so they have the full picture of what has happened.',
        `Write it as narrative prose in the past tense, like the "previously" of a novel series: what happened from the beginning to the end of this volume, who did what, what was won and lost, what changed between people, and what was left unresolved. ${userName} is the player character; tell what ${userName} did as history.`,
        'Use only what the material below says happened; never invent events. Answer with JSON only.',
    ].join(' ');
    const parts = [];
    if (clean(input.previous)) parts.push('THE VOLUMES BEFORE (for context only - do not recap them again)', String(input.previous).slice(0, 3000), '');
    parts.push(`VOLUME ${input.number}${clean(input.shape) ? ` (${clean(input.shape)})` : ''}${input.closedEarly ? ' - closed before its outline was finished' : ''}`);
    if (clean(outline?.premise)) parts.push(`What it was about: ${clean(outline.premise)}`);
    if (outline?.acts?.length) {
        parts.push('', 'ITS OUTLINE (what the story played out, and what it never reached)');
        outline.acts.forEach((a, i) => {
            parts.push(`Chapter ${i + 1}: ${a.title}`);
            for (const b of a.beats) parts.push(`- ${b.text} - ${b.status === 'done' ? 'happened' : b.status === 'skipped' ? 'did not happen' : 'not reached'}${b.note ? ` (${b.note})` : ''}`);
        });
    }
    const chronicle = list(input.chronicle);
    if (chronicle.length) {
        parts.push('', 'WHAT PLAYED OUT, IN ORDER');
        for (const c of chronicle) parts.push(`- ${Number.isInteger(c.day) ? `[day ${c.day}] ` : ''}${clean(c.text)}`);
    }
    if (clean(input.summary)) parts.push('', 'THE STORY\'S OWN SUMMARY (from its memory)', cut(input.summary, 2500));
    const events = texts(input.events, 20);
    if (events.length) parts.push('', 'MAJOR EVENTS', ...events.map((e) => `- ${e}`));
    const quests = list(input.quests).filter((q) => clean(q?.name));
    if (quests.length) parts.push('', 'QUESTS', ...quests.map((q) => `- ${clean(q.name)}: ${clean(q.status) || 'open'}`));
    const words = Number.isInteger(input.words) ? input.words : 600;
    parts.push(
        '',
        'WRITE THE RECAP',
        `About ${words} words in several paragraphs, the first one a short overview of the whole volume. Then give the volume a title of two to six words, and list the threads still open that should matter in the next volume (one short line each).`,
        'Answer in this JSON shape: {"title":"<title>","recap":"<the recap; paragraphs separated by \\n\\n>","threads":["<an open thread>"]}',
    );
    return { system, prompt: parts.join('\n') };
}

// -> { title, recap, threads } or null.
export function readRecap(json) {
    if (!isObject(json)) return null;
    const recap = String(json.recap ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (recap.length < 40) return null;
    return { title: cut(json.title, 80), recap: recap.slice(0, 8000), threads: texts(json.threads, 10).map((t) => cut(t, 200)) };
}

// A JSON answer cut off before its end (the model ran out of tokens): the
// part up to its last complete object, with what was left open closed.
// -> the repaired text, or '' when there is no complete object in it.
export function closeCutJson(raw) {
    const text = String(raw ?? '');
    const start = text.indexOf('{');
    if (start < 0) return '';
    const stack = [];
    let inString = false;
    let escaped = false;
    let lastGood = -1;
    let lastStack = null;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
        else if (ch === '}' || ch === ']') {
            stack.pop();
            if (ch === '}') { lastGood = i; lastStack = [...stack]; }
            if (!stack.length) return text.slice(start, i + 1);
        }
    }
    if (lastGood < 0) return '';
    return text.slice(start, lastGood + 1).replace(/,\s*$/, '') + lastStack.reverse().join('');
}

// A recap answer that is not clean JSON - long prose with an unescaped
// quote, a reply cut short, or plain prose with no JSON at all: what can be
// read of it. -> { title, recap, threads } or null (nothing usable).
export function readRecapText(raw) {
    const text = String(raw ?? '').replace(/\r/g, '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim();
    if (!text) return null;
    const unescape = (s) => s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const title = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1] ?? '';
    let recap = '';
    const at = /"recap"\s*:\s*"/.exec(text);
    if (at) {
        // Up to where the threads begin, the object closes, or the text ends.
        const rest = text.slice(at.index + at[0].length);
        const end = rest.search(/"\s*,\s*"threads"\s*:|"\s*}\s*$/);
        recap = unescape(end >= 0 ? rest.slice(0, end) : rest.replace(/"?\s*}?\s*$/, ''));
    } else if (!/^[{[]/.test(text)) {
        // Plain prose: the recap itself (a "Title:" line taken as the title).
        const m = /^(?:#+\s*|title\s*:\s*)([^\n]{2,80})\n+/i.exec(text);
        recap = m ? text.slice(m[0].length) : text;
        return readRecap({ title: m ? m[1] : '', recap, threads: [] });
    }
    const threads = [...(/"threads"\s*:\s*\[([\s\S]*?)(?:\]|$)/.exec(text)?.[1] ?? '').matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => unescape(m[1]));
    return readRecap({ title: unescape(title), recap, threads });
}

// BEAT: one beat of the outline written afresh. input: { dossier,
//   userName, messages, shape, outline, beatId, wish (the user's steer, or
//   ''), storySoFar }
// The user's steer for the volume under way (gm.volume.direction): where
// it should go. Every outline and beat pass is given it, not only the first.
export function steerLines(steer) {
    if (!clean(steer)) return [];
    return ['', 'WHERE THE USER WANTS THIS VOLUME TO GO (follow it: it outranks older threads, quests and places the story has moved past - those come back only if this steer brings them back)', cut(steer, 4000)];
}

export function buildBeatPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const outline = input.outline;
    const system = [
        'You are the game master of an ongoing roleplay, keeping the long-term outline of the story in private. The user did not like one beat of it: write that one beat again, differently.',
        rules(userName),
    ].join(' ');
    const parts = [clean(input.dossier)];
    const sofar = String(input.storySoFar ?? '').trim();
    if (sofar) parts.push('', 'THE STORY SO FAR', sofar.slice(0, 3000));
    parts.push('', 'THE LATEST CHAT', recentText(list(input.messages).slice(-6), userName), '', `THE OUTLINE (${clean(input.shape?.label)}) - the beat to write again is marked >>`);
    let old = null;
    outline.acts.forEach((a, i) => {
        parts.push(`Act ${i + 1}: ${a.title}`);
        for (const b of a.beats) {
            if (b.id === input.beatId) old = b;
            parts.push(`${b.id === input.beatId ? '>>' : '-'} ${b.text} - ${b.status}`);
        }
    });
    parts.push(
        '',
        'WRITE IT AGAIN',
        `A different turn in the story for the same place in the outline: it follows from the beats before it and leads toward the ones after. Not a rewording of "${clean(old?.text)}" - a different idea.`,
        ...steerLines(input.steer),
        ...(clean(input.wish) ? [`The user wants: ${clean(input.wish)}`] : []),
        'Answer in this JSON shape: {"text":"<the beat, one sentence>","ties":["<names of the people, places, factions or threads it involves>"]}',
    );
    return { system, prompt: parts.join('\n') };
}

// -> { text, ties } or null.
export function readBeat(json) {
    if (!isObject(json) || !clean(json.text)) return null;
    return { text: cut(json.text, 300), ties: texts(json.ties, 6) };
}

// -> { premise, themes, acts, seeds } or null.
export function readOutline(json) {
    if (!isObject(json)) return null;
    const acts = list(json.acts).filter(isObject).map((a) => ({
        title: cut(a.title, 80),
        beats: list(a.beats).filter((b) => isObject(b) && clean(b.text)).map((b) => ({
            id: clean(b.id).replace(/^\[|\]$/g, ''),
            text: cut(b.text, 300),
            ties: texts(b.ties, 6),
            status: ['pending', 'active', 'done', 'skipped'].includes(clean(b.status).toLowerCase()) ? clean(b.status).toLowerCase() : 'pending',
        })).slice(0, 8),
    })).filter((a) => a.beats.length);
    if (!acts.length) return null;
    return {
        premise: cut(json.premise, 800),
        themes: texts(json.themes, 6).map((t) => cut(t, 80)),
        acts: acts.slice(0, 8),
        seeds: list(json.seeds).filter((x) => isObject(x) && clean(x.text)).map((x) => ({ text: cut(x.text, 200), payoff: cut(x.payoff, 200) })).slice(0, 6),
        triggers: list(json.triggers).filter((x) => isObject(x) && clean(x.when) && clean(x.then)).map((x) => ({ when: cut(x.when, 240), then: cut(x.then, 300) })).slice(0, 3),
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

// IDEAS: proactive worldbuilding (§3.4) - frictions, standing quests and
// lore the scene isn't using, turned into proposals.
// input: { dossier, userName, messages, story ({ shape, act, beat, next,
//   aim }), frictions: [text], quests: [{ name, status, type, objectives
//   (count), description }], lore: [{ name, description }] (not in play),
//   agenda: [{ text, inDays }], motifs, dismissed: [text] (turned down
//   before), canonOnly (no new quests and no added detail: happenings and
//   seeds only), gmStyle }
export function buildIdeasPrompt(input) {
    const userName = clean(input.userName) || 'the player';
    const system = [
        'You are the game master of an ongoing roleplay, thinking ahead in private between scenes. Look past the current scene at the world: the frictions between people and factions, the quests standing open, the lore nobody has used yet.',
        'Invent interesting things that could happen and grow out of what is there and what the story is doing now - never at random. Each idea names what it grows out of.',
        rules(userName),
        clean(input.gmStyle) ? `How the user wants this story run - follow it: ${cut(input.gmStyle, 600)}` : '',
    ].filter(Boolean).join(' ');
    const parts = [clean(input.dossier), '', 'THE LATEST CHAT', recentText(list(input.messages).slice(-6), userName)];
    const story = storyText(input.story);
    if (story) parts.push('', 'WHERE THE STORY IS GOING', story);
    const frictions = texts(input.frictions, 12);
    if (frictions.length) parts.push('', 'FRICTIONS (between people, factions; secrets kept; oaths pending or broken)', ...frictions.map((f) => `- ${f}`));
    const quests = list(input.quests).filter((q) => clean(q?.name));
    if (quests.length) {
        parts.push('', 'QUESTS STANDING OPEN (thin ones could use detail)');
        for (const q of quests.slice(0, 10)) parts.push(`- ${clean(q.name)} (${clean(q.status) || 'open'}${q.type ? `, ${clean(q.type)}` : ''}; ${q.objectives || 0} objectives)${clean(q.description) ? `: ${cut(q.description, 200)}` : ''}`);
    }
    const lore = list(input.lore).filter((l) => clean(l?.name));
    if (lore.length) parts.push('', 'LORE NOT YET IN PLAY (bring some of it in, tied to the story)', ...lore.slice(0, 10).map((l) => `- ${clean(l.name)}${clean(l.description) ? `: ${cut(l.description, 180)}` : ''}`));
    const agenda = list(input.agenda).filter((a) => clean(a?.text));
    if (agenda.length) parts.push('', 'ALREADY ON THE CALENDAR', ...agenda.map((a) => `- ${clean(a.text)} (in ${a.inDays} day${a.inDays === 1 ? '' : 's'})`));
    if (input.motifs?.length) parts.push('', 'MOTIFS FROM THE USER\'S INSPIRATION (echo them symbolically)', input.motifs.map((m) => `- ${clean(m)}`).join('\n'));
    const dismissed = texts(input.dismissed, 20);
    if (dismissed.length) parts.push('', 'TURNED DOWN BEFORE (do not propose these or anything like them)', ...dismissed.map((d) => `- ${d}`));
    const canon = input.canonOnly === true;
    parts.push(
        '',
        'YOUR IDEAS',
        canon
            ? 'This setting is fixed canon: invent no new quests and add no detail to existing ones. Give only happenings and seeds.'
            : 'At most two of each kind; fewer is fine, and none of a kind is fine. A quest is a new potential quest tied to the current story (it starts not yet taken up). An enrichment adds lore, a complication or objectives to an open quest above. ',
        'A happening is something set for a later in-game day (one to fourteen days on) that should come up then without disrupting the scene now. A seed is a small thing to plant now so a later beat pays off.',
        'Answer in this JSON shape:',
        `{${canon ? '' : '"quests":[{"name":"<quest name>","description":"<two sentences>","why":"<what it grows out of, by name>","ties":["<names>"]}],"enrich":[{"quest":"<an open quest\'s name>","text":"<the lore or complication>","objectives":["<a new objective>"]}],'}"happenings":[{"text":"<what happens>","in_days":3,"when":"<time of day, or empty>","why":"<what it grows out of>","ties":["<names>"]}],"seeds":[{"text":"<what to plant>","payoff":"<what it pays off later>"}]}`,
    );
    return { system, prompt: parts.join('\n') };
}

// -> [idea] (src/planner/model.js addIdeas shape), at most two per kind.
export function readIdeas(json, { canonOnly = false } = {}) {
    if (!isObject(json)) return [];
    const out = [];
    if (!canonOnly) {
        for (const q of list(json.quests).filter((x) => isObject(x) && clean(x.name)).slice(0, 2)) {
            out.push({ kind: 'quest', name: cut(q.name, 80), text: cut(q.description, 500), why: cut(q.why, 200), ties: texts(q.ties, 6) });
        }
        for (const e of list(json.enrich).filter((x) => isObject(x) && clean(x.quest) && clean(x.text)).slice(0, 2)) {
            out.push({ kind: 'enrich', target: cut(e.quest, 80), text: cut(e.text, 500), objectives: texts(e.objectives, 3).map((o) => cut(o, 160)) });
        }
    }
    for (const h of list(json.happenings).filter((x) => isObject(x) && clean(x.text)).slice(0, 2)) {
        const n = Math.round(Number(h.in_days ?? h.inDays));
        out.push({ kind: 'happening', text: cut(h.text, 300), why: cut(h.why, 200), ties: texts(h.ties, 6), inDays: Number.isFinite(n) ? Math.min(30, Math.max(1, n)) : 3, when: cut(h.when, 40) });
    }
    for (const s of list(json.seeds).filter((x) => isObject(x) && clean(x.text)).slice(0, 2)) {
        out.push({ kind: 'seed', text: cut(s.text, 300), why: cut(s.payoff, 200) });
    }
    return out;
}
