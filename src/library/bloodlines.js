// Bloodlines (docs/DESIGN - BLOODLINES.md): the kinds of being a character
// can be - an ancestry (elves), a species (Greys), a made kind (androids),
// a changed kind (vampires), or plain humans - how they look and live in
// THIS world, and how common each is where. Pure (no SillyTavern imports).
//
// A bloodline is a Lore entry with a block in its metadata:
//   meta.bloodline = { on, kind, singular, plural, adjective, look, here,
//                      lifespan, lifespanNote, traits, culture, naming,
//                      related, playable, canMix, visual }
// A character's bloodline:   meta.lineage = { ids: [], note }
// Who lives where:           overview.population = { mix, notes, only, views }
//                            a location's meta.population = { mode, mix, notes, views }
// How each is seen there:    views = [{ id, standing, note }] (phase 4)
//                            a faction's meta.members = { mix, notes }
// A mix is [{ id, share }], `id` a bloodline entry id or HUMANS (the
// implicit humans, when the world has no human bloodline of its own).

export const BLOODLINE_KINDS = Object.freeze([
    ['ancestry', 'Ancestry - elves, dwarves, orcs'],
    ['species', 'Species - aliens, uplifted animals'],
    ['made', 'Made - androids, clones, golems'],
    ['changed', 'Changed - vampires, cyborgs, ghouls'],
    ['human', 'Human'],
]);

// How common a bloodline is, as words: the model reads words better than
// percentages, and a user thinks "elves are rare here". [id, label, weight
// for rolling]. A unique one is already in the library and never rolled;
// none is never met here.
export const SHARES = Object.freeze([
    ['most', 'Most people', 60],
    ['common', 'Common', 20],
    ['some', 'Some', 8],
    ['few', 'A few', 3],
    ['rare', 'Rare', 1],
    ['unique', 'Unique - only the one', 0],
    ['none', 'None here', 0],
]);
const SHARE_IDS = new Set(SHARES.map(([id]) => id));
export const shareWeight = (share) => SHARES.find(([id]) => id === share)?.[2] ?? 0;

export const LIFESPANS = Object.freeze([
    ['short', 'Short - old at forty'],
    ['human', 'A human span'],
    ['long', 'Long - centuries'],
    ['ageless', 'Ageless'],
]);

// How well an image model can be expected to know them already.
export const KNOWN = Object.freeze([
    ['well', 'Well known - elf, dwarf, android: the word is enough'],
    ['partly', 'Partly - tiefling, Grey: the word and what matters'],
    ['not', 'Not at all - invented: every feature spelled out'],
]);

// Where a bloodline's names come from: their own tongue, the place they
// live in, or either (some keep the old names, some do not).
export const NAMING_MODES = Object.freeze([
    ['own', 'Their own culture, wherever they live'],
    ['local', 'The names of the place they live in'],
    ['either', 'Either - some keep the old names'],
]);

// How a bloodline is seen in a place (phase 4): for the narrator, how the
// people there react to one of them. [id, label, the words for the line]
export const STANDINGS = Object.freeze([
    ['revered', 'Revered', 'revered'],
    ['welcome', 'Welcome', 'welcome'],
    ['accepted', 'Accepted', 'accepted'],
    ['wary', 'Watched warily', 'watched warily'],
    ['distrusted', 'Distrusted', 'distrusted'],
    ['scorned', 'Looked down on', 'looked down on'],
    ['feared', 'Feared', 'feared'],
    ['hunted', 'Hunted', 'hunted'],
    ['outlawed', 'Outlawed', 'outlawed'],
]);

export const HUMANS = 'humans';

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const clean = (v) => str(v).replace(/\s+/g, ' ').trim();
const strList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))] : []);
const oneOf = (list, v, fallback = '') => (list.some(([id]) => id === v) ? v : fallback);

export function emptyVisual() {
    return { known: '', body: '', skin: '', features: '', dress: '', tags: '', negative: '', variety: '' };
}

export function normalizeVisual(v) {
    const x = isObject(v) ? v : {};
    return { known: oneOf(KNOWN, x.known), body: str(x.body), skin: str(x.skin), features: str(x.features), dress: str(x.dress), tags: str(x.tags), negative: str(x.negative), variety: str(x.variety) };
}

export function emptyBloodline() {
    return {
        on: false, kind: '', singular: '', plural: '', adjective: '', look: '', here: '',
        lifespan: '', lifespanNote: '', traits: [], culture: '', naming: '', related: '',
        playable: false, canMix: false, preset: '', visual: emptyVisual(),
    };
}

// The block on a Lore entry. `on`: the entry is a bloodline.
export function normalizeBloodline(b) {
    const x = isObject(b) ? b : {};
    return {
        on: x.on === true,
        kind: oneOf(BLOODLINE_KINDS, x.kind),
        singular: str(x.singular),
        plural: str(x.plural),
        adjective: str(x.adjective),
        look: str(x.look),
        here: str(x.here),
        lifespan: oneOf(LIFESPANS, x.lifespan),
        lifespanNote: str(x.lifespanNote),
        traits: strList(x.traits),
        // A naming culture id (src/naming/cultures.js), and how it is used.
        culture: str(x.culture),
        naming: oneOf(NAMING_MODES, x.naming),
        // The creature entry they are related to (trolls the bloodline,
        // trolls under the bridge).
        related: str(x.related),
        playable: x.playable === true,
        canMix: x.canMix === true,
        // The preset it was made from, if any.
        preset: str(x.preset),
        visual: normalizeVisual(x.visual),
    };
}

