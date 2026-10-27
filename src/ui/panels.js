// The workspace's other tabs: Scene (canonical state next to what the
// story says), Review (what the story added, open questions, candidates),
// History (every change, with undo) and Preview (the exact outputs).

import { getSettings } from '../settings.js';
import { STANCES, STANCE_LABELS, combatOptions } from '../director/combat.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { DAY_PARTS, TEMPERATURES, WEATHER_VALUES } from '../store/schema.js';
import { getObject } from '../api/objects.js';
import { getVariableValues } from '../api/variables.js';
import { listEntries, getParents, getObjectTypes } from '../library/library.js';
import { pathOf } from '../library/hierarchy.js';
import { undoHistoryEntry } from '../state/canonical.js';
import { pushCanonicalToObserved, resolveDrift, promoteCandidate, mergeCandidate, rejectCandidate, forgetRejection, hideRejections, showRejections, dismissAdopted, removeAdopted } from '../validate/reconcile.js';
import { readObserved, FIELD_LABELS, UNKNOWN_PLACE, UNKNOWN_ONE, scrubIds } from '../validate/drift.js';
import { OBSERVED_NAMES } from '../preset/blueprint.js';
import { getPresetStatus } from '../preset/scenario-preset.js';
import { getLastBuild, syncNow } from '../guidance/sync.js';
import { GUIDANCE_PARTS } from '../guidance/build.js';
import { curatorStatus, curatorLine } from './status-model.js';
import { activateForOpenChat } from './activate.js';
import { enrichListed } from '../library/intake.js';
import { getSettingDoc } from '../store/setting-store.js';
import { takeInStoryBloodline, dismissStoryBloodline } from '../library/bloodline-store.js';
import { storyBloodline } from '../library/bloodline-prompts.js';
import { holdStoryWeather, advanceBy } from '../calendar/clock.js';
import { getEnrichmentStatus, cancelEnrichment } from '../generate/enrich.js';
import { openChanges, writeChange, useChange, dismissChange, editChangeDraft } from '../state/changes.js';
import { runDirector, getDirectorStatus } from '../director/run.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';

const ENRICH_LABELS = { queued: ['Detail queued', 'fa-clock'], running: ['Adding detail…', 'fa-spinner fa-spin'], done: ['Detail added', 'fa-wand-magic-sparkles'], failed: ['Detail failed', 'fa-triangle-exclamation'], held: ['Held while editing', 'fa-pause'], off: ['', ''] };

function enrichBadge(a) {
    const [label, iconName] = ENRICH_LABELS[a.enrich] ?? ['', ''];
    return label ? h('span', { class: `sb-badge sb-enrich-${a.enrich}`, title: a.error || label }, icon(iconName), ` ${label}`) : null;
}
import { setScene } from './sheet.js';
import { confirmAction } from './confirm.js';
import { ws, rerender, openSheet, markDirty } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

