// The GM Plan's Event card: set up an arena, a tournament, a dungeon crawl
// or a programme - by hand, from a template, or written by the model from a
// line of guidance - start it now or on a day of the story, follow it and
// step in (src/events/; docs/DESIGN - STRUCTURED EVENTS.md). The story is
// held to the stage under way through the game master's briefing, so the
// card says so when the game master is switched off.

import { getChatDoc } from '../store/chat-store.js';
import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';
import { newLocalId } from '../store/schema.js';
import { getSettings } from '../settings.js';
import { getParents, playerIdOf } from '../library/library.js';
import { planEvent, startPlannedEvent, discardPlannedEvent, markEventStage, makeRooms, removeComingEvent, startComingNow } from '../events/run.js';
import { currentStage, stageLabel, bouts, rooms, bracketText, roundTitle, roundsFor, KIND_LABEL } from '../events/model.js';
import { emptyForm, emptyRoom, normalizeForm, eventFromForm, formProblem, foeMatcher, addTemplate, readEntrants } from '../events/setup.js';
import { generateEventForm } from '../events/generate.js';
import { syncNow } from '../guidance/sync.js';
import { confirmAction } from './confirm.js';
import { ws, rerender, markDirty, stopEditing } from './ws.js';
import { h, icon, button, select, toast } from './dom.js';

const STATUS_TEXT = Object.freeze({ pending: 'to come', current: 'now', won: 'won', lost: 'lost', done: 'done', skipped: 'skipped' });
const ROOM_STATUS = Object.freeze({ pending: 'not entered', current: 'here now', won: 'cleared', lost: 'lost', done: 'cleared', skipped: 'skipped' });
const RESULT_TEXT = Object.freeze({ won: 'won', lost: 'lost', ended: 'ended early' });
const KIND_OPTIONS = Object.freeze([
    { value: 'arena', label: 'Arena - opponents one after another' },
    { value: 'tournament', label: 'Tournament - a bracket to a grand final' },
    { value: 'crawl', label: 'Dungeon crawl - rooms to clear' },
    { value: 'programme', label: 'Programme - a fixed sequence (a festival, a trial)' },
]);
const KIND_HINT = Object.freeze({
    arena: 'Opponents come out one at a time, each fought until beaten; losing a bout ends it.',
    tournament: 'You and the rivals in a bracket. Each round your match is fought in the story; the other matches are decided off screen by the entrants\' strength and reported. Optionally a wait between rounds on the clock.',
    crawl: 'The rooms are places inside the dungeon. The room the scene is in is the stage: what waits there is fought, a puzzle is watched for by a story trigger. The game master never sees what waits beyond. The final room ends it.',
    programme: 'One stage per line: "bout: Graxx and Ulf", "moment: The feast - the duke speaks", "wait: until noon". A lost bout goes on to the next stage.',
});

const after = async () => {
    stopEditing();
    await syncNow();
    rerender();
};

let generating = false;

export function eventCard(places, foes) {
    const { chatKey } = ws.ctx;
    const doc = getChatDoc(chatKey);
    const event = doc.event;
    const directorOff = getSettings().director.enabled !== true;
    const body = event?.status === 'running' ? runningView(event, chatKey, places)
        : event?.status === 'planned' ? plannedView(event, chatKey, places)
            : setupView(chatKey, places, foes, event);
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-trophy'), 'Event'),
        h('small', { class: 'sb-hint' }, 'A fixed programme the story is held to - an arena, a tournament, a dungeon crawl or a programme. The game master sees only the stage under way and cannot skip, repeat or invent what comes next; Scenario Builder moves it on when the stage is over. No extra model calls while it runs.'),
        directorOff ? h('div', { class: 'sb-callout sb-warn' }, icon('fa-triangle-exclamation'), h('span', {}, 'The game master is switched off: an event needs its briefing to hold the story to the stage, so it waits until it is on.')) : null,
        body,
        comingView(chatKey, doc));
}

// ---- setting one up

