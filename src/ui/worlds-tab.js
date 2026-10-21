// The workspace's Worlds tab: the open world's starting points and
// playthroughs (src/worlds/), and a standard lorebook made from it
// (src/export/). Starting over makes a new copy of the world and a new chat
// on it; nothing here changes a playthrough except deleting it, which asks
// for its name first.

import { getCurrentChatRef } from '../store/chat-ref.js';
import {
    describeFamily, saveStartingPoint, renameStartingPoint, deleteStartingPoint, downloadStartingPoint, downloadWorld,
    loadWorldFile, startOver, deletePlaythrough, openChat, downloadPlaythroughStory, playthroughStoryMarkdown,
} from '../worlds/run.js';
import { makeLorebook } from '../export/run.js';
import { LOREBOOK_TYPES } from '../export/lorebook.js';
import { CHAPTER_LABELS } from '../library/library.js';
import { confirmAction } from './confirm.js';
import { ws, rerender } from './ws.js';
import { h, icon, button, select, toast } from './dom.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '');

// Runs `fn`, showing what failed. -> its result, or undefined.
async function attempt(fn) {
    try {
        return await fn();
    } catch (err) {
        toast('error', err?.message ?? String(err));
        return undefined;
    } finally {
        rerender();
    }
}

export async function renderWorlds() {
    const f = await describeFamily(ws.ctx.settingId);
    const here = f.playthroughs.find((p) => p.setting.id === ws.ctx.settingId);
    const form = ws.worldsForm ?? (ws.worldsForm = { pointName: '', deleting: null, typed: '', saveStory: true, forget: true, files: false, bookFrom: '', bookTypes: new Set(LOREBOOK_TYPES), gmNotes: false });
    return h('div', { class: 'sb-import sb-worlds' },
        h('h3', {}, icon('fa-earth-americas'), ` ${f.familyName}`),
        h('small', { class: 'sb-hint' }, here && here.number > 1
            ? `You are in playthrough ${here.number} of this world. Each playthrough is its own copy of the world: what the story adds or changes in one never reaches another.`
            : 'Each playthrough is its own copy of the world: what the story adds or changes in one never reaches another. Start over from a starting point whenever you like - this playthrough stays as it is.'),
        f.canCopy ? null : h('div', { class: 'sb-callout sb-warn' }, icon('fa-triangle-exclamation'),
            h('span', {}, 'This State Engine cannot copy worlds yet. Update State Engine to save starting points and start over.')),
        startingPointsCard(f, form),
        playthroughsCard(f, form),
        lorebookCard(f, form));
}

// ---- starting points

function startingPointsCard(f, form) {
    const points = f.startingPoints;
    const save = () => attempt(async () => {
        const point = await saveStartingPoint(ws.ctx.settingId, { name: form.pointName });
        form.pointName = '';
        toast('success', `Saved "${point.name}" - ${point.objectCount} entries.`);
    });
    const load = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        void attempt(async () => {
            const setting = await loadWorldFile(await file.text());
            toast('success', `Loaded "${setting.name}" as a world of its own. Switch a chat to it with the world picker at the top.`);
        });
    };
    const row = (p) => h('div', { class: 'sb-row sb-past-import' },
        h('b', {}, p.name), p.auto ? h('span', { class: 'sb-chip' }, 'kept before the story began') : null,
        h('small', { class: 'sb-hint' }, `${when(p.savedAt)} · ${p.objectCount} entries`),
        h('span', { class: 'sb-push sb-actions' },
            button('Start over from here', () => void confirmStartOver(f, p.id, p.name), { iconName: 'fa-rotate-left', cls: 'sb-primary', disabled: !f.canCopy }),
            button('', () => void attempt(() => downloadStartingPoint(p.id)), { iconName: 'fa-download', title: 'Download it as a world file - to keep, or to load in another SillyTavern' }),
            button('', () => {
                const name = window.prompt('Rename the starting point', p.name);
                if (name) void attempt(() => renameStartingPoint(p.id, name));
            }, { iconName: 'fa-heading', title: 'Rename' }),
            button('', async () => {
                if (await confirmAction(`Delete the starting point "${p.name}"? Its file is deleted too. Playthroughs made from it are not touched.`)) void attempt(() => deleteStartingPoint(p.id));
            }, { iconName: 'fa-trash', cls: 'sb-danger', title: 'Delete this starting point' })));
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-flag-checkered'), ' Starting points'),
        points.length ? points.map(row) : h('div', { class: 'sb-callout' }, icon('fa-circle-info'),
            h('span', {}, 'No starting point yet. One called "Original" is kept on its own the first time a world is played from a fresh chat. For a world already played, save one now - or start over with the world minus what the story added.')),
        h('div', { class: 'sb-actions sb-wrap' },
            h('input', { class: 'text_pole', placeholder: 'Name (optional) - e.g. "Before the siege"', value: form.pointName, oninput: (e) => { form.pointName = e.target.value; } }),
            button('Save the world as it is now', () => void save(), { iconName: 'fa-floppy-disk', disabled: !f.canCopy }),
            points.length ? null : button('Start over without the story\'s additions', () => void confirmStartOver(f, 'clean', ''), { iconName: 'fa-broom', disabled: !f.canCopy, title: 'A copy of this world without the entries the story or the director added. Changes the story made to your own entries stay.' })),
        h('div', { class: 'sb-actions sb-wrap' },
            button('Download this world', () => void attempt(() => downloadWorld(ws.ctx.settingId)), { iconName: 'fa-file-arrow-down', disabled: !f.canCopy, title: 'The world as it is now, as a file' }),
            h('label', { class: 'menu_button menu_button_icon sb-button', title: 'Load a world file as a new world of its own' }, icon('fa-file-arrow-up'), h('span', {}, 'Load a world file'),
                h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: load }))));
}

