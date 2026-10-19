// The GM Plan tab (docs/DESIGN - GM PLANNER.md §8): the story's shape and
// long-term outline on its tension chart, what the planner has in mind for
// today (veiled unless the user shows spoilers or peeks at one item), the
// user's guidance queue, inspiration texts and their motifs, pacing, the
// pass log and the planner's settings.

import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc } from '../store/chat-store.js';
import { URGENCIES, LEVELS, PACINGS, LEVEL_CADENCE, FIRST_OUTLINE_AFTER, isVeiled, openRequests, currentAct } from '../planner/model.js';
import { SHAPES, shapeCurve, targetAt } from '../planner/shapes.js';
import {
    getPlannerStatus, runDay, runCheck, runInspire, runOutline, runBeat, queueRequest, withdrawRequest, addInspiration, removeInspiration,
    setMotifs, peek, setHold, storyState, setShape, editOutlineBeat, lockOutlineBeat, removeOutlineBeat, addOutlineBeat,
    finishOutlineBeat, setOutlineText, setJoin,
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

// ---- inline editing
//
// One thing is edited at a time, in place: { key, text, flag } ('beat:b3',
// 'add:a2', 'premise', 'motifs:<id>', 'regen:b3', 'regen-outline'). While
// it is open the tab is "dirty", so background updates don't redraw under
// the user's typing.
let editing = null;

function startEdit(key, text = '', flag = true) {
    editing = { key, text, flag };
    rerender();
    markDirty();
}

function stopEdit() {
    editing = null;
    done();
}

const isEditing = (key) => editing?.key === key;

// A textarea that grows with its text, focused once it is on the page.
function growing(attrs) {
    const el = h('textarea', { class: 'text_pole sb-gm-edit-text', ...attrs });
    const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };
    el.addEventListener('input', fit);
    let tries = 0;
    const settle = () => {
        if (el.isConnected) { fit(); el.focus(); el.setSelectionRange(el.value.length, el.value.length); return; }
        if (++tries < 60) requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
    return el;
}

// The editor for `key`: a growing text box with Save and Cancel (Ctrl+Enter
// saves, Escape cancels). onSave(text) - an empty text is not saved unless
// allowEmpty. extra: more controls under the box.
function inlineEditor(key, { onSave, placeholder = '', saveLabel = 'Save', saveIcon = 'fa-check', allowEmpty = false, hint = null, extra = null } = {}) {
    const save = () => {
        const text = editing?.text ?? '';
        if (!allowEmpty && !text.trim()) return;
        const flag = editing?.flag;
        stopEdit();
        onSave(text.trim(), flag);
    };
    return h('div', { class: 'sb-gm-edit' },
        growing({
            value: editing?.text ?? '', placeholder, rows: 2,
            oninput: (e) => { if (editing) editing.text = e.target.value; markDirty(); },
            onkeydown: (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopEdit(); }
            },
        }),
        extra,
        h('div', { class: 'sb-actions' },
            button(saveLabel, save, { iconName: saveIcon, cls: 'sb-primary' }),
            button('Cancel', stopEdit, { iconName: 'fa-xmark' }),
            h('small', { class: 'sb-hint' }, hint ?? 'Ctrl+Enter to save, Esc to cancel')));
}

// ---- the story outline (§3.1, §5)

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
    for (const c of children.flat()) if (c) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
}

const AIM_ICON = { build: 'fa-arrow-trend-up', hold: 'fa-equals', ease: 'fa-arrow-trend-down' };
const BEAT_ICON = { done: 'fa-circle-check', active: 'fa-circle-play', pending: 'fa-circle', skipped: 'fa-circle-minus' };

