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
export const JOB = /\b(?:heists?|raid(?:s|ing)?|break-?ins?|breaking in|breach(?:es|ed|ing)?|theft|thie(?:f|ves)|burglar\w*|robb(?:ery|eries|ing)|steal(?:s|ing)?|ambush(?:es|ing)?|kidnap(?:s|ping)?|hijack(?:s|ing)?|smuggl\w*|assault\w*|sabotag\w*)\b/i;

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

// texts: the recent chat, oldest first, with the director's last briefing
// and the threads being followed (its own "disrupting Enrique's art heist"
// counts, when the chat only says "Enrique's operatives"); factions:
// library faction entries; relations: the setting's; mine: the player
// character's faction ids; playerId; members: Map(factionId -> [character
// entries]). A rival is a faction at odds with the player character's side
// - the faction itself, or one of its people at odds with the player
// character or one of theirs (Enrique Medina, Cyril's rival). A job and the
// rival's name in the same passage.
// -> { who (the faction's name), what (the passage, cut) } or null.
export function rivalAtWork({ texts = [], factions = [], relations = [], mine = [], playerId = '', members = new Map() } = {}) {
    const ours = new Set(mine);
    const usIds = new Set([...mine, ...(playerId ? [playerId] : []), ...mine.flatMap((id) => (members.get(id) ?? []).map((c) => c.id))]);
    if (!usIds.size) return null;
    const rivals = factions.filter((f) => {
        if (ours.has(f.id)) return false;
        const them = new Set([f.id, ...(members.get(f.id) ?? []).map((c) => c.id)].filter((id) => !usIds.has(id)));
        return relations.some((r) => AT_ODDS.test(clean(r?.kind)) && ((usIds.has(r.from) && them.has(r.to)) || (usIds.has(r.to) && them.has(r.from))));
    });
    if (!rivals.length) return null;
    const passages = texts.flatMap((t) => String(t ?? '').split(/\n\s*\n/)).map(clean).filter(Boolean).reverse();
    for (const p of passages) {
        if (!JOB.test(p)) continue;
        const f = rivals.find((x) => namesOf(x, members.get(x.id) ?? []).some((n) => wordIn(n, p)));
        if (!f) continue;
        // The sentence with the job in it, for the plan's request.
        const sentence = p.split(/(?<=[.!?…])\s+/).find((x) => JOB.test(x)) ?? p;
        return { who: f.name, what: clean(sentence).slice(0, 300) };
    }
    return null;
}
