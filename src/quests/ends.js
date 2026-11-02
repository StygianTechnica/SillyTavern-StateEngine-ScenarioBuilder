// How a quest ends. Every quest gets a "completes when" and, when the
// story gives it a real way to be lost, a "fails when" - written from the
// part of the chat the quest came from, so a quest the story made can
// actually finish:
//   - quests made automatically (Archivist's threads) get them in the
//     background, one per reply, whether or not they have objectives;
//   - Enrich on a quest, or "Write from the story" on its Quest tab, writes
//     them too;
//   - after each reply, the open quests with conditions are checked against
//     it, and one whose condition the story has met is marked Completed or
//     Failed - only with words quoted from the reply that show it (an
//     ending the user can always override).
// Written from the name and objectives alone, the model made up endings the
// story could never reach ("the ancestral crypt collapses in an
// earthquake"), and a bare "3 | failed" ended quests on events that never
// happened (Assassins Inc).
// The prompts and readers here are pure (and tested); the runners call the
// model through the generation queue and never throw.

import { LOG_PREFIX } from '../constants.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

const SYSTEM = 'You are a game master\'s assistant for a roleplay. You answer with exactly the lines asked for - no preamble, no commentary.';

// The part of the chat a quest came from: the messages around where its
// thread began, and its latest ones when it runs on. chat: SillyTavern's
// messages ({ mes, name, is_user, is_system }); range: Archivist's
// message_range ({ from, to }) or null, for the chat's last messages. Pure.
export function questStory(chat, range, { max = 3000 } = {}) {
    const list = (chat ?? []).map((m, i) => ({ m, i })).filter(({ m }) => m && !m.is_system && clean(m.mes));
    if (!list.length) return '';
    let picked;
    if (range && Number.isInteger(range.from)) {
        const opening = [...list.filter((x) => x.i < range.from).slice(-1), ...list.filter((x) => x.i >= range.from).slice(0, 4)];
        const last = opening[opening.length - 1]?.i ?? -1;
        const latest = Number.isInteger(range.to) ? list.filter((x) => x.i <= range.to && x.i > last).slice(-2) : [];
        picked = [...opening, ...(latest.length ? [null, ...latest] : [])];
    } else {
        picked = list.slice(-4);
    }
    const per = Math.max(300, Math.floor(max / Math.max(1, picked.filter(Boolean).length)));
    const text = picked.map((x) => (x ? `${clean(x.m.name) || (x.m.is_user ? 'User' : 'Narrator')}: ${cut(x.m.mes, per)}` : '…')).join('\n\n');
    return cut(text, max);
}

// "When does this quest end?" -> { system, user, plain }
// quest: { name, description, objectives: [text | { text, status }] };
// story: the chat it came from (questStory); progress: where it stands.
export function buildEndsPrompt(quest, { story = '', progress = '' } = {}) {
    const objectives = (quest?.objectives ?? []).map((o) => clean(typeof o === 'string' ? o : o?.text)).filter(Boolean);
    const told = clean(story);
    const user = [
        `# The quest\nName: ${clean(quest?.name)}`,
        clean(quest?.description) ? `What it is: ${cut(quest.description, 600)}` : '',
        objectives.length ? `Objectives, in order:\n${objectives.map((o, i) => `${i + 1}. ${cut(o, 200)}`).join('\n')}` : '',
        clean(progress) ? `Where it stands: ${cut(progress, 300)}` : '',
        told ? `# Where it came from in the story\n${String(story).trim()}` : '',
        '# Your task\nSay how this quest ends, so the game master can tell when it is over.',
        `- DONE: what has visibly happened in the story once its goal is reached - what the characters${told ? ' in the story above' : ''} set out to do, done. One short sentence. It must be reachable from where the story is now.`,
        '- FAILS: only if the story has a real way for this goal to be lost for good - someone who could stop it, a deadline, a thing that could be destroyed or taken. One short sentence. If there is no such way, write: FAILS: none',
        `- Use only the people, places and things ${told ? 'in the story and the quest above' : 'named above'}; never add new ones - no new twist, disaster, person, place, name or object.${told ? ' Where the name or objectives do not fit the story, follow the story.' : ''} Something that can be seen happening in the story, not a feeling.`,
        '# Reply\nExactly two lines:\nDONE: <sentence>\nFAILS: <sentence, or none>',
    ].filter(Boolean).join('\n\n');
    return { system: SYSTEM, user, plain: true };
}

// "None", "N/A", "This quest cannot be abandoned": no way to fail.
const NO_FAIL = /^(?:none|n\/?a|nothing|never|-|(?:this quest|it) cannot (?:fail|be (?:failed|abandoned)))\.?$/i;

