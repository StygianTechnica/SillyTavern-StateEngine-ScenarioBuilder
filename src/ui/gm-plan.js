// The GM Plan tab (docs/DESIGN - GM PLANNER.md §8): the story's shape and
// long-term outline on its tension chart, what the planner has in mind for
// today (veiled unless the user shows spoilers or peeks at one item), the
// user's guidance queue, inspiration texts and their motifs, pacing, the
// pass log and the planner's settings.

import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { getSettingDoc } from '../store/setting-store.js';
import { URGENCIES, LEVELS, PACINGS, LEVEL_CADENCE, FIRST_OUTLINE_AFTER, isVeiled, openRequests, currentAct, volumeComplete, volumeReadings, storyMarkdown, hasStory, openIdeas, sameBeat } from '../planner/model.js';
import { SHAPES, shapeCurve, targetAt } from '../planner/shapes.js';
import {
    getPlannerStatus, runDay, runCheck, runInspire, runOutline, runBeat, queueRequest, withdrawRequest, addInspiration, removeInspiration,
    setMotifs, peek, setHold, storyState, setShape, editOutlineBeat, lockOutlineBeat, removeOutlineBeat, addOutlineBeat,
    finishOutlineBeat, restoreOutlineBeat, setOutlineText, setJoin, finishVolume, editFinishedVolume, steerObjects,
    runIdeas, acceptIdea, dismissIdea, editProposal, addAgendaItem, removeAgendaItem, setCreationMode,
    writeStarter, postStarter, starterSpeakers,
} from '../planner/run.js';
import { confirmAction } from './confirm.js';
import { armTrigger, retireTrigger, clearFinishedTriggers } from '../triggers/run.js';
import { listEntries, getSettingSummary } from '../library/library.js';
import { downloadText, safeFileName } from '../store/files.js';
import { eventCard } from './event-card.js';
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
    return out;
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
            // A skipped beat (the planner judged it could no longer happen):
            // bring it back, or remove it.
            beat.status === 'skipped' ? h('div', { class: 'sb-iconbtn', title: 'Skipped by the planner - bring it back as a beat still to come', onclick: () => restoreOutlineBeat(chatKey, beat.id), 'aria-disabled': off }, icon('fa-rotate-left')) : null,
            beat.status === 'skipped' ? h('div', { class: 'sb-iconbtn', title: 'Remove', onclick: async () => { if (await confirmAction('Remove this skipped beat from the outline?')) removeOutlineBeat(chatKey, beat.id); } }, icon('fa-trash')) : null,
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
    const readings = volumeReadings(gm);
    const complete = volumeComplete(outline);
    const source = readings.length ? (readings[readings.length - 1].source === 'archivist' ? 'from Archivist' : 'the game master\'s own reading') : '';
    const premise = !outline?.premise && !isEditing('premise') ? null
        : isEditing('premise')
            ? inlineEditor('premise', { onSave: (text) => setOutlineText(chatKey, { premise: text }), placeholder: 'What this story is about', allowEmpty: true })
            : h('div', { class: 'sb-gm-premise' }, h('span', {}, outline.premise), h('div', { class: 'sb-iconbtn', title: 'Edit', onclick: () => startEdit('premise', outline.premise) }, icon('fa-pen')));
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-route'), gm.volume.number > 1 || gm.volumes.length ? `Volume ${gm.volume.number}` : 'The story',
            h('span', { class: 'sb-gm-title-tools' },
                select(SHAPES.map((s) => ({ value: s.id, label: s.label })), state.shape.id, { onchange: (e) => setShape(chatKey, e.target.value), title: 'The story\'s shape' }),
                aim ? h('span', { class: `sb-chip sb-gm-aim-${aim.word}`, title: aim.why }, icon(AIM_ICON[aim.word]), `${aim.word} · ${aim.lean}`) : null)),
        tensionChart(state.shape, state, readings),
        h('small', { class: 'sb-hint' }, readings.length
            ? `Tension ${readings[readings.length - 1].overall} of 5 (${source}); the band is where the ${state.shape.label.toLowerCase()} wants it.${aim ? ` Aim: ${aim.word} - ${aim.why}.` : ''}`
            : 'No tension readings yet: they come from Archivist\'s compiles, or from the game master\'s checks.'),
        !outline ? h('p', { class: 'sb-muted' }, `No outline yet. One is written after ${FIRST_OUTLINE_AFTER} replies, or now:`) : null,
        // Joining a story under way is for its first volume; a later one
        // starts from the recap before it, steered by the user's text.
        gm.volume.number > 1 || gm.volumes.length ? null : joinPanel(gm, state.shape, chatKey),
        volumeSteer(gm, chatKey),
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
        complete && !isEditing('next-volume') ? h('div', { class: 'sb-gm-complete' },
            h('div', {}, icon('fa-flag-checkered'), h('b', {}, ' This volume is complete.'), ' Every beat of its last chapter has played out.'),
            h('small', { class: 'sb-hint' }, 'Continue with a new volume - its recap is written first - or keep going in this one: the game master keeps winding it down until you choose.'),
            h('div', { class: 'sb-actions' }, button('Continue with a new volume…', () => startEdit('next-volume', '', state.shape.id), { iconName: 'fa-book', cls: 'sb-primary', disabled: busy }))) : null,
        isEditing('next-volume') ? nextVolumePanel(gm, chatId, chatKey, complete) : null,
        h('div', { class: 'sb-actions' },
            button(outline ? 'Review against the story' : 'Write the outline now', () => void running(outline ? 'Reviewing the outline' : 'Writing the outline', () => runOutline(chatId, chatKey)), { iconName: 'fa-feather', disabled: busy }),
            outline && !isEditing('regen-outline') ? button('Regenerate…', () => startEdit('regen-outline', '', true), { iconName: 'fa-dice', disabled: busy, title: 'Write the outline again - with a steer if you like' }) : null,
            outline && !complete && !isEditing('next-volume') ? button('Close this volume…', () => startEdit('next-volume', '', state.shape.id), { iconName: 'fa-book', disabled: busy, title: 'End this arc now and go on with a new volume' }) : null),
        gm.outlineWanted && outline ? h('small', { class: 'sb-hint' }, icon('fa-clock'), ' A review is due on the next pass.') : null);
}