function setupView(chatKey, places, foes, last) {
    const { settingId, chatId } = ws.ctx;
    const form = ws.eventForm ?? (ws.eventForm = emptyForm('arena'));
    const set = (key) => (e) => { form[key] = e.target.value; markDirty(); };
    const input = (key, placeholder, rows = 0) => (rows
        ? h('textarea', { class: 'text_pole', rows, placeholder, value: form[key], oninput: set(key) })
        : h('input', { class: 'text_pole', placeholder, value: form[key], oninput: set(key) }));
    const matchFoe = foeMatcher(foes);
    const playerName = () => foes.find((f) => f.id === playerIdOf(settingId, foes))?.name ?? SillyTavern.getContext().name1 ?? '';
    const templates = getSettingDoc(settingId).eventTemplates ?? [];

    const plan = async () => {
        try {
            let f = normalizeForm(form);
            if (f.kind === 'crawl') f = { ...f, rooms: await makeRooms(chatId, settingId, f.placeId, f.rooms.map((r) => ({ ...r, leadsTo: r.leadsTo.split(/\s*,\s*/).filter(Boolean) }))) };
            const event = eventFromForm(f, { matchFoe, playerName: playerName() });
            if (!event) throw new Error(formProblem(f) || 'There is nothing in it to run.');
            const days = parseInt(f.startIn, 10);
            const startDay = Number.isInteger(days) && days > 0 ? getChatDoc(chatKey).canonical.day + days : null;
            planEvent(chatKey, event, { startDay });
            ws.eventForm = null;
            toast('success', startDay ? `${event.name} is on the calendar: it begins by itself in ${days} day${days === 1 ? '' : 's'}.` : `${event.name} is set up - start it when the story gets there.`);
            await after();
        } catch (err) {
            toast('info', err?.message ?? String(err));
        }
    };
    const saveTemplate = () => {
        updateSettingDoc(settingId, (d) => { d.eventTemplates = addTemplate(d.eventTemplates, form, { id: newLocalId('tpl') }); });
        toast('success', `Kept as a template for this world: ${form.name || `a ${KIND_LABEL[form.kind]}`}.`);
        rerender();
    };
    const write = async () => {
        if (generating) return;
        generating = true;
        rerender();
        try {
            const made = await generateEventForm(chatId, settingId, { kind: form.kind, request: ws.eventRequest ?? '', placeId: form.placeId });
            if (!made) throw new Error('The model\'s answer could not be used - try again, or set it up by hand.');
            ws.eventForm = { ...made, startIn: form.startIn };
            toast('success', 'Written - look it over, then set it up.');
        } catch (err) {
            toast('info', err?.message ?? String(err));
        } finally {
            generating = false;
            rerender();
        }
    };
    const pickKind = (kind) => {
        ws.eventForm = { ...normalizeForm(form), kind };
        if (kind === 'crawl' && form.placeId && !form.rooms.length) fillRooms(ws.eventForm, places);
        rerender();
    };
    const problem = formProblem(form);
    return h('div', {},
        last && RESULT_TEXT[last.status] ? h('p', { class: 'sb-muted' }, `${last.name}: ${RESULT_TEXT[last.status]}${resultDetail(last)}.`) : null,
        h('div', { class: 'sb-row' },
            select(KIND_OPTIONS, form.kind, { onchange: (e) => pickKind(e.target.value) }),
            templates.length ? select([{ value: '', label: 'From a template...' }, ...templates.map((t) => ({ value: t.id, label: `${t.name} (${KIND_LABEL[t.form.kind]})` }))], '', {
                onchange: (e) => {
                    const t = templates.find((x) => x.id === e.target.value);
                    if (t) { ws.eventForm = normalizeForm(structuredClone(t.form)); rerender(); }
                },
            }) : null),
        h('small', { class: 'sb-hint' }, KIND_HINT[form.kind]),
        h('div', { class: 'sb-row' },
            h('input', { class: 'text_pole', placeholder: `Write it for me - e.g. ${form.kind === 'tournament' ? 'a jousting tournament in the capital, seven rivals' : form.kind === 'crawl' ? 'a flooded crypt of a drowned cult' : form.kind === 'programme' ? 'the harvest festival: a procession, a wrestling match, a feast' : 'gladiators of rising danger, a beast last'}`, value: ws.eventRequest ?? '', oninput: (e) => { ws.eventRequest = e.target.value; } }),
            button(generating ? 'Writing...' : 'Write it', () => void write(), { iconName: 'fa-wand-magic-sparkles', disabled: generating, title: 'One model call: fills in the form from the setting and your words. You look it over before it is set up.' })),
        h('div', { class: 'sb-row' },
            input('name', `Name - e.g. ${form.kind === 'tournament' ? 'The Midsummer Lists' : form.kind === 'crawl' ? 'The Sunken Crypt' : form.kind === 'programme' ? 'The Harvest Festival' : 'The Pit of Brassport'}`),
            select([{ value: '', label: form.kind === 'crawl' ? 'The dungeon (a place)' : 'Where (optional)' }, ...places.map((p) => ({ value: p.id, label: p.name }))], form.placeId, {
                onchange: (e) => {
                    form.placeId = e.target.value;
                    if (form.kind === 'crawl') { fillRooms(form, places); rerender(); }
                },
            })),
        kindFields(form, foes, places, input),
        form.kind !== 'programme' ? input('intro', form.kind === 'crawl' ? 'The way in (optional) - what the party sees as they enter' : 'The opening (optional) - e.g. the herald presents the challenger to a jeering crowd', 2) : null,
        form.kind !== 'programme' ? input('close', form.kind === 'crawl' ? 'The end (optional) - what happens when the last room is cleared' : 'The close (optional) - what happens when it is won', 2) : null,
        input('prize', 'The prize (optional) - e.g. freedom, and a purse of gold'),
        h('div', { class: 'sb-row' },
            h('span', { class: 'sb-muted' }, 'Begins'),
            select([{ value: '', label: 'when I start it' }, ...[1, 2, 3, 5, 7, 10, 14, 21, 30].map((n) => ({ value: String(n), label: `by itself in ${n} day${n === 1 ? '' : 's'}` }))], form.startIn, { onchange: (e) => { form.startIn = e.target.value; } })),
        problem && (form.opponents || form.entrants || form.steps || form.rooms.length) ? h('small', { class: 'sb-hint' }, problem) : null,
        h('div', { class: 'sb-actions sb-wrap' },
            button(`Set up the ${KIND_LABEL[form.kind]}`, () => void plan(), { iconName: 'fa-trophy', cls: 'sb-primary', disabled: !!problem }),
            button('Keep as a template', saveTemplate, { iconName: 'fa-bookmark', disabled: !!problem, title: 'Kept with this world, to set up again in any of its chats' }),
            templates.length ? button('Templates...', () => { ws.eventTemplatesOpen = !ws.eventTemplatesOpen; rerender(); }, { iconName: 'fa-list' }) : null),
        ws.eventTemplatesOpen ? templateList(settingId, templates) : null);
}