async function confirmStartOver(f, from, name) {
    const ref = getCurrentChatRef();
    const who = ref?.displayName || 'this character';
    const what = from === 'clean'
        ? 'a copy of this world without the entries the story or the director added'
        : `a copy of the world as it was at "${name}"`;
    const ok = await confirmAction(`Start a new playthrough of ${f.familyName}?

Scenario Builder makes ${what}, and opens a new chat with ${who} on it. This playthrough and its chats stay exactly as they are.

When State Engine asks how to start the new chat, choose "Same presets" so the scenario is switched on.`);
    if (!ok) return;
    const out = await attempt(() => startOver(ws.ctx.settingId, { from }));
    if (out?.setting) toast('success', `"${out.setting.name}" has begun${from === 'clean' ? ` - ${out.left} story-made ${out.left === 1 ? 'entry' : 'entries'} left behind` : ''}.`);
}

// ---- playthroughs

function playthroughsCard(f, form) {
    const row = (p) => {
        const current = p.setting.id === ws.ctx.settingId;
        const deleting = form.deleting === p.setting.id;
        const hasStory = !!playthroughStoryMarkdown(p.setting.id, p.setting.name);
        return h('div', { class: 'sb-card sb-playthrough' },
            h('div', { class: 'sb-row' },
                h('b', {}, p.setting.name), current ? h('span', { class: 'sb-chip sb-chip-on' }, 'open now') : null,
                h('small', { class: 'sb-hint' }, `${p.number === 1 ? 'the world it began with' : `playthrough ${p.number}`}${p.record?.createdAt ? ` · begun ${when(p.record.createdAt)}` : ''} · ${p.setting.objectCount} entries`),
                h('span', { class: 'sb-push sb-actions' },
                    button('Save story', () => {
                        if (!downloadPlaythroughStory(p.setting.id, p.setting.name)) toast('info', 'No story to save yet - the GM planner writes it as the story goes.');
                    }, { iconName: 'fa-book-bookmark', disabled: !hasStory, title: 'Every chat\'s volume recaps, and the volume under way, as a Markdown file' }),
                    current || p.setting.isDefault ? null : button('Delete…', () => { form.deleting = deleting ? null : p.setting.id; form.typed = ''; rerender(); }, { iconName: 'fa-trash', cls: 'sb-danger' }))),
            p.chats.length
                ? h('div', { class: 'sb-chips' }, p.chats.map((c) => h('span', { class: 'sb-chip', title: c.kind === 'group' ? 'Group chat' : c.owner },
                    icon(c.kind === 'group' ? 'fa-users' : 'fa-comment'), ` ${c.chatId}`,
                    h('span', { class: 'sb-iconbtn', title: 'Open this chat', onclick: () => void attempt(() => openChat(c.chatKey)) }, icon('fa-arrow-up-right-from-square')))))
                : h('small', { class: 'sb-hint' }, 'No chats on it yet.'),
            deleting ? deletePanel(f, p, form, hasStory) : null);
    };
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-code-branch'), ' Playthroughs'),
        f.playthroughs.map(row));
}