async function pathLabels(typeId) {
    const { chatId, settingId } = ws.ctx;
    const entries = await listEntries(chatId, settingId, typeId);
    const parents = getParents(settingId);
    const names = new Map(entries.map((e) => [e.id, e.name]));
    return entries.map((e) => ({ value: e.id, label: pathOf(parents, e.id).map((x) => names.get(x)).filter(Boolean).join(' › ') || e.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------- scene

export async function renderScene() {
    const { chatId, chatKey, settingId } = ws.ctx;
    const status = await getPresetStatus(chatId);
    const doc = getChatDoc(chatKey);
    const c = doc.canonical;
    const characters = await listEntries(chatId, settingId, 'character');
    const draft = ws.sceneDraft ?? (ws.sceneDraft = structuredClone(c));
    if (!ws.dirty) Object.assign(draft, structuredClone(c));
    const set = (key, value) => { draft[key] = value; markDirty(); };

    const location = select([{ value: '', label: '(none)' }, ...await pathLabels('location')], draft.locationId, { onchange: (e) => set('locationId', e.target.value) });
    const toggle = (key, value) => (e) => set(key, e.target.checked ? [...new Set([...draft[key], value])] : draft[key].filter((x) => x !== value));

    const clockOn = getSettings().time.enabled && Number.isFinite(c.time);
    const save = async () => {
        ws.dirty = false;
        const patch = { ...draft, day: Math.max(1, Math.round(Number(draft.day) || 1)) };
        if (clockOn) {
            // The clock owns the time; weather set by hand holds a while.
            delete patch.time;
            delete patch.dayPart;
            delete patch.day;
            const changedWeather = JSON.stringify(draft.weather) !== JSON.stringify(c.weather) || draft.temperature !== c.temperature;
            if (changedWeather) await holdStoryWeather(chatKey, settingId, draft.weather, draft.temperature);
        }
        await setScene(patch, 'Edited the scene');
        toast('success', 'Scene saved.');
        rerender();
    };
    const advance = async () => {
        if (clockOn) {
            ws.dirty = false;
            await advanceBy(chatId, chatKey, settingId, '1 hour', { source: 'user', note: 'Advanced the time' });
            await setScene({}, 'Advanced the time');
            rerender();
            return;
        }
        const index = DAY_PARTS.indexOf(c.dayPart);
        const next = index === -1 ? { dayPart: DAY_PARTS[0] } : index === DAY_PARTS.length - 1 ? { dayPart: DAY_PARTS[0], day: c.day + 1 } : { dayPart: DAY_PARTS[index + 1] };
        ws.dirty = false;
        await setScene(next, 'Advanced the time');
        rerender();
    };

    let observedCol = h('div', { class: 'sb-muted' }, 'Activate Scenario State in this chat to see what the story says.');
    if (status.active) {
        const raw = await getVariableValues(chatId, OBSERVED_NAMES);
        const obs = readObserved(raw);
        const nameOf = async (id, unknown) => (id ? (await getObject(chatId, id))?.name ?? unknown : '');
        const one = (id) => nameOf(id, UNKNOWN_ONE);
        const rows = [
            ['Location', await nameOf(obs.location, UNKNOWN_PLACE)],
            ['Characters', (await Promise.all(obs.cast.map(one))).join(', ')],
            ['Creatures', (await Promise.all(obs.creatures.map(one))).join(', ')],
            ['Weather', obs.weather.join(', ')],
            ['Temperature', obs.temperature],
            ['Indoors', obs.indoor === null ? '' : (obs.indoor ? 'yes' : 'no')],
            ['Title', obs.title],
            ...(getSettings().generation.showNsfw === true ? [['Intimate', raw.scene_nsfw === true || raw.scene_nsfw === 'true' ? 'yes' : 'no']] : []),
            ['Time passed', typeof raw.scene_deltatime === 'string' ? raw.scene_deltatime : ''],
        ];
        observedCol = h('dl', { class: 'sb-glance' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v || '—')]));
    }

    return h('div', { class: 'sb-scene' },
        !status.active ? h('div', { class: 'sb-callout sb-warn' }, icon('fa-triangle-exclamation'), h('span', {}, 'Scenario State is not active in this chat, so the guidance is empty. Activate it from the Scenario Builder drawer.')) : null,
        h('div', { class: 'sb-scene-cols' },
            h('div', { class: 'sb-card' },
                h('div', { class: 'sb-card-title' }, 'What is true'),
                field('Location', location),
                h('div', { class: 'sb-field' }, h('span', { class: 'sb-field-label' }, 'Characters present'),
                    characters.length ? h('div', { class: 'sb-checks' }, characters.map((ch) => h('label', { class: 'checkbox_label' },
                        h('input', { type: 'checkbox', checked: draft.castIds.includes(ch.id), onchange: toggle('castIds', ch.id) }), h('span', {}, ch.name))))
                        : h('small', { class: 'sb-hint' }, 'No characters in the library yet.')),
                clockOn
                    ? h('div', { class: 'sb-row' },
                        field('Time', h('span', {}, `${c.dayPart || '—'}, day ${c.day} of the story`), 'Kept by the clock - set it on the Calendar tab.'),
                        button('+1 hour', () => void advance(), { iconName: 'fa-forward' }),
                        button('Calendar', () => { ws.tab = 'calendar'; rerender(); }, { iconName: 'fa-calendar-days' }))
                    : h('div', { class: 'sb-row' },
                        field('Day', h('input', { class: 'text_pole', type: 'number', min: 1, value: draft.day, oninput: (e) => set('day', e.target.value) })),
                        field('Time of day', select([{ value: '', label: '—' }, ...DAY_PARTS.map((p) => ({ value: p, label: p }))], draft.dayPart, { onchange: (e) => set('dayPart', e.target.value) })),
                        button('Advance', () => void advance(), { iconName: 'fa-forward', title: 'Next time of day' })),
                h('div', { class: 'sb-field' }, h('span', { class: 'sb-field-label' }, 'Weather'),
                    h('div', { class: 'sb-checks' }, WEATHER_VALUES.map((w) => h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: draft.weather.includes(w), onchange: toggle('weather', w) }), h('span', {}, w))))),
                h('div', { class: 'sb-row' },
                    field('Temperature', select([{ value: '', label: '—' }, ...TEMPERATURES.map((t) => ({ value: t, label: t }))], draft.temperature, { onchange: (e) => set('temperature', e.target.value) })),
                    field('Indoors / outdoors', select([{ value: '', label: '—' }, { value: 'true', label: 'Indoors' }, { value: 'false', label: 'Outdoors' }], draft.indoor === null ? '' : String(draft.indoor), { onchange: (e) => set('indoor', e.target.value === '' ? null : e.target.value === 'true') }))),
                field('Scene title', h('input', { class: 'text_pole', value: draft.sceneTitle, oninput: (e) => set('sceneTitle', e.target.value) })),
                // Saved at once: not part of the canonical scene.
                getSettings().generation.showNsfw !== true ? null : field('Intimate scene (NSFW)', select([{ value: 'auto', label: 'Auto - as the story reads' }, { value: 'on', label: 'Yes' }, { value: 'off', label: 'No' }], doc.nsfwMode, { onchange: (e) => { updateChatDoc(chatKey, (d) => { d.nsfwMode = e.target.value; }); void syncNow(); } }), 'While it is, the characters\' intimate-scene notes are given to the narrator.'),
                // Who may die in this chat (src/director/combat.js) - saved at once.
                field('Who can die', select([{ value: '', label: `Default - ${STANCE_LABELS[combatOptions(getSettings()).stance].toLowerCase()}` }, ...STANCES.map((x) => ({ value: x, label: STANCE_LABELS[x] }))], doc.combatStance, { onchange: (e) => { updateChatDoc(chatKey, (d) => { d.combatStance = e.target.value; }); void syncNow(); } }),
                    'In this chat. Anyone: the story may kill whoever it will. Allies spared: those fighting on your side are beaten or captured at worst. No named character: only nameless foes and creatures of a kind die. A character\'s own fate (plot device, unkillable, mortal) comes first; your own "Mark dead" always stands.'),
                (() => { const el = h('textarea', { class: 'text_pole', rows: 3, oninput: (e) => set('scenePremise', e.target.value) }); el.value = draft.scenePremise; return field('Scene premise', el, 'What the scene is about: its stakes and tone.'); })(),
                h('div', { class: 'sb-savebar' }, button('Save scene', () => void save(), { iconName: 'fa-floppy-disk', cls: 'sb-primary' }))),
            h('div', { class: 'sb-card' },
                h('div', { class: 'sb-card-title' }, 'What the story says'),
                h('small', { class: 'sb-hint' }, 'Read by State Engine from each reply. When the story moves on, the scene follows it.'),
                observedCol)));
}