// ---- volumes (§5.1)

// Where the user wants this volume to go (written when it began): shown,
// and editable - the outline follows it.
function volumeSteer(gm, chatKey) {
    const text = gm.volume?.direction ?? '';
    if (isEditing('vsteer')) {
        return inlineEditor('vsteer', {
            onSave: (t) => {
                const before = getChatDoc(chatKey).gm.volume.direction;
                updateChatDoc(chatKey, (d) => { d.gm.volume.direction = t; d.gm.outlineWanted = true; });
                // People and places newly named in it are made first.
                if (t && t !== before) {
                    void steerObjects(ws.ctx.chatId, chatKey, ws.ctx.settingId, t, { number: getChatDoc(chatKey).gm.volume.number }).then((made) => {
                        if (made.length) toast('success', `Made from your steer: ${made.join(', ')} - see Review.`);
                    });
                }
                done();
            },
            placeholder: 'Where this volume should go', allowEmpty: true,
            hint: 'The next outline pass follows it. Ctrl+Enter to save, Esc to cancel.',
        });
    }
    if (!text) return null;
    return h('div', { class: 'sb-gm-premise' },
        h('div', {}, h('b', {}, 'Your steer'), ...text.split(/\n\s*\n/).map((para) => h('p', {}, para))),
        h('div', { class: 'sb-iconbtn', title: 'Edit', onclick: () => startEdit('vsteer', text) }, icon('fa-pen')));
}