// A character's bloodline: one, two for mixed heritage, and a line of
// their own ("raised human; had her ears clipped at fourteen").
export function normalizeLineage(l) {
    const x = isObject(l) ? l : {};
    return { ids: strList(x.ids).slice(0, 2), note: str(x.note) };
}

export function normalizeMix(mix) {
    if (!Array.isArray(mix)) return [];
    const seen = new Set();
    const out = [];
    for (const row of mix) {
        if (!isObject(row) || !str(row.id) || seen.has(row.id) || !SHARE_IDS.has(row.share)) continue;
        seen.add(row.id);
        out.push({ id: row.id, share: row.share });
    }
    return out;
}

// How bloodlines are seen: [{ id, standing, note }], one per bloodline.
export function normalizeViews(views) {
    if (!Array.isArray(views)) return [];
    const seen = new Set();
    const out = [];
    for (const v of views) {
        if (!isObject(v) || !str(v.id) || seen.has(v.id) || !STANDINGS.some(([id]) => id === v.standing)) continue;
        seen.add(v.id);
        out.push({ id: v.id, standing: v.standing, note: str(v.note) });
    }
    return out;
}

export function emptyPopulation() {
    return { mix: [], notes: '', only: false, views: [], unset: 'most' };
}

// The world's: who lives in it, whether these and no others do, and how
// each is seen.
export function normalizePopulation(p) {
    const x = isObject(p) ? p : {};
    // unset: what a character with no bloodline set (and none in their
    // description) is - 'most' (the world's most common), 'story' (left to
    // the story) or a bloodline id.
    const unset = typeof x.unset === 'string' && x.unset.trim() ? x.unset.trim() : 'most';
    return { mix: normalizeMix(x.mix), notes: str(x.notes), only: x.only === true, views: normalizeViews(x.views), unset };
}

// A place's: its own mix, replacing the one above or adjusting it ("as
// above, but elves common" - the default, being what people mean most),
// and how bloodlines are seen there.
export function normalizePlacePopulation(p) {
    const x = isObject(p) ? p : {};
    return { mode: x.mode === 'replace' ? 'replace' : 'adjust', mix: normalizeMix(x.mix), notes: str(x.notes), views: normalizeViews(x.views) };
}

// A faction's: who it takes ("elves only", "mostly dwarves"); empty: anyone.
export function normalizeMembers(m) {
    const x = isObject(m) ? m : {};
    return { mix: normalizeMix(x.mix), notes: str(x.notes) };
}

// ---- names of a bloodline

// "Elves" -> "elf", "Dwarves" -> "dwarf", "Greys" -> "grey". A guess for
// when the singular is not written.
export function singularOf(word) {
    const w = clean(word).replace(/^the\s+/i, '');
    if (!w) return '';
    const lower = w.toLowerCase();
    const irregular = { elves: 'elf', dwarves: 'dwarf', dwarfs: 'dwarf', wolves: 'wolf', halflings: 'halfling', men: 'man', women: 'woman', people: 'person', folk: 'folk', children: 'child', mice: 'mouse', fae: 'fae', fey: 'fey', merfolk: 'merfolk', undead: 'undead', humans: 'human' };
    if (irregular[lower]) return irregular[lower];
    const last = lower.split(' ').pop();
    if (irregular[last]) return `${lower.slice(0, -last.length)}${irregular[last]}`;
    if (/(?:ves)$/.test(lower)) return lower.replace(/ves$/, 'f');
    if (/[^aeiou]ies$/.test(lower)) return lower.replace(/ies$/, 'y');
    if (/(?:ch|sh|x|ss)es$/.test(lower)) return lower.replace(/es$/, '');
    if (/[^s]s$/.test(lower)) return lower.slice(0, -1);
    return lower;
}

// The words for one: { name (the entry's), singular, plural, adjective }.
export function wordsOf(entry) {
    if (!entry) return { name: '', singular: '', plural: '', adjective: '' };
    if (entry.id === HUMANS) return { name: 'Humans', singular: 'human', plural: 'humans', adjective: 'human' };
    const b = normalizeBloodline(entry.meta?.bloodline);
    const name = clean(entry.name);
    // A name like "Elves" is a common word, lower case in a sentence; one
    // like "The Vaskari" or "Greys" written as the plural keeps its capital.
    const bare = name.replace(/^the\s+/i, '');
    const plural = clean(b.plural) || (/s$/i.test(bare) ? bare.toLowerCase() : bare);
    const singular = clean(b.singular) || (/s$/i.test(plural) ? singularOf(plural) : plural);
    return { name, singular, plural, adjective: clean(b.adjective) || adjectiveOf(singular) };
}

