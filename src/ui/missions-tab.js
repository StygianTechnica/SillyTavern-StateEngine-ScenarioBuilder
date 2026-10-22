// The Missions tab of a character's, faction's or location's sheet: whether
// it hands out work (a guild master, an assassins' order, a guild hall), what
// work, for whom and for what pay - and its missions, with a button to have
// it offer one now (src/quests/missions.js).

import { getEntryMeta } from '../store/setting-store.js';
import { setEntryMeta } from '../library/library.js';
import { questBoard } from '../quests/sync.js';
import { normalizeGiver, offerMission, nextDifficulty, MISSION_DIFFICULTIES } from '../quests/missions.js';

const MODE_TEXT = {
    grow: ['Grows with their record', 'Starts easy; one step harder for every two done, one easier for each failure.'],
    fixed: ['Always the same', 'Every mission at the difficulty set beside it.'],
    random: ['Random', 'Any difficulty, mostly the middle ones - you never know what the next job holds.'],
    story: ['Follows the story', 'As hard as the story wants it now: the tension the GM planner\'s story shape aims for at this point (grows with their record without a shape).'],
};
const OFFER_TEXT = {
    meet: ['When they next meet', 'The giver offers each new mission the next time the character is with them.'],
    asked: ['Only when asked for work', 'The giver waits until the character asks for work - a story trigger watches for it.'],
    when: ['Only when…', 'The giver waits for the condition below - a story trigger watches for it (e.g. "Remus is at the guild hall during working hours").'],
    after: ['After a while', 'Once a mission ends, the next is written and offered some days later - put on the calendar as a day trigger. A mission you ask for now is offered when they next meet.'],
};
import { syncNow } from '../guidance/sync.js';
import { ws, rerender, openSheet } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

export const GIVER_TYPES = Object.freeze(['character', 'faction', 'location']);

const STATUS_ICON = { Active: 'fa-person-running', 'Not started': 'fa-hourglass-start', Completed: 'fa-circle-check', Failed: 'fa-circle-xmark', Abandoned: 'fa-ban' };

