// People the story names, made into characters. The game master may add
// someone with a NEW line, but a small model buried in a long briefing
// rarely writes one ("Kael and Arin will go with you" made no one). So after
// each reply one short question is asked on its own - "who in these
// messages has a name and is not on this list?" - and each answer the
// messages really name becomes a character (not placed in the scene: State
// Engine's reading says who is here). The prompt and reader are pure (and
// tested); addNamedPeople() runs them through the generation queue and
// never throws.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keyOf = (name) => clean(name).toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[’']s$/, '');

// Whether `text` holds `name` as whole words, with its own capitals (a
// name, not the same letters in a common word).
export function namedInText(text, name) {
    const n = clean(name);
    if (!n) return false;
    return new RegExp(`(^|[^\\p{L}])${escapeRe(n)}(?=$|[^\\p{L}])`, 'u').test(String(text ?? ''));
}

// "Who is newly named here?" -> { system, user, plain }
// text: the recent messages; known: names the library already has.
export function buildPeoplePrompt({ text, known = [], playerNames = [] }) {
    const user = [
        `# Recent messages\n${cut(text, 6000)}`,
        `# Already known (never list these)\n${[...new Set([...playerNames, ...known].map(clean).filter(Boolean))].join(', ') || '(none)'}`,
        '# Your task\nList every PERSON the messages give a personal name to who is not already known - someone introduced, described, sent for, picked for a task or talked about. A companion that talks and thinks like a person (a sentient familiar, a dragon, a bound spirit) counts as a person. Not gods, places, groups, ships or things; not animals, even named ones (a pet, a mount, a hound - those are creatures); not nicknames for someone already known; not anyone left unnamed ("two of his men").',
        '# Reply\nOne line per person, exactly:\nName | what the messages say about them, in one sentence\nOr the single word NONE if there is no one.',
    ].join('\n\n');
    return { system: 'You read a roleplay and list the people it names. You answer with exactly the lines asked for - no preamble, no commentary.', user, plain: true };
}

// Names written with a nickname inside: Delvin "Ice" Timmors. -> a map from
// each form the model may answer with ("Delvin Timmors", "Ice Timmors",
// "Delvin "Ice" Timmors") to { name: 'Delvin Timmors', aliases: ['Ice',
// 'Ice Timmors'] }. Cyril's post named him so, and the model answered with
// a form the post never has word for word - and no one was made.
const NICKNAMED = /(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?)\s+["“‘'(]\s*(\p{Lu}[^"”’')\n]{0,24}?)\s*["”’')]\s+(\p{Lu}[\p{L}'’-]+)/gu;
export function nicknamedNames(text) {
    const out = new Map();
    for (const m of String(text ?? '').matchAll(NICKNAMED)) {
        const [, first, nick, last] = m;
        const person = { name: clean(`${first} ${last}`), aliases: [clean(nick), clean(`${nick} ${last}`)] };
        for (const form of [person.name, ...person.aliases, `${first} "${nick}" ${last}`, `${first} ${nick} ${last}`]) {
            if (!out.has(keyOf(form))) out.set(keyOf(form), person);
        }
    }
    return out;
}

// The people of an answer that the text really names and the library does
// not have. -> [{ name, description, aliases? }] ([] for NONE), or null when
// the answer could not be read at all.
export function readPeople(answer, { text, known = [], playerNames = [] }) {
    const raw = String(answer ?? '').trim();
    if (/^\W*none\W*$/i.test(raw)) return [];
    const taken = new Set([...known, ...playerNames].map(keyOf).filter(Boolean));
    const nicknamed = nicknamedNames(text);
    const out = [];
    let read = 0;
    for (const line of raw.split('\n')) {
        const parts = line.replace(/^[\s*\-•\d.)]+/, '').replace(/[*`]/g, '').split('|').map(clean);
        if (parts.length < 2 || !parts[0]) continue;
        read++;
        const said = parts[0].replace(/^["']|["']$/g, '').replace(/[“”‘’]/g, (q) => (/[“”]/.test(q) ? '"' : "'"));
        // One the messages wrote with a nickname: known by its plain name,
        // the nickname kept as an alias.
        const nick = nicknamed.get(keyOf(said)) ?? nicknamed.get(keyOf(said.replace(/["'()]/g, '')));
        const name = nick?.name ?? said;
        // A name: one to four words, capitalised, in the messages as written.
        if (name.length > 40 || name.split(/\s+/).length > 4 || !/^\p{Lu}/u.test(name)) continue;
        if (!nick && !namedInText(text, name)) continue;
        if ([name, ...(nick?.aliases ?? [])].some((n) => taken.has(keyOf(n)))) continue;
        if (out.some((p) => keyOf(p.name) === keyOf(name))) continue;
        out.push({ name, description: cut(parts.slice(1).join(' - '), 300), ...(nick ? { aliases: nick.aliases } : {}) });
    }
    return read || /\bnone\b/i.test(raw) ? out : null;
}
