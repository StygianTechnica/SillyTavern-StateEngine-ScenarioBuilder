// "Fix pronouns in recent replies" on a person's Heart card: the chat's own
// recent replies put right where they plainly mean this person
// (src/guidance/canon.js fixPronounsIn). Galice, a woman, was "he" in 9 of
// the last 40 messages, and every model - small or large - followed the
// chat over the corrections. Only the shown text of each reply changes;
// nothing is re-read or undone (no edit event).

import { h, icon, button, toast } from './dom.js';
import { confirmAction } from './confirm.js';
import { fixPronounsIn } from '../guidance/canon.js';
import { personGender } from '../naming/classify.js';
import { LOG_PREFIX } from '../constants.js';

const RECENT = 40;
const text = (v) => (typeof v === 'string' ? v : '');

const genderOf = (c) => {
    const base = c?.base ?? {};
    return personGender({ name: c?.name, own: [c?.description, base.description], more: [text(c?.personality), text(base.personality)] });
};

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
            for (const ch of changes) {
                const m = c.chat[ch.index];
                m.mes = ch.text;
                if (Array.isArray(m.swipes) && Number.isInteger(m.swipe_id) && m.swipes[m.swipe_id] !== undefined) m.swipes[m.swipe_id] = ch.text;
                if (typeof c.updateMessageBlock === 'function') c.updateMessageBlock(ch.index, m);
            }
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
