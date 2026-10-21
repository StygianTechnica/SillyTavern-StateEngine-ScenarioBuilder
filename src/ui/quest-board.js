// The Quests chapter as a board (spec 9.5): active quests first, by
// priority, then the ones waiting, then the finished - each with its
// progress, current objective and where its status comes from. Plus the
// quest tab on a quest's sheet: status override, type, base priority,
// objectives with their own statuses, completion and abandon conditions,
// and what Archivist's story thread says.

import { getSettings } from '../settings.js';
import { runQuestSync, questBoard, setQuestMeta, questMeta, hasQuestTracking, setupQuestTracking, hasArchivistThreads, writeActiveQuests } from '../quests/sync.js';
import { QUEST_TYPES, QUEST_PRIORITIES, QUEST_STATUSES, OBJECTIVE_STATUSES } from '../quests/model.js';
import { syncNow } from '../guidance/sync.js';
import { ws, rerender, openSheet } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

const STATUS_ICON = { Active: 'fa-person-running', 'Not started': 'fa-hourglass-start', Completed: 'fa-circle-check', Failed: 'fa-circle-xmark', Abandoned: 'fa-ban' };
const FROM_TEXT = { user: 'set by you', story: 'from the story', archivist: 'from Archivist', ends: 'its end condition was met', none: '' };

async function scan() {
    const { chatId, chatKey, settingId } = ws.ctx;
    if (!hasArchivistThreads()) return toast('info', 'Archivist is not installed - there are no story threads to read quests from.');
    ws.questScanning = true;
    rerender();
    try {
        const out = await runQuestSync(chatId, chatKey, settingId, { scan: true });
        if (!out) toast('warning', 'A scan is already running.');
        else toast('success', out.created || out.linked || out.updated ? `Quests: ${out.created} new, ${out.updated} updated, ${out.linked} linked.` : 'Nothing new in Archivist\'s story threads.');
        await syncNow();
    } finally {
        ws.questScanning = false;
        rerender();
    }
}

// A mission's parts in a line: from whom, for whom, how hard, for what pay.
const missionLine = (m) => [m.giverName && `from ${m.giverName}`, m.client && `for ${m.client}`, m.difficulty, m.reward && `pays ${m.reward}`].filter(Boolean).join(' · ');

function questCard(q, color) {
    const pct = Math.round(q.progress.ratio * 100);
    return h('div', { class: `sb-quest sb-quest-${q.status.replace(/\s/g, '').toLowerCase()}`, style: `--sb-accent: ${color}`, onclick: () => openSheet(q.id, 'quest') },
        h('div', { class: 'sb-row' },
            icon(STATUS_ICON[q.status] ?? 'fa-scroll'),
            h('b', {}, q.name),
            h('span', { class: `sb-badge sb-prio-${q.priority.level}`, title: q.priority.reasons.join(', ') || 'priority' }, q.priority.level),
            h('span', { class: 'sb-badge' }, q.type),
            q.from !== 'none' ? h('small', { class: 'sb-hint sb-push' }, `${q.status} · ${FROM_TEXT[q.from]}`) : null),
        q.mission ? h('small', { class: 'sb-hint' }, icon('fa-briefcase'), ` ${missionLine(q.mission)}`) : null,
        q.conflict ? h('small', { class: 'sb-warn' }, icon('fa-circle-exclamation'), ` Archivist thinks it is ${q.conflict.toLowerCase()} - open it to confirm.`) : null,
        q.progress.total ? h('div', { class: 'sb-progress sb-progress-small', title: `${q.progress.done} of ${q.progress.total} objectives` }, h('div', { class: 'sb-progress-bar', style: `width: ${pct}%` })) : null,
        q.runtime.current || q.current ? h('small', { class: 'sb-hint' }, `Now: ${q.runtime.current || q.current.text}`) : null);
}