// ---------------------------------------------------------------- review

export async function renderReview() {
    const { chatId, chatKey, settingId } = ws.ctx;
    const doc = getChatDoc(chatKey);
    const types = new Map((await getObjectTypes()).map((t) => [t.id, t]));
    const pending = doc.drift.filter((d) => d.status === 'pending');
    const resolved = doc.drift.filter((d) => d.status === 'resolved').slice(-20).reverse();
    const done = () => void syncNow();

    // What the story brought into the world - already in the library.
    const adopted = doc.adopted.map((a) => {
        const t = types.get(a.type);
        return h('div', { class: 'sb-review-item sb-adopted', style: `--sb-accent: ${t?.color ?? '#888'}` },
            h('div', { class: 'sb-row' },
                h('i', { class: `fa-solid ${t?.icon ?? 'fa-star'}` }),
                h('b', {}, a.name),
                h('small', { class: 'sb-hint' }, `new ${a.bloodline ? 'bloodline' : t?.noun ?? 'entry'}${a.placedUnder ? ` · placed in ${a.placedUnder}` : ''}`),
                enrichBadge(a)),
            h('small', { class: 'sb-hint' }, a.bloodline ? 'A kind of being the story brought in - a bloodline now. Check how they look and live here on its sheet.' : 'Confirmed into the setting and now tracked here. Check its details and where it sits.'),
            h('div', { class: 'sb-actions' },
                button('Open sheet', () => openSheet(a.objectId, a.type), { iconName: 'fa-pen', cls: 'sb-primary' }),
                ['off', 'failed', 'held'].includes(a.enrich) ? button('Add detail', () => enrichListed(chatId, chatKey, settingId, a.id), { iconName: 'fa-wand-magic-sparkles', title: a.error || 'Write its empty fields from the setting\'s context' }) : null,
                button('Done', () => dismissAdopted(chatKey, a.id), { iconName: 'fa-check', title: 'Take it off this list' }),
                button('Reject', async () => {
                    if (!await confirmAction(`Reject "${a.name}"? It is removed from the library, and later mentions of it are corrected rather than taken in again.`)) return;
                    await removeAdopted(chatId, chatKey, a.id);
                    done();
                }, { iconName: 'fa-ban', cls: 'sb-danger', title: 'Remove it from the library and keep it out - whether or not it belongs to the world, you do not want it' })));
    });

    const questions = pending.map((d) => h('div', { class: 'sb-review-item' },
        h('div', {}, scrubIds(d.text)),
        h('div', { class: 'sb-actions' },
            button('Go with the story', () => void resolveDrift(chatId, chatKey, d.id, 'accept').then(done), { iconName: 'fa-check', cls: 'sb-primary' }),
            button('Keep it as it was', () => void resolveDrift(chatId, chatKey, d.id, 'keep').then(done), { iconName: 'fa-rotate-left', title: 'Write the canonical value back and correct the next reply' }))));

    const candidates = [];
    for (const c of doc.candidates) {
        const others = c.type ? (await listEntries(chatId, settingId, c.type)).filter((e) => e.id !== c.objectId) : [];
        const mergeSel = select([{ value: '', label: 'It is really…' }, ...others.map((o) => ({ value: o.id, label: o.name }))], '');
        const parentSel = c.type === 'location' ? select([{ value: '', label: '(top level)' }, ...(await pathLabels('location')).filter((o) => o.value !== c.objectId)], doc.canonical.locationId) : null;
        candidates.push(h('div', { class: 'sb-review-item' },
            h('div', {}, h('b', {}, c.name), ` - a new ${c.type || 'object'} the story named (${FIELD_LABELS[c.field] ?? c.field})`),
            parentSel ? field('Inside', parentSel) : null,
            h('div', { class: 'sb-actions' },
                button('Add to library', () => void promoteCandidate(chatId, chatKey, c.id, { parentId: parentSel?.value || null }).then((ok) => { if (!ok) toast('error', 'Could not add it.'); done(); }), { iconName: 'fa-plus', cls: 'sb-primary' }),
                mergeSel,
                button('Merge', () => {
                    if (!mergeSel.value) return toast('info', 'Choose what it really is first.');
                    void mergeCandidate(chatId, chatKey, c.id, mergeSel.value).then((ok) => { if (!ok) toast('error', 'Could not merge it.'); done(); });
                }, { iconName: 'fa-code-merge' }),
                button('Reject', () => void rejectCandidate(chatId, chatKey, c.id).then(done), { iconName: 'fa-ban', cls: 'sb-danger' }))));
    }

    // Kinds of being the story brought into a "these and no others" world
    // (src/library/bloodline-store.js): yours to allow or turn down.
    const heard = settingId ? (getSettingDoc(settingId).bloodlinesHeard ?? []).filter((x) => x.status === 'pending') : [];
    for (const x of heard) {
        const made = storyBloodline(x.word);
        candidates.push(h('div', { class: 'sb-review-item' },
            h('div', {}, icon('fa-dna'), h('b', {}, ` ${made.name}`), ` - the story has ${x.ids.length === 1 ? 'someone' : `${x.ids.length} people`} who ${x.ids.length === 1 ? 'is' : 'are'} ${/^[aeiou]/i.test(x.word) ? 'an' : 'a'} ${x.word}, but this world has only the bloodlines you listed.`),
            h('div', { class: 'sb-actions' },
                button('Add the bloodline', () => void takeInStoryBloodline(chatId, chatKey, settingId, x.word, x.ids).then((id) => { if (!id) toast('error', 'Could not add it.'); done(); rerender(); }), { iconName: 'fa-plus', cls: 'sb-primary', title: 'Make it one of this world\'s bloodlines (rare), with these characters of it' }),
                button('Not in this world', () => { dismissStoryBloodline(settingId, x.word); rerender(); }, { iconName: 'fa-ban', title: 'Never raised again - correct the story by hand if it matters' }))));
    }

    const section = (title, iconName, items, empty) => [h('h3', {}, icon(iconName), ` ${title}`), items.length ? items : h('div', { class: 'sb-muted' }, empty)];
    const status = getEnrichmentStatus();
    const changed = openChanges(doc).map((s) => changeItem(s, types.get(s.type)));
    return h('div', { class: 'sb-review' },
        h('small', { class: 'sb-hint' }, 'New places and characters the story mentions are confirmed in State Engine\'s own object review. Once confirmed, they appear here - tracked, placed, and (if auto-enrich is on) given detail.'),
        status.current || status.queued ? h('div', { class: 'sb-callout' }, icon('fa-spinner fa-spin'),
            h('span', {}, `Adding detail${status.current ? ` to ${status.current.name}` : ''}${status.queued ? ` - ${status.queued} more waiting` : ''}.`),
            status.queued ? button('Stop', () => cancelEnrichment(), { iconName: 'fa-stop' }) : null) : null,
        section('New in the setting', 'fa-seedling', adopted, 'Nothing new. Objects confirmed into the setting while you play land here.'),
        changed.length ? section('Changed in the story', 'fa-hourglass-half', changed, '') : null,
        pending.length ? section('Questions', 'fa-circle-question', questions, '') : null,
        candidates.length ? section('Waiting for you', 'fa-inbox', candidates, '') : null,
        ...rejectedSection(doc, chatKey, section),
        h('h3', {}, icon('fa-list-check'), ' Recently followed'),
        resolved.length ? h('div', { class: 'sb-list' }, resolved.map((d) => h('div', { class: 'sb-log' },
            h('span', { class: `sb-badge sb-badge-${d.classification}` }, d.classification.replace('_', ' ')), ` ${scrubIds(d.text)}`, h('small', { class: 'sb-hint' }, ` - ${d.resolution}`))))
            : h('div', { class: 'sb-muted' }, 'Nothing yet.'));
}

