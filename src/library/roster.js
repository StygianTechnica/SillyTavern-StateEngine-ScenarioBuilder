// A faction's chain of command: named tiers, top to bottom, each holding
// people with a title of their own. Belonging to a faction is not a tie
// between two people - Assassins Inc set the Medina Syndicate's people up as
// "member of" relationships, every one the same, and the story took Enrique
// (third in command) for its head. Kept in the faction's Scenario Builder
// entry (meta.roster); its people count as members wherever memberships are
// read (src/library/faction-sync.js libraryMemberships). Pure, but for the
// helpers at the bottom that save.
//
// roster: { tiers: [{ id, name, people: [{ id, title }] }] } - tiers[0] is
// the top; people in one tier are peers.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
let counter = 0;
const tierId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export function normalizeRoster(x) {
    const seen = new Set();
    const tiers = (isObject(x) && Array.isArray(x.tiers) ? x.tiers : []).filter(isObject).map((t) => ({
        id: clean(t.id) || tierId(),
        name: clean(t.name).slice(0, 60),
        people: (Array.isArray(t.people) ? t.people : []).filter((p) => isObject(p) && clean(p.id) && !seen.has(p.id) && seen.add(p.id))
            .map((p) => ({ id: clean(p.id), title: clean(p.title).slice(0, 80) })),
    }));
    return { tiers };
}

export const rosterOf = (faction) => normalizeRoster(faction?.meta?.roster);
export const rosterIds = (roster) => normalizeRoster(roster).tiers.flatMap((t) => t.people.map((p) => p.id));
export const hasRoster = (roster) => normalizeRoster(roster).tiers.length > 0;

// Where someone stands: { tier (0 = top), tierName, title } or null.
export function placeIn(roster, personId) {
    const tiers = normalizeRoster(roster).tiers;
    for (let i = 0; i < tiers.length; i++) {
        const p = tiers[i].people.find((x) => x.id === personId);
        if (p) return { tier: i, tierName: tiers[i].name, title: p.title };
    }
    return null;
}

// Who leads: the top tier with anyone in it. -> [{ id, title, tierName }]
export function rosterLeaders(roster) {
    const top = normalizeRoster(roster).tiers.find((t) => t.people.length);
    return top ? top.people.map((p) => ({ ...p, tierName: top.name })) : [];
}

// A person's standing in words: "Power Broker (Underbosses)", "Lieutenants".
export function standingWords(place) {
    if (!place) return '';
    const title = clean(place.title);
    const tier = clean(place.tierName);
    if (title && tier && title.toLowerCase() !== tier.toLowerCase()) return `${title} (${tier})`;
    return title || tier;
}

// The chain as lines, top down, for a prompt: "Patriarch: Serlos Medina
// (Founder and Leader)". nameOf(id) -> name.
export function rosterLines(roster, nameOf) {
    return normalizeRoster(roster).tiers.filter((t) => t.people.length).map((t, i) => {
        const people = t.people.map((p) => { const n = clean(nameOf(p.id)); return n ? `${n}${p.title ? ` (${p.title})` : ''}` : ''; }).filter(Boolean);
        return people.length ? `${t.name || `Tier ${i + 1}`}: ${people.join(', ')}` : '';
    }).filter(Boolean);
}

// ---- changes (pure: roster in, roster out)

export function addTier(roster, name = '', at = null) {
    const r = normalizeRoster(roster);
    const tier = { id: tierId(), name: clean(name).slice(0, 60), people: [] };
    const i = Number.isInteger(at) ? Math.max(0, Math.min(at, r.tiers.length)) : r.tiers.length;
    r.tiers.splice(i, 0, tier);
    return r;
}

export function renameTier(roster, id, name) {
    const r = normalizeRoster(roster);
    r.tiers = r.tiers.map((t) => (t.id === id ? { ...t, name: clean(name).slice(0, 60) } : t));
    return r;
}

// Its people go back to unplaced.
export function removeTier(roster, id) {
    const r = normalizeRoster(roster);
    r.tiers = r.tiers.filter((t) => t.id !== id);
    return r;
}

export function moveTier(roster, id, by) {
    const r = normalizeRoster(roster);
    const i = r.tiers.findIndex((t) => t.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= r.tiers.length) return r;
    [r.tiers[i], r.tiers[j]] = [r.tiers[j], r.tiers[i]];
    return r;
}

// Puts someone in a tier (out of any other), keeping their title unless a
// new one is given.
export function placePerson(roster, personId, tier, title) {
    const r = normalizeRoster(roster);
    const had = placeIn(r, personId);
    r.tiers = r.tiers.map((t) => ({ ...t, people: t.people.filter((p) => p.id !== personId) }));
    r.tiers = r.tiers.map((t) => (t.id === tier ? { ...t, people: [...t.people, { id: personId, title: clean(title ?? had?.title ?? '').slice(0, 80) }] } : t));
    return r;
}