// The board. -> node
export async function renderQuestBoard(type) {
    const { chatId, chatKey, settingId } = ws.ctx;
    const quests = await questBoard(chatId, chatKey, settingId);
    const tracking = await hasQuestTracking(settingId);
    const groups = [
        ['Active', quests.filter((q) => q.status === 'Active'), 'fa-person-running'],
        ['Waiting', quests.filter((q) => q.status === 'Not started'), 'fa-hourglass-start'],
        ['Finished', quests.filter((q) => ['Completed', 'Failed', 'Abandoned'].includes(q.status)), 'fa-flag-checkered'],
    ];
    const auto = getSettings().quests.autoCreate;
    return h('div', { class: 'sb-questboard' },
        h('div', { class: 'sb-actions' },
            button(ws.questScanning ? 'Scanning…' : 'Scan Archivist for quests', () => void scan(), { iconName: ws.questScanning ? 'fa-spinner fa-spin' : 'fa-magnifying-glass', disabled: ws.questScanning, title: 'Turn quest seeds, goals and plans from Archivist\'s story threads into quests - including ones not yet translated' }),
            tracking ? h('small', { class: 'sb-hint' }, icon('fa-check'), ' Progress tracking is on') : button('Track progress', async () => {
                if (await setupQuestTracking(settingId)) toast('success', 'Quests now have "progress" and "current objective" values that the story keeps up to date.');
                else toast('error', 'State Engine refused the new fields.');
                rerender();
            }, { iconName: 'fa-chart-line', title: 'Add "progress" and "current objective" runtime values to this setting\'s quests, filled from the story while a quest is active' }),
            h('label', { class: 'checkbox_label sb-push', title: 'Make quests from Archivist\'s quest seeds, goals and plans automatically, after each compile' },
                h('input', { type: 'checkbox', checked: auto, onchange: (e) => { getSettings().quests.autoCreate = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); } }),
                h('span', {}, 'Create automatically'))),
        quests.length ? groups.filter(([, list]) => list.length).map(([title, list, i]) => h('div', { class: 'sb-questgroup' },
            h('div', { class: 'sb-section-title' }, icon(i), ` ${title} (${list.length})`),
            list.map((q) => questCard(q, type.color))))
            : h('div', { class: 'sb-callout sb-callout-big' }, h('i', { class: `fa-solid ${type.icon}`, style: `color: ${type.color}` }),
                h('div', {}, h('b', {}, 'No quests yet.'), h('div', {}, hasArchivistThreads() ? 'Scan Archivist for the quest seeds, goals and plans the story has set up - or create one.' : 'Create one - or install Archivist to have quests made from the story.'))));
}

// A mission's parts on its quest tab; the giver, client and target open
// their own pages when they are in the library.
function missionCard(m) {
    const typeOf = (id) => ({ chr: 'character', fac: 'faction', loc: 'location', itm: 'item', crt: 'creature' })[String(id).split('_')[0]] ?? null;
    const link = (name, id) => (id ? h('a', { class: 'sb-link', onclick: () => openSheet(id, typeOf(id)) }, name) : h('span', {}, name || '-'));
    return h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, icon('fa-briefcase'), ` A ${m.difficulty} mission`),
        h('div', {}, h('b', {}, 'Giver: '), link(m.giverName, m.giverId)),
        m.client ? h('div', {}, h('b', {}, 'Client: '), link(m.client, m.clientId)) : null,
        m.target ? h('div', {}, h('b', {}, 'Target: '), link(m.target, m.targetId)) : null,
        m.task ? h('div', { class: 'sb-prose' }, m.task) : null,
        m.reward ? h('div', {}, h('b', {}, 'Reward: '), m.reward) : null);
}