// The next volume: its shape and an optional steer; the volume under way is
// recapped and filed first.
function nextVolumePanel(gm, chatId, chatKey, complete) {
    const next = gm.volume.number + 1;
    return h('div', { class: 'sb-gm-regen' },
        h('div', { class: 'sb-card-title' }, icon('fa-book'), complete ? `Volume ${next}` : `Close volume ${gm.volume.number} and begin volume ${next}`),
        !complete ? h('small', { class: 'sb-hint' }, 'The beats this volume has not reached are kept in its record as not reached.') : null,
        inlineEditor('next-volume', {
            onSave: (direction, shape) => void (async () => {
                const out = await running(`Writing the recap of volume ${gm.volume.number}`, () => finishVolume(chatId, chatKey, { shape, direction }));
                // Failed: nothing changed - the panel again, as it was, to try once more.
                if (!out) startEdit('next-volume', direction, shape);
            })(),
            placeholder: 'Where should the next volume go? (optional - e.g. "the war comes to Redhaven", "something quieter")',
            saveLabel: `Write the recap and begin volume ${next}`, saveIcon: 'fa-feather', allowEmpty: true,
            hint: 'The recap is written in the background; the new outline follows on the next pass.',
            extra: h('div', {},
                field('Story shape', select(SHAPES.map((sh) => ({ value: sh.id, label: sh.label })), editing?.flag ?? gm.shape, {
                    onchange: (e) => { if (editing) editing.flag = e.target.value; },
                })),
                h('label', { class: 'checkbox_label', title: 'Before anything else reads your steer, one model call takes out the people, places and groups it names that the world does not have yet - a new antagonist, the temple you set out for - and makes them, with your own words as their description. Listed in Review. Not in a canon-only setting.' },
                    h('input', { type: 'checkbox', checked: getSettings().planner.steerObjects !== false, onchange: (e) => { getSettings().planner.steerObjects = e.target.checked; saveSettings(); } }),
                    h('span', {}, 'Add the new people and places I name to the world (one call)'))),
        }));
}

function volumeRecord(gm, v, chatKey) {
    const key = (what) => `${what}:${v.number}`;
    const meta = [v.shape, v.startedDay === v.endedDay ? `day ${v.startedDay}` : `days ${v.startedDay}-${v.endedDay}`, `${Math.max(0, v.endedTurn - v.startedTurn)} replies`, v.closedEarly ? 'closed early' : ''].filter(Boolean).join(' · ');
    const tools = h('span', { class: 'sb-gm-title-tools' },
        h('div', { class: 'sb-iconbtn', title: 'Rename', onclick: () => startEdit(key('vtitle'), v.title) }, icon('fa-heading')),
        h('div', { class: 'sb-iconbtn', title: 'Edit the recap', onclick: () => startEdit(key('vrecap'), v.recap) }, icon('fa-pen')),
        h('div', { class: 'sb-iconbtn', title: 'Edit the threads carried forward', onclick: () => startEdit(key('vthreads'), v.threads.join('\n')) }, icon('fa-list')));
    const open = ['vtitle', 'vrecap', 'vthreads'].some((w) => isEditing(key(w))) || null;
    return h('details', { class: 'sb-gm-volume', open },
        h('summary', {}, h('b', {}, `Volume ${v.number}: ${v.title}`), h('small', { class: 'sb-hint' }, ` ${meta}`)),
        h('div', { class: 'sb-gm-volume-body' },
            tools,
            isEditing(key('vtitle')) ? inlineEditor(key('vtitle'), { onSave: (text) => editFinishedVolume(chatKey, v.number, { title: text }), placeholder: 'The volume\'s title' }) : null,
            isEditing(key('vrecap'))
                ? inlineEditor(key('vrecap'), { onSave: (text) => editFinishedVolume(chatKey, v.number, { recap: text }), placeholder: 'The recap', allowEmpty: true })
                : h('div', { class: 'sb-gm-recap' }, (v.recap || '(no recap)').split(/\n\s*\n/).map((para) => h('p', {}, para.trim()))),
            isEditing(key('vthreads'))
                ? inlineEditor(key('vthreads'), { onSave: (text) => editFinishedVolume(chatKey, v.number, { threads: text.split('\n').map((t) => t.trim()).filter(Boolean) }), placeholder: 'One thread per line', allowEmpty: true, hint: 'One thread per line. Ctrl+Enter to save, Esc to cancel.' })
                : v.threads.length ? h('div', {}, h('div', { class: 'sb-gm-sub' }, 'Threads carried forward'), h('ul', { class: 'sb-gm-threads' }, v.threads.map((t) => h('li', {}, t)))) : null,
            v.editedByUser ? h('small', { class: 'sb-hint' }, icon('fa-user-pen'), ' Edited by you') : null));
}