// The two lines of an answer. -> { completion, abandon }, either '' when
// missing; null when neither could be read.
export function readEnds(text) {
    const lines = String(text ?? '').split('\n').map((l) => l.replace(/[*`#]/g, '').trim());
    const pick = (re) => clean(lines.map((l) => l.match(re)?.[1]).find(Boolean) ?? '').replace(/^["']|["']$/g, '');
    const completion = pick(/^(?:done|complet(?:es?|ed)?|success)(?: when)?\s*[:\-–]\s*(.+)$/i);
    const failLine = pick(/^(?:fails?|failed|failure|abandon(?:ed|s)?)(?: when| if)?\s*[:\-–]\s*(.+)$/i);
    const abandon = NO_FAIL.test(failLine) ? '' : failLine;
    return completion || abandon ? { completion, abandon } : null;
}

// "Has the latest reply ended any of these?" -> { system, user, plain }
// quests: [{ name, completion, abandon }]
export function buildEndCheckPrompt(quests, { reply = '', userText = '' } = {}) {
    const list = (quests ?? []).map((q, i) => [
        `${i + 1}. ${clean(q.name)}`,
        clean(q.completion) ? `   done when: ${cut(q.completion, 240)}` : '',
        clean(q.abandon) ? `   fails when: ${cut(q.abandon, 240)}` : '',
    ].filter(Boolean).join('\n')).join('\n');
    const user = [
        `# Quests under way\n${list}`,
        `# What just happened in the story\n${clean(userText) ? `${cut(userText, 1200)}\n\n` : ''}${cut(reply, 3000)}`,
        '# Your task\nFor each quest, decide whether what just happened has met its "done when" or its "fails when". Only an ending the story has clearly SHOWN counts - not one planned, hoped for, close or half done, and never one that did not happen at all. When in doubt, it is open.\nFor a quest that is done or failed, copy the words from the story above that show it, exactly as written, after a second |.',
        `# Reply\nOne line per quest, exactly:\n<number> | open\n<number> | done | <the words from the story that show it>\n<number> | failed | <the words from the story that show it>\nFor example:\n1 | open${quests?.length > 1 ? '\n2 | done | She handed the ledger to Tobin and he locked it away.' : ''}`,
    ].join('\n\n');
    return { system: SYSTEM, user, plain: true };
}

const fold = (t) => String(t ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();

// Whether `quote` is in `source`: word for word (after folding case and
// punctuation), or - for a quote cut short or stitched - a long enough run
// of its words together. At least four words. Pure.
export function quotedFrom(quote, source) {
    const q = fold(quote);
    const s = ` ${fold(source)} `;
    const words = q.split(' ').filter(Boolean);
    if (words.length < 4) return false;
    if (s.includes(` ${q} `)) return true;
    // The longest run of the quote's words found together in the source.
    let best = 0;
    for (let i = 0; i < words.length; i++) {
        for (let j = words.length; j - i > best; j--) {
            if (s.includes(` ${words.slice(i, j).join(' ')} `)) { best = j - i; break; }
        }
    }
    return best >= 6 || best / words.length >= 0.7;
}

// The verdicts of an answer, for `count` quests. -> [{ index, verdict:
// 'done' | 'failed', quote }] (open ones and unreadable lines left out), or
// null when no line could be read at all.
export function readEndCheck(text, count) {
    const out = [];
    let read = 0;
    for (const line of String(text ?? '').split('\n')) {
        const m = line.replace(/[*`]/g, '').match(/^\s*(\d+)\s*[|:.)\-]\s*(done|completed?|failed|fails?|open|no|ongoing)\b\s*(?:[|:\-–]\s*(.*))?$/i);
        if (!m) continue;
        const index = Number(m[1]) - 1;
        if (index < 0 || index >= count) continue;
        read++;
        const word = m[2].toLowerCase();
        const quote = clean(m[3] ?? '').replace(/^["'“]+|["'”]+$/g, '');
        if (word.startsWith('done') || word.startsWith('complete')) out.push({ index, verdict: 'done', quote });
        else if (word.startsWith('fail')) out.push({ index, verdict: 'failed', quote });
    }
    return read ? out : null;
}

// The verdicts the story backs: each with a quote found in what just
// happened. -> { kept, dropped }. Pure.
export function backedVerdicts(verdicts, { reply = '', userText = '' } = {}) {
    const source = `${userText}\n${reply}`;
    const kept = [];
    const dropped = [];
    for (const v of verdicts ?? []) (v.quote && quotedFrom(v.quote, source) ? kept : dropped).push(v);
    return { kept, dropped };
}

// Which quests are checked after a reply: open ones with a condition - not
// only Active (a quest whose thread is still "open" is Not started, and its
// conditions, the user's own too, were never checked) - active first, the
// story's dormant ones left out. At most `max`. Pure.
export function questsToCheck(quests, max = 6) {
    return (quests ?? [])
        .filter((q) => (q.status === 'Active' || q.status === 'Not started') && !q.dormant && (clean(q.completion) || clean(q.abandon)))
        .sort((a, b) => (a.status === 'Active' ? 0 : 1) - (b.status === 'Active' ? 0 : 1) || (b.priority?.score ?? 0) - (a.priority?.score ?? 0))
        .slice(0, max);
}

// ---- runners

async function ask(prompt, read, maxTokens) {
    const { askReliably } = await import('../generate/run.js');
    return askReliably(prompt, (_p, text) => {
        const values = read(text);
        return values ? { values, dropped: [], error: null } : { values: {}, dropped: [], error: 'no lines in the asked form' };
    }, maxTokens);
}

// The open chat's part a quest came from (its thread's range), or ''.
function storyOf(thread) {
    try {
        return questStory(SillyTavern.getContext().chat ?? [], thread?.message_range ?? null);
    } catch {
        return '';
    }
}

// Writes a quest's ends from the story it came from. thread: Archivist's
// thread for it, or null (the chat's latest messages stand in).
// -> { completion, abandon } or null. Never throws.
export async function suggestQuestEnds(quest, { thread = null } = {}) {
    try {
        const prompt = buildEndsPrompt(quest, { story: storyOf(thread), progress: thread?.progress ?? '' });
        const result = await ask(prompt, readEnds, 250);
        return result.error ? null : result.values;
    } catch (err) {
        console.warn(LOG_PREFIX, `could not write how "${quest?.name}" ends`, err);
        return null;
    }
}

// Fills in the ends of one quest made without them (active ones first), if
// the setting allows generated detail. One per call - after each reply -
// so the queue stays light; a quest is tried once. Never throws.
export async function fillMissingEnds(chatId, chatKey, settingId) {
    try {
        const [{ questBoard, questMeta, setQuestMeta }, { mayAddGeneratedDetail }] = await Promise.all([import('./sync.js'), import('../library/library.js')]);
        const quests = await questBoard(chatId, chatKey, settingId);
        const next = quests.find((q) => (q.status === 'Active' || q.status === 'Not started') && !q.dormant
            && !clean(q.completion) && !clean(q.abandon) && !questMeta(settingId, q.id).endsTried && mayAddGeneratedDetail(settingId, q.id));
        if (!next) return false;
        setQuestMeta(settingId, next.id, { endsTried: true });
        const ends = await suggestQuestEnds(next, { thread: next.thread });
        if (!ends) return false;
        // The user may have written them meanwhile.
        const meta = questMeta(settingId, next.id);
        setQuestMeta(settingId, next.id, { completion: clean(meta.completion) ? meta.completion : ends.completion, abandon: clean(meta.abandon) ? meta.abandon : ends.abandon });
        return true;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not fill in how a quest ends', err);
        return false;
    }
}

// Checks the open quests' ends against the latest reply; one met - with
// the words that show it - is marked ended (Completed or Failed). -> the
// names ended. Never throws.
export async function checkQuestEnds(chatId, chatKey, settingId, { reply = '', userText = '' } = {}) {
    try {
        if (!clean(reply)) return [];
        const { questBoard, setQuestMeta } = await import('./sync.js');
        const quests = questsToCheck(await questBoard(chatId, chatKey, settingId));
        if (!quests.length) return [];
        const result = await ask(buildEndCheckPrompt(quests, { reply, userText }), (text) => readEndCheck(text, quests.length), 80 + 70 * quests.length);
        if (result.error) return [];
        const { kept, dropped } = backedVerdicts(result.values, { reply, userText });
        for (const v of dropped) console.info(LOG_PREFIX, `"${quests[v.index].name}" called ${v.verdict}, but nothing in the reply shows it${v.quote ? ` ("${cut(v.quote, 120)}" is not in it)` : ''} - still open`);
        const ended = [];
        for (const { index, verdict, quote } of kept) {
            const q = quests[index];
            setQuestMeta(settingId, q.id, { ended: verdict === 'done' ? 'Completed' : 'Failed' });
            ended.push(`${q.name} (${verdict === 'done' ? 'completed' : 'failed'}: "${cut(quote, 120)}")`);
        }
        if (ended.length) console.info(LOG_PREFIX, `quests ended: ${ended.join(', ')}`);
        return ended;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not check the quests\' ends', err);
        return [];
    }
}
