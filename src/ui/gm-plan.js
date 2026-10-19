// The GM Plan tab (docs/DESIGN - GM PLANNER.md §8): what the planner has
// in mind for today (veiled unless the user shows spoilers or peeks at one
// item), the user's guidance queue, inspiration texts and their motifs,
// pacing, the pass log and the planner's settings.

import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc } from '../store/chat-store.js';
import { URGENCIES, LEVELS, PACINGS, LEVEL_CADENCE, isVeiled, openRequests } from '../planner/model.js';
import {
    getPlannerStatus, runDay, runCheck, runInspire, queueRequest, withdrawRequest, addInspiration, removeInspiration,
    setMotifs, peek, setHold,
} from '../planner/run.js';
import { confirmAction } from './confirm.js';
import { ws, rerender, markDirty } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

const WHEN_ICON = { morning: 'fa-sun', midday: 'fa-sun', afternoon: 'fa-cloud-sun', evening: 'fa-moon', night: 'fa-moon' };
const STATUS_TEXT = { waiting: 'waiting', planned: 'planned', done: 'done', withdrawn: 'withdrawn' };

const done = () => { ws.dirty = false; rerender(); };

async function running(label, fn) {
    toast('info', `${label}… (in the background)`);
    const out = await fn();
    if (out) toast('success', `${label}: ${out}`);
    else if (getPlannerStatus().error) toast('warning', `${label} failed: ${getPlannerStatus().error}`);
    rerender();
}

// ---- today

function momentRow(gm, m, show) {
    const veiled = isVeiled(gm, m.id, show) && m.status === 'pending';
    const when = m.when ? h('span', { class: 'sb-chip' }, icon(WHEN_ICON[m.when] ?? 'fa-clock'), m.when) : null;
    const state = m.status === 'pending' ? null : h('span', { class: `sb-chip sb-gm-${m.status}` }, m.status === 'done' ? icon('fa-check') : icon('fa-forward'), m.status);
    if (veiled) {
        return h('div', { class: 'sb-gm-row sb-gm-veiled' },
            icon('fa-mask'), h('span', { class: 'sb-muted' }, 'A moment is planned'), when,
            h('a', { href: '#', class: 'sb-gm-peek', title: 'Show just this one', onclick: (e) => { e.preventDefault(); peek(ws.ctx.chatKey, m.id); } }, 'peek'));
    }
    return h('div', { class: `sb-gm-row${m.status !== 'pending' ? ' sb-gm-past' : ''}` },
        h('div', { class: 'sb-gm-text' }, h('span', {}, m.text),
            m.trigger ? h('small', { class: 'sb-hint' }, ` - ${m.trigger}`) : null,
            m.note ? h('small', { class: 'sb-hint' }, ` (${m.note})`) : null),
        h('div', { class: 'sb-chips' }, when, state, ...m.ties.map((t) => h('span', { class: 'sb-chip' }, t))));
}