// The finished volumes, newest first, with the story so far to copy or save
// (the volume under way included, from its first chronicle line).
function volumesCard(gm) {
    if (!hasStory(gm)) return null;
    const { chatKey, chatId, settingId } = ws.ctx;
    const markdown = (title) => storyMarkdown(gm, title, { inProgress: true });
    const copy = async () => {
        try { await navigator.clipboard.writeText(markdown()); toast('success', 'The story so far is copied.'); } catch { toast('warning', 'Could not copy - your browser blocked it.'); }
    };
    const save = async () => {
        const world = (await getSettingSummary(settingId))?.name ?? 'Story';
        const name = `${world} - ${chatId} - ${new Date().toISOString().slice(0, 10)}`;
        downloadText(`${safeFileName(name, 'story-so-far')}.md`, markdown(`${world}: the story so far`), 'text/markdown');
    };
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-book-bookmark'), 'The story so far',
            h('span', { class: 'sb-gm-title-tools' },
                button('Copy', () => void copy(), { iconName: 'fa-copy', title: 'Copy every recap, and the volume under way, as Markdown' }),
                button('Save', () => void save(), { iconName: 'fa-download', title: 'Save every recap, and the volume under way, as a Markdown file' }))),
        gm.volumes.length ? null : h('small', { class: 'sb-hint' }, 'No volume has finished yet - saving gives what the one under way has so far.'),
        ...gm.volumes.slice().reverse().map((v) => volumeRecord(gm, v, chatKey)));
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
            // A note that only repeats the moment says nothing.
            m.note && !sameBeat(m.note, m.text) ? h('small', { class: 'sb-hint' }, ` (${m.note})`) : null),
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

// ---- story triggers (src/triggers/)

const TRIGGER_KIND_TEXT = { story: 'Something happens', place: 'They reach a place', person: 'Someone is present', day: 'A day comes' };
const TRIGGER_STATUS_TEXT = { armed: 'watching', fired: 'set off', done: 'played', retired: 'taken down' };

