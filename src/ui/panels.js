// The workspace's other tabs: Scene (canonical state next to what the
// story says), Review (what the story added, open questions, candidates),
// History (every change, with undo) and Preview (the exact outputs).

import { getSettings } from '../settings.js';
import { getChatDoc } from '../store/chat-store.js';
import { DAY_PARTS, TEMPERATURES, WEATHER_VALUES } from '../store/schema.js';
import { getObject } from '../api/objects.js';
import { getVariableValues } from '../api/variables.js';
import { listEntries, getParents, getObjectTypes } from '../library/library.js';
import { pathOf } from '../library/hierarchy.js';
import { undoHistoryEntry } from '../state/canonical.js';
import { pushCanonicalToObserved, resolveDrift, promoteCandidate, mergeCandidate, rejectCandidate, forgetRejection, dismissAdopted, removeAdopted } from '../validate/reconcile.js';
import { readObserved, FIELD_LABELS } from '../validate/drift.js';
import { OBSERVED_NAMES } from '../preset/blueprint.js';
import { getPresetStatus } from '../preset/scenario-preset.js';
import { getLastBuild, syncNow } from '../guidance/sync.js';
import { GUIDANCE_PARTS } from '../guidance/build.js';
import { curatorStatus, curatorLine } from './status-model.js';
import { activateForOpenChat } from './activate.js';
import { enrichListed } from '../library/intake.js';
import { holdStoryWeather, advanceBy } from '../calendar/clock.js';
import { getEnrichmentStatus, cancelEnrichment } from '../generate/enrich.js';
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
        const nameOf = async (id) => (id ? (await getObject(chatId, id))?.name ?? id : '');
        const rows = [
            ['Location', await nameOf(obs.location)],
            ['Characters', (await Promise.all(obs.cast.map(nameOf))).join(', ')],
            ['Weather', obs.weather.join(', ')],
            ['Temperature', obs.temperature],
            ['Indoors', obs.indoor === null ? '' : (obs.indoor ? 'yes' : 'no')],
            ['Title', obs.title],
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
                h('small', { class: 'sb-hint' }, `new ${t?.noun ?? 'entry'}${a.placedUnder ? ` · placed in ${a.placedUnder}` : ''}`),
                enrichBadge(a)),
            h('small', { class: 'sb-hint' }, 'Confirmed into the setting and now tracked here. Check its details and where it sits.'),
            h('div', { class: 'sb-actions' },
                button('Open sheet', () => openSheet(a.objectId, a.type), { iconName: 'fa-pen', cls: 'sb-primary' }),
                ['off', 'failed', 'held'].includes(a.enrich) ? button('Add detail', () => enrichListed(chatId, chatKey, settingId, a.id), { iconName: 'fa-wand-magic-sparkles', title: a.error || 'Write its empty fields from the setting\'s context' }) : null,
                button('Done', () => dismissAdopted(chatKey, a.id), { iconName: 'fa-check', title: 'Take it off this list' }),
                button('Not part of this world', async () => {
                    if (!await confirmAction(`Remove "${a.name}" from the library? Later mentions of it will be corrected.`)) return;
                    await removeAdopted(chatId, chatKey, a.id);
                    done();
                }, { iconName: 'fa-ban', cls: 'sb-danger' })));
    });

    const questions = pending.map((d) => h('div', { class: 'sb-review-item' },
        h('div', {}, d.text),
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

    const section = (title, iconName, items, empty) => [h('h3', {}, icon(iconName), ` ${title}`), items.length ? items : h('div', { class: 'sb-muted' }, empty)];
    const status = getEnrichmentStatus();
    return h('div', { class: 'sb-review' },
        h('small', { class: 'sb-hint' }, 'New places and characters the story mentions are confirmed in State Engine\'s own object review. Once confirmed, they appear here - tracked, placed, and (if auto-enrich is on) given detail.'),
        status.current || status.queued ? h('div', { class: 'sb-callout' }, icon('fa-spinner fa-spin'),
            h('span', {}, `Adding detail${status.current ? ` to ${status.current.name}` : ''}${status.queued ? ` - ${status.queued} more waiting` : ''}.`),
            status.queued ? button('Stop', () => cancelEnrichment(), { iconName: 'fa-stop' }) : null) : null,
        section('New in the setting', 'fa-seedling', adopted, 'Nothing new. Objects confirmed into the setting while you play land here.'),
        pending.length ? section('Questions', 'fa-circle-question', questions, '') : null,
        candidates.length ? section('Waiting for you', 'fa-inbox', candidates, '') : null,
        doc.rejected.length ? section('Not part of this world', 'fa-ban', doc.rejected.map((r, i) => h('div', { class: 'sb-review-item sb-row' },
            h('span', {}, `${r.name} (${r.type})`), button('Allow again', () => forgetRejection(chatKey, i), { iconName: 'fa-rotate-left' }))), '') : null,
        h('h3', {}, icon('fa-list-check'), ' Recently followed'),
        resolved.length ? h('div', { class: 'sb-list' }, resolved.map((d) => h('div', { class: 'sb-log' },
            h('span', { class: `sb-badge sb-badge-${d.classification}` }, d.classification.replace('_', ' ')), ` ${d.text}`, h('small', { class: 'sb-hint' }, ` - ${d.resolution}`))))
            : h('div', { class: 'sb-muted' }, 'Nothing yet.'));
}

// ---------------------------------------------------------------- history

const SOURCE_LABELS = { user: 'You', validation: 'Story', story: 'Story', review: 'Review', revert: 'Revert', clock: 'Clock', director: 'Game master' };
const KEY_LABELS = { locationId: 'Location', castIds: 'Characters', weather: 'Weather', temperature: 'Temperature', indoor: 'Indoors', dayPart: 'Time of day', day: 'Day', sceneTitle: 'Scene', scenePremise: 'Premise' };

export async function renderHistory() {
    const { chatId, chatKey } = ws.ctx;
    const doc = getChatDoc(chatKey);
    const names = new Map();
    const nameOf = async (id) => {
        if (!names.has(id)) names.set(id, (await getObject(chatId, id))?.name ?? id);
        return names.get(id);
    };
    const show = async (key, value) => {
        if (key === 'locationId') return value ? nameOf(value) : '(none)';
        if (key === 'castIds') return value?.length ? (await Promise.all(value.map(nameOf))).join(', ') : '(none)';
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