function resultDetail(e) {
    if (e.kind === 'crawl') return ` (${rooms(e).filter((r) => r.status === 'won' || r.status === 'done').length} of ${rooms(e).length} rooms cleared)`;
    if (e.kind === 'tournament') return bracketText(e) ? ` - ${bracketText(e)}` : '';
    return ` (${bouts(e).filter((b) => b.status === 'won').length} of ${bouts(e).length} bouts won)`;
}

// A crawl's rooms from the dungeon's own places (kept where already set).
function fillRooms(form, places) {
    const parents = getParents(ws.ctx.settingId);
    const inside = places.filter((p) => parents[p.id] === form.placeId);
    const have = new Set(form.rooms.map((r) => r.placeId).filter(Boolean));
    form.rooms = [...form.rooms.filter((r) => r.placeId ? inside.some((p) => p.id === r.placeId) : r.name), ...inside.filter((p) => !have.has(p.id)).map((p) => ({ ...emptyRoom(), placeId: p.id, name: p.name }))];
    markDirty();
}

function kindFields(form, foes, places, input) {
    if (form.kind === 'tournament') {
        const read = readEntrants(form.entrants, foeMatcher(foes));
        return h('div', {},
            input('entrants', 'Rival entrants - one per line, with how hard they are to beat: "Graxx | strong" (minor, standard, strong, deadly)', 5),
            read.length ? h('small', { class: 'sb-hint' }, `${read.length + 1} entrants with you: ${roundsFor(read.length + 1)} rounds. ${read.filter((r) => r.objectId).length} found in the library.`) : null,
            input('between', 'Between rounds (optional) - e.g. two hours, the next morning'));
    }
    if (form.kind === 'programme') return input('steps', 'One stage per line:\nmoment: The procession - the bishop leads the relics through the square\nbout: Graxx - the champion of the north\nwait: until noon\nmoment: The feast', 7);
    if (form.kind === 'crawl') return roomsEditor(form);
    const n = String(form.opponents).split('\n').filter((l) => l.trim()).length;
    const known = String(form.opponents).split('\n').filter((l) => l.trim() && foeMatcher(foes)(l.trim()).objectId).length;
    return h('div', {},
        input('opponents', 'Opponents, in order - one per line (a character or creature from the library, or anyone)', 4),
        n ? h('small', { class: 'sb-hint' }, `${known} of ${n} found in the library; the rest are fought by name.`) : null);
}