// Conditions watched in the story, and what they set off: the user's own,
// and the planner's (veiled like the rest of the plan).
function triggersCard(gm, show, places, people) {
    const { chatId, chatKey } = ws.ctx;
    const draft = { kind: 'story', when: '', then: '', target: '', day: '' };
    const name = (list, id) => list.find((e) => e.id === id)?.name ?? '(gone)';
    const whenText = (t) => (t.kind === 'place' ? `the scene reaches ${name(places, t.target)}`
        : t.kind === 'person' ? `${name(people, t.target)} is present`
            : t.kind === 'day' ? `day ${t.day} comes` : t.when);
    const arm = async () => {
        const kind = draft.kind;
        const target = kind === 'place' || kind === 'person' ? draft.target : '';
        const day = kind === 'day' ? Number.parseInt(draft.day, 10) : null;
        const when = kind === 'story' ? draft.when.trim() : whenText({ kind, target, day });
        if (!draft.then.trim() || (kind === 'story' && !when) || ((kind === 'place' || kind === 'person') && !target) || (kind === 'day' && !(day > 0))) {
            return toast('info', 'Say when, and what then happens.');
        }
        const made = await armTrigger(chatId, chatKey, { kind, when, then: draft.then.trim(), target, day });
        if (made) toast('success', 'Watching for it.');
        else toast('warning', 'Not armed: it is already watched, too many are, or State Engine refused (see the console).');
        done();
    };
    const whenField = h('div', {});
    const drawWhen = () => {
        whenField.replaceChildren(draft.kind === 'story'
            ? h('input', { class: 'text_pole', placeholder: 'When… (e.g. Remus opens his predecessor\'s tomb)', oninput: (e) => { draft.when = e.target.value; markDirty(); } })
            : draft.kind === 'place' ? select([{ value: '', label: 'Which place?' }, ...places.map((p) => ({ value: p.id, label: p.name }))], '', { onchange: (e) => { draft.target = e.target.value; } })
                : draft.kind === 'person' ? select([{ value: '', label: 'Who?' }, ...people.map((p) => ({ value: p.id, label: p.name }))], '', { onchange: (e) => { draft.target = e.target.value; } })
                    : h('input', { class: 'text_pole', type: 'number', min: 1, placeholder: 'Day', oninput: (e) => { draft.day = e.target.value; } }));
    };
    drawWhen();
    const list = gm.triggers.slice().reverse();
    const finished = list.filter((t) => t.status === 'done' || t.status === 'retired').length;
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-bolt'), 'Story triggers'),
        h('small', { class: 'sb-hint' }, 'When something happens, something follows. State Engine watches each condition in its usual update (no extra calls); when one is met, the game master sets off what follows in the next reply.'),
        h('div', { class: 'sb-row' },
            select(Object.entries(TRIGGER_KIND_TEXT).map(([value, label]) => ({ value, label })), draft.kind, { onchange: (e) => { draft.kind = e.target.value; draft.target = ''; drawWhen(); } }),
            whenField),
        h('textarea', { class: 'text_pole', rows: 2, placeholder: 'Then… (e.g. the corrupted champion rises and attacks)', oninput: (e) => { draft.then = e.target.value; markDirty(); } }),
        h('div', { class: 'sb-actions' }, button('Watch for it', () => void arm(), { iconName: 'fa-bolt', cls: 'sb-primary' })),
        ...list.map((t) => {
            const veiled = t.source === 'planner' && t.status === 'armed' && !show;
            return h('div', { class: `sb-gm-row${t.status === 'done' || t.status === 'retired' ? ' sb-gm-past' : ''}` },
                h('div', { class: 'sb-gm-text' }, veiled ? h('i', {}, 'A turn the plan is waiting for (hidden - show spoilers to read it).') : [h('b', {}, 'When '), whenText(t), h('b', {}, ' then '), t.then]),
                h('div', { class: 'sb-chips' },
                    h('span', { class: 'sb-chip' }, t.source === 'planner' ? 'the plan\'s' : 'yours'),
                    h('span', { class: `sb-chip sb-gm-${t.status}` }, TRIGGER_STATUS_TEXT[t.status]),
                    t.status === 'armed' ? h('div', { class: 'sb-iconbtn', title: 'Stop watching for it', onclick: () => void retireTrigger(chatKey, t.id).then(done) }, icon('fa-xmark')) : null));
        }),
        !list.length ? h('p', { class: 'sb-muted' }, 'Nothing watched yet.') : null,
        finished ? h('div', { class: 'sb-actions' }, button(`Clear ${finished} finished`, () => { clearFinishedTriggers(chatKey); done(); }, { iconName: 'fa-broom' })) : null);
}

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

// ---- ideas (§3.4) and the agenda (§3.3)

const IDEA_LABEL = { quest: ['Quest', 'fa-scroll'], enrich: ['Quest detail', 'fa-feather'], happening: ['Happening', 'fa-calendar-day'], seed: ['Seed', 'fa-seedling'], event: ['Event', 'fa-trophy'] };
const EVENT_IDEA_KIND = { arena: 'an arena', tournament: 'a tournament', crawl: 'a dungeon crawl', programme: 'a programme' };