// "elf" -> "elven": the usual adjectives, else the word itself.
const ADJECTIVES = { elf: 'elven', dwarf: 'dwarven', orc: 'orcish', gnome: 'gnomish', vampire: 'vampiric', giant: 'giantish', fey: 'fey', fae: 'fae', dragon: 'draconic', troll: 'trollish' };
function adjectiveOf(singular) {
    const last = singular.split(' ').pop().toLowerCase();
    return ADJECTIVES[last] ? `${singular.slice(0, -last.length)}${ADJECTIVES[last]}` : singular;
}

// The bloodline entries of a library's lore.
export const bloodlinesOf = (lore) => (lore ?? []).filter((e) => e?.meta?.bloodline?.on === true);

// The world's human bloodline: an entry of the human kind, else the
// implicit one.
export function humansOf(bloodlines) {
    return (bloodlines ?? []).find((b) => normalizeBloodline(b.meta?.bloodline).kind === 'human') ?? { id: HUMANS, name: 'Humans', meta: { bloodline: { on: true, kind: 'human' } } };
}

// Every bloodline a mix can name: the entries, and the implicit humans
// when there is no human entry.
export function choicesOf(bloodlines) {
    const list = [...(bloodlines ?? [])];
    if (humansOf(list).id === HUMANS) list.unshift(humansOf(list));
    return list;
}

// ---- who lives where

// The mix that holds at a place: the world's, changed by each place from
// the top down to it - one that replaces starts again from its own, one
// that adjusts sets its bloodlines' shares and keeps the rest. Notes come
// from the nearest place that has them.
// parents: { id: parentId }; metaById: { id: { population } }.
// -> { mix, notes, only, from: placeId of the nearest place with a mix, or '' }
export function mixAt(world, parents = {}, metaById = {}, placeId = null) {
    const w = normalizePopulation(world);
    const chain = [];
    const seen = new Set();
    for (let at = placeId; at && !seen.has(at); at = parents?.[at]) { seen.add(at); chain.unshift(at); }
    let mix = w.mix;
    let notes = w.notes;
    let from = '';
    for (const id of chain) {
        const p = normalizePlacePopulation(metaById?.[id]?.population);
        if (p.mix.length) {
            if (p.mode === 'replace') mix = p.mix;
            else {
                const set = new Map(p.mix.map((r) => [r.id, r.share]));
                mix = [...mix.map((r) => (set.has(r.id) ? { id: r.id, share: set.get(r.id) } : r)), ...p.mix.filter((r) => !mix.some((x) => x.id === r.id))];
            }
            from = id;
        }
        if (clean(p.notes)) notes = p.notes;
    }
    return { mix, notes, only: w.only, from };
}

// Who a faction takes, else the place's mix (anyone, as common as they are
// where it is).
export function mixFor({ world, parents = {}, metaById = {}, placeId = null, factionId = null } = {}) {
    const m = factionId ? normalizeMembers(metaById?.[factionId]?.members) : null;
    if (m?.mix.length) return { mix: m.mix, notes: m.notes, only: normalizePopulation(world).only, from: factionId };
    return mixAt(world, parents, metaById, placeId);
}

// Rolls one bloodline from a mix, by its shares' weights. -> id or ''.
export function rollBloodline(mix, random = Math.random) {
    const rows = normalizeMix(mix).filter((r) => shareWeight(r.share) > 0);
    const total = rows.reduce((n, r) => n + shareWeight(r.share), 0);
    if (!total) return '';
    let at = random() * total;
    for (const r of rows) {
        at -= shareWeight(r.share);
        if (at < 0) return r.id;
    }
    return rows[rows.length - 1].id;
}

const SHARE_ORDER = ['most', 'common', 'some', 'few', 'rare', 'unique'];

// A mix in words, most common first: "mostly humans; many elves; a few
// dwarves". byId: { id: entry }. '' for an empty mix.
export function mixText(mix, byId = {}) {
    const rows = normalizeMix(mix).filter((r) => r.share !== 'none' && (byId[r.id] || r.id === HUMANS));
    rows.sort((a, b) => SHARE_ORDER.indexOf(a.share) - SHARE_ORDER.indexOf(b.share));
    const plural = (id) => wordsOf(byId[id] ?? { id }).plural;
    const say = { most: (p) => `mostly ${p}`, common: (p) => `many ${p}`, some: (p) => `some ${p}`, few: (p) => `a few ${p}`, rare: (p) => `rarely, ${p}`, unique: (p) => `one of the ${p}` };
    return rows.map((r) => say[r.share](plural(r.id))).join('; ');
}

// A mix with nothing to say: empty, or humans alone.
export function isPlainMix(mix, byId = {}) {
    const rows = normalizeMix(mix).filter((r) => r.share !== 'none');
    if (!rows.length) return true;
    return rows.every((r) => r.id === HUMANS || normalizeBloodline(byId[r.id]?.meta?.bloodline).kind === 'human');
}

