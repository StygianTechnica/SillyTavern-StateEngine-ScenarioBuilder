// People the recent chat speaks of who are not in the scene: who they are
// and whose side they are on, from the library. Without it the narrator
// knows an absent name only from what the story has said of it, and a
// passing "Riven" becomes whatever fits the line - an attacker, a rival -
// even when the library has him in the very crew that is talking about him.
// Pure.

import { peopleNamedIn } from '../director/prompt.js';
import { MEMBER_KINDS } from '../library/faction-sync.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// characters: library characters [{ id, name, aliases, role?, base? }].
// here: ids in the scene; skip: ids never spoken for (the player, the
// dead, powers). memberships: Map characterId -> [factionId];
// factionName(id) -> name or ''. relations: the authored relations.
// -> [{ name, sides: [faction name], role, stances: ['distrusts the X'] }]
export function spokenOf(characters, { recentText = '', here = [], skip = [], memberships = new Map(), factionName = () => '', relations = [], max = 4 } = {}) {
    const out = [];
    const away = new Set([...here, ...skip]);
    for (const c of peopleNamedIn(recentText, characters)) {
        if (away.has(c.id)) continue;
        const sides = [...new Set((memberships.get(c.id) ?? []).map(factionName).map(clean).filter(Boolean))];
        const stances = (relations ?? [])
            .filter((r) => r.from === c.id && clean(factionName(r.to)) && !MEMBER_KINDS.has(clean(r.kind).toLowerCase()))
            .map((r) => `${clean(r.kind)} ${clean(factionName(r.to))}`);
        const role = clean(c.base?.role ?? c.role);
        if (!sides.length && !role && !stances.length) continue;
        out.push({ name: clean(c.name), sides, role, stances });
        if (out.length >= max) break;
    }
    return out;
}
