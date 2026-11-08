// The GM Plan's Other side card (src/ops/): a rival crew's operation the
// game master runs - a heist, a raid, an ambush. Plan one (one model call,
// from the faction, its people, where and the story so far), look it over
// and change any line, start it; follow it, set a crew member's state, move
// it on, have them pull out or end it. The plan is the game master's: veiled
// like the day plan unless spoilers are shown or the user peeks.

import { getChatDoc } from '../store/chat-store.js';
import { getSettings } from '../settings.js';
import { planOp, startOpPlan, markOpAction, setOpCrew, clearOp } from '../ops/run.js';
import { isLive, currentStep, crewOut, CREW_STATES } from '../ops/model.js';
import { readOpPlan, opPlanText, matchPeople } from '../ops/generate.js';
import { syncNow } from '../guidance/sync.js';
import { confirmAction } from './confirm.js';
import { ws, rerender, markDirty, stopEditing } from './ws.js';
import { h, icon, button, select, toast } from './dom.js';

const after = async () => {
    stopEditing();
    await syncNow();
    rerender();
};

let planning = false;

export function opCard(factions, people, show) {
    const { chatKey } = ws.ctx;
    const doc = getChatDoc(chatKey);
    const op = doc.op;
    const directorOff = getSettings().director.enabled !== true;
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-user-secret'), 'The other side'),
        h('small', { class: 'sb-hint' }, 'A rival crew at work where the story is - a heist, a raid, an ambush - with a plan of its own: a leader, a crew with skills and posts, what they are after, how they got in, their steps, and when they pull out. The game master plays them every reply; they do not wait for the player.'),
        directorOff ? h('div', { class: 'sb-callout sb-warn' }, icon('fa-triangle-exclamation'), h('span', {}, 'The game master is switched off: the other side needs its briefing to act.')) : null,
        isLive(op) ? runningView(op, chatKey, show) : setupView(chatKey, factions, people, op));
}

function setupView(chatKey, factions, people, last) {
    const { chatId, settingId } = ws.ctx;
    const form = ws.opForm ?? (ws.opForm = { side: '', request: '', aware: false });
    const draft = ws.opDraft ?? null;
    const plan = async () => {
        if (planning) return;
        if (!form.side) { toast('info', 'Pick the side first.'); return; }
        planning = true;
        rerender();
        try {
            const made = await planOp(chatId, chatKey, settingId, { side: form.side, request: form.request, aware: form.aware });
            if (!made) throw new Error('The model\'s answer could not be used - try again.');
            ws.opDraft = { meta: made, text: opPlanText(made) };
            toast('success', 'Planned - look it over, then start it.');
        } catch (err) {
            toast('info', err?.message ?? String(err));
        } finally {
            planning = false;
            rerender();
        }
    };
    const start = async () => {
        try {
            const read = readOpPlan(draft.text, draft.meta.side);
            if (!read) throw new Error('It needs an AIM line and at least one STEP line.');
            const plan = matchPeople({ ...draft.meta, ...read, leader: { ...read.leader }, aware: draft.meta.aware }, people);
            await startOpPlan(chatId, chatKey, settingId, plan);
            ws.opDraft = null;
            toast('success', `${plan.side}'s operation runs from the next reply.`);
            await after();
        } catch (err) {
            toast('info', err?.message ?? String(err));
        }
    };
    const options = [{ value: '', label: 'Whose operation...' }, ...factions.map((f) => ({ value: f.id, label: f.name }))];
    return h('div', {},
        last && !isLive(last) && last.endText ? h('p', { class: 'sb-muted' }, `Last: ${last.endText}`, ' ', h('a', { class: 'sb-link', onclick: () => { clearOp(chatKey); rerender(); } }, 'clear')) : null,
        draft ? h('div', {},
            h('small', { class: 'sb-hint' }, 'One line each - change anything. CREW: name | skill | post. STEP lines in order (add "| done" for one the story already played). BREAK: crew down before they pull out.'),
            h('textarea', { class: 'text_pole', rows: 14, value: draft.text, oninput: (e) => { draft.text = e.target.value; markDirty(); } }),
            h('div', { class: 'sb-actions sb-wrap' },
                button('Start it', () => void start(), { iconName: 'fa-play', cls: 'sb-primary', title: 'They act from the next reply. Anyone named who is not in the library yet is added as one of their side.' }),
                button('Discard', () => { ws.opDraft = null; rerender(); }, { iconName: 'fa-trash', cls: 'sb-danger' })))
            : h('div', {},
                h('div', { class: 'sb-row' },
                    select(options, form.side, { onchange: (e) => { form.side = e.target.value; markDirty(); } }),
                    h('label', { class: 'checkbox_label', title: 'Whether they know the player character\'s side is here against them. Off: they plan for guards and locks, and find out only if the story shows them.' },
                        h('input', { type: 'checkbox', checked: form.aware, onchange: (e) => { form.aware = e.target.checked; } }), h('span', {}, 'They know we are here'))),
                h('div', { class: 'sb-row' },
                    h('input', { class: 'text_pole', placeholder: 'What they are doing - e.g. stealing the Ashen Codex from the museum vault tonight', value: form.request, oninput: (e) => { form.request = e.target.value; markDirty(); } }),
                    button(planning ? 'Planning...' : 'Plan it', () => void plan(), { iconName: 'fa-wand-magic-sparkles', disabled: planning, title: 'One model call: their leader, crew, way in, steps and breaking point, from the faction, its people, where the scene is and the story so far. You look it over before it starts.' })),
                getSettings().director.opposition !== false ? h('small', { class: 'sb-hint' }, 'The game master also plans one by itself when the story shows a rival crew at work with no plan (Settings: Plan the other side).') : null));
}

