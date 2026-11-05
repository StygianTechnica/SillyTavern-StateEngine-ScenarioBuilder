// People the recent chat speaks of who are not in the scene: who they are
// and whose side they are on, from the library. Without it the narrator
// knows an absent name only from what the story has said of it, and a
// passing "Riven" becomes whatever fits the line - an attacker, a rival -
// even when the library has him in the very crew that is talking about him.
// Pure.

import { peopleNamedIn, callNames } from '../director/prompt.js';
import { MEMBER_KINDS } from '../library/faction-sync.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// characters: library characters [{ id, name, aliases, role?, base? }].
// here: ids in the scene; skip: ids never spoken for (the player, the
// dead, powers). memberships: Map characterId -> [factionId];
// factionName(id) -> name or ''. relations: the authored relations.
// playerId: the player's character - their ties count, but they are
// never one who "knows" someone (the player decides that).
// -> [{ name, sides: [faction name], role, stances: ['distrusts the X'],
//      ties: ['toward Inji Miyama: rival'], knownBy: [name], at }] - the
//    latest named first (Cyril asked after Zane; the four named before him
//    filled the list and Zane was left out); `at`: where in the text they
//    were last named.
//    knownBy: those here who share a faction or a tie with them - they
//    know who this is (Inji answered "I'm not familiar with an agent by
//    that name" of Zane, a fellow White Cerberus agent and his rival).
export function spokenOf(characters, { recentText = '', here = [], skip = [], memberships = new Map(), factionName = () => '', relations = [], playerId = '', max = 4 } = {}) {
    const out = [];
    const away = new Set([...here, ...skip]);
    const nameOf = new Map((characters ?? []).map((c) => [c.id, clean(c.name)]));
    const presentIds = (here ?? []).filter((id) => nameOf.has(id));
    const text = String(recentText ?? '');
    const lastAt = (c) => Math.max(-1, ...callNames(c).map((n) => {
        const re = new RegExp(String.raw`(^|[^\p{L}\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\p{L}\p{N}])`, 'giu');
        let at = -1;
        for (const m of text.matchAll(re)) at = m.index;
        return at;
    }));
    const named = peopleNamedIn(text, characters).map((c) => ({ c, at: lastAt(c) })).sort((a, b) => b.at - a.at);
    for (const { c, at } of named) {
        if (away.has(c.id)) continue;
        const sides = [...new Set((memberships.get(c.id) ?? []).map(factionName).map(clean).filter(Boolean))];
        const stances = (relations ?? [])
            .filter((r) => r.from === c.id && clean(factionName(r.to)) && !MEMBER_KINDS.has(clean(r.kind).toLowerCase()))
            .map((r) => `${clean(r.kind)} ${clean(factionName(r.to))}`);
        const role = clean(c.base?.role ?? c.role);
        // Ties to the people here, either way round.
        const ties = (relations ?? []).flatMap((r) => {
            const kind = clean(r.kind);
            if (!kind || MEMBER_KINDS.has(kind.toLowerCase())) return [];
            if (r.from === c.id && presentIds.includes(r.to)) return [{ id: r.to, line: `toward ${nameOf.get(r.to)}: ${kind}` }];
            if (r.to === c.id && presentIds.includes(r.from)) return [{ id: r.from, line: `${nameOf.get(r.from)} toward them: ${kind}` }];
            return [];
        });
        const mine = new Set(memberships.get(c.id) ?? []);
        const knownBy = presentIds.filter((id) => id !== playerId && !(skip ?? []).includes(id)
            && (ties.some((t) => t.id === id) || (memberships.get(id) ?? []).some((f) => mine.has(f))))
            .map((id) => nameOf.get(id));
        if (!sides.length && !role && !stances.length && !ties.length) continue;
        out.push({ name: clean(c.name), sides, role, stances, ties: ties.map((t) => t.line), knownBy, at });
        if (out.length >= max) break;
    }
    return out;
}

const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

// For the in-chat note: those just named whom someone here knows - one
// sentence each, a couple at most.
export function spokenNowText(list = [], max = 2) {
    return (list ?? []).filter((p) => (p?.knownBy ?? []).length).slice(0, max).map((p) => {
        const who = [p.sides?.length ? `of ${listOf(p.sides)}` : '', ...(p.ties ?? [])].map(clean).filter(Boolean).join('; ');
        const k = p.knownBy.map(clean);
        const one = k.length === 1;
        return `${clean(p.name)}, just named and not here, is someone ${listOf(k)} know${one ? 's' : ''}${who ? ` (${who})` : ''}: they speak of ${clean(p.name)} as someone known, never as a stranger.`;
    }).join(' ');
}
