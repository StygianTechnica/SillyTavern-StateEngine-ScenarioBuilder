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

// Library people the reply before the player's post named, or the reasons
// of those arriving name, who are not in the scene: they stay where they
// are. Assassins Inc - a cutaway had Doc, Galice, Vex and Miller at HQ;
// the next reply, Zane coming "for Adam's assignment of Cyril and Inji",
// put all of them at the gun range. Not those the player's post names
// (Cyril may be going to them), nor anyone here, nor `skip`.
// -> [name], at most `max`.
export function elsewhereNow(characters, { lastReply = '', reasons = [], playerPost = '', here = [], skip = [], max = 6 } = {}) {
    const away = new Set([...(here ?? []), ...(skip ?? [])]);
    const called = new Set(peopleNamedIn(playerPost, characters).map((c) => c.id));
    const named = peopleNamedIn([lastReply, ...(reasons ?? [])].join('\n'), characters);
    return named.filter((c) => !away.has(c.id) && !called.has(c.id)).map((c) => clean(c.name)).filter(Boolean).slice(0, max);
}

// Those the player's recent posts say will not turn up in person - a boss
// who sends his people. Assassins Inc: "Enrique wouldn't show up at a small
// heist like this in person" (and "would never do something like that
// himself"); the day plan gave Enrique an agenda on the job and the next
// reply had him step out of the shadows. A later post that has them come
// ("Enrique walks in") undoes it. posts: the player's posts, oldest first.
// -> [name], those not in `here`.
const SAY_NOT = String.raw`(?:wouldn'?t|won'?t|would(?:\s+\w+)?\s+never|will\s+never|never|would\s+not|will\s+not|doesn'?t|does\s+not|isn'?t\s+going\s+to|is\s+not\s+going\s+to|not\s+going\s+to|can'?t\s+be\s+bothered\s+to)`;
const COME = String.raw`(?:show(?:s|ing)?\s+(?:up|(?:his|her|their)\s+face)|come(?:s)?(?:\s+(?:himself|herself|themselves|personally|in\s+person))?\b|turn(?:s)?\s+up|be\s+there|be\s+here|appear|oversee|lead\s+(?:it|this|the\s+\w+)|bother|do\s+(?:something|anything|it|that|the\s+\w+)\s+(?:like\s+that\s+)?(?:himself|herself|themselves|personally))`;
const THINK_NOT = String.raw`(?:didn'?t|don'?t|doesn'?t|did\s+not|do\s+not|does\s+not)\s+(?:think|expect|believe|imagine)`;
const COMES_NOW = /\b(?:arrives?|walks?\s+in|steps?\s+(?:in|out)|shows?\s+up|turns?\s+up|is\s+here|was\s+there|appears?)\b/i;
export function notInPerson(posts, characters, { here = [] } = {}) {
    const at = new Set(here ?? []);
    const verdict = new Map();
    for (const post of posts ?? []) {
        for (const sentence of String(post ?? '').split(/(?<=[.!?])\s+|\n+/)) {
            for (const c of peopleNamedIn(sentence, characters)) {
                const n = callNames(c).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
                if (!n) continue;
                const away = new RegExp(String.raw`\b(?:${n})\b(?!'s)[^.!?]{0,30}?\b${SAY_NOT}\b[^.!?]{0,40}?\b${COME}`, 'i').test(sentence)
                    || new RegExp(String.raw`\b${THINK_NOT}\s+(?:that\s+)?(?:${n})\b(?!'s)\s+(?:would|will|'d|'ll)\s+(?:\w+\s+){0,2}?${COME}`, 'i').test(sentence);
                if (away) verdict.set(c.id, c);
                else if (new RegExp(String.raw`\b(?:${n})\b(?!'s)`, 'i').test(sentence) && COMES_NOW.test(sentence) && !/\b(?:if|when|unless|in case|might|could)\b/i.test(sentence)) verdict.delete(c.id);
            }
        }
    }
    return [...verdict.values()].filter((c) => !at.has(c.id)).map((c) => clean(c.name));
}

// Whether a character is set to stay out of the field (the sheet's "In
// person" choice, meta.inPerson 'remote'): a boss who sends their people.
// 'later': saved for their beat - an end boss met in person only once the
// plan's beat brings them (Enrique, before the story has played out Bartin).
export const IN_PERSON_MODES = Object.freeze(['', 'remote', 'later']);
export const IN_PERSON_LABELS = Object.freeze({
    '': 'Goes where the story takes them',
    remote: 'Stays out of the field - sends their people',
    later: 'Works from the shadows - met in person only when the plan\'s beat brings them',
});
export const inPersonOf = (c) => (IN_PERSON_MODES.includes(c?.meta?.inPerson) ? c.meta.inPerson : '');

// Those held out of the scene by their sheet whom `texts` (the latest
// messages, the day's agendas) bring up, and who are not here: only they
// need the line. A 'later' one the beat now names (beatTies) is free.
// -> { remote: [name], later: [name] }
export function heldOutNamed(characters, texts, { here = [], beatTies = [] } = {}) {
    const at = new Set(here ?? []);
    const ties = (beatTies ?? []).map((n) => String(n ?? '').trim().toLowerCase()).filter(Boolean);
    const tied = (c) => ties.some((t) => t === clean(c.name).toLowerCase() || t.split(/\s+/)[0] === clean(c.name).toLowerCase().split(/\s+/)[0]);
    const held = (characters ?? []).filter((c) => !at.has(c.id) && (inPersonOf(c) === 'remote' || (inPersonOf(c) === 'later' && !tied(c))));
    if (!held.length) return { remote: [], later: [] };
    const named = texts === null ? held : peopleNamedIn((texts ?? []).join('\n'), held);
    return {
        remote: named.filter((c) => inPersonOf(c) === 'remote').map((c) => clean(c.name)),
        later: named.filter((c) => inPersonOf(c) === 'later').map((c) => clean(c.name)),
    };
}

// For the day's plan: everyone their sheet holds back, named or not. ''
// when no one.
export function heldBackText(characters, { here = [], beatTies = [] } = {}) {
    const { remote, later } = heldOutNamed(characters, null, { here, beatTies });
    return [
        later.length ? `Working from the shadows, not met in person today: ${later.join(', ')} - the story builds up to them. Their hand is felt: their schemes move the world and their underlings bring the trouble and the grief, one rung at a time. No moment has them appear, fight or reveal what they know.` : '',
        remote.length ? `Stay out of the field: ${remote.join(', ')} - they send their people and do not turn up in person.` : '',
    ].filter(Boolean).join('\n');
}