function roomsEditor(form) {
    const row = (r, i) => {
        const set = (key) => (e) => { r[key] = e.target.value; markDirty(); };
        return h('div', { class: 'sb-gm-row' },
            h('div', { class: 'sb-gm-text' },
                h('div', { class: 'sb-row' },
                    h('b', {}, `${i + 1}.`),
                    h('input', { class: 'text_pole', placeholder: 'Room name', value: r.name, oninput: set('name'), disabled: !!r.placeId, title: r.placeId ? 'A place in the library' : 'Made as a place inside the dungeon when it is set up' }),
                    h('label', { class: 'checkbox_label', title: 'Clearing this room ends the crawl' }, h('input', { type: 'checkbox', checked: r.final, onchange: (e) => { r.final = e.target.checked; markDirty(); } }), h('span', {}, 'final'))),
                h('input', { class: 'text_pole', placeholder: 'What waits here - foes, comma-separated ("3 ghouls, the Warden"), or leave empty', value: r.threats, oninput: set('threats') }),
                h('input', { class: 'text_pole', placeholder: 'What it is like (optional)', value: r.note, oninput: set('note') }),
                h('div', { class: 'sb-row' },
                    h('input', { class: 'text_pole', placeholder: 'Treasure (optional)', value: r.loot, oninput: set('loot') }),
                    h('input', { class: 'text_pole', placeholder: 'Puzzle or trap: cleared when... (optional)', value: r.clearWhen, oninput: set('clearWhen') })),
                r.placeId ? null : h('input', { class: 'text_pole', placeholder: 'Leads to (other rooms\' names, comma-separated; empty: the next in the list)', value: r.leadsTo, oninput: set('leadsTo') })),
            h('div', { class: 'sb-chips' }, button('', () => { form.rooms.splice(i, 1); rerender(); }, { iconName: 'fa-xmark', title: 'Leave this room out' })));
    };
    return h('div', {},
        form.placeId ? null : h('small', { class: 'sb-hint' }, 'Pick the dungeon above: its places become the rooms. Rooms you add by name are made inside it.'),
        ...form.rooms.map(row),
        h('div', { class: 'sb-actions' }, button('Add a room', () => { form.rooms.push(emptyRoom()); rerender(); }, { iconName: 'fa-plus' })),
        form.rooms.length ? h('small', { class: 'sb-hint' }, 'The first room is the way in. The ways between rooms are the setting\'s routes; rooms with none lead to the ones before and after them.') : null);
}

function templateList(settingId, templates) {
    return h('div', {}, templates.map((t) => h('div', { class: 'sb-gm-row' },
        h('div', { class: 'sb-gm-text' }, h('b', {}, t.name), ` - a ${KIND_LABEL[t.form.kind]}`),
        h('div', { class: 'sb-chips' },
            button('Use', () => { ws.eventForm = normalizeForm(structuredClone(t.form)); ws.eventTemplatesOpen = false; rerender(); }, { iconName: 'fa-file-import' }),
            button('', async () => {
                if (!await confirmAction(`Delete the template "${t.name}"?`)) return;
                updateSettingDoc(settingId, (d) => { d.eventTemplates = d.eventTemplates.filter((x) => x.id !== t.id); });
                rerender();
            }, { iconName: 'fa-trash', cls: 'sb-danger', title: 'Delete the template' })))));
}

// ---- following it

function stageText(event, s) {
    if (s.kind === 'bout' && s.round) return [`${roundTitle(s.round, roundsFor(event.bracket?.entrants.length ?? 2))}: `, s.opponents.length ? `against ${s.opponents.map((o) => o.name).join(' and ')}` : 'drawn when it comes'];
    if (s.kind === 'bout') return [`Bout ${bouts(event).indexOf(s) + 1}: `, s.opponents.map((o) => o.name).join(' and ')];
    if (s.kind === 'room') {
        const bits = [s.opponents.length ? s.opponents.map((o) => o.name).join(', ') : 'nothing to fight', s.clearWhen ? `puzzle: ${s.clearWhen}${s.solved ? ' (solved)' : ''}` : '', s.loot ? `treasure: ${s.loot}${s.looted ? ' (taken)' : ''}` : '', s.final ? 'final' : '', s.visited && s.status === 'pending' ? 'left with something still in it' : ''];
        return [`${s.title}: `, bits.filter(Boolean).join(' · ')];
    }
    if (s.kind === 'wait') return [`${s.title}: `, `until ${s.waitFor}`];
    return [`${s.title}: `, s.note || ''];
}

