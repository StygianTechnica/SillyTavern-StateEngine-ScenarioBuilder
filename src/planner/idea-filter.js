// Which of the game master's new quests and quest details are worth showing.
// Assassins Inc: all 14 it offered were dismissed. The same dark history of
// the same art collection four times, Dr. Tole's intentions twice, a lost
// prototype nobody had mentioned - while the crew stood mid-heist. Happenings
// and seeds are not touched. Pure.

import { notAQuest, rejectedLike } from '../quests/model.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = (s) => clean(s).toLowerCase();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NOT_A_NAME = new Set(['the', 'and', 'doctor', 'commander', 'captain', 'lord', 'lady', 'sir', 'king', 'queen', 'prince', 'princess', 'general', 'sergeant', 'agent', 'master', 'mistress', 'brother', 'sister', 'father', 'mother']);

// Turned down this often for one quest, it wants no more detail.
export const ENRICH_REFUSALS = 2;

// Whether the idea ties in someone or something the latest chat has - the
// player character does not count, being in everything.
export function tiedToNow(idea, { recent = '', player = [] } = {}) {
    const me = new Set((player ?? []).flatMap((p) => [lower(p), lower(p).split(/\s+/)[0]]));
    const said = (n, flags) => new RegExp(`(^|[^\\p{L}])${escape(n)}(?!\\p{L})`, flags).test(String(recent));
    // By the whole name, or a word of it as a name ("Commander Reyes": Reyes).
    return (idea?.ties ?? []).map(clean).filter((t) => t && !me.has(lower(t)) && !me.has(lower(t).split(/\s+/)[0]))
        .some((t) => said(t, 'iu') || t.split(/\s+/).filter((w) => w.length >= 3 && !NOT_A_NAME.has(w.toLowerCase())).some((w) => said(w, 'u')));
}

// ideas: from readIdeas. past: every earlier idea ({ kind, name, target, text,
// status }). rejected: quests rejected in Review ({ name, text }). open: the
// quests on the board ({ name, text }). recent: the latest chat. player: the
// player character's names. encounter: a fight or a rival job is under way.
// -> the ideas to keep, at most one new quest and one detail.
export function narrowIdeas(ideas, { past = [], rejected = [], open = [], recent = '', player = [], encounter = false } = {}) {
    const refused = (past ?? []).filter((i) => i.status === 'dismissed');
    const quests = refused.filter((i) => i.kind === 'quest').map((i) => ({ name: i.name, text: i.text }));
    const timesFor = (target) => refused.filter((i) => i.kind === 'enrich' && lower(i.target) === lower(target)).length;
    let quest = false;
    let detail = false;
    return (ideas ?? []).filter((idea) => {
        if (idea.kind === 'quest') {
            const thread = { title: idea.name, text: idea.text };
            if (quest || encounter || notAQuest(thread) || !tiedToNow(idea, { recent, player }) || rejectedLike(thread, [...quests, ...(rejected ?? []), ...(open ?? [])])) return false;
            quest = true;
            return true;
        }
        if (idea.kind === 'enrich') {
            if (detail || encounter || notAQuest({ title: idea.target, text: idea.text }) || timesFor(idea.target) >= ENRICH_REFUSALS) return false;
            detail = true;
            return true;
        }
        return true;
    });
}
