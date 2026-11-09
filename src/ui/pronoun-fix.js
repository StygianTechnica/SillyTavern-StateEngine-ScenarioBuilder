// "Fix pronouns in recent replies" on a person's Heart card: the chat's own
// recent replies put right where they plainly mean this person
// (src/guidance/canon.js fixPronounsIn). Galice, a woman, was "he" in 9 of
// the last 40 messages, and every model - small or large - followed the
// chat over the corrections. Only the shown text of each reply changes;
// nothing is re-read or undone (no edit event).

import { h, icon, button, toast } from './dom.js';
import { confirmAction } from './confirm.js';
import { fixPronounsIn, repairReply } from '../guidance/canon.js';
import { personGender } from '../naming/classify.js';
import { LOG_PREFIX } from '../constants.js';
import { getSettings, isActive } from '../settings.js';
import { getCurrentChatRef } from '../store/chat-ref.js';
import { getBoundSettingId, listEntries, playerIdOf } from '../library/library.js';

const RECENT = 40;
const text = (v) => (typeof v === 'string' ? v : '');

const genderOf = (c) => {
    const base = c?.base ?? {};
    return personGender({ name: c?.name, own: [c?.description, base.description], more: [text(c?.personality), text(base.personality)] });
};

// A message's shown text changed in place (no edit event: nothing re-read).
function setShownText(c, index, text) {
    const m = c.chat[index];
    m.mes = text;
    if (Array.isArray(m.swipes) && Number.isInteger(m.swipe_id) && m.swipes[m.swipe_id] !== undefined) m.swipes[m.swipe_id] = text;
    if (typeof c.updateMessageBlock === 'function') c.updateMessageBlock(index, m);
}

// A new reply, as it lands: Inji, "he" for 700 messages, came back "she"
// with "Inji Miyama is he / him" in the note right before the reply, and the
// model follows the chat - so it is put right before it can be copied. An
// edit of the user's own is never touched: no event brings it here.
const EARLIER = 20;
export async function repairNewReply(index) {
    try {
        if (!isActive() || getSettings().autoPronouns === false) return;
        const c = SillyTavern.getContext();
        const at = Number(index);
        const m = c.chat?.[at];
        if (!m || at !== c.chat.length - 1 || m.is_user || m.is_system || typeof m.mes !== 'string') return;
        const before = m.mes;
        const ref = getCurrentChatRef();
        const settingId = ref ? await getBoundSettingId(ref.chatId) : '';
        if (!settingId) return;
        const entries = await listEntries(ref.chatId, settingId, 'character');
        const playerId = playerIdOf(settingId, entries);
        const people = entries.map((e) => ({ name: e.name, aliases: e.aliases ?? e.base?.aliases ?? [], gender: genderOf(e), player: e.id === playerId }));
        const earlier = c.chat.slice(0, at).filter((x) => x && !x.is_user && !x.is_system).slice(-EARLIER).map((x) => String(x.mes ?? ''));
        const { text, fixed } = repairReply(before, people, earlier);
        // The chat moved on while the library was read.
        if (!fixed.length || c.chat[at] !== m || m.mes !== before) return;
        setShownText(c, at, text);
        await c.saveChat();
        toast('info', `Pronouns put right: ${fixed.map((f) => `${f.name} (${f.count})`).join(', ')}.`);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not put the new reply\'s pronouns right', err);
    }
}

// Each reply in reach that would change. -> [{ index, text, count }]
function planned(entry, all) {
    const person = { name: entry.name, aliases: entry.aliases ?? entry.base?.aliases ?? [], gender: genderOf(entry) };
    if (!['f', 'm'].includes(person.gender)) return { person, changes: [] };
    const others = (all.character ?? []).filter((c) => c.id !== entry.id).map((c) => ({ name: c.name, aliases: c.aliases ?? c.base?.aliases ?? [], gender: genderOf(c) }));
    const chat = SillyTavern.getContext().chat ?? [];
    const changes = [];
    for (let i = Math.max(0, chat.length - RECENT); i < chat.length; i++) {
        const m = chat[i];
        if (!m || m.is_user || m.is_system || typeof m.mes !== 'string') continue;
        const r = fixPronounsIn(m.mes, person, others);
        if (r.count) changes.push({ index: i, text: r.text, count: r.count });
    }
    return { person, changes };
}

export function pronounFixRow(entry, all) {
    const run = async () => {
        const { person, changes } = planned(entry, all);
        if (!['f', 'm'].includes(person.gender)) return toast('info', `${entry.name}'s own sheet does not say he or she clearly enough to put the chat right.`);
        if (!changes.length) return toast('info', `The last ${RECENT} messages already call ${entry.name} ${person.gender === 'f' ? 'she' : 'he'}.`);
        const n = changes.reduce((s, c) => s + c.count, 0);
        if (!await confirmAction(`Put right ${n} pronoun${n === 1 ? '' : 's'} for ${entry.name} in ${changes.length} recent repl${changes.length === 1 ? 'y' : 'ies'}?\nOnly sentences where ${entry.name} is plainly the one meant change; what people say aloud is left as it is.`)) return;
        const c = SillyTavern.getContext();
        try {
            for (const ch of changes) setShownText(c, ch.index, ch.text);
            await c.saveChat();
            toast('success', `${n} put right - ${entry.name} is ${person.gender === 'f' ? 'she' : 'he'} again in the chat.`);
        } catch (err) {
            console.warn(LOG_PREFIX, 'could not put the pronouns right', err);
            toast('error', 'Could not change the chat - see the console.');
        }
    };
    return h('div', { class: 'sb-actions' },
        button('Fix pronouns in recent replies', () => void run(), { iconName: 'fa-spell-check', title: `Where the last ${RECENT} messages call ${entry.name} by the wrong pronouns - models follow the chat over any note` }));
}