function ideaRow(idea, chatId, chatKey) {
    const [label, iconName] = IDEA_LABEL[idea.kind] ?? ['Idea', 'fa-lightbulb'];
    const accept = async () => {
        const result = await acceptIdea(chatId, chatKey, idea.id);
        toast(result.ok ? 'success' : 'warning', result.message);
        rerender();
    };
    const key = `idea:${idea.id}`;
    const head = idea.kind === 'quest' || idea.kind === 'event' ? idea.name : idea.kind === 'enrich' ? `For "${idea.target}"` : '';
    return h('div', { class: 'sb-gm-idea' },
        h('div', { class: 'sb-gm-idea-head' },
            h('span', { class: 'sb-chip' }, icon(iconName), label),
            head ? h('b', {}, head) : null,
            idea.kind === 'happening' ? h('small', { class: 'sb-hint' }, `in ${idea.inDays ?? 3} day${idea.inDays === 1 ? '' : 's'}${idea.when ? `, ${idea.when}` : ''}`) : null,
            idea.kind === 'event' ? h('small', { class: 'sb-hint' }, `${EVENT_IDEA_KIND[idea.eventKind] ?? 'an event'}${idea.inDays ? `, in ${idea.inDays} day${idea.inDays === 1 ? '' : 's'}` : ''} - accepting writes it (one call)`) : null,
            h('span', { class: 'sb-gm-title-tools' },
                h('div', { class: 'sb-iconbtn', title: 'Accept', onclick: () => void accept() }, icon('fa-check')),
                h('div', { class: 'sb-iconbtn', title: 'Edit before accepting', onclick: () => startEdit(key, idea.text) }, icon('fa-pen')),
                h('div', { class: 'sb-iconbtn', title: 'Dismiss - it won\'t be proposed again', onclick: () => dismissIdea(chatKey, idea.id) }, icon('fa-xmark')))),
        isEditing(key)
            ? inlineEditor(key, { onSave: (text) => editProposal(chatKey, idea.id, { text }), placeholder: 'The idea' })
            : h('div', { class: 'sb-gm-text' }, idea.text),
        idea.objectives.length ? h('ul', { class: 'sb-gm-threads' }, idea.objectives.map((o) => h('li', {}, o))) : null,
        idea.why ? h('small', { class: 'sb-hint' }, idea.kind === 'seed' ? `Pays off: ${idea.why}` : `Grows out of: ${idea.why}`) : null,
        idea.ties.length ? h('div', { class: 'sb-chips' }, idea.ties.slice(0, 4).map((t) => h('span', { class: 'sb-chip' }, t))) : null);
}

function ideasCard(gm) {
    const { chatId, chatKey, settingId } = ws.ctx;
    const ideas = openIdeas(gm);
    const silent = getSettingDoc(settingId).gm?.creation === 'silent';
    const st = getPlannerStatus();
    const busy = !!st.running && st.chatKey === chatKey;
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-lightbulb'), 'GM ideas', ideas.length ? h('span', { class: 'sb-tab-badge' }, String(ideas.length)) : null,
            h('span', { class: 'sb-gm-title-tools' }, button('Think up ideas', () => void running('Thinking up ideas', () => runIdeas(chatId, chatKey)), { iconName: 'fa-wand-magic-sparkles', disabled: busy, title: 'Look at the frictions, open quests and unused lore for things that could happen' }))),
        h('small', { class: 'sb-hint' }, silent
            ? 'This setting adds ideas at once: new quests appear in Review, happenings on the agenda.'
            : 'New quests, more to open quests, happenings for the calendar and seeds for the outline - grown out of the world\'s frictions and lore. Accept, edit or dismiss each.'),
        ...ideas.map((idea) => ideaRow(idea, chatId, chatKey)),
        !ideas.length ? h('p', { class: 'sb-muted' }, 'No ideas waiting.') : null);
}