// Something the story changed (src/state/changes.js): what it says happened,
// and its current description written on request - one call - to look over,
// edit and use. The setting's own description stays as it is.
let writingChange = '';
function changeItem(s, type) {
    const { chatId, chatKey, settingId } = ws.ctx;
    const current = getChatDoc(chatKey).narrative[s.objectId]?.text ?? '';
    const write = async () => {
        writingChange = s.id;
        rerender();
        try {
            if (!await writeChange(chatId, chatKey, settingId, s.id)) toast('warning', 'The model\'s answer could not be used - try again.');
        } finally {
            writingChange = '';
            rerender();
        }
    };
    const draft = h('textarea', { class: 'text_pole', rows: 4, oninput: (e) => { editChangeDraft(chatKey, s.id, e.target.value); markDirty(); } });
    draft.value = s.draft;
    return h('div', { class: 'sb-review-item sb-adopted', style: `--sb-accent: ${type?.color ?? '#888'}` },
        h('div', { class: 'sb-row' }, h('i', { class: `fa-solid ${type?.icon ?? 'fa-star'}` }), h('b', {}, s.name),
            h('small', { class: 'sb-hint' }, current ? 'has a current description - update it?' : 'update its description for this story?')),
        h('ul', { class: 'sb-gm-threads' }, s.texts.map((t) => h('li', {}, t))),
        s.draft ? field('How it is now (this chat)', draft, 'Replaces its description in this chat\'s guidance and image prompts. The setting\'s description is not changed.') : null,
        h('div', { class: 'sb-actions' },
            s.draft
                ? button('Use it', async () => { useChange(chatKey, s.id, draft.value); ws.dirty = false; await syncNow(); rerender(); }, { iconName: 'fa-check', cls: 'sb-primary' })
                : button(writingChange === s.id ? 'Writing…' : 'Write how it is now', () => void write(), { iconName: writingChange === s.id ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles', cls: 'sb-primary', disabled: !!writingChange, title: 'One model call: its description, rewritten for what the story did to it' }),
            s.draft ? button('Write again', () => void write(), { iconName: 'fa-rotate', disabled: !!writingChange }) : null,
            button('Open sheet', () => openSheet(s.objectId, s.type), { iconName: 'fa-pen' }),
            button('Not needed', () => { dismissChange(chatKey, s.id); rerender(); }, { iconName: 'fa-xmark', title: 'Take it off the list - the description stays as it is' })));
}

// What the user rejected: kept out of the story for good. Each can be
// allowed again, or taken off the list (it stays rejected) - one at a time
// or all at once; the hidden ones can be shown again.
function rejectedSection(doc, chatKey, section) {
    const shown = doc.rejected.map((r, i) => ({ r, i })).filter(({ r }) => !r.hidden);
    const hidden = doc.rejected.length - shown.length;
    if (!doc.rejected.length) return [];
    const rerun = (fn) => () => { fn(); ws.dirty = false; rerender(); };
    return [
        ...section('Rejected', 'fa-ban', shown.map(({ r, i }) => h('div', { class: 'sb-review-item sb-row' },
            h('span', {}, `${r.name} (${r.type})`),
            button('Allow again', rerun(() => forgetRejection(chatKey, i)), { iconName: 'fa-rotate-left' }),
            h('span', { class: 'sb-iconbtn', title: 'Take it off this list - it stays rejected', onclick: rerun(() => hideRejections(chatKey, i)) }, icon('fa-eye-slash')))),
        'Nothing on the list.'),
        h('div', { class: 'sb-actions' },
            shown.length ? button('Clear the list', rerun(() => hideRejections(chatKey)), { iconName: 'fa-broom', title: 'Take them all off this list. They stay rejected: the story never brings them back.' }) : null,
            hidden ? button(`Show ${hidden} hidden`, rerun(() => showRejections(chatKey)), { iconName: 'fa-eye' }) : null),
    ];
}

// ---------------------------------------------------------------- history

const SOURCE_LABELS = { user: 'You', validation: 'Story', story: 'Story', review: 'Review', revert: 'Revert', clock: 'Clock', director: 'Game master' };
const KEY_LABELS = { locationId: 'Location', castIds: 'Characters', weather: 'Weather', temperature: 'Temperature', indoor: 'Indoors', dayPart: 'Time of day', day: 'Day', sceneTitle: 'Scene', scenePremise: 'Premise' };

export async function renderHistory() {
    const { chatId, chatKey } = ws.ctx;
    const doc = getChatDoc(chatKey);
    const names = new Map();
    const nameOf = async (id) => {
        if (!names.has(id)) names.set(id, (await getObject(chatId, id))?.name ?? '');
        return names.get(id);
    };
    const show = async (key, value) => {
        if (key === 'locationId') return value ? (await nameOf(value)) || UNKNOWN_PLACE : '(none)';
        if (key === 'castIds') return value?.length ? (await Promise.all(value.map(async (id) => (await nameOf(id)) || UNKNOWN_ONE))).join(', ') : '(none)';
        if (key === 'indoor') return value === true ? 'indoors' : (value === false ? 'outdoors' : '(unset)');
        if (Array.isArray(value)) return value.join(', ') || '(none)';
        if (value === null || value === '') return '(unset)';
        return String(value);
    };
    const rows = [];
    for (const entry of [...doc.history].reverse()) {
        const changes = [];
        for (const key of Object.keys(entry.after)) changes.push(`${KEY_LABELS[key] ?? key}: ${await show(key, entry.before[key])} → ${await show(key, entry.after[key])}`);
        rows.push(h('div', { class: `sb-review-item${entry.undone ? ' sb-undone' : ''}` },
            h('div', { class: 'sb-row' },
                h('span', { class: 'sb-badge' }, SOURCE_LABELS[entry.source] ?? entry.source),
                h('span', {}, entry.note || 'Change'),
                h('small', { class: 'sb-hint sb-push' }, new Date(entry.at).toLocaleString())),
            changes.length ? h('small', { class: 'sb-hint' }, changes.join(' · ')) : null,
            !entry.undone && entry.source !== 'revert' && changes.length ? h('div', { class: 'sb-actions' }, button('Undo', async () => {
                undoHistoryEntry(chatKey, entry.id, chatId);
                await pushCanonicalToObserved(chatId, chatKey);
                await syncNow();
            }, { iconName: 'fa-rotate-left' })) : null));
    }
    return h('div', { class: 'sb-history' }, h('h3', {}, 'History'), h('small', { class: 'sb-hint' }, 'Every change to the scene, newest first.'),
        rows.length ? rows : h('div', { class: 'sb-muted' }, 'No changes yet.'));
}

// ---------------------------------------------------------------- preview

export async function renderPreview() {
    const build = getLastBuild();
    const curator = curatorLine(curatorStatus(SillyTavern.getContext().extensionSettings), getSettings().stateBlockEnabled);
    const modeLabel = { full: 'included', compact: 'shortened', dropped: 'dropped (over budget)', off: 'switched off', empty: 'nothing to say' };
    // The game master's briefing: when it was written, what it added, why it failed.
    const director = getSettings().director;
    const running = getDirectorStatus().running;
    const ref = getCurrentChatRef();
    const record = ref ? getChatDoc(chatKeyFor(ref)).director : null;
    const directorLine = !director.enabled ? null : h('small', { class: `sb-hint${record?.error ? ' sb-warn' : ''}` },
        running ? 'The game master is thinking about the next reply…'
            : record?.error ? `The last briefing failed (${record.error}); the previous one is used.`
                : record?.note ? `Briefing written ${new Date(record.at).toLocaleTimeString()}.${record.created?.length ? ` It added: ${record.created.slice(-5).map((c) => c.name).join(', ')}.` : ''}`
                    : 'No briefing yet: the game master writes one before the next reply, or press Rethink.');
    return h('div', { class: 'sb-preview' },
        h('div', { class: 'sb-actions' },
            button('Rebuild now', async () => { await syncNow(); rerender(); }, { iconName: 'fa-arrows-rotate' }),
            director.enabled ? button(running ? 'Thinking…' : 'Rethink the briefing', async () => {
                const ref = getCurrentChatRef();
                if (!ref) return;
                const job = runDirector(ref.chatId, chatKeyFor(ref), { type: 'continue', force: true });
                rerender();
                await job;
                await syncNow();
                rerender();
            }, { iconName: running ? 'fa-spinner fa-spin' : 'fa-chess-knight', disabled: running }) : null),
        h('small', { class: `sb-hint${curator.warn ? ' sb-warn' : ''}` }, curator.text),
        directorLine,
        build.inert ? h('div', { class: 'sb-callout sb-warn' }, icon('fa-circle-info'), h('span', {}, `The outputs are empty: ${build.reason}`),
            /not active|missing/.test(build.reason) ? button('Activate Scenario State', async () => { if (await activateForOpenChat()) { await syncNow(); rerender(); } }, { iconName: 'fa-toggle-on', cls: 'sb-primary' }) : null) : null,
        h('h3', {}, 'Characters present'),
        h('small', { class: 'sb-hint' }, 'sb__cast - its own block, so you can place it above the guidance in Curator.'),
        h('pre', { class: 'sb-pre' }, build.cast || '(empty)'),
        h('h3', {}, `Narrative guidance - ~${build.guidance.tokens} of ${getSettings().tokenBudget} tokens`),
        h('pre', { class: 'sb-pre' }, build.guidance.text || '(empty)'),
        h('h3', {}, 'The same guidance, in parts'),
        h('small', { class: 'sb-hint' }, 'Each part is its own variable too - place them separately in Curator to read and tune them one by one.'),
        GUIDANCE_PARTS.map(([name, header]) => h('details', { class: 'sb-part' },
            h('summary', {}, `sb__${name}`, h('small', { class: 'sb-hint' }, ` - ${header.toLowerCase()}${build.parts?.[name] ? ` (~${Math.ceil(build.parts[name].length / 4)} tokens)` : ' (empty)'}`)),
            h('pre', { class: 'sb-pre' }, build.parts?.[name] || '(empty)'))),
        h('table', { class: 'sb-sections' },
            h('tr', {}, h('th', {}, 'Section'), h('th', {}, 'Status'), h('th', {}, 'Tokens'), h('th', {}, 'Why')),
            build.guidance.sections.map((s) => h('tr', {}, h('td', {}, s.title), h('td', {}, modeLabel[s.mode] ?? s.mode), h('td', {}, String(s.tokens)), h('td', {}, s.why ?? '')))),
        h('h3', {}, 'Canonical scene state'),
        h('pre', { class: 'sb-pre' }, getSettings().stateBlockEnabled ? (build.stateBlock || '(empty)') : '(switched off)'));
}