// The bloodlines a place or the world says are never met there.
export const absentIn = (mix, byId = {}) => normalizeMix(mix).filter((r) => r.share === 'none' && (byId[r.id] || r.id === HUMANS)).map((r) => wordsOf(byId[r.id] ?? { id: r.id }).plural);

// The line for the location section: "Who is about here: mostly humans;
// some elves." '' when the mix is plain or unknown.
export function whoIsAboutLine(at, byId = {}) {
    if (!at || isPlainMix(at.mix, byId)) {
        const none = absentIn(at?.mix, byId);
        return none.length ? `No ${none.join(' or ')} are found here.` : '';
    }
    const none = absentIn(at.mix, byId);
    const notes = clean(at.notes);
    return [`Who is about here: ${mixText(at.mix, byId)}.`, notes ? notes.replace(/[.!]?$/, '.') : '', none.length ? `No ${none.join(' or ')} are found here.` : ''].filter(Boolean).join(' ');
}

// The world's "these and no others" rule, for the limits. '' when it is
// off or no bloodline is named.
export function onlyRule(world, byId = {}) {
    const w = normalizePopulation(world);
    if (!w.only) return '';
    const names = w.mix.filter((r) => r.share !== 'none' && (byId[r.id] || r.id === HUMANS)).map((r) => wordsOf(byId[r.id] ?? { id: r.id }).plural);
    if (!names.length) return '';
    return `The only peoples in this world are ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}. Never introduce any other race, species or kind of being as a people of this world, not even as a rumour.`;
}

// ---- how they are seen (phase 4)

// How each bloodline is seen at a place: the world's, then each place from
// the top down to it - the nearest that says something of a bloodline wins.
// -> [{ id, standing, note, from: placeId or '' (the world) }]
export function viewsAt(world, parents = {}, metaById = {}, placeId = null) {
    const chain = [];
    const seen = new Set();
    for (let at = placeId; at && !seen.has(at); at = parents?.[at]) { seen.add(at); chain.unshift(at); }
    const views = new Map(normalizePopulation(world).views.map((v) => [v.id, { ...v, from: '' }]));
    for (const id of chain) for (const v of normalizePlacePopulation(metaById?.[id]?.population).views) views.set(v.id, { ...v, from: id });
    return [...views.values()];
}

const firstUpper = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// How the bloodlines of those present are seen here, for the narrator:
// "Elves are distrusted here (old grudges from the Purge) - the locals
// treat Kael accordingly." people: [{ name, ids }]; with none given (a
// place being written), every view. '' when nothing applies.
export function seenHereLine(views = [], byId = {}, people = null) {
    const lines = [];
    for (const v of normalizeViews(views)) {
        if (!byId[v.id] && v.id !== HUMANS) continue;
        const who = people ? people.filter((p) => (p.ids ?? []).includes(v.id)).map((p) => clean(p.name)).filter(Boolean) : [];
        if (people && !who.length) continue;
        const words = STANDINGS.find(([id]) => id === v.standing)[2];
        const note = clean(v.note).replace(/[.!]+$/, '');
        const names = who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who[0];
        lines.push(`${firstUpper(wordsOf(byId[v.id] ?? { id: v.id }).plural)} are ${words} here${note ? ` (${note})` : ''}${names ? ` - the locals treat ${names} accordingly` : ''}.`);
    }
    return lines.join(' ');
}

// ---- a character's bloodline

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Where `word` first stands as a whole word in `text` (lower case), or -1.
const wordAt = (text, word) => (word.length >= 3 ? text.search(new RegExp(`(^|[^\\p{L}])${escape(word)}(?=$|[^\\p{L}])`, 'u')) : -1);
// The same in the text as written: a proper word ("Grey", "Vaskari") only
// with its capital, so "a grey coat" is not one of the Greys.
const foundAt = (text, word) => (/^\p{Lu}/u.test(word) ? wordAt(text, word) : wordAt(text.toLowerCase(), word.toLowerCase()));

// The bloodline a character's own words give ("an elven fixer"), when
// nobody set one: its role, and the first sentence of its description,
// matched by each bloodline's singular, adjective and name. Humans are
// never guessed (they are what is left). -> [id] (at most two)
export function guessLineage({ role = '', description = '' } = {}, bloodlines = []) {
    const first = clean(description).split(/(?<=[.!?])\s+/)[0] ?? '';
    const text = `${clean(role)} \n ${first}`;
    const hits = [];
    for (const b of bloodlines ?? []) {
        if (normalizeBloodline(b.meta?.bloodline).kind === 'human') continue;
        const w = wordsOf(b);
        const at = [w.singular, w.adjective].map((x) => foundAt(text, clean(x))).filter((i) => i >= 0);
        if (at.length) hits.push({ id: b.id, at: Math.min(...at) });
    }
    return hits.sort((a, b) => a.at - b.at).slice(0, 2).map((x) => x.id);
}