function agendaCard(gm, show) {
    const { chatKey } = ws.ctx;
    const today = getChatDoc(chatKey).canonical.day;
    const items = gm.agenda.filter((x) => x.status === 'coming' || x.status === 'planned');
    const past = gm.agenda.filter((x) => x.status === 'done' || x.status === 'passed').slice(-3).reverse();
    const dueText = (x) => (x.day <= today ? 'today' : x.day === today + 1 ? 'tomorrow' : `in ${x.day - today} days`);
    const addKey = 'agenda-add';
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-calendar-days'), 'Agenda',
            h('span', { class: 'sb-gm-title-tools' }, !isEditing(addKey) ? button('Add', () => startEdit(addKey, '', 3), { iconName: 'fa-plus', title: 'Set something to happen on a later day' }) : null)),
        h('small', { class: 'sb-hint' }, 'Happenings set for later days. The day plan brings each in when its day comes; they also show on the Calendar tab.'),
        isEditing(addKey) ? inlineEditor(addKey, {
            onSave: (text, inDays) => addAgendaItem(chatKey, text, Number(inDays) || 0),
            placeholder: 'What should happen - e.g. "an envoy from the Pale Choir arrives at the gate"', saveLabel: 'Add', saveIcon: 'fa-plus',
            extra: field('In how many days', h('input', { type: 'number', class: 'text_pole', min: 0, max: 365, value: editing?.flag ?? 3, onchange: (e) => { if (editing) editing.flag = Math.max(0, Math.round(Number(e.target.value) || 0)); } })),
        }) : null,
        ...items.map((x) => (isVeiled(gm, x.id, show) && x.source !== 'user'
            ? h('div', { class: 'sb-gm-row sb-gm-veiled' }, icon('fa-mask'), h('span', { class: 'sb-muted' }, `Something is set for ${dueText(x)}`),
                h('a', { href: '#', class: 'sb-gm-peek', onclick: (e) => { e.preventDefault(); peek(chatKey, x.id); } }, 'peek'))
            : h('div', { class: 'sb-gm-row' },
                h('span', { class: 'sb-chip' }, icon('fa-calendar-day'), dueText(x)),
                h('div', { class: 'sb-gm-text' }, x.text, x.when ? h('small', { class: 'sb-hint' }, ` (${x.when})`) : null),
                x.status === 'planned' ? h('span', { class: 'sb-chip sb-gm-planned' }, 'planned') : null,
                h('div', { class: 'sb-iconbtn', title: 'Remove', onclick: () => removeAgendaItem(chatKey, x.id) }, icon('fa-trash'))))),
        !items.length ? h('p', { class: 'sb-muted' }, 'Nothing on the agenda.') : null,
        past.length ? h('div', { class: 'sb-gm-sub' }, 'Recently') : null,
        ...past.map((x) => h('div', { class: 'sb-gm-row sb-gm-past' }, h('span', { class: `sb-chip sb-gm-${x.status === 'done' ? 'done' : 'skipped'}` }, x.status === 'done' ? 'happened' : 'passed'), h('div', { class: 'sb-gm-text' }, x.text))));
}

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
            num('outlineEvery', cadence.outline, 'Review outline every (replies)', '0: only on demand'),
            num('ideasEvery', cadence.ideas, 'New ideas every (replies)', '0: only on demand')),
        field('New ideas in this setting', select([{ value: 'proposals', label: 'Wait for me to accept them' }, { value: 'silent', label: 'Add them at once (listed in Review)' }], getSettingDoc(ws.ctx.settingId).gm?.creation ?? 'proposals', {
            onchange: (e) => { setCreationMode(ws.ctx.settingId, e.target.value); rerender(); },
        }), 'Quests, quest detail, happenings and seeds the game master thinks up.'),
        log.length ? h('div', { class: 'sb-gm-sub' }, 'Recent passes') : null,
        ...log.map((l) => h('div', { class: 'sb-gm-row sb-gm-log' },
            h('span', { class: 'sb-chip' }, l.pass), h('span', {}, l.error ? `failed: ${l.error}` : l.outcome),
            h('small', { class: 'sb-hint' }, `${new Date(l.at).toLocaleTimeString()}${l.ms ? ` · ${(l.ms / 1000).toFixed(1)}s` : ''}`))));
}