// The quest tab of a quest's sheet. Changes save at once.
export async function renderQuestTab(entry) {
    const { chatId, chatKey, settingId } = ws.ctx;
    const q = (await questBoard(chatId, chatKey, settingId)).find((x) => x.id === entry.id);
    const meta = questMeta(settingId, entry.id);
    // The active quests variable (sb__quests) follows at once, not only
    // before the next reply.
    const save = (patch) => { setQuestMeta(settingId, entry.id, patch); void syncNow(); void writeActiveQuests(chatId, chatKey, settingId); rerender(); };
    // The board's list is tidied (near-duplicates collapsed); an edit saves it so.
    const objectives = q ? q.objectives : meta.objectives;
    const setObjectives = (list) => save({ objectives: list });
    const newObjective = h('input', { class: 'text_pole', placeholder: 'Add an objective…', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) setObjectives([...objectives, { text: e.target.value.trim(), status: 'pending', byUser: true }]); } });
    return h('div', { class: 'sb-tabpane' },
        q ? h('div', { class: 'sb-row' },
            h('span', { class: `sb-badge sb-prio-${q.priority.level}`, title: q.priority.reasons.join(', ') }, `${q.priority.level} priority`),
            h('span', { class: 'sb-chip' }, icon(STATUS_ICON[q.status] ?? 'fa-scroll'), ` ${q.status}`),
            h('small', { class: 'sb-hint' }, FROM_TEXT[q.from]),
            q.dormant ? h('span', { class: 'sb-chip', title: 'The story has not touched it in a long while: it is not put before the narrator. Set its status to Active to follow it again.' }, icon('fa-moon'), ' dormant') : null,
            q.priority.reasons.length ? h('small', { class: 'sb-hint' }, `(${q.priority.reasons.join(', ')})`) : null) : null,
        q?.mission ? missionCard(q.mission) : null,
        q?.conflict ? h('div', { class: 'sb-callout sb-warn' }, icon('fa-circle-exclamation'),
            h('span', {}, `Archivist thinks this quest is ${q.conflict.toLowerCase()}, but the story still has it active.`),
            button(`Mark ${q.conflict.toLowerCase()}`, () => save({ status: q.conflict }), { iconName: 'fa-check' })) : null,
        h('div', { class: 'sb-fieldgrid' },
            field('Status', select([{ value: '', label: 'Automatic (story, then Archivist)' }, ...QUEST_STATUSES.map((s) => ({ value: s, label: s }))], meta.status, { onchange: (e) => save({ status: e.target.value, ended: '' }) }), 'Your choice always wins.'),
            field('Type', select(QUEST_TYPES.map((t) => ({ value: t, label: t })), meta.type || q?.type || 'side', { onchange: (e) => save({ type: e.target.value }) })),
            field('Base priority', select(QUEST_PRIORITIES.map((p) => ({ value: p, label: p })), meta.priority, { onchange: (e) => save({ priority: e.target.value }) }), 'Raised automatically when it is active or its people are in the scene.')),
        h('div', { class: 'sb-section-title' }, icon('fa-list-check'), ` Objectives${q?.progress.total ? ` - ${q.progress.done} of ${q.progress.total} done` : ''}`),
        h('div', { class: 'sb-objectives' }, objectives.map((o, i) => h('div', { class: `sb-objective sb-obj-${o.status}` },
            select(OBJECTIVE_STATUSES.map((s) => ({ value: s, label: s })), o.status, { onchange: (e) => setObjectives(objectives.map((x, j) => (j === i ? { ...x, status: e.target.value, byUser: true } : x))) }),
            h('span', { class: 'sb-objective-text' }, o.text),
            o.from === 'archivist' ? h('small', { class: 'sb-hint', title: 'Kept in step with Archivist\'s plan steps' }, icon('fa-brain')) : null,
            // Removed stays removed: Archivist's rewordings of it are not added back.
            h('span', { class: 'sb-iconbtn sb-danger', title: 'Remove', onclick: () => save({ objectives: objectives.filter((_, j) => j !== i), removed: [...(meta.removed ?? []), o.text] }) }, icon('fa-xmark')))),
        newObjective),
        h('div', { class: 'sb-fieldgrid' },
            field('Completes when', h('textarea', { class: 'text_pole', rows: 2, placeholder: 'e.g. the ledger is in Tobin\'s hands', onchange: (e) => save({ completion: e.target.value }) }, meta.completion)),
            field('Fails or is abandoned when', h('textarea', { class: 'text_pole', rows: 2, placeholder: 'e.g. the ledger burns, or the deadline passes', onchange: (e) => save({ abandon: e.target.value }) }, meta.abandon))),
        q?.runtime.progress || q?.runtime.current ? h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, icon('fa-chart-line'), ' What the story says now'),
            q.runtime.current ? h('div', {}, h('b', {}, 'Working on: '), q.runtime.current) : null,
            q.runtime.progress ? h('div', {}, h('b', {}, 'Progress: '), q.runtime.progress) : null) : null,
        q?.thread ? h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, icon('fa-brain'), ` Archivist: ${q.thread.kind} - ${q.thread.status}`),
            h('div', { class: 'sb-prose' }, q.thread.text),
            q.thread.progress ? h('small', { class: 'sb-hint' }, `Progress: ${q.thread.progress}`) : null,
            (q.thread.steps ?? []).length ? h('ol', { class: 'sb-steps' }, q.thread.steps.map((s) => h('li', {}, `[${s.status}] ${s.text}`))) : null) : null);
}