// The bloodline of a character no one set one for, by the world's
// population (its `unset`): the most common in the world's mix, the one
// picked, or none (left to the story). -> [id] or []
export function defaultLineage(population, bloodlines = []) {
    const p = normalizePopulation(population);
    if (p.unset === 'story') return [];
    const known = new Set([HUMANS, ...(bloodlines ?? []).map((b) => b.id)]);
    if (p.unset !== 'most') return known.has(p.unset) ? [p.unset] : [];
    const rows = p.mix.filter((r) => known.has(r.id) && SHARE_ORDER.includes(r.share));
    rows.sort((a, b) => SHARE_ORDER.indexOf(a.share) - SHARE_ORDER.indexOf(b.share));
    return rows.length ? [rows[0].id] : [];
}

// A character's bloodline ids: set on the sheet, else guessed from their
// description, else the world's default (population given).
// -> { ids, note, guessed, defaulted }
export function lineageOf(entry, bloodlines = [], { population = null } = {}) {
    const own = normalizeLineage(entry?.meta?.lineage);
    const known = new Set([HUMANS, ...(bloodlines ?? []).map((b) => b.id)]);
    const ids = own.ids.filter((id) => known.has(id));
    if (ids.length) return { ids, note: own.note, guessed: false, defaulted: false };
    const base = entry?.base ?? entry ?? {};
    const role = Array.isArray(base.role) ? base.role.join(', ') : str(base.role);
    const guessed = guessLineage({ role, description: str(entry?.description ?? base.description) }, bloodlines);
    if (guessed.length || !population) return { ids: guessed, note: own.note, guessed: guessed.length > 0, defaulted: false };
    const fallback = defaultLineage(population, bloodlines);
    return { ids: fallback, note: own.note, guessed: false, defaulted: fallback.length > 0 };
}

const isHuman = (id, byId) => id === HUMANS || normalizeBloodline(byId[id]?.meta?.bloodline).kind === 'human';
const entryOf = (id, byId) => byId[id] ?? (id === HUMANS ? { id } : null);

// "elf"; "half-elf" (the other parent human); "half elf, half orc" - for
// the cast line. '' for humans in a world where nothing else is said.
export function lineageLabel(ids, byId = {}) {
    const known = (ids ?? []).filter((id) => wordsOf(entryOf(id, byId)).singular);
    const words = known.map((id) => wordsOf(entryOf(id, byId)).singular);
    if (words.length === 2) {
        const human = known.findIndex((id) => isHuman(id, byId));
        // "half-elf", but "half high elf".
        if (human >= 0 && !isHuman(known[1 - human], byId)) return `half${/\s/.test(words[1 - human]) ? ' ' : '-'}${words[1 - human]}`;
        if (words[0] === words[1]) return words[0];
        return `half ${words[0]}, half ${words[1]}`;
    }
    return words[0] ?? '';
}

// The short form of a bloodline for a prompt: "Elves: tall, pointed ears;
// awakened in 2031, old money." '' when it has neither line.
export function bloodlineBrief(entry) {
    const b = normalizeBloodline(entry?.meta?.bloodline);
    const look = clean(b.look).replace(/[.!]+$/, '');
    const here = clean(b.here).replace(/[.!]+$/, '');
    if (!look && !here) return '';
    return [`${wordsOf(entry).name}:`, look ? `${look}.` : '', here ? `How they live here: ${here}.` : ''].filter(Boolean).join(' ');
}

// ---- images

// What an image prompt needs to draw one of them. -> { lead, details:
// [phrase], negative: [word] }. `lead`: the word for one ("elf"); details
// in the order the picture should weigh them - none for a well-known
// bloodline beyond its dress, the body plan and features for the rest.
export function visualFor(entry) {
    if (!entry) return null;
    const b = normalizeBloodline(entry.meta?.bloodline);
    if (b.kind === 'human' || entry.id === HUMANS) return null;
    const v = b.visual;
    const lead = wordsOf(entry).singular;
    const known = v.known || 'partly';
    const details = [];
    if (known !== 'well') {
        if (clean(v.body) && !/^humanoid$/i.test(clean(v.body))) details.push(clean(v.body));
        if (clean(v.skin)) details.push(clean(v.skin));
        if (clean(v.features)) details.push(clean(v.features));
        if (known === 'not' && !details.length && clean(b.look)) details.push(clean(b.look));
    } else if (clean(v.features)) details.push(clean(v.features).split(/[;,]/)[0].trim());
    if (clean(v.dress)) details.push(clean(v.dress));
    const negative = clean(v.negative).split(',').map(clean).filter(Boolean);
    // A body that is not a person's pulls back to a person in a costume
    // unless "human" is kept out.
    if (clean(v.body) && !/humanoid|human-like|human sized|human-sized/i.test(v.body)) negative.push('human');
    return { lead, tags: clean(v.tags), details: details.map((d) => d.replace(/[.!]+$/, '')), negative: [...new Set(negative)], lifespan: b.lifespan, lifespanNote: clean(b.lifespanNote) };
}

