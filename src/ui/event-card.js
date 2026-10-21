// The GM Plan's Event card: set up an arena, start it, follow it and step
// in (src/events/; docs/DESIGN - STRUCTURED EVENTS.md). The story is held
// to the stage under way through the game master's briefing, so the card
// says so when the game master is switched off.

import { getChatDoc } from '../store/chat-store.js';
import { getSettings } from '../settings.js';
import { planArena, startPlannedEvent, discardPlannedEvent, markEventStage } from '../events/run.js';
import { currentStage, stageLabel, bouts } from '../events/model.js';
import { syncNow } from '../guidance/sync.js';
import { confirmAction } from './confirm.js';
import { ws, rerender, markDirty, stopEditing } from './ws.js';
import { h, icon, button, select, toast } from './dom.js';

const STATUS_TEXT = Object.freeze({ pending: 'to come', current: 'now', won: 'won', lost: 'lost', done: 'done', skipped: 'skipped' });
const RESULT_TEXT = Object.freeze({ won: 'won', lost: 'lost', ended: 'ended early' });

const lower = (s) => String(s ?? '').trim().toLowerCase();

// Each line of the opponents box, matched to a library character or
// creature by name or alias when there is one.
function readOpponents(text, foes) {
    return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((name) => {
        const found = foes.find((f) => [f.name, ...(f.aliases ?? [])].some((n) => lower(n) === lower(name)));
        return { name: found?.name ?? name, objectId: found?.id ?? '' };
    });
}

const after = async () => {
    stopEditing();
    await syncNow();
    rerender();
};

export function eventCard(places, foes) {
    const { chatKey } = ws.ctx;
    const doc = getChatDoc(chatKey);
    const event = doc.event;
    const directorOff = getSettings().director.enabled !== true;
    const body = event?.status === 'running' ? runningView(event, chatKey)
        : event?.status === 'planned' ? plannedView(event, chatKey, places)
            : setupView(chatKey, places, foes, event);
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-trophy'), 'Event'),
        h('small', { class: 'sb-hint' }, 'A fixed programme the story is held to - an arena: opponents one after another, each fought until beaten. The game master sees only the stage under way and cannot skip, repeat or invent the next opponent; Scenario Builder moves it on when the fight ends. No extra model calls.'),
        directorOff ? h('div', { class: 'sb-callout sb-warn' }, icon('fa-triangle-exclamation'), h('span', {}, 'The game master is switched off: an event needs its briefing to hold the story to the stage, so it waits until it is on.')) : null,
        body);
}

function setupView(chatKey, places, foes, last) {
    const form = ws.eventForm ?? (ws.eventForm = { name: '', placeId: '', opponents: '', intro: '', close: '', prize: '' });
    const input = (key, placeholder, rows = 0) => (rows
        ? h('textarea', { class: 'text_pole', rows, placeholder, value: form[key], oninput: (e) => { form[key] = e.target.value; markDirty(); } })
        : h('input', { class: 'text_pole', placeholder, value: form[key], oninput: (e) => { form[key] = e.target.value; markDirty(); } }));
    const plan = async () => {
        try {
            planArena(chatKey, { ...form, opponents: readOpponents(form.opponents, foes) });
            ws.eventForm = null;
            toast('success', 'The arena is set up - start it when the story gets there.');
            await after();
        } catch (err) {
            toast('info', err?.message ?? String(err));
        }
    };
    const known = readOpponents(form.opponents, foes).filter((o) => o.objectId).length;
    return h('div', {},
        last && RESULT_TEXT[last.status] ? h('p', { class: 'sb-muted' }, `${last.name}: ${RESULT_TEXT[last.status]} (${bouts(last).filter((b) => b.status === 'won').length} of ${bouts(last).length} bouts won).`) : null,
        h('div', { class: 'sb-row' },
            input('name', 'Name - e.g. The Pit of Brassport'),
            select([{ value: '', label: 'Where (optional)' }, ...places.map((p) => ({ value: p.id, label: p.name }))], form.placeId, { onchange: (e) => { form.placeId = e.target.value; } })),
        input('opponents', 'Opponents, in order - one per line (a character or creature from the library, or anyone)', 4),
        form.opponents.trim() ? h('small', { class: 'sb-hint' }, `${known} of ${readOpponents(form.opponents, foes).length} found in the library; the rest are fought by name.`) : null,
        input('intro', 'The opening (optional) - e.g. the herald presents the challenger to a jeering crowd', 2),
        input('close', 'The close (optional) - what happens when the last opponent falls', 2),
        input('prize', 'The prize (optional) - e.g. freedom, and a purse of gold'),
        h('div', { class: 'sb-actions' }, button('Set up the arena', () => void plan(), { iconName: 'fa-trophy', cls: 'sb-primary', disabled: !form.opponents.trim() })));
}

function stageList(event) {
    return h('div', {}, event.stages.map((s, i) => h('div', { class: `sb-gm-row${s.status === 'current' || s.status === 'pending' ? '' : ' sb-gm-past'}` },
        h('div', { class: 'sb-gm-text' },
            h('b', {}, s.kind === 'bout' ? `Bout ${bouts(event).indexOf(s) + 1}: ` : `${s.title}: `),
            s.kind === 'bout' ? s.opponents.map((o) => o.name).join(' and ') : (s.note || '')),
        h('div', { class: 'sb-chips' }, h('span', { class: `sb-chip${i === event.current && s.status === 'current' ? ' sb-chip-on' : ''}` }, STATUS_TEXT[s.status] ?? s.status)))));
}

function plannedView(event, chatKey, places) {
    const where = places.find((p) => p.id === event.placeId)?.name;
    return h('div', {},
        h('p', {}, h('b', {}, event.name), where ? ` - at ${where}` : '', event.prize ? ` - prize: ${event.prize}` : ''),
        stageList(event),
        h('div', { class: 'sb-actions' },
            button('Start it', async () => {
                startPlannedEvent(chatKey);
                toast('success', `${event.name} begins with the next reply.`);
                await after();
            }, { iconName: 'fa-play', cls: 'sb-primary', title: 'The opening plays in the next reply' }),
            button('Discard', async () => { discardPlannedEvent(chatKey); await after(); }, { iconName: 'fa-trash', cls: 'sb-danger' })));
}

function runningView(event, chatKey) {
    const s = currentStage(event);
    const mark = (action, question) => async () => {
        if (question && !await confirmAction(question)) return;
        markEventStage(chatKey, action);
        await after();
    };
    return h('div', {},
        h('p', {}, h('b', {}, event.name), ` - now: ${stageLabel(event)}${s.status !== 'current' ? ` (${STATUS_TEXT[s.status]}; the next stage begins with the next reply)` : ''}`),
        stageList(event),
        s.status === 'current' ? h('div', { class: 'sb-actions sb-wrap' },
            button(s.kind === 'bout' ? 'Won' : 'Done', mark('won'), { iconName: 'fa-check', title: s.kind === 'bout' ? 'The player won this bout - the next stage begins with the next reply' : 'Move on to the next stage' }),
            s.kind === 'bout' ? button('Lost', mark('lost', `The player lost the bout against ${s.opponents.map((o) => o.name).join(' and ')}? ${event.onLoss === 'ends' ? 'That ends the arena.' : ''}`), { iconName: 'fa-xmark' }) : null,
            button('Skip', mark('skip'), { iconName: 'fa-forward', title: 'Leave this stage out' })) : null,
        h('div', { class: 'sb-actions' }, button('End the event', mark('end', `End ${event.name} now? What is left of it is skipped.`), { iconName: 'fa-flag-checkered', cls: 'sb-danger' })));
}
