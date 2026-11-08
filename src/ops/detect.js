// A rival crew at work in the story, found without the model (src/ops/).
// The director is asked for an OPPOSED line when a rival group is on a
// job of its own, but a small model let "their mission to disrupt
// Enrique's heist" pass with none: no plan, and the narrator made one up -
// the Medina Syndicate lying in wait for White Cerberus it did not know was
// there. So the recent chat is read for it: a faction the player
// character's side is at odds with, named (or one of its people named) in
// the same sentence as a job - a heist, a raid, a break-in, an ambush. Pure.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Factions that do not work together (src/guidance/sides.js).
const AT_ODDS = /distrust|mistrust|enem|rival|hostil|\bwar\b|oppos|hate|feud|against|suspic|wary|target(?:s|ed|ing)?\b|hunt\w*|competit/i;
const JOB = /\b(?:heists?|raid(?:s|ing)?|break-?ins?|breaking in|robb(?:ery|eries|ing)|steal(?:s|ing)?|ambush(?:es|ing)?|kidnap(?:s|ping)?|hijack(?:s|ing)?|smuggl\w*|assault\w*|sabotag\w*)\b/i;

const wordIn = (name, text) => {
    const n = clean(name);
    return n.length >= 4 && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text);
};

// The names a faction goes by in the chat: its own, and its people's (a
// first name of four letters or more will do: "Enrique's heist").
function namesOf(faction, people = []) {
    const own = [faction.name, ...(faction.aliases ?? faction.base?.aliases ?? [])].map(clean).filter(Boolean);
    const theirs = people.flatMap((p) => {
        const full = clean(p.name);
        return [full, full.split(/[\s"']+/)[0], ...(p.aliases ?? p.base?.aliases ?? [])].map(clean);
    }).filter((n) => n.length >= 4);
    return [...new Set([...own, ...theirs])];
}

// texts: the recent chat, oldest first; factions: library faction entries;
// relations: the setting's; mine: the player character's faction ids;
// members: Map(factionId -> [character entries]).
// -> { who (the faction's name), what (the sentence) } or null.
export function rivalAtWork({ texts = [], factions = [], relations = [], mine = [], members = new Map() } = {}) {
    if (!mine.length) return null;
    const ours = new Set(mine);
    const rivals = factions.filter((f) => !ours.has(f.id) && relations.some((r) => AT_ODDS.test(clean(r?.kind))
        && ((ours.has(r.from) && r.to === f.id) || (ours.has(r.to) && r.from === f.id))));
    if (!rivals.length) return null;
    const sentences = texts.flatMap((t) => String(t ?? '').split(/(?<=[.!?…])\s+|\n+/)).map(clean).filter(Boolean).reverse();
    for (const s of sentences) {
        if (!JOB.test(s)) continue;
        const f = rivals.find((x) => namesOf(x, members.get(x.id) ?? []).some((n) => wordIn(n, s)));
        if (f) return { who: f.name, what: s.slice(0, 300) };
    }
    return null;
}