// What one of mixed heritage looks like (phase 4): a half-elf is drawn as
// one - the other parent's mark softened beside the first's - with nothing
// kept out that either parent has. One bloodline: visualFor. -> as
// visualFor, or null for a human.
export function lineageVisual(ids = [], byId = {}) {
    const list = (ids ?? []).filter((id) => entryOf(id, byId)).slice(0, 2);
    if (list.length < 2) return list.length ? visualFor(entryOf(list[0], byId)) : null;
    if (list[0] === list[1]) return visualFor(entryOf(list[0], byId));
    const [a, b] = list.map((id) => (isHuman(id, byId) ? null : visualFor(entryOf(id, byId))));
    if (!a && !b) return null;
    const firstMark = (id) => {
        const v = normalizeBloodline(entryOf(id, byId)?.meta?.bloodline).visual;
        const mark = clean(v.features).split(/[;,]/)[0].trim() || clean(v.skin).split(/[;,]/)[0].trim();
        return mark ? `subtly ${mark.replace(/[.!]+$/, '')}` : '';
    };
    const marks = list.filter((id) => !isHuman(id, byId)).map(firstMark).filter(Boolean);
    const lifespans = list.map((id) => (isHuman(id, byId) ? 'human' : normalizeBloodline(entryOf(id, byId)?.meta?.bloodline).lifespan || 'human'));
    // Half-human: nothing kept out - the human parent may give what the
    // other lacks (hair, a human face). Two others: only what neither has.
    const negative = a && b ? a.negative.filter((n) => b.negative.includes(n)) : [];
    return {
        lead: lineageLabel(list, byId),
        tags: [a?.tags, b?.tags].filter(Boolean).join(', '),
        details: [...marks, 'mixed heritage'],
        negative,
        lifespan: lifespans.join('+'),
        lifespanNote: '',
    };
}

// ---- age for their kind (phase 4)
//
// A 300-year-old elf is not "old". Each lifespan has the ages where one
// stops being a child, young, in their prime, middle-aged and old; an age
// reads by those, and how old one looks is the same point on a human's.
// Mixed heritage ("long+human") lies between its parents'.

const STAGE_AGES = Object.freeze({
    short: [8, 15, 25, 40, 55],
    human: [14, 25, 45, 65, 85],
    long: [40, 100, 400, 600, 800],
    ageless: [14, 25, Infinity, Infinity, Infinity],
});
const STAGES = ['a child', 'young', 'in the prime of life', 'middle-aged', 'old', 'very old'];

// An age the text gives: "312 years old", "a 300-year-old elf", "aged 41",
// "Age: 41". -> number or null
export function ageIn(text) {
    const t = clean(text);
    const m = t.match(/\b(\d{1,5})[\s-]*(?:years?|yrs?)[\s-]*old\b/i) ?? t.match(/\baged?\s*[:=]?\s*(\d{1,5})\b/i);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
}

function stageAgesOf(lifespan) {
    const parts = String(lifespan || 'human').split('+').map((p) => STAGE_AGES[p] ?? STAGE_AGES.human);
    if (parts.length === 1) return parts[0];
    // Half-ageless ages, but slowly: as a long-lived one.
    return parts[0].map((_, i) => {
        const xs = parts.map((p) => (Number.isFinite(p[i]) ? p[i] : STAGE_AGES.long[i]));
        return Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
    });
}

// "A 300-year-old looks 30": the ratio a note gives, or null.
function noteScale(note) {
    const m = clean(note).match(/(\d{1,5})[\s-]*(?:years?)?[\s-]*old\b[^.\d]*?\blooks?\s+(?:about\s+|like\s+(?:a\s+)?)?(\d{1,3})/i);
    return m && Number(m[1]) > 0 ? Number(m[2]) / Number(m[1]) : null;
}

// How old `age` is for one of their kind. -> { age, stage, looks } or null.
// looks: the human age they look.
export function ageReading(age, lifespan = 'human', note = '') {
    const n = Number(age);
    if (!Number.isFinite(n) || n <= 0) return null;
    const human = STAGE_AGES.human;
    const at = (ages, x) => { const i = ages.findIndex((a) => x < a); return i < 0 ? ages.length : i; };
    const scale = noteScale(note);
    if (scale) {
        const looks = Math.max(1, Math.round(n * scale));
        return { age: n, stage: STAGES[at(human, looks)], looks };
    }
    if (String(lifespan || 'human') === 'ageless') {
        const looks = n < 25 ? Math.round(n) : 30;
        return { age: n, stage: n < 25 ? STAGES[at(human, n)] : 'ageless', looks };
    }
    const ages = stageAgesOf(lifespan);
    const i = at(ages, n);
    // The same point between the stage's ages on a human's.
    const lo = [0, ...ages][i];
    const hi = [...ages, ages[ages.length - 1] * 1.25][i];
    const hlo = [0, ...human][i];
    const hhi = [...human, 100][i];
    const looks = Math.round(hlo + ((Math.min(n, hi) - lo) / Math.max(1, hi - lo)) * (hhi - hlo));
    return { age: n, stage: STAGES[i], looks };
}

