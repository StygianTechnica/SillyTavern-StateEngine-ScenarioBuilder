// How a quest ends. Every quest gets a "completes when" and a "fails when",
// written from its objectives, so a quest the story made can actually
// finish:
//   - Enrich all on a quest writes them when they are empty;
//   - quests made automatically (Archivist's threads) get them in the
//     background, one per reply;
//   - after each reply, the active quests with conditions are checked
//     against it, and one whose condition the story has met is marked
//     Completed or Failed (an ending the user can always override).
// The prompts and readers here are pure (and tested); the runners call the
// model through the generation queue and never throw.

import { LOG_PREFIX } from '../constants.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

const SYSTEM = 'You are a game master\'s assistant for a roleplay. You answer with exactly the lines asked for - no preamble, no commentary.';

// "When does this quest end?" -> { system, user, plain }
// quest: { name, description, objectives: [text | { text, status }] }
export function buildEndsPrompt(quest) {
    const objectives = (quest?.objectives ?? []).map((o) => clean(typeof o === 'string' ? o : o?.text)).filter(Boolean);
    const user = [
        `# The quest\nName: ${clean(quest?.name)}`,
        clean(quest?.description) ? `What it is: ${cut(quest.description, 600)}` : '',
        objectives.length ? `Objectives, in order:\n${objectives.map((o, i) => `${i + 1}. ${cut(o, 200)}`).join('\n')}` : '',
        '# Your task\nSay how this quest ends, so the game master can tell when it is over.',
        '- DONE: the event in the story that completes it - what has visibly happened when its goal is reached (usually the last objective achieved). One short sentence.',
        '- FAILS: the event that makes it impossible or abandoned - its goal lost for good, destroyed, given up. One short sentence.',
        '- Use only the people, places and things named above; never add new ones. Something that can be seen happening in the story, not a feeling.',
        '# Reply\nExactly two lines:\nDONE: <sentence>\nFAILS: <sentence>',
    ].filter(Boolean).join('\n\n');
    return { system: SYSTEM, user, plain: true };
}

// The two lines of an answer. -> { completion, abandon }, either '' when
// missing; null when neither could be read.
export function readEnds(text) {
    const lines = String(text ?? '').split('\n').map((l) => l.replace(/[*`#]/g, '').trim());
    const pick = (re) => clean(lines.map((l) => l.match(re)?.[1]).find(Boolean) ?? '').replace(/^["']|["']$/g, '');
    const completion = pick(/^(?:done|complet(?:es?|ed)?|success)(?: when)?\s*[:\-–]\s*(.+)$/i);
    const abandon = pick(/^(?:fails?|failed|failure|abandon(?:ed|s)?)(?: when| if)?\s*[:\-–]\s*(.+)$/i);
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
        '# Your task\nFor each quest, decide whether what just happened has met its "done when" or its "fails when". Only an ending the story has clearly SHOWN counts - not one planned, hoped for, close or half done. When in doubt, it is open.',
        `# Reply\nOne line per quest, exactly:\n<number> | done\n<number> | failed\n<number> | open\nFor example:\n1 | open${quests?.length > 1 ? '\n2 | done' : ''}`,
    ].join('\n\n');
    return { system: SYSTEM, user, plain: true };
}

// The verdicts of an answer, for `count` quests. -> [{ index, verdict:
// 'done' | 'failed' }] (open ones and unreadable lines left out), or null
// when no line could be read at all.
export function readEndCheck(text, count) {
    const out = [];
    let read = 0;
    for (const line of String(text ?? '').split('\n')) {
        const m = line.replace(/[*`]/g, '').match(/^\s*(\d+)\s*[|:.)\-]\s*(done|completed?|failed|fails?|open|no|ongoing)\b/i);
        if (!m) continue;
        const index = Number(m[1]) - 1;
        if (index < 0 || index >= count) continue;
        read++;
        const word = m[2].toLowerCase();
        if (word.startsWith('done') || word.startsWith('complete')) out.push({ index, verdict: 'done' });
        else if (word.startsWith('fail')) out.push({ index, verdict: 'failed' });
    }
    return read ? out : null;
}

// ---- runners

async function ask(prompt, read, maxTokens) {
    const { askReliably } = await import('../generate/run.js');
    return askReliably(prompt, (_p, text) => {
        const values = read(text);
        return values ? { values, dropped: [], error: null } : { values: {}, dropped: [], error: 'no lines in the asked form' };
    }, maxTokens);
}

// Writes a quest's ends. -> { completion, abandon } or null. Never throws.
export async function suggestQuestEnds(quest) {
    try {
        const result = await ask(buildEndsPrompt(quest), readEnds, 250);
        return result.error ? null : result.values;
    } catch (err) {
        console.warn(LOG_PREFIX, `could not write how "${quest?.name}" ends`, err);
        return null;
    }
}

// Fills in the ends of one quest made without them (the oldest first), if
// the setting allows generated detail. One per call - after each reply -
// so the queue stays light; a quest is tried once. Never throws.
export async function fillMissingEnds(chatId, chatKey, settingId) {
    try {
        const [{ questBoard, questMeta, setQuestMeta }, { mayAddGeneratedDetail }] = await Promise.all([import('./sync.js'), import('../library/library.js')]);
        const quests = await questBoard(chatId, chatKey, settingId);
        const next = quests.find((q) => (q.status === 'Active' || q.status === 'Not started') && q.objectives.length
            && !clean(q.completion) && !clean(q.abandon) && !questMeta(settingId, q.id).endsTried && mayAddGeneratedDetail(settingId, q.id));
        if (!next) return false;
        setQuestMeta(settingId, next.id, { endsTried: true });
        const ends = await suggestQuestEnds(next);
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

// Checks the active quests' ends against the latest reply; one met is
// marked ended (Completed or Failed). -> the names ended. Never throws.
export async function checkQuestEnds(chatId, chatKey, settingId, { reply = '', userText = '' } = {}) {
    try {
        if (!clean(reply)) return [];
        const { questBoard, setQuestMeta } = await import('./sync.js');
        const quests = (await questBoard(chatId, chatKey, settingId))
            .filter((q) => q.status === 'Active' && (clean(q.completion) || clean(q.abandon)))
            .slice(0, 6);
        if (!quests.length) return [];
        const result = await ask(buildEndCheckPrompt(quests, { reply, userText }), (text) => readEndCheck(text, quests.length), 120);
        if (result.error) return [];
        const ended = [];
        for (const { index, verdict } of result.values) {
            const q = quests[index];
            setQuestMeta(settingId, q.id, { ended: verdict === 'done' ? 'Completed' : 'Failed' });
            ended.push(`${q.name} (${verdict === 'done' ? 'completed' : 'failed'})`);
        }
        if (ended.length) console.info(LOG_PREFIX, `quests ended: ${ended.join(', ')}`);
        return ended;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not check the quests\' ends', err);
        return [];
    }
}