// The shape's target band across the story, the acts, where the story is
// and the newest reading - and, beside it, the recent readings against the
// band where the story is now.
function tensionChart(shape, state, readings) {
    const W = 560, H = 150, pad = { l: 26, r: 8, t: 18, b: 20 };
    const x = (pos) => pad.l + pos * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / 5) * (H - pad.t - pad.b);
    const curve = shapeCurve(shape, 60);
    const band = [...curve.map((p) => `${x(p.pos)},${y(p.max)}`), ...curve.slice().reverse().map((p) => `${x(p.pos)},${y(p.min)}`)].join(' ');
    const center = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.pos)},${y((p.min + p.max) / 2)}`).join(' ');
    let start = 0;
    const acts = shape.acts.map((a, i) => {
        const at = start;
        start += a.share;
        return svg('g', {},
            i ? svg('line', { x1: x(at), x2: x(at), y1: pad.t - 4, y2: H - pad.b, class: 'sb-gm-chart-act' }) : null,
            svg('text', { x: x(at + a.share / 2), y: pad.t - 6, class: 'sb-gm-chart-label', 'text-anchor': 'middle' }, a.title));
    });
    const now = readings[readings.length - 1];
    const here = x(state.position);
    const grid = [0, 1, 2, 3, 4, 5].map((v) => svg('g', {},
        svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'sb-gm-chart-grid' }),
        svg('text', { x: pad.l - 6, y: y(v) + 4, class: 'sb-gm-chart-label', 'text-anchor': 'end' }, String(v))));
    const main = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sb-gm-chart', role: 'img', 'aria-label': `${shape.label}: target tension across the story` },
        ...grid,
        svg('polygon', { points: band, class: 'sb-gm-chart-band' }),
        svg('path', { d: center, class: 'sb-gm-chart-center' }),
        ...acts,
        svg('line', { x1: here, x2: here, y1: pad.t, y2: H - pad.b, class: 'sb-gm-chart-here' }),
        now ? svg('circle', { cx: here, cy: y(now.overall), r: 5, class: 'sb-gm-chart-now' }, svg('title', {}, `Tension now: ${now.overall}${now.reason ? ` - ${now.reason}` : ''}`)) : null,
        svg('text', { x: Math.min(W - 40, here + 4), y: H - 6, class: 'sb-gm-chart-label' }, 'now'));
    // The recent readings against the band at the story's position.
    const recent = readings.slice(-20);
    const t = targetAt(shape, state.position);
    const RW = 200;
    const rx = (i) => pad.l + (recent.length > 1 ? i / (recent.length - 1) : 0.5) * (RW - pad.l - pad.r);
    const spark = svg('svg', { viewBox: `0 0 ${RW} ${H}`, class: 'sb-gm-chart sb-gm-spark', role: 'img', 'aria-label': 'Recent tension readings' },
        ...[0, 5].map((v) => svg('text', { x: pad.l - 6, y: y(v) + 4, class: 'sb-gm-chart-label', 'text-anchor': 'end' }, String(v))),
        svg('rect', { x: pad.l, y: y(t.max), width: RW - pad.l - pad.r, height: Math.max(1, y(t.min) - y(t.max)), class: 'sb-gm-chart-band' }),
        svg('text', { x: pad.l, y: pad.t - 6, class: 'sb-gm-chart-label' }, 'Recent readings'),
        recent.length > 1 ? svg('path', { d: recent.map((r, i) => `${i ? 'L' : 'M'}${rx(i)},${y(r.overall)}`).join(' '), class: 'sb-gm-chart-line' }) : null,
        ...recent.map((r, i) => svg('circle', { cx: rx(i), cy: y(r.overall), r: i === recent.length - 1 ? 4 : 2.5, class: 'sb-gm-chart-dot' },
            svg('title', {}, `${r.overall}${Number.isFinite(r.threat) ? ` (threat ${r.threat}, uncertainty ${r.uncertainty}, emotional ${r.emotional})` : ''}${r.reason ? ` - ${r.reason}` : ''}`))),
        !recent.length ? svg('text', { x: RW / 2, y: H / 2, class: 'sb-gm-chart-label', 'text-anchor': 'middle' }, 'no readings yet') : null);
    return h('div', { class: 'sb-gm-charts' }, main, spark);
}

function shapePicker(current, onPick) {
    return h('div', { class: 'sb-gm-shapes' }, SHAPES.map((s) => h('div', {
        class: `sb-gm-shape${s.id === current ? ' active' : ''}`,
        title: `Leans on ${s.lean} tension`,
        onclick: () => onPick(s.id),
    }, h('b', {}, s.label), h('small', {}, s.blurb))));
}

function beatRow(gm, beat, { veiled, chatId, chatKey, busy }) {
    if (veiled) {
        return h('div', { class: 'sb-gm-row sb-gm-veiled' }, icon('fa-mask'), h('span', { class: 'sb-muted' }, 'A beat to come'),
            h('a', { href: '#', class: 'sb-gm-peek', onclick: (e) => { e.preventDefault(); peek(chatKey, beat.id); } }, 'peek'));
    }
    const head = icon(BEAT_ICON[beat.status] ?? 'fa-circle');
    if (isEditing(`beat:${beat.id}`)) {
        return h('div', { class: `sb-gm-row sb-gm-beat sb-gm-beat-${beat.status}` }, head,
            inlineEditor(`beat:${beat.id}`, { onSave: (text) => editOutlineBeat(chatKey, beat.id, text), placeholder: 'What happens in this beat', hint: 'Your words are kept: the beat is locked. Ctrl+Enter to save, Esc to cancel.' }));
    }
    if (isEditing(`regen:${beat.id}`)) {
        return h('div', { class: `sb-gm-row sb-gm-beat sb-gm-beat-${beat.status}` }, head,
            h('div', { class: 'sb-gm-text' }, h('s', { class: 'sb-hint' }, beat.text),
                inlineEditor(`regen:${beat.id}`, {
                    onSave: (wish) => void running('Regenerating the beat', () => runBeat(chatId, chatKey, beat.id, wish)),
                    placeholder: 'What should it be instead? (optional - leave empty for something different)',
                    saveLabel: 'Regenerate', saveIcon: 'fa-dice', allowEmpty: true, hint: 'Ctrl+Enter to regenerate, Esc to cancel',
                })));
    }
    const open = beat.status === 'pending' || beat.status === 'active';
    const off = busy ? 'true' : null;
    return h('div', { class: `sb-gm-row sb-gm-beat sb-gm-beat-${beat.status}` },
        head,
        h('div', { class: 'sb-gm-text' }, beat.text, beat.note ? h('small', { class: 'sb-hint' }, ` (${beat.note})`) : null),
        h('div', { class: 'sb-chips' },
            beat.by === 'user' ? h('span', { class: 'sb-chip', title: 'Your beat' }, icon('fa-user-pen')) : null,
            ...beat.ties.slice(0, 3).map((t) => h('span', { class: 'sb-chip' }, t)),
            open ? h('div', { class: 'sb-iconbtn', title: beat.locked ? 'Locked: the planner keeps it as written. Click to unlock.' : 'Lock it: the planner keeps it as written', onclick: () => lockOutlineBeat(chatKey, beat.id, !beat.locked) }, icon(beat.locked ? 'fa-lock' : 'fa-lock-open')) : null,
            open ? h('div', { class: 'sb-iconbtn', title: 'Edit', onclick: () => startEdit(`beat:${beat.id}`, beat.text) }, icon('fa-pen')) : null,
            open ? h('div', { class: 'sb-iconbtn', title: 'Regenerate this beat', onclick: busy ? null : () => startEdit(`regen:${beat.id}`, ''), 'aria-disabled': off }, icon('fa-dice')) : null,
            beat.status === 'active' ? h('div', { class: 'sb-iconbtn', title: 'The story has played this out', onclick: () => finishOutlineBeat(chatKey, beat.id), 'aria-disabled': off }, icon('fa-check')) : null,
            open ? h('div', { class: 'sb-iconbtn', title: 'Remove', onclick: async () => { if (await confirmAction('Remove this beat from the outline?')) removeOutlineBeat(chatKey, beat.id); } }, icon('fa-trash')) : null));
}

// Regenerate the whole outline: keep the beats the user locked or wrote, or
// start afresh (only what the story has done is ever kept), with an
// optional steer.
function regeneratePanel(chatId, chatKey) {
    return h('div', { class: 'sb-gm-regen' },
        h('div', { class: 'sb-card-title' }, icon('fa-dice'), 'Regenerate the outline'),
        inlineEditor('regen-outline', {
            onSave: (wish, keepLocked) => void running('Regenerating the outline', () => runOutline(chatId, chatKey, { rewrite: true, keepLocked, wish })),
            placeholder: 'Anything it should do differently? (optional - e.g. "more intrigue", "Niamh should betray them")',
            saveLabel: 'Regenerate', saveIcon: 'fa-dice', allowEmpty: true, hint: 'What the story has already done is always kept.',
            extra: h('label', { class: 'checkbox_label' },
                h('input', { type: 'checkbox', checked: editing?.flag !== false, onchange: (e) => { if (editing) editing.flag = e.target.checked; } }),
                h('span', {}, 'Keep the beats I locked or wrote')),
        }));
}

// A story already under way: which chapter it is in now, and what has
// happened so far - so the outline picks the story up where it is instead
// of starting it from the beginning. Open until there is an outline.
function joinPanel(gm, shape, chatKey) {
    let note = gm.join.note;
    const save = () => { setJoin(chatKey, { note }); ws.dirty = false; };
    return h('details', { class: 'sb-gm-join', open: !gm.outline || null },
        h('summary', {}, icon('fa-book-open'), ' Joining a story already under way?'),
        h('small', { class: 'sb-hint' }, 'Say where the story is now, so the outline picks it up there instead of starting from the beginning. Earlier chapters are summed up as already done. Used the next time the outline is written or rewritten.'),
        field('The story is now in', select([{ value: -1, label: 'Let the game master judge' }, ...shape.acts.map((a, i) => ({ value: i, label: `Chapter ${i + 1}: ${a.title}` }))], gm.join.act, {
            onchange: (e) => setJoin(chatKey, { act: Number(e.target.value) }),
        })),
        field('The story so far (optional)', h('textarea', {
            class: 'text_pole', rows: 4, placeholder: 'What has happened so far, in a few lines - who the characters are to each other now, what they have done, what is unresolved.',
            value: note, oninput: (e) => { note = e.target.value; markDirty(); }, onchange: save, onblur: save,
        }), 'Archivist\'s summary, major events and open threads are added when it has compiled.'));
}

function outlineCard(gm, show) {
    const { chatId, chatKey } = ws.ctx;
    const st = getPlannerStatus();
    const busy = !!st.running && st.chatKey === chatKey;
    const state = storyState(gm);
    if (!state.shape) {
        return h('div', { class: 'sb-card' },
            h('div', { class: 'sb-card-title' }, icon('fa-route'), 'The story\'s shape'),
            h('small', { class: 'sb-hint' }, 'Pick the kind of story this is. Its shape sets the tension the game master steers toward; the outline follows it. You can change it any time.'),
            shapePicker('', (id) => setShape(chatKey, id)));
    }
    const outline = gm.outline;
    const cur = currentAct(outline);
    const aim = state.aim;
    const readings = gm.tension;
    const source = readings.length ? (readings[readings.length - 1].source === 'archivist' ? 'from Archivist' : 'the game master\'s own reading') : '';
    const premise = !outline?.premise && !isEditing('premise') ? null
        : isEditing('premise')
            ? inlineEditor('premise', { onSave: (text) => setOutlineText(chatKey, { premise: text }), placeholder: 'What this story is about', allowEmpty: true })
            : h('div', { class: 'sb-gm-premise' }, h('span', {}, outline.premise), h('div', { class: 'sb-iconbtn', title: 'Edit', onclick: () => startEdit('premise', outline.premise) }, icon('fa-pen')));
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-route'), 'The story',
            h('span', { class: 'sb-gm-title-tools' },
                select(SHAPES.map((s) => ({ value: s.id, label: s.label })), state.shape.id, { onchange: (e) => setShape(chatKey, e.target.value), title: 'The story\'s shape' }),
                aim ? h('span', { class: `sb-chip sb-gm-aim-${aim.word}`, title: aim.why }, icon(AIM_ICON[aim.word]), `${aim.word} · ${aim.lean}`) : null)),
        tensionChart(state.shape, state, readings),
        h('small', { class: 'sb-hint' }, readings.length
            ? `Tension ${readings[readings.length - 1].overall} of 5 (${source}); the band is where the ${state.shape.label.toLowerCase()} wants it.${aim ? ` Aim: ${aim.word} - ${aim.why}.` : ''}`
            : 'No tension readings yet: they come from Archivist\'s compiles, or from the game master\'s checks.'),
        !outline ? h('p', { class: 'sb-muted' }, `No outline yet. One is written after ${FIRST_OUTLINE_AFTER} replies, or now:`) : null,
        joinPanel(gm, state.shape, chatKey),
        premise,
        outline?.themes?.length ? h('div', { class: 'sb-chips' }, outline.themes.map((t) => h('span', { class: 'sb-chip' }, t))) : null,
        ...(outline?.acts ?? []).map((act, i) => {
            // Spoilers: the current act and what is done show; acts to come are veiled.
            const ahead = cur && i > cur.index;
            return h('div', { class: `sb-gm-act${cur && i === cur.index ? ' current' : ''}` },
                h('div', { class: 'sb-gm-sub' }, `Chapter ${i + 1}: ${act.title}`,
                    act.beats.length < 10 && !isEditing(`add:${act.id}`) ? h('a', { href: '#', class: 'sb-gm-peek', onclick: (e) => { e.preventDefault(); startEdit(`add:${act.id}`, ''); } }, '+ beat') : null),
                ...act.beats.map((b) => beatRow(gm, b, { veiled: ahead && b.status === 'pending' && isVeiled(gm, b.id, show), chatId, chatKey, busy })),
                isEditing(`add:${act.id}`) ? inlineEditor(`add:${act.id}`, { onSave: (text) => addOutlineBeat(chatKey, act.id, text), placeholder: `A new beat for "${act.title}"`, saveLabel: 'Add', saveIcon: 'fa-plus', hint: 'Your beat is locked: the planner keeps it. Ctrl+Enter to add, Esc to cancel.' }) : null);
        }),
        isEditing('regen-outline') ? regeneratePanel(chatId, chatKey) : null,
        h('div', { class: 'sb-actions' },
            button(outline ? 'Review against the story' : 'Write the outline now', () => void running(outline ? 'Reviewing the outline' : 'Writing the outline', () => runOutline(chatId, chatKey)), { iconName: 'fa-feather', disabled: busy }),
            outline && !isEditing('regen-outline') ? button('Regenerate…', () => startEdit('regen-outline', '', true), { iconName: 'fa-dice', disabled: busy, title: 'Write the outline again - with a steer if you like' }) : null),
        gm.outlineWanted && outline ? h('small', { class: 'sb-hint' }, icon('fa-clock'), ' A review is due on the next pass.') : null);
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
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-feather-pointed'), 'Inspiration'),
        h('small', { class: 'sb-hint' }, 'A story, a poem, song lyrics - read for its images and themes, which the game master echoes symbolically. It is never retold or quoted.'),
        h('input', { class: 'text_pole', placeholder: 'Title (optional)', oninput: (e) => { title = e.target.value; markDirty(); } }),
        h('textarea', { class: 'text_pole', rows: 4, placeholder: 'Paste the text here…', oninput: (e) => { text = e.target.value; markDirty(); } }),
        h('div', { class: 'sb-actions' }, button('Add', add, { iconName: 'fa-plus', cls: 'sb-primary' })),
        ...gm.inspirations.map((x) => h('div', { class: 'sb-gm-insp' },
            h('div', { class: 'sb-gm-insp-head' }, h('b', {}, x.title || 'Untitled'),
                h('div', { class: 'sb-actions' },
                    h('div', { class: 'sb-iconbtn', title: 'Edit the motifs', onclick: () => startEdit(`motifs:${x.id}`, x.motifs.join('\n')) }, icon('fa-pen')),
                    h('div', { class: 'sb-iconbtn', title: 'Read it again for motifs', onclick: () => void running('Reading', () => runInspire(chatKey, x.id)) }, icon('fa-rotate')),
                    h('div', { class: 'sb-iconbtn', title: 'Remove', onclick: async () => { if (await confirmAction(`Remove "${x.title || 'this inspiration'}"?`)) removeInspiration(chatKey, x.id); } }, icon('fa-trash')))),
            isEditing(`motifs:${x.id}`) ? inlineEditor(`motifs:${x.id}`, { onSave: (text) => setMotifs(chatKey, x.id, text.split('\n').map((m) => m.trim()).filter(Boolean)), placeholder: 'One motif per line', allowEmpty: true, hint: 'One motif per line. Ctrl+Enter to save, Esc to cancel.' })
                : x.motifs.length ? h('div', { class: 'sb-chips' }, x.motifs.map((m) => h('span', { class: 'sb-chip' }, m)))
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
            num('dayExpire', cadence.dayExpire, 'Re-plan after (replies)', 'when one day runs long'),
            num('outlineEvery', cadence.outline, 'Review outline every (replies)', '0: only on demand')),
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
            h('div', { class: 'sb-gm-col' }, outlineCard(gm, show), todayCard(gm, show), queueCard(gm), inspirationCard(gm)),
            h('div', { class: 'sb-gm-col' }, paceCard(gm), settingsCard(gm))));
}