function todayCard(gm, show) {
    const { chatId, chatKey } = ws.ctx;
    const st = getPlannerStatus();
    const busy = st.running && st.chatKey === chatKey;
    const day = gm.day;
    const sameDay = day && day.day === getChatDoc(chatKey).canonical.day;
    const agendaId = (a) => `agenda:${a.who}`;
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-chess-knight'), day ? `Today's plan (day ${day.day})` : 'Today\'s plan',
            busy ? h('span', { class: 'sb-chip' }, icon('fa-spinner fa-spin'), `${st.running}…`) : null),
        !day ? h('p', { class: 'sb-muted' }, 'No plan yet. One is made in the background after the next reply, or now:') : null,
        day && !sameDay ? h('p', { class: 'sb-hint' }, icon('fa-calendar-day'), ' This plan was for an earlier day; a new one is made after the next reply.') : null,
        ...(day?.moments ?? []).map((m) => momentRow(gm, m, show)),
        day?.agendas?.length ? h('div', { class: 'sb-gm-sub' }, 'Agendas') : null,
        ...(day?.agendas ?? []).map((a) => (isVeiled(gm, agendaId(a), show)
            ? h('div', { class: 'sb-gm-row sb-gm-veiled' }, icon('fa-mask'), h('span', {}, a.who), h('span', { class: 'sb-muted' }, 'has plans of their own'),
                h('a', { href: '#', class: 'sb-gm-peek', onclick: (e) => { e.preventDefault(); peek(chatKey, agendaId(a)); } }, 'peek'))
            : h('div', { class: 'sb-gm-row' }, h('div', { class: 'sb-gm-text' }, h('b', {}, a.who), ` wants ${a.wants}${a.will ? `, and will ${a.will}` : ''}.`, a.hidden ? h('small', { class: 'sb-hint' }, ` Hidden: ${a.hidden}`) : null)))),
        day?.offscreen?.length ? h('div', { class: 'sb-gm-sub' }, 'Off-screen') : null,
        ...(day?.offscreen ?? []).map((t, i) => (isVeiled(gm, `off:${i}`, show)
            ? h('div', { class: 'sb-gm-row sb-gm-veiled' }, icon('fa-mask'), h('span', { class: 'sb-muted' }, 'Something is going on elsewhere'),
                h('a', { href: '#', class: 'sb-gm-peek', onclick: (e) => { e.preventDefault(); peek(chatKey, `off:${i}`); } }, 'peek'))
            : h('div', { class: 'sb-gm-row' }, h('span', {}, t)))),
        h('div', { class: 'sb-actions' },
            button(day && sameDay ? 'Re-plan the rest of today' : 'Plan today now', () => void running('Planning', () => runDay(chatId, chatKey, { rest: !!sameDay })), { iconName: 'fa-wand-magic-sparkles', disabled: busy }),
            day ? button('Check against the story', () => void running('Checking', () => runCheck(chatId, chatKey)), { iconName: 'fa-list-check', disabled: busy }) : null));
}

// ---- pacing

function paceCard(gm) {
    const { chatKey } = ws.ctx;
    const p = gm.pace;
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-hourglass-half'), 'Pacing'),
        h('dl', { class: 'sb-glance' },
            h('dt', {}, 'This scene'), h('dd', {}, `${p.sceneReplies} repl${p.sceneReplies === 1 ? 'y' : 'ies'}, ${p.idleReplies} without change`),
            h('dt', {}, 'Your usual post'), h('dd', {}, p.baselineWords ? `about ${Math.round(p.baselineWords)} words` : '—')),
        h('label', { class: 'checkbox_label', title: 'Keep the game master from moving the story on until the scene changes. Writing [stay] in a post does the same.' },
            h('input', { type: 'checkbox', checked: p.hold, onchange: (e) => setHold(chatKey, e.target.checked) }), h('span', {}, 'Stay with this scene')));
}

// ---- the queue

function queueCard(gm) {
    const { chatKey } = ws.ctx;
    let text = '';
    let urgency = 'whenever';
    const add = () => {
        if (!text.trim()) return;
        queueRequest(chatKey, text.trim(), urgency);
        toast('success', 'Added to the queue - the game master will fit it in.');
        done();
    };
    const list = gm.queue.slice().reverse();
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-list-ol'), 'Your requests'),
        h('small', { class: 'sb-hint' }, 'Things you would like to happen - "add an NPC", "a new quest", "visit somewhere new". They shape the next scenes, not the long-term story.'),
        h('textarea', { class: 'text_pole', rows: 2, placeholder: 'I\'d like…', oninput: (e) => { text = e.target.value; markDirty(); } }),
        h('div', { class: 'sb-actions' },
            select(URGENCIES.map(([value, label]) => ({ value, label })), urgency, { onchange: (e) => { urgency = e.target.value; } }),
            button('Add', add, { iconName: 'fa-plus', cls: 'sb-primary' })),
        ...list.map((r) => h('div', { class: `sb-gm-row${r.status === 'done' || r.status === 'withdrawn' ? ' sb-gm-past' : ''}` },
            h('div', { class: 'sb-gm-text' }, r.text),
            h('div', { class: 'sb-chips' },
                h('span', { class: 'sb-chip' }, URGENCIES.find(([u]) => u === r.urgency)?.[1] ?? r.urgency),
                h('span', { class: `sb-chip sb-gm-${r.status}` }, STATUS_TEXT[r.status]),
                openRequests({ queue: [r] }).length ? h('div', { class: 'sb-iconbtn', title: 'Withdraw', onclick: () => withdrawRequest(chatKey, r.id) }, icon('fa-xmark')) : null))),
        !list.length ? h('p', { class: 'sb-muted' }, 'Nothing queued.') : null);
}

// ---- inspiration

function inspirationCard(gm) {
    const { chatKey } = ws.ctx;
    let title = '';
    let text = '';
    const add = () => {
        if (!text.trim()) return;
        addInspiration(chatKey, title, text);
        toast('info', 'Reading it for motifs in the background…');
        done();
    };
    const editMotifs = (x) => {
        const answer = window.prompt('Motifs, one per line:', x.motifs.join('\n'));
        if (answer === null) return;
        setMotifs(chatKey, x.id, answer.split('\n').map((s) => s.trim()).filter(Boolean));
    };
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-feather-pointed'), 'Inspiration'),
        h('small', { class: 'sb-hint' }, 'A story, a poem, song lyrics - read for its images and themes, which the game master echoes symbolically. It is never retold or quoted.'),
        h('input', { class: 'text_pole', placeholder: 'Title (optional)', oninput: (e) => { title = e.target.value; markDirty(); } }),
        h('textarea', { class: 'text_pole', rows: 4, placeholder: 'Paste the text here…', oninput: (e) => { text = e.target.value; markDirty(); } }),
        h('div', { class: 'sb-actions' }, button('Add', add, { iconName: 'fa-plus', cls: 'sb-primary' })),
        ...gm.inspirations.map((x) => h('div', { class: 'sb-gm-insp' },
            h('div', { class: 'sb-gm-insp-head' }, h('b', {}, x.title || 'Untitled'),
                h('div', { class: 'sb-actions' },
                    h('div', { class: 'sb-iconbtn', title: 'Edit the motifs', onclick: () => editMotifs(x) }, icon('fa-pen')),
                    h('div', { class: 'sb-iconbtn', title: 'Read it again for motifs', onclick: () => void running('Reading', () => runInspire(chatKey, x.id)) }, icon('fa-rotate')),
                    h('div', { class: 'sb-iconbtn', title: 'Remove', onclick: async () => { if (await confirmAction(`Remove "${x.title || 'this inspiration'}"?`)) removeInspiration(chatKey, x.id); } }, icon('fa-trash')))),
            x.motifs.length ? h('div', { class: 'sb-chips' }, x.motifs.map((m) => h('span', { class: 'sb-chip' }, m)))
                : h('small', { class: 'sb-hint' }, x.error ? `Could not read it: ${x.error}` : 'Being read for motifs…'))));
}

// ---- settings and activity

function settingsCard(gm) {
    const s = getSettings();
    const p = s.planner;
    const set = (patch) => { Object.assign(p, patch); saveSettings(); rerender(); };
    const cadence = LEVEL_CADENCE[p.level] ?? LEVEL_CADENCE.moderate;
    const num = (key, fallback, label, hint) => field(label, h('input', {
        type: 'number', class: 'text_pole', min: 0, max: 99, value: Number.isInteger(p[key]) ? p[key] : '', placeholder: String(fallback),
        onchange: (e) => set({ [key]: e.target.value === '' ? null : Math.max(0, Math.min(99, Math.round(Number(e.target.value)))) }),
    }), hint);
    const showSpoilers = async (on) => {
        if (on && !await confirmAction('Show what the game master has planned? The story will hold fewer surprises.')) return rerender();
        set({ showSpoilers: on });
    };
    const log = gm.log.slice(-8).reverse();
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-sliders'), 'Planner'),
        h('label', { class: 'checkbox_label', title: 'Off: the game master works reply by reply, as before - no background planning calls.' },
            h('input', { type: 'checkbox', checked: p.enabled, onchange: (e) => set({ enabled: e.target.checked }) }), h('span', {}, 'Plan ahead in the background')),
        h('label', { class: 'checkbox_label' },
            h('input', { type: 'checkbox', checked: p.showSpoilers, onchange: (e) => void showSpoilers(e.target.checked) }), h('span', {}, 'Show spoilers')),
        field('How much', select(LEVELS.map(([value, label]) => ({ value, label })), p.level, { onchange: (e) => set({ level: e.target.value }) }),
            'Light: few background calls. Heavy: a check after every reply.'),
        field('Pacing', select(PACINGS.map(([value, label]) => ({ value, label })), p.pacing, { onchange: (e) => set({ pacing: e.target.value }) }),
            'How readily a quiet scene moves on in time.'),
        h('div', { class: 'sb-row' },
            num('checkEvery', cadence.check, 'Check every (replies)', '0: only when a planned moment falls through'),
            num('dayExpire', cadence.dayExpire, 'Re-plan after (replies)', 'when one day runs long')),
        log.length ? h('div', { class: 'sb-gm-sub' }, 'Recent passes') : null,
        ...log.map((l) => h('div', { class: 'sb-gm-row sb-gm-log' },
            h('span', { class: 'sb-chip' }, l.pass), h('span', {}, l.error ? `failed: ${l.error}` : l.outcome),
            h('small', { class: 'sb-hint' }, `${new Date(l.at).toLocaleTimeString()}${l.ms ? ` · ${(l.ms / 1000).toFixed(1)}s` : ''}`))));
}

export async function renderGmPlan() {
    const { chatKey, settingId } = ws.ctx;
    if (!settingId) return h('div', { class: 'sb-muted' }, 'This chat has no setting yet.');
    const gm = getChatDoc(chatKey).gm;
    const show = getSettings().planner.showSpoilers === true;
    return h('div', { class: 'sb-gm-plan' },
        h('div', { class: 'sb-scene-cols' },
            h('div', { class: 'sb-gm-col' }, todayCard(gm, show), queueCard(gm), inspirationCard(gm)),
            h('div', { class: 'sb-gm-col' }, paceCard(gm), settingsCard(gm))));
}