export function setTitle(roster, personId, title) {
    const r = normalizeRoster(roster);
    r.tiers = r.tiers.map((t) => ({ ...t, people: t.people.map((p) => (p.id === personId ? { ...p, title: clean(title).slice(0, 80) } : p)) }));
    return r;
}

export function removePerson(roster, personId) {
    const r = normalizeRoster(roster);
    r.tiers = r.tiers.map((t) => ({ ...t, people: t.people.filter((p) => p.id !== personId) }));
    return r;
}

// The tier a new member takes, by how they join (kind) and their role: one
// who leads, or whose role is a top post (a CEO, a boss, a founder), the
// top tier; one whose role names a tier ("Capo" -> "Capos"), that one; else
// '' - they wait in Unplaced. Pure.
const TOP_POST = /\b(?:ceo|chief executive|president|chair(?:man|woman|person)?|founder|boss|kingpin|don|patriarch|matriarch|leader|head|ruler|king|queen|grandmaster|guildmaster|high priest(?:ess)?|commander[- ]in[- ]chief|owner)\b/i;
const stem = (w) => w.toLowerCase().replace(/(?:es|s)$/, '');
export function tierFor(roster, { kind = '', role = '' } = {}) {
    const tiers = normalizeRoster(roster).tiers;
    if (!tiers.length) return '';
    if (clean(kind).toLowerCase() === 'leads' || TOP_POST.test(clean(role))) return tiers[0].id;
    const words = new Set((clean(role).match(/[\p{L}-]{3,}/gu) ?? []).map(stem));
    if (!words.size) return '';
    const hit = tiers.find((t) => (t.name.match(/[\p{L}-]{3,}/gu) ?? []).some((w) => words.has(stem(w))));
    return hit?.id ?? '';
}

// ---- suggesting one (one model call, on the user's word)

// people: [{ id, name, role, description }]. Pure.
export function buildRosterPrompt({ faction = {}, people = [], overview = '' } = {}) {
    const list = people.map((p, i) => `${i + 1}. ${clean(p.name)}${clean(p.role) ? ` - ${clean(p.role).slice(0, 120)}` : ''}${clean(p.description) ? `: ${clean(p.description).slice(0, 200)}` : ''}`).join('\n');
    const user = [
        clean(overview) ? `# The setting\n${clean(overview).slice(0, 400)}` : '',
        `# The faction: ${clean(faction.name)}\n${clean(faction.description).slice(0, 700) || '(no description)'}${clean(faction.goals) ? `\nGoals: ${clean(faction.goals).slice(0, 300)}` : ''}`,
        `# Its people\n${list || '(none yet)'}`,
        '# Your task',
        `Lay out ${clean(faction.name)}'s chain of command as tiers from the top down. First work out what kind of group it is from its description, then name the tiers the way its own people would - for example a mob family: Boss, Underboss, Capos, Soldiers, Associates; a corporation: CEO, Executives, Directors, Staff; an army or police force: its ranks; a church or cult: High Priest, Elders, Acolytes; a guild: Guildmaster, Masters, Journeymen, Apprentices; a street gang: Shot-caller, Lieutenants, Crew - in this setting's own flavour, never generic words like "Tier 1". Two to five tiers; people of equal rank share a tier. Place every person listed by their number, going by their role and description; give each a short title of their own when their role gives one. Keep a tier empty rather than invent anyone.`,
        'Answer with JSON only: {"tiers":[{"name":"<tier name>","people":[{"n":<number>,"title":"<their title, or empty>"}]}]}',
    ].filter(Boolean).join('\n\n');
    return { system: 'You lay out the ranks of a roleplay\'s factions. You answer with JSON only.', user };
}

// The model's answer -> a roster ({ tiers }) or null. people: as given to
// the prompt (numbers are their places, from 1).
export function readRoster(text, people = []) {
    const raw = String(text ?? '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    let parsed;
    try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
    const tiers = (Array.isArray(parsed?.tiers) ? parsed.tiers : []).filter(isObject).slice(0, 6).map((t) => ({
        name: clean(t.name).slice(0, 60),
        people: (Array.isArray(t.people) ? t.people : []).map((p) => {
            const n = Number(isObject(p) ? p.n : p);
            const who = Number.isInteger(n) ? people[n - 1] : null;
            return who ? { id: who.id, title: isObject(p) ? clean(p.title).slice(0, 80) : '' } : null;
        }).filter(Boolean),
    })).filter((t) => t.name);
    if (!tiers.length) return null;
    return normalizeRoster({ tiers });
}