// A character's age for the narrator, when their kind does not age as
// humans do: "312 years old - in the prime of life for an elf, looks about
// 34". '' for a human span, or no age.
export function ageLine(age, { lifespan = '', note = '', singular = '' } = {}) {
    if ((!lifespan || lifespan === 'human' || lifespan === 'human+human') && !noteScale(note)) return '';
    const r = ageReading(age, lifespan, note);
    if (!r) return '';
    const kind = singular ? ` for ${articled(singular)}` : '';
    return r.stage === 'ageless' ? `${r.age} years old - ageless, looks about ${r.looks}` : `${r.age} years old - ${r.stage}${kind}, looks about ${r.looks}`;
}

// What a writer is told of a bloodline's span, so a new one's age fits:
// "Elves live for centuries: one of 250 is in the prime of life and looks
// about 35." '' for a human span with no note.
export function lifespanLine(entry) {
    const b = normalizeBloodline(entry?.meta?.bloodline);
    const w = wordsOf(entry);
    const note = clean(b.lifespanNote).replace(/[.!]+$/, '');
    const P = firstUpper(w.plural);
    let line = '';
    if (b.lifespan === 'long') {
        const r = ageReading(250, 'long', b.lifespanNote);
        line = `${P} live for centuries: one of 250 is ${r.stage} and looks about ${r.looks}.`;
    } else if (b.lifespan === 'short') line = `${P} are short-lived: old at 40.`;
    else if (b.lifespan === 'ageless') line = `${P} do not age: however old, they look as they did when they stopped.`;
    if (note) line = `${line} ${firstUpper(note)}.`.trim();
    return line ? `${line} Give an age that fits.` : '';
}

// ---- a new character (phase 2: Generate and the director)

// Words for kinds of being a brief may use that the world has no bloodline
// for - "a troll bouncer" in a world without trolls is used as given and
// offered as a new bloodline. The presets' words are added by the caller.
export const KIND_WORDS = Object.freeze([
    'elf', 'dwarf', 'halfling', 'gnome', 'orc', 'goblin', 'hobgoblin', 'kobold', 'troll', 'ogre', 'centaur', 'satyr', 'faun', 'minotaur',
    'merfolk', 'mermaid', 'merman', 'naga', 'lizardfolk', 'dragonborn', 'tiefling', 'aasimar', 'genasi', 'changeling', 'shapeshifter', 'fey', 'fae', 'faerie',
    'nymph', 'dryad', 'vampire', 'werewolf', 'lycanthrope', 'ghoul', 'ghost', 'wraith', 'lich', 'revenant', 'android', 'robot', 'synth', 'cyborg', 'clone',
    'mutant', 'alien', 'insectoid', 'reptilian', 'golem', 'angel', 'demon',
]);

// The bloodlines a brief names ("an elf hacker", "one of the Vaskari",
// "a half-orc"), by each one's singular, plural and adjective, in the
// order they come; and a kind of being it names that the world has no
// bloodline for. -> { ids: [id] (at most two), unknown: 'troll' | '' }
export function matchBrief(text, bloodlines = [], extraWords = []) {
    const raw = clean(text);
    const t = raw.toLowerCase();
    if (!t) return { ids: [], unknown: '' };
    const hits = [];
    const covered = new Set();
    for (const b of bloodlines ?? []) {
        const w = wordsOf(b);
        const words = [...new Set([w.singular, w.plural, w.adjective].map(clean).filter(Boolean))];
        for (const x of words) covered.add(x.toLowerCase());
        const at = words.map((x) => foundAt(raw, x)).filter((i) => i >= 0);
        if (at.length) hits.push({ id: b.id, at: Math.min(...at) });
    }
    const ids = hits.sort((a, b) => a.at - b.at).slice(0, 2).map((x) => x.id);
    // "A half-orc": half human, when nothing else is named with it.
    if (ids.length === 1) {
        const w = wordsOf((bloodlines ?? []).find((x) => x.id === ids[0]));
        const human = humansOf(bloodlines).id;
        if (ids[0] !== human && [w.singular, w.adjective].some((x) => foundAt(raw, `half-${clean(x)}`) >= 0 || foundAt(raw, `half ${clean(x)}`) >= 0)) ids.push(human);
    }
    // Whichever kind comes first is the one meant: "an elf and a troll" is
    // an elf, "a kobold who sells to the dwarves" a kobold. A proper word
    // ("Grey") counts only with its capital.
    // A kind ending in one the world has ("half-orc", "wood elf") is that one.
    const words = [...new Set([...KIND_WORDS, ...extraWords.map(clean)])].filter((x) => x && !covered.has(x.toLowerCase()) && !covered.has(x.toLowerCase().split(/[\s-]/).pop()));
    const found = words.map((x) => ({ x, at: Math.min(...[x, `${x}s`, singularPlural(x)].map((y) => foundAt(raw, y)).filter((i) => i >= 0).concat(Infinity)) })).filter((f) => f.at < Infinity).sort((a, b) => a.at - b.at)[0];
    if (found && (!hits.length || found.at < hits[0].at)) return { ids: [], unknown: found.x };
    return { ids, unknown: '' };
}
const singularPlural = (x) => ({ elf: 'elves', dwarf: 'dwarves', fey: 'fey', fae: 'fae', merfolk: 'merfolk', lizardfolk: 'lizardfolk' }[x] ?? `${x}s`);

