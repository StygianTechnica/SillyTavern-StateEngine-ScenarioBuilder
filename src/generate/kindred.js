// What a faction's people have in common - the cult's red robes and shaved
// heads - and what the world's descriptions have used too often. The game
// keeps the first by itself (one short model call, once per faction, the
// first time someone of it is written) and the user can change it on the
// faction's sheet. Neither is more than a line in a prompt already being
// sent. Pure.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s, max) => { const t = clean(s); return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`; };

export const KINDRED_FIELDS = Object.freeze([
    ['people', 'PEOPLE', 'Who they are', 'what kind of people join: one people or bloodline, one class, one background'],
    ['dress', 'DRESS', 'How they dress', 'clothing, colours, uniforms or gear most of them wear'],
    ['marks', 'MARKS', 'Marks and hair', 'hair, tattoos, piercings, scars, augmentations or badges they share'],
    ['speech', 'SPEECH', 'How they talk', 'a shared manner of speaking: greetings, jargon, oaths'],
    ['skills', 'SKILLS', 'What they are good at', 'training, weapons or talents most of them have'],
]);

const NONE = /^(?:none|nothing|no|n\/a|-|not? (?:really|shared|applicable|in common).*|varies.*|they vary.*)[.!]?$/i;

export function normalizeKindred(k) {
    const v = k && typeof k === 'object' && !Array.isArray(k) ? k : {};
    return { ...Object.fromEntries(KINDRED_FIELDS.map(([key]) => [key, cut(v[key], 160)])), at: clean(v.at) };
}

export const hasKindred = (k) => KINDRED_FIELDS.some(([key]) => clean(k?.[key]));

// input: { faction: { name, description }, members: [{ name, description }],
// world: the setting in a line or two }. -> { system, user, plain }
export function buildKindredPrompt({ faction = {}, members = [], world = '' } = {}) {
    const known = (members ?? []).filter((m) => clean(m?.name)).slice(0, 6);
    const user = [
        clean(world) ? `# The setting\n${cut(world, 400)}` : '',
        `# The group\n${clean(faction.name)}${clean(faction.description) ? `: ${cut(faction.description, 500)}` : ''}`,
        known.length ? `# Some of its people\n${known.map((m) => `- ${clean(m.name)}${clean(m.description) ? `: ${cut(m.description, 180)}` : ''}`).join('\n')}` : '',
        '# Your task',
        'Say what the people of this group have in common, for someone writing a new member. Keep to what its description and people above show, and what a group like this would plainly have. Only what most of them truly share: a cult may have one robe and one shaved head; a city or a big company may share almost nothing. Each answer is one short phrase, and "none" wherever they do not share it - most groups have several.',
        '# Reply\nExactly these lines:',
        ...KINDRED_FIELDS.map(([, label, , about]) => `${label}: <${about}, or none>`),
    ].filter(Boolean).join('\n\n');
    return { system: 'You describe what the members of a group in a story have in common. You answer in exactly the lines asked for - no preamble.', user, plain: true };
}

// The answer -> { values } or { error } (src/generate/run.js askReliably).
export function readKindred(_prompt, text) {
    const values = {};
    let seen = 0;
    for (const [key, label] of KINDRED_FIELDS) {
        const m = String(text ?? '').match(new RegExp(`^\\s*[-*]*\\s*\\**${label}\\**\\s*:\\s*(.+)$`, 'im'));
        if (!m) continue;
        seen += 1;
        const said = clean(m[1]).replace(/^[\s"'<*]+|[\s"'>*]+$/g, '');
        values[key] = NONE.test(said) ? '' : said;
    }
    return seen ? { values, dropped: [], error: null } : { values: {}, dropped: [], error: 'no lines' };
}

// The prompt's words for it, or ''.
export function kindredLine(k) {
    return KINDRED_FIELDS.filter(([key]) => clean(k?.[key])).map(([key, , label]) => `${label}: ${clean(k[key])}`).join('; ');
}

// ---- what has been said too often

const STOP = new Set('a an the of and or but in on at to by for from with as into that this these those his her their its he she they him them is are was were has have had who whom which what when where while than then so such very more most some any all each it be been being not no s t'.split(' '));
// Words a model reaches for, counted one at a time.
const CLICHES = /^(?:lean|wiry|lithe|athletic|piercing|angular|chiseled|chiselled|icy|striking|weathered|slicked|close-cropped)$/;
const wordsOf = (text) => clean(text).toLowerCase().replace(/[’]/g, "'").match(/[\p{L}][\p{L}'-]*/gu) ?? [];

// The phrases (two to five words) and the stock adjectives several of these
// descriptions share, longest first. -> [text], at most `max`.
export function overusedPhrases(descriptions = [], { max = 12 } = {}) {
    const docs = (descriptions ?? []).map(wordsOf).filter((w) => w.length >= 6);
    const counts = new Map();
    docs.forEach((words) => {
        const seen = new Set();
        for (let n = 2; n <= 4; n++) {
            for (let i = 0; i + n <= words.length; i++) {
                const g = words.slice(i, i + n);
                if (STOP.has(g[0]) || STOP.has(g[n - 1]) || g.filter((w) => !STOP.has(w)).length < 2) continue;
                seen.add(g.join(' '));
            }
        }
        for (const w of words) if (CLICHES.test(w)) seen.add(w);
        for (const g of seen) counts.set(g, (counts.get(g) ?? 0) + 1);
    });
    const need = (g) => (g.split(' ').length >= 3 ? 2 : 3);
    const ranked = [...counts].filter(([g, c]) => c >= need(g)).sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length).map(([g]) => g);
    // Pieces of one phrase count once: two words in a row in common.
    const pairs = (g) => g.split(' ').slice(0, -1).map((w, i) => `${w} ${g.split(' ')[i + 1]}`);
    const phrases = [];
    for (const g of ranked.filter((x) => x.includes(' '))) if (!phrases.some((p) => pairs(p).some((a) => pairs(g).includes(a)))) phrases.push(g);
    return [...phrases.slice(0, Math.max(1, max - 4)), ...ranked.filter((x) => !x.includes(' ')).slice(0, 4)];
}

// The rule for whoever is writing a new description, or ''.
export const overusedRule = (phrases = []) => (phrases?.length ? `This world's descriptions have used these too often: ${phrases.map((p) => `"${p}"`).join(', ')}. Do not use them or close variants. Give this person a build, face and bearing of their own.` : '');