function runningView(op, chatKey, show) {
    const peek = show || ws.opPeek === op.id;
    const mark = (action, question) => async () => {
        if (question && !await confirmAction(question)) return;
        markOpAction(chatKey, action);
        await after();
    };
    const step = currentStep(op);
    const head = h('p', {}, h('b', {}, op.side), op.status === 'pulling out' ? ' - pulling out now' : ` - step ${op.current + 1} of ${op.steps.length}${peek ? `: ${step.text}` : ''}`,
        op.crew.length ? h('span', { class: 'sb-muted' }, ` (${crewOut(op)} of ${op.crew.length} crew out of it)`) : null);
    if (!peek) {
        return h('div', {}, head,
            h('small', { class: 'sb-hint' }, 'Their plan is hidden, like the day plan.'),
            h('div', { class: 'sb-actions' }, button('Peek', () => { ws.opPeek = op.id; rerender(); }, { iconName: 'fa-eye' })));
    }
    return h('div', {},
        head,
        h('div', { class: 'sb-gm-text' },
            op.leader.name ? h('div', {}, h('b', {}, 'Led by '), op.leader.name, op.leader.where ? ` - ${op.leader.where}` : '') : null,
            h('div', {}, h('b', {}, 'After: '), op.aim),
            op.vehicle ? h('div', {}, h('b', {}, 'Came in: '), op.vehicle) : null,
            op.entry ? h('div', {}, h('b', {}, 'Got in: '), op.entry) : null,
            op.withdraw.length ? h('div', {}, h('b', {}, 'Pull out if: '), `${op.withdraw.join('; ')} - or ${op.breakAt} of the crew out of it.`) : null,
            h('div', { class: 'sb-muted' }, op.aware ? `They know ${op.against || 'someone'} is against them.` : `They do not know ${op.against || 'anyone'} is here.`)),
        op.crew.length ? h('div', {}, op.crew.map((c, i) => h('div', { class: 'sb-gm-row' },
            h('div', { class: 'sb-gm-text' }, h('b', {}, c.name), [c.skill, c.post].filter(Boolean).length ? ` - ${[c.skill, c.post].filter(Boolean).join('; ')}` : ''),
            select(CREW_STATES.map((s) => ({ value: s, label: s })), c.state, { onchange: async (e) => { setOpCrew(chatKey, i, e.target.value); await after(); } })))) : null,
        h('div', {}, op.steps.map((s, i) => h('div', { class: `sb-gm-row${s.status === 'done' ? ' sb-gm-past' : ''}` },
            h('div', { class: 'sb-gm-text' }, `${i + 1}. ${s.text}`),
            h('div', { class: 'sb-chips' }, h('span', { class: `sb-chip${s.status === 'current' ? ' sb-chip-on' : ''}` }, s.status === 'current' ? 'now' : s.status === 'done' ? 'done' : 'to come'))))),
        op.log.length ? h('small', { class: 'sb-hint' }, op.log.slice(-4).map((l) => l.text).join(' ')) : null,
        h('div', { class: 'sb-actions sb-wrap' },
            op.status === 'running' ? button('Step done', mark('next'), { iconName: 'fa-forward', title: 'Their step is carried out - the next begins' }) : null,
            op.status === 'running' ? button('Pull them out', mark('pull out'), { iconName: 'fa-person-running', title: 'They break off and get away in the next reply' }) : null,
            button('End it', mark('end', `End ${op.side}'s operation now? The game master stops playing it.`), { iconName: 'fa-flag-checkered', cls: 'sb-danger' }),
            show ? null : button('Hide', () => { ws.opPeek = null; rerender(); }, { iconName: 'fa-eye-slash' })));
}