// The starter post: an opening for the current scene, written from the
// scene, the people here and the outline's beat now. Shown to edit or
// write again; posted to the chat only when the user says so.
function starterCard() {
    const { chatId, chatKey } = ws.ctx;
    const st = ws.starter?.chatKey === chatKey ? ws.starter : (ws.starter = { chatKey, text: '', wish: '', busy: false, as: '' });
    const speakers = starterSpeakers();
    const write = async () => {
        st.busy = true;
        rerender();
        try {
            st.text = await writeStarter(chatId, chatKey, { wish: st.wish });
        } catch (err) {
            toast('error', `Could not write the opening: ${err?.message ?? err}`);
        } finally {
            st.busy = false;
            rerender();
        }
    };
    const post = async () => {
        const as = st.as || speakers[0]?.name || '';
        if (!await confirmAction(`Post this opening to the chat as ${as}?`)) return;
        try {
            await postStarter(st.text, { as });
            toast('success', `Posted as ${as}.`);
            st.text = '';
            rerender();
        } catch (err) {
            toast('error', `Could not post it: ${err?.message ?? err}`);
        }
    };
    const box = h('textarea', { class: 'text_pole', rows: 10, oninput: (e) => { st.text = e.target.value; } });
    box.value = st.text;
    const wish = h('input', { class: 'text_pole', value: st.wish, placeholder: 'Steer it (optional) - e.g. "start mid-argument", "open on the storm"', oninput: (e) => { st.wish = e.target.value; } });
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-feather-pointed'), ' Opening post',
            h('small', { class: 'sb-hint' }, ' - a starter for the current scene, from where it is, who is here and the beat now; never your character\'s actions')),
        wish,
        st.text ? box : null,
        h('div', { class: 'sb-actions' },
            button(st.busy ? 'Writing…' : st.text ? 'Write again' : 'Write the opening', () => void write(), { iconName: st.busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles', cls: st.text ? '' : 'sb-primary', disabled: st.busy }),
            st.text && speakers.length > 1 ? select(speakers.map((s) => ({ value: s.name, label: `as ${s.name}` })), st.as || speakers[0].name, { onchange: (e) => { st.as = e.target.value; } }) : null,
            st.text ? button('Post to chat', () => void post(), { iconName: 'fa-paper-plane', cls: 'sb-primary', disabled: st.busy || !speakers.length, title: speakers.length ? `Posted as ${st.as || speakers[0].name}'s message` : 'No chat is open' }) : null,
            st.text ? button('', () => { st.text = ''; rerender(); }, { iconName: 'fa-xmark', title: 'Discard it' }) : null));
}

export async function renderGmPlan() {
    const { chatKey, settingId } = ws.ctx;
    if (!settingId) return h('div', { class: 'sb-muted' }, 'This chat has no setting yet.');
    const gm = getChatDoc(chatKey).gm;
    const show = getSettings().planner.showSpoilers === true;
    const places = await listEntries(ws.ctx.chatId, settingId, 'location').catch(() => []);
    const people = await listEntries(ws.ctx.chatId, settingId, 'character').catch(() => []);
    const creatures = await listEntries(ws.ctx.chatId, settingId, 'creature').catch(() => []);
    return h('div', { class: 'sb-gm-plan' },
        h('div', { class: 'sb-scene-cols' },
            h('div', { class: 'sb-gm-col' }, outlineCard(gm, show), starterCard(), volumesCard(gm), ideasCard(gm), todayCard(gm, show), agendaCard(gm, show), eventCard(places, [...people, ...creatures]), triggersCard(gm, show, places, people), queueCard(gm), inspirationCard(gm)),
            h('div', { class: 'sb-gm-col' }, paceCard(gm), settingsCard(gm))));
}