// A new character's bloodline: the one chosen, else the ones the brief
// names, else rolled from the mix where they will be. A kind the brief
// names that the world has no bloodline for wins over a roll: it is used
// as given. -> { ids, how: 'chosen' | 'brief' | 'rolled' | '', unknown }
export function decideLineage({ chosen = '', brief = '', bloodlines = [], mix = [], extraWords = [], random = Math.random } = {}) {
    if (chosen) return { ids: [chosen], how: 'chosen', unknown: '' };
    const m = matchBrief(brief, bloodlines, extraWords);
    if (m.ids.length) return { ids: m.ids, how: 'brief', unknown: '' };
    if (m.unknown) return { ids: [], how: '', unknown: m.unknown };
    const rolled = rollBloodline(mix, random);
    return rolled ? { ids: [rolled], how: 'rolled', unknown: '' } : { ids: [], how: '', unknown: '' };
}

// The naming culture a character's bloodline gives, by its mode: their own
// wherever they live; the place's ('' - the usual order decides); or
// either, weighted toward their own. Mixed heritage takes the first that
// has one. -> culture id or ''.
export function cultureOfLineage(ids = [], byId = {}, random = Math.random) {
    for (const id of ids ?? []) {
        const b = normalizeBloodline(byId[id]?.meta?.bloodline);
        if (!b.culture) continue;
        const mode = b.naming || 'own';
        if (mode === 'own') return b.culture;
        if (mode === 'either') return random() < 0.65 ? b.culture : '';
        return '';
    }
    return '';
}

// Mixed heritage's names (phase 4): the given name in one parent's culture,
// the family name in the other's - which parent gives which is rolled.
// Each parent's culture by its own mode, as cultureOfLineage. One parent,
// or both naming alike: no split. -> { given, family, split } (culture
// ids, '' for the usual order - the place's; split: the family name is
// rolled apart, in `family`)
export function namesOfLineage(ids = [], byId = {}, random = Math.random) {
    const list = (ids ?? []).slice(0, 2);
    if (list.length < 2) return { given: cultureOfLineage(list, byId, random), family: '', split: false };
    const [x, y] = list.map((id) => cultureOfLineage([id], byId, random));
    if (x === y) return { given: x, family: '', split: false };
    return random() < 0.5 ? { given: x, family: y, split: true } : { given: y, family: x, split: true };
}

const articled = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

// What a writer is told about a new character's bloodline: who they are,
// what their bloodline is like here, and - for one image models and the
// reader cannot picture - the features to put into their appearance.
// unknown: a kind the world has no bloodline for. '' when there is nothing.
export function lineageBriefLine(ids = [], byId = {}, unknown = '') {
    if (!ids?.length) return unknown ? `This character is ${articled(unknown)}, as asked - a kind of being this world has not described yet; keep this character true to the setting.` : '';
    const label = lineageLabel(ids, byId);
    const first = byId[ids[0]];
    if (!label || !first) return '';
    if (normalizeBloodline(first.meta?.bloodline).kind === 'human' && ids.length === 1) return `This character is ${articled(label)}.`;
    const lines = [`This character is ${articled(label)}.`];
    for (const id of ids) {
        const brief = bloodlineBrief(byId[id]);
        if (brief) lines.push(brief);
    }
    if (ids.length > 1 && ids[0] !== ids[1]) {
        // Mixed heritage: something of each parent, neither all of one.
        const v = lineageVisual(ids, byId);
        lines.push(`Write this character as of both: something of each parent in the looks and upbringing${v?.details.length > 1 ? ` (${v.details.slice(0, -1).join('; ')})` : ''}, and how each side sees one of mixed blood.`);
        const span = ids.map((id) => normalizeBloodline(byId[id]?.meta?.bloodline).lifespan).find((l) => l && l !== 'human');
        if (span === 'long' || span === 'ageless') lines.push('This character ages more slowly than a human, but not as slowly as the longer-lived parent. Give an age that fits.');
        return lines.join(' ');
    }
    const v = visualFor(first);
    if (v && normalizeBloodline(first.meta?.bloodline).visual.known !== 'well' && v.details.length) lines.push(`Put what marks this character as ${articled(wordsOf(first).singular)} into the appearance: ${v.details.join('; ')}.`);
    const span = lifespanLine(first);
    if (span) lines.push(span);
    return lines.join(' ');
}

// What a writer is told about who lives where a new place or faction
// is: the mix in words and its notes, the bloodlines never met there, and
// the world's "only" rule, and how each bloodline is seen there (views:
// viewsAt). '' when the mix is plain or not said.
export function populationBriefLine(at, byId = {}, world = null, views = []) {
    const lines = [];
    const who = whoIsAboutLine(at, byId).replace(/^Who is about here:/, 'Who lives here:');
    if (who) lines.push(who);
    const seen = seenHereLine(views, byId);
    if (seen) lines.push(`How they are seen there: ${seen}`);
    const only = world ? onlyRule(world, byId) : '';
    if (only) lines.push(only);
    return lines.join(' ');
}