function deletePanel(f, p, form, hasStory) {
    const onlyCopy = f.playthroughs.length === 1 && !f.startingPoints.length;
    const run = () => attempt(async () => {
        if (form.saveStory && hasStory) downloadPlaythroughStory(p.setting.id, p.setting.name);
        const out = await deletePlaythrough(p.setting.id, { forgetMemories: form.forget, deleteChats: form.files });
        form.deleting = null;
        form.typed = '';
        toast('success', `"${p.setting.name}" is deleted: ${out.chats} chat${out.chats === 1 ? '' : 's'} let go${form.forget ? `, ${out.memories} forgotten by Archivist` : ''}${form.files ? `, ${out.files} chat file${out.files === 1 ? '' : 's'} deleted${out.kept ? ` (${out.kept} group chat${out.kept === 1 ? '' : 's'} kept)` : ''}` : ''}.`);
    });
    const option = (key, label, hint, disabled = false) => h('label', { class: 'checkbox_label sb-option', title: hint || null },
        h('input', { type: 'checkbox', checked: form[key] === true, disabled, onchange: (e) => { form[key] = e.target.checked; } }),
        h('span', {}, label, hint ? h('small', { class: 'sb-hint' }, ` - ${hint}`) : null));
    return h('div', { class: 'sb-merge' },
        h('div', { class: 'sb-card-title' }, icon('fa-trash'), `Delete "${p.setting.name}"`),
        onlyCopy ? h('div', { class: 'sb-callout sb-warn' }, icon('fa-triangle-exclamation'),
            h('span', {}, 'This is the only copy of this world and it has no starting point. Deleting it deletes the world you built. Save a starting point first if you may want it again.')) : null,
        h('small', { class: 'sb-hint' }, 'Its world copy and every entry in it, and Scenario Builder\'s scene, clock, deaths, GM plan and review for its chats, are deleted. This cannot be undone.'),
        option('saveStory', 'Save the story so far first', hasStory ? 'downloads it before anything is deleted' : 'there is no story to save yet', !hasStory),
        option('forget', 'Have Archivist forget these chats', window.StateEngineArchivist?.forgetChat ? 'their memories and compiled memory' : 'Archivist is not here, or too old to be asked', !window.StateEngineArchivist?.forgetChat),
        option('files', 'Delete the chat files too', 'solo chats only - group chats stay in their group'),
        h('div', { class: 'sb-actions sb-wrap' },
            h('input', { class: 'text_pole', placeholder: `Type "${p.setting.name}" to confirm`, value: form.typed, oninput: (e) => { form.typed = e.target.value; } }),
            button('Delete playthrough', () => {
                if (form.typed.trim().toLowerCase() !== p.setting.name.toLowerCase()) return toast('info', `Type "${p.setting.name}" first.`);
                void run();
            }, { iconName: 'fa-trash', cls: 'sb-danger' }),
            button('Cancel', () => { form.deleting = null; form.typed = ''; rerender(); }, { iconName: 'fa-xmark' })));
}

// ---- a lorebook for plain SillyTavern

function lorebookCard(f, form) {
    const sources = [{ value: '', label: 'This world as it is now' }, ...f.startingPoints.map((p) => ({ value: p.id, label: `Starting point: ${p.name}` }))];
    const run = () => attempt(async () => {
        const out = await makeLorebook({ settingId: ws.ctx.settingId, pointId: form.bookFrom, options: { types: [...form.bookTypes], gmNotes: form.gmNotes } });
        toast('success', `Made the lorebook "${out.name}" with ${out.entries} entries. Find it in SillyTavern's World Info panel.`);
    });
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-book'), ' A lorebook for plain SillyTavern'),
        h('small', { class: 'sb-hint' }, 'A standard World Info book made from the world: one entry per entry here, keyed by its name and aliases, and the world\'s overview as an always-on entry. It works without Scenario Builder or State Engine. It is always a new book - an existing one is never written over.'),
        h('div', { class: 'sb-actions sb-wrap' },
            select(sources, form.bookFrom, { onchange: (e) => { form.bookFrom = e.target.value; } }),
            LOREBOOK_TYPES.map((type) => h('label', { class: 'checkbox_label' },
                h('input', { type: 'checkbox', checked: form.bookTypes.has(type), onchange: (e) => { if (e.target.checked) form.bookTypes.add(type); else form.bookTypes.delete(type); } }),
                h('span', {}, CHAPTER_LABELS[type] ?? type))),
            h('label', { class: 'checkbox_label', title: 'GM notes are your notes for running the story - left out unless you tick this' },
                h('input', { type: 'checkbox', checked: form.gmNotes, onchange: (e) => { form.gmNotes = e.target.checked; } }), h('span', {}, 'Include GM notes'))),
        h('div', { class: 'sb-actions' }, button('Make the lorebook', () => void run(), { iconName: 'fa-book-medical', cls: 'sb-primary', disabled: !f.canCopy })));
}