function stageList(event) {
    const statusText = event.kind === 'crawl' ? ROOM_STATUS : STATUS_TEXT;
    return h('div', {}, event.stages.map((s, i) => {
        const [head, rest] = stageText(event, s);
        return h('div', { class: `sb-gm-row${s.status === 'current' || s.status === 'pending' ? '' : ' sb-gm-past'}` },
            h('div', { class: 'sb-gm-text' }, h('b', {}, head), rest),
            h('div', { class: 'sb-chips' }, h('span', { class: `sb-chip${i === event.current && s.status === 'current' ? ' sb-chip-on' : ''}` }, statusText[s.status] ?? s.status)));
    }));
}

function plannedView(event, chatKey, places) {
    const where = places.find((p) => p.id === event.placeId)?.name;
    return h('div', {},
        h('p', {}, h('b', {}, event.name), ` - a ${KIND_LABEL[event.kind]}`, where ? ` at ${where}` : '', event.prize ? ` - prize: ${event.prize}` : ''),
        event.kind === 'tournament' ? h('small', { class: 'sb-hint' }, `${event.bracket.entrants.length} entrants: ${event.bracket.entrants.map((x) => `${x.name}${x.player ? '' : ` (${x.strength})`}`).join(', ')}.`) : null,
        stageList(event),
        h('div', { class: 'sb-actions' },
            button('Start it', async () => {
                startPlannedEvent(chatKey);
                toast('success', event.kind === 'crawl' ? `${event.name} begins: it follows the scene into its rooms.` : `${event.name} begins with the next reply.`);
                await after();
            }, { iconName: 'fa-play', cls: 'sb-primary', title: event.kind === 'crawl' ? 'The crawl runs while the scene is in one of its rooms' : 'The opening plays in the next reply' }),
            button('Discard', async () => { discardPlannedEvent(chatKey); await after(); }, { iconName: 'fa-trash', cls: 'sb-danger' })));
}

function runningView(event, chatKey) {
    const s = currentStage(event);
    const mark = (action, question) => async () => {
        if (question && !await confirmAction(question)) return;
        markEventStage(chatKey, action);
        await after();
    };
    const fought = s && (s.kind === 'bout' || (s.kind === 'room' && s.opponents.length));
    const foesNamed = s?.opponents.map((o) => o.name).join(' and ');
    return h('div', {},
        h('p', {}, h('b', {}, event.name), ` - now: ${stageLabel(event)}${s && s.status !== 'current' && event.kind !== 'crawl' ? ` (${STATUS_TEXT[s.status]}; the next stage begins with the next reply)` : ''}`),
        event.kind === 'tournament' && bracketText(event) ? h('small', { class: 'sb-hint' }, bracketText(event)) : null,
        stageList(event),
        s?.status === 'current' ? h('div', { class: 'sb-actions sb-wrap' },
            button(fought ? 'Won' : s.kind === 'room' ? 'Cleared' : 'Done', mark('won'), { iconName: 'fa-check', title: fought ? 'The player won this - the next stage begins with the next reply' : 'Move on' }),
            fought ? button('Lost', mark('lost', `The player lost against ${foesNamed}? ${event.onLoss === 'ends' ? `That ends the ${KIND_LABEL[event.kind]}.` : ''}`), { iconName: 'fa-xmark' }) : null,
            button('Skip', mark('skip'), { iconName: 'fa-forward', title: 'Leave this stage out' })) : null,
        h('div', { class: 'sb-actions' }, button('End the event', mark('end', `End ${event.name} now? What is left of it is skipped.`), { iconName: 'fa-flag-checkered', cls: 'sb-danger' })));
}

// Events waiting for their day on the calendar.
function comingView(chatKey, doc) {
    if (!doc.eventsComing.length) return null;
    const today = doc.canonical.day;
    return h('div', {},
        h('div', { class: 'sb-gm-sub' }, 'On the calendar'),
        ...doc.eventsComing.map((e) => h('div', { class: 'sb-gm-row' },
            h('div', { class: 'sb-gm-text' }, h('b', {}, e.name), ` - a ${KIND_LABEL[e.kind]}, `, e.startDay <= today ? 'begins as soon as nothing else is under way' : `begins on day ${e.startDay} (in ${e.startDay - today} day${e.startDay - today === 1 ? '' : 's'})`),
            h('div', { class: 'sb-chips' },
                button('', async () => {
                    try {
                        startComingNow(chatKey, e.id);
                        await after();
                    } catch (err) {
                        toast('info', err?.message ?? String(err));
                    }
                }, { iconName: 'fa-play', title: 'Begin it now' }),
                button('', async () => {
                    if (!await confirmAction(`Take ${e.name} off the calendar?`)) return;
                    removeComingEvent(chatKey, e.id);
                    await after();
                }, { iconName: 'fa-trash', cls: 'sb-danger', title: 'Take it off the calendar' })))));
}