export async function renderMissionsTab(entry) {
    const { chatId, chatKey, settingId } = ws.ctx;
    const giver = normalizeGiver(getEntryMeta(settingId, entry.id).giver);
    const save = (patch) => { setEntryMeta(settingId, entry.id, { giver: { ...giver, ...patch } }); rerender(); };
    const missions = (await questBoard(chatId, chatKey, settingId)).filter((q) => q.mission?.giverId === entry.id)
        .sort((a, b) => String(b.mission.offeredAt).localeCompare(String(a.mission.offeredAt)));
    const next = nextDifficulty(giver, [...missions].reverse());
    const draft = ws.missionDraft?.for === entry.id ? ws.missionDraft : (ws.missionDraft = { for: entry.id, request: '', difficulty: '' });
    const offer = async () => {
        ws.missionOffering = entry.id;
        rerender();
        try {
            const quest = await offerMission(chatId, chatKey, settingId, entry.id, { difficulty: draft.difficulty, request: draft.request });
            if (quest) {
                toast('success', `${entry.name} has a new mission: ${quest.name}. They will offer it in the story.`);
                draft.request = '';
                await syncNow();
            } else {
                toast('warning', 'No mission was written - the model\'s answer could not be read, or one is already being written (see the console).');
            }
        } finally {
            ws.missionOffering = null;
            rerender();
        }
    };
    const text = (key, placeholder, rows = 1) => h(rows > 1 ? 'textarea' : 'input', { class: 'text_pole', ...(rows > 1 ? { rows } : {}), placeholder, value: giver[key], onchange: (e) => save({ [key]: e.target.value }) });
    return h('div', { class: 'sb-tabpane' },
        h('label', { class: 'checkbox_label', title: 'This one hands out ready-to-go work: a quest board, a boss with jobs, an order that assigns marks' },
            h('input', { type: 'checkbox', checked: giver.on, onchange: (e) => save({ on: e.target.checked }) }),
            h('span', {}, `${entry.name} gives missions`)),
        giver.on ? [
            h('div', { class: 'sb-fieldgrid' },
                field('What kind of work', text('trade', 'e.g. marks to kill for pay; things to steal; quests for adventurers', 2)),
                field('Their clients', text('clients', 'e.g. nobles settling scores, the town\'s merchants', 2)),
                field('Usual pay', text('reward', 'e.g. coin by the job, favours, a cut of the take')),
                field('Difficulty', h('div', { class: 'sb-row' },
                    select(Object.entries(MODE_TEXT).map(([value, [label]]) => ({ value, label })), giver.difficultyMode, { onchange: (e) => save({ difficultyMode: e.target.value, difficulty: e.target.value === 'fixed' ? (giver.difficulty || 'moderate') : giver.difficulty }) }),
                    giver.difficultyMode === 'fixed' ? select(MISSION_DIFFICULTIES.map((d) => ({ value: d, label: d })), giver.difficulty || 'moderate', { onchange: (e) => save({ difficulty: e.target.value }) }) : null),
                    `${MODE_TEXT[giver.difficultyMode][1]}${giver.difficultyMode === 'grow' ? ` Next: ${next}.` : ''}`),
                field('Offers a mission', select(Object.entries(OFFER_TEXT).map(([value, [label]]) => ({ value, label })), giver.offer, { onchange: (e) => save({ offer: e.target.value }) }), OFFER_TEXT[giver.offer][1]),
                giver.offer === 'when' ? field('Only when', text('offerWhen', 'e.g. Remus is at the guild hall during working hours', 2)) : null,
                giver.offer === 'after' ? field('Days later', h('input', { type: 'number', class: 'text_pole', min: 1, max: 60, value: giver.afterDays, onchange: (e) => save({ afterDays: Math.max(1, Math.min(60, Math.round(Number(e.target.value) || 3))) }) })) : null,
                field('Jobs on offer at once', select([1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: n === 1 ? 'one at a time' : `a board of ${n}` })), String(giver.board), { onchange: (e) => save({ board: Number(e.target.value) }) }),
                    giver.board > 1 ? 'A board: up to this many jobs wait at once and the character picks one. While one is under way no new ones are posted; when it ends, the board fills up again (one model call per new job).' : 'One job at a time: the next is written once the last has ended.')),
            h('label', { class: 'checkbox_label', title: 'Write the work for the group present with the player character, not for them alone' },
                h('input', { type: 'checkbox', checked: giver.team, onchange: (e) => save({ team: e.target.checked }) }),
                h('span', {}, 'Missions for a group')),
            h('label', { class: 'checkbox_label', title: 'Once a mission from here is done or failed, the next one is written and offered in the story (one model call, then)' },
                h('input', { type: 'checkbox', checked: giver.auto, onchange: (e) => save({ auto: e.target.checked }) }),
                h('span', {}, 'Offer the next one when one ends')),
            h('div', { class: 'sb-card' },
                h('div', { class: 'sb-card-title' }, icon('fa-briefcase'), ' Offer a mission now'),
                h('div', { class: 'sb-fieldgrid' },
                    field('This time (optional)', h('input', { class: 'text_pole', placeholder: 'e.g. something in the docks; a job against the Ravagers', value: draft.request, oninput: (e) => { draft.request = e.target.value; } })),
                    field('Difficulty', select([{ value: '', label: `as usual (${MODE_TEXT[giver.difficultyMode][0].toLowerCase()}${giver.difficultyMode === 'grow' ? `: ${next}` : giver.difficultyMode === 'fixed' ? `: ${giver.difficulty}` : ''})` }, ...MISSION_DIFFICULTIES.map((d) => ({ value: d, label: d }))], draft.difficulty, { onchange: (e) => { draft.difficulty = e.target.value; } }))),
                h('div', { class: 'sb-actions' },
                    button(ws.missionOffering === entry.id ? 'Writing…' : 'Offer a mission', () => void offer(), { iconName: ws.missionOffering === entry.id ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles', cls: 'sb-primary', disabled: !!ws.missionOffering }))),
        ] : h('small', { class: 'sb-hint' }, 'A guild master, a crime boss, an order, a guild hall\'s board: turn this on and describe the work, and missions can be written from here - each with a client, a difficulty, a target and a reward.'),
        missions.length ? h('div', { class: 'sb-questgroup' },
            h('div', { class: 'sb-section-title' }, icon('fa-scroll'), ` Missions from ${entry.name} (${missions.length})`),
            missions.map((q) => h('div', { class: 'sb-quest', onclick: () => openSheet(q.id, 'quest') },
                h('div', { class: 'sb-row' }, icon(STATUS_ICON[q.status] ?? 'fa-scroll'), h('b', {}, q.name),
                    h('span', { class: 'sb-badge' }, q.mission.difficulty),
                    h('small', { class: 'sb-hint sb-push' }, q.status)),
                q.mission.client || q.mission.reward ? h('small', { class: 'sb-hint' }, [q.mission.client && `for ${q.mission.client}`, q.mission.reward && `pays ${q.mission.reward}`].filter(Boolean).join(' · ')) : null))) : null);
}
