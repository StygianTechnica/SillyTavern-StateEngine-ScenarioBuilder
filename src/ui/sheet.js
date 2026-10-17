// An entry's sheet: a header (portrait, name, type, where it is, tags,
// status in this chat) and tabs - Overview, Details, Relationships, Story,
// Image, GM notes. It opens in READ mode, like a page of a setting book;
// Edit switches every tab to inputs, backed by one draft so moving between
// tabs keeps what was typed. Saving writes the object through State
// Engine's Object API and the rest through Scenario Builder's stores.

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc } from '../store/chat-store.js';
import { getObjectTypes, CHAPTER_LABELS, findSimilar, createEntry, updateEntry, setEntryMeta, getParents, setParent, findReferrers, deleteEntry, getOverview, playerIdOf, setPlayerId, listEntries } from '../library/library.js';
import { pathOf, descendantsOf, inheritedEnvironment } from '../library/hierarchy.js';
import { relationsOf } from '../library/relations.js';
import { getSettingDoc } from '../store/setting-store.js';
import { setCanonical } from '../state/canonical.js';
import { setNarrative, revertNarrative } from '../state/narrative.js';
import { pushCanonicalToObserved, holdUserScene } from '../validate/reconcile.js';
import { syncNow } from '../guidance/sync.js';
import { getSettings } from '../settings.js';
import { runDirector } from '../director/run.js';
import { safeImageSrc } from '../images/attach.js';
import { entityHistory, chatStatusOf, STATUS_LABELS } from './catalog-model.js';
import { renderImagePanel } from './image-panel.js';
import { renderQuestTab } from './quest-board.js';
import { baselineFields } from '../library/fields.js';
import { CLIMATES } from '../calendar/weather.js';
import { listRoutes, routesFrom, addRoute, removeRoute, updateRoute, guessRoute } from '../library/routes.js';
import { suggestRoutes, suggestEnvironment, randomClimate } from '../generate/places.js';
import { hasArchivist, storyRelationships } from '../library/story-relations.js';
import { removeLink, addLink, listRelations, addRelation, removeRelation, relationsFor, pairCovered, RELATION_KINDS, MUTUAL_KINDS } from '../library/relations-edit.js';
import { sparkButton, fieldWithTools } from './controls.js';
import { generateEntry, canGenerateFor } from '../generate/run.js';
import { splitAliases, mergeAliases } from '../generate/prompt.js';
import { confirmAction } from './confirm.js';
import { ws, rerender, openSheet, closeSheet, markDirty, stopEditing } from './ws.js';
import { h, icon, button, select, field, csv, fromCsv, toast } from './dom.js';

const SHEET_TABS = Object.freeze([
    ['overview', 'Overview', 'fa-feather'],
    ['details', 'Details', 'fa-list-ul'],
    ['relations', 'Relationships', 'fa-diagram-project'],
    ['story', 'Story', 'fa-book-open-reader'],
    ['image', 'Image', 'fa-image'],
    ['gm', 'GM notes', 'fa-user-secret'],
    ['quest', 'Quest', 'fa-scroll'],
]);

// ---- fields

export async function fieldDefs(type) {
    return baselineFields(ws.ctx.settingId, type);
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

// ---- the draft (edit mode)

function startDraft(entry, defs) {
    const base = entry.base ?? entry;
    const doc = getChatDoc(ws.ctx.chatKey);
    ws.draft = {
        name: base.name ?? entry.name ?? '',
        aliases: [...(base.aliases ?? entry.aliases ?? [])],
        description: base.description ?? '',
        narrative: entry.id ? doc.narrative[entry.id]?.text ?? '' : '',
        fields: Object.fromEntries(defs.map((d) => [d.name, structuredClone(base[d.name] ?? entry[d.name] ?? null)])),
        meta: {
            tags: [...(entry.meta?.tags ?? [])],
            pinned: entry.meta?.pinned === true,
            canonLocked: entry.meta?.canonLocked === true,
            gmNotes: entry.meta?.gmNotes ?? '',
            parentId: entry.meta?.parentId ?? ws.newParent ?? '',
            environment: { climate: '', lighting: '', rules: '', ...(entry.meta?.environment ?? {}) },
            climate: entry.meta?.climate ?? '',
            sky: entry.meta?.sky ?? '',
        },
    };
    ws.draftFor = entry.id ?? 'new';
    ws.newParent = null;
    ws.generatedFields = new Set();
    // A generated new entry (catalog "Generate") arrives as a prefill.
    if (!entry.id && ws.prefill) {
        const { values, parentId } = ws.prefill;
        applyGenerated(values, 'create');
        if (parentId) {
            if (entry.type === 'location') ws.draft.meta.parentId = parentId;
            else if ('location' in ws.draft.fields && !ws.draft.fields.location) ws.draft.fields.location = parentId;
        }
        ws.prefill = null;
        ws.dirty = true;
    }
}

// Puts generated values into the draft. 'fill' never replaces content;
// the other tasks replace (an enriched field already holds what was there).
function applyGenerated(values, task) {
    const d = ws.draft;
    const take = (current) => task !== 'fill' || isEmpty(current);
    for (const [key, value] of Object.entries(values)) {
        if (key === 'name') { if (take(d.name)) { d.name = value; ws.generatedFields.add('name'); } continue; }
        if (key === 'description') { if (take(d.description)) { d.description = value; ws.generatedFields.add(key); } continue; }
        if (key === 'aliases') { if (take(d.aliases)) { d.aliases = mergeAliases(d.aliases, value); ws.generatedFields.add(key); } continue; }
        if (key === 'relations') { d.pendingRelations = value; continue; }
        if (key in d.fields && take(d.fields[key])) { d.fields[key] = value; ws.generatedFields.add(key); }
    }
}

const set = (path, value) => {
    let target = ws.draft;
    const keys = path.split('.');
    for (const key of keys.slice(0, -1)) target = target[key];
    target[keys[keys.length - 1]] = value;
    markDirty();
};

function textInput(path, value, attrs = {}) {
    return h('input', { class: 'text_pole', value: value ?? '', oninput: (e) => set(path, e.target.value), ...attrs });
}

function textArea(path, value, rows = 3, attrs = {}) {
    const el = h('textarea', { class: 'text_pole', rows, oninput: (e) => set(path, e.target.value), ...attrs });
    el.value = value ?? '';
    return el;
}

function fieldControl(def, all) {
    const path = `fields.${def.name}`;
    const value = ws.draft.fields[def.name];
    const options = (typeId) => (all[typeId] ?? []).map((o) => ({ value: o.id, label: o.name }));
    switch (def.kind) {
        case 'longtext': return textArea(path, value, 3);
        case 'list': return h('input', { class: 'text_pole', value: csv(value), placeholder: 'comma-separated', oninput: (e) => set(path, fromCsv(e.target.value)) });
        case 'number': return h('input', { class: 'text_pole', type: 'number', value: value ?? '', oninput: (e) => set(path, e.target.value === '' ? null : Number(e.target.value)) });
        case 'boolean': return h('input', { type: 'checkbox', checked: value === true, onchange: (e) => set(path, e.target.checked) });
        case 'enum': return select([{ value: '', label: '—' }, ...def.values.map((v) => ({ value: v, label: v }))], value, { onchange: (e) => set(path, e.target.value) });
        case 'ref': return select([{ value: '', label: '—' }, ...options(def.refType)], value, { onchange: (e) => set(path, e.target.value) });
        case 'refs': {
            const chosen = new Set(Array.isArray(value) ? value : []);
            return h('div', { class: 'sb-checks sb-refs' }, options(def.refType).map((o) => h('label', { class: 'checkbox_label' },
                h('input', { type: 'checkbox', checked: chosen.has(o.value), onchange: (e) => { if (e.target.checked) chosen.add(o.value); else chosen.delete(o.value); set(path, [...chosen]); } }),
                h('span', {}, o.label))), !options(def.refType).length ? h('small', { class: 'sb-hint' }, 'Nothing to choose yet.') : null);
        }
        default: return textInput(path, value);
    }
}

// A field's value for reading.
function fieldDisplay(def, value, names) {
    if (isEmpty(value)) return null;
    if (def.kind === 'ref') return chip(value, names);
    if (def.kind === 'refs') return h('div', { class: 'sb-chips' }, value.map((id) => chip(id, names)));
    if (def.kind === 'list') return h('div', { class: 'sb-chips' }, value.map((v) => h('span', { class: 'sb-chip' }, v)));
    if (def.kind === 'boolean') return value ? 'Yes' : 'No';
    return h('div', { class: 'sb-prose' }, String(value));
}

// A clickable link to another entry's sheet.
function chip(id, names) {
    const target = names.get(id);
    if (!target) return h('span', { class: 'sb-chip sb-chip-missing' }, id);
    return h('span', { class: 'sb-chip sb-chip-link', style: `--sb-accent: ${target.color}`, onclick: () => openSheet(id, target.type) },
        h('i', { class: `fa-solid ${target.icon}` }), target.name);
}

// ---- the sheet

export async function renderSheet(type, all) {
    const { chatId, chatKey, settingId } = ws.ctx;
    const isNew = ws.entryId === 'new';
    let entry = isNew ? { type: type.id, name: '', aliases: [], description: '', meta: {} } : all[type.id].find((e) => e.id === ws.entryId);
    if (!entry && !isNew) {
        // Opened from a link to another type's entry.
        for (const list of Object.values(all)) {
            const found = list.find((e) => e.id === ws.entryId);
            if (found) { ws.chapter = found.type; rerender(); return h('div'); }
        }
        return h('div', { class: 'sb-callout' }, 'That entry no longer exists.', button('Back', closeSheet));
    }

    const defs = await fieldDefs(type);
    // An unsaved new entry has nothing to show outside edit mode.
    if (isNew && !ws.editing) {
        closeSheet();
        return h('div');
    }
    // A draft exists exactly while editing this entry: start one when there
    // is none (or it belongs to another entry); drop it - and the marker of
    // whose it was - when not editing, so the next Edit starts fresh.
    if (ws.editing && (!ws.draft || ws.draftFor !== (entry.id ?? 'new'))) startDraft(entry, defs);
    if (!ws.editing) {
        ws.draft = null;
        ws.draftFor = null;
    }

    const doc = getChatDoc(chatKey);
    const parents = getParents(settingId);
    const allEntries = Object.values(all).flat();
    const typeOf = new Map((await getObjectTypes()).map((t) => [t.id, t]));
    const names = new Map(allEntries.map((e) => [e.id, { name: e.name, type: e.type, color: typeOf.get(e.type)?.color, icon: typeOf.get(e.type)?.icon }]));
    const pathNames = (id) => pathOf(parents, id).map((x) => names.get(x)?.name).filter(Boolean);
    const draft = ws.draft;

    // ---- top bar
    const siblings = [...all[type.id]].sort((a, b) => a.name.localeCompare(b.name));
    const index = siblings.findIndex((e) => e.id === entry.id);
    const step = (delta) => {
        const next = siblings[(index + delta + siblings.length) % siblings.length];
        if (next && next.id !== entry.id) openSheet(next.id);
    };
    const save = () => void saveSheet(type, entry, defs, isNew);
    genCtx = { type, entry, defs, all, isNew };
    const gate = canGenerateFor(settingId, isNew ? null : entry.id);
    const busy = ws.generating?.scope === 'sheet';
    if (ws.editing && ws.pendingGen) {
        const { task, field } = typeof ws.pendingGen === 'string' ? { task: ws.pendingGen, field: null } : ws.pendingGen;
        ws.pendingGen = null;
        queueMicrotask(() => void runGen(task, field));
    }
    const topbar = h('div', { class: 'sb-sheet-top' },
        h('div', { class: 'sb-back', onclick: () => { if (ws.dirty) return void confirmAction('Leave without saving your changes?').then((ok) => ok && closeSheet()); closeSheet(); } },
            icon('fa-arrow-left'), h('span', {}, CHAPTER_LABELS[type.id] ?? type.plural)),
        !isNew && siblings.length > 1 ? h('div', { class: 'sb-stepper' },
            h('span', { class: 'sb-iconbtn', title: 'Previous', onclick: () => step(-1) }, icon('fa-chevron-left')),
            h('small', {}, `${index + 1} / ${siblings.length}`),
            h('span', { class: 'sb-iconbtn', title: 'Next', onclick: () => step(1) }, icon('fa-chevron-right'))) : null,
        h('div', { class: 'sb-spacer' }),
        ws.editing
            ? [button('Save', save, { iconName: 'fa-floppy-disk', cls: 'sb-primary' }), button('Cancel', () => {
                stopEditing();
                if (isNew) closeSheet(); else rerender();
            }, { iconName: 'fa-xmark' })]
            : [button('Enrich', () => { ws.editing = true; ws.pendingGen = 'enrich'; rerender(); }, { iconName: 'fa-wand-magic-sparkles', disabled: !gate.ok, title: gate.reason || 'Add detail to every field - fill the empty ones and deepen the rest. You review it before saving.' }),
                button('Edit', () => { ws.editing = true; rerender(); }, { iconName: 'fa-pen', cls: 'sb-primary' }),
                button('', () => void removeEntry(entry), { iconName: 'fa-trash', cls: 'sb-danger', title: 'Delete' })]);

    // ---- generation strip (edit mode)
    const genStrip = ws.editing ? h('div', { class: 'sb-genstrip' },
        icon(busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'),
        h('input', { class: 'text_pole', value: ws.genBrief ?? '', placeholder: gate.ok ? 'Steer the writing (optional) - e.g. "make her secretly loyal to the Guild"' : gate.reason, disabled: !gate.ok, oninput: (e) => { ws.genBrief = e.target.value; } }),
        button(isNew && !draft.name ? 'Write it' : 'Fill empty', () => void runGen('fill'), { iconName: 'fa-fill-drip', disabled: !gate.ok || busy, title: 'Write only the fields that are still empty' }),
        isNew && !draft.name ? null : button('Enrich all', () => void runGen('enrich'), { iconName: 'fa-wand-magic-sparkles', disabled: !gate.ok || busy, title: 'Fill the empty fields and deepen the ones with content' }),
        ws.generatedFields?.size ? h('small', { class: 'sb-hint' }, `${ws.generatedFields.size} field${ws.generatedFields.size === 1 ? '' : 's'} written - highlighted until you save`) : null,
        draft?.pendingRelations?.length ? h('div', { class: 'sb-chips', style: 'flex-basis: 100%' },
            h('small', { class: 'sb-hint' }, 'On save, also adds:'),
            draft.pendingRelations.map((r, i) => h('span', { class: 'sb-chip' }, `${r.kind} ${r.name}`,
                h('span', { class: 'sb-iconbtn', title: 'Leave this one out', onclick: () => { draft.pendingRelations.splice(i, 1); rerender({ force: true }); } }, icon('fa-xmark'))))) : null) : null;

    // ---- header
    const status = isNew ? 'unused' : chatStatusOf(entry.id, doc);
    const placeId = type.id === 'location' ? (draft?.meta.parentId ?? entry.meta?.parentId) : (entry.base?.location ?? entry.location);
    const where = placeId ? pathNames(placeId) : [];
    const src = safeImageSrc(entry.image);
    const quick = [];
    if (!isNew && !ws.editing) {
        if (type.id === 'location' && doc.canonical.locationId !== entry.id) quick.push(button('Set the scene here', () => void setScene({ locationId: entry.id }, `Moved the scene to ${entry.name}`), { iconName: 'fa-location-dot' }));
        if (type.id === 'character') {
            const isPlayer = playerIdOf(ws.ctx.settingId, [entry]) === entry.id;
            quick.push(button(isPlayer ? 'Player character' : 'Mark as player character', () => {
                setPlayerId(ws.ctx.settingId, isPlayer ? '' : entry.id);
                rerender();
            }, { iconName: 'fa-gamepad', cls: isPlayer ? 'sb-primary' : '', title: isPlayer ? 'The character you play - the guidance never writes their words, actions, thoughts or feelings. Click to unmark.' : 'The character you play. The guidance is then written from the other characters\' side and never speaks for this one.' }));
            const present = doc.canonical.castIds.includes(entry.id);
            quick.push(button(present ? 'Remove from scene' : 'Bring into scene', () => void setScene({
                castIds: present ? doc.canonical.castIds.filter((id) => id !== entry.id) : [...doc.canonical.castIds, entry.id],
            }, `${entry.name} ${present ? 'left' : 'joined'} the scene`), { iconName: present ? 'fa-user-minus' : 'fa-user-plus' }));
        }
        if (type.id === 'creature') {
            const present = doc.canonical.creatureIds.includes(entry.id);
            quick.push(button(present ? 'Remove from scene' : 'Bring into scene', () => void setScene({
                creatureIds: present ? doc.canonical.creatureIds.filter((id) => id !== entry.id) : [...doc.canonical.creatureIds, entry.id],
            }, `${entry.name} ${present ? 'left' : 'appeared in'} the scene`), { iconName: present ? 'fa-minus' : 'fa-plus' }));
        }
    }
    const header = h('div', { class: 'sb-sheet-head', style: `--sb-accent: ${type.color}` },
        h('div', { class: 'sb-portrait', title: 'Image', onclick: () => { ws.sheetTab = 'image'; rerender(); } },
            src ? h('img', { src, alt: '' }) : h('i', { class: `fa-solid ${type.icon}` })),
        h('div', { class: 'sb-sheet-title' },
            h('div', { class: 'sb-type-chip' }, h('i', { class: `fa-solid ${type.icon}` }), type.label, type.scope === 'story' ? h('small', {}, ' · this chat') : null),
            ws.editing ? textInput('name', draft.name, { class: 'text_pole sb-name-input', placeholder: `Name this ${type.noun}` }) : h('h2', {}, entry.name),
            ws.editing ? textInput('aliases', csv(draft.aliases), { placeholder: 'Also known as… (comma-separated)', oninput: (e) => set('aliases', fromCsv(e.target.value)) })
                : (entry.aliases?.length ? h('small', { class: 'sb-aka' }, `also ${entry.aliases.join(', ')}`) : null),
            where.length ? h('div', { class: 'sb-where' }, icon('fa-location-dot'), where.map((n, i) => [i ? ' › ' : '', n])) : null,
            h('div', { class: 'sb-chips' },
                status !== 'unused' ? h('span', { class: `sb-badge sb-badge-${status}` }, STATUS_LABELS[status]) : null,
                (draft?.meta.tags ?? entry.meta?.tags ?? []).map((t) => h('span', { class: 'sb-tag' }, `#${t}`)),
                entry.confirmed === false ? h('span', { class: 'sb-badge' }, 'not in the setting yet') : null),
            quick.length ? h('div', { class: 'sb-actions' }, quick) : null));

    // ---- tabs
    // The quest tab is for quests only, and opens first for them.
    if (type.id === 'quest' && ws.sheetTab === 'overview' && !ws.questTabSeen?.has(entry.id ?? 'new') && !isNew) {
        (ws.questTabSeen ??= new Set()).add(entry.id);
        ws.sheetTab = 'quest';
    }
    const tabs = h('div', { class: 'sb-sheet-tabs' }, SHEET_TABS.filter(([key]) => key !== 'quest' || (type.id === 'quest' && !isNew)).map(([key, label, i]) => h('div', {
        class: `sb-sheet-tab${ws.sheetTab === key ? ' active' : ''}`,
        onclick: () => { ws.sheetTab = key; rerender(); },
    }, icon(i), h('span', {}, label))));

    let body;
    try {
        body = await sheetBody(ws.sheetTab, { type, entry, isNew, defs, all, allEntries, names, parents, doc, pathNames });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not draw the sheet', err);
        body = h('div', { class: 'sb-error' }, `Something went wrong: ${err?.message ?? err}`);
    }
    return h('div', { class: `sb-sheet${ws.editing ? ' sb-editing' : ''}` }, topbar, header, genStrip, tabs, h('div', { class: 'sb-sheet-body' }, body));
}

// ---- generation on the sheet

let genCtx = null;

// Runs a generation into the edit draft. task: 'field' (with `field`),
// 'fill', 'enrich'. A brand-new entry with no name yet is created whole.
async function runGen(task, field = null) {
    if (!genCtx || !ws.draft || ws.generating) return;
    const { type, entry, defs, all, isNew } = genCtx;
    const effective = isNew && !ws.draft.name && task !== 'field' ? 'create' : task;
    ws.generating = { scope: 'sheet', field: field ?? task };
    rerender({ force: true });
    try {
        const { values, dropped } = await generateEntry({
            task: effective, type, ctx: ws.ctx, fields: defs, entry: isNew ? null : entry, draft: ws.draft, all,
            targetField: field, brief: ws.genBrief ?? '', parentId: type.id === 'location' ? (ws.draft.meta.parentId || null) : null,
        });
        applyGenerated(values, effective === 'create' ? 'fill' : effective);
        ws.dirty = true;
        if (dropped.length) toast('info', `Left out what did not fit: ${dropped.slice(0, 4).join('; ')}`);
    } catch (err) {
        toast('error', `Could not generate: ${err?.message ?? err}`);
    } finally {
        ws.generating = null;
        rerender({ force: true });
    }
}

// The sparkle for one field: write it if empty, enrich it otherwise.
function spark(fieldName, current) {
    const gate = canGenerateFor(ws.ctx.settingId, genCtx?.isNew ? null : genCtx?.entry?.id);
    const busy = ws.generating?.scope === 'sheet' && (ws.generating.field === fieldName || ws.generating.field === 'fill' || ws.generating.field === 'enrich');
    return sparkButton(() => void runGen('field', fieldName), {
        title: isEmpty(current) ? 'Write this field' : 'Enrich - keep it and add more',
        busy,
        disabledReason: gate.ok ? (ws.generating ? 'Writing…' : '') : gate.reason,
    });
}

// Opens edit mode with one field's input focused - editing from where the
// value is shown.
function editField(fieldName) {
    ws.editing = true;
    ws.focusField = fieldName;
    rerender();
    setTimeout(() => {
        const el = document.querySelector(`.sb-sheet [data-field="${CSS.escape(fieldName)}"] :is(textarea, input, select)`);
        if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
        ws.focusField = null;
    }, 200);
}

// The sparkle in READ mode: switches to editing and writes (or enriches)
// that one field, so the result can be checked before saving.
function readSpark(fieldName, current) {
    const gate = canGenerateFor(ws.ctx.settingId, genCtx?.isNew ? null : genCtx?.entry?.id);
    return sparkButton(() => { ws.editing = true; ws.pendingGen = { task: 'field', field: fieldName }; rerender(); }, {
        title: isEmpty(current) ? 'Write this field' : 'Enrich - keep it and add more',
        disabledReason: gate.ok ? (ws.generating ? 'Writing…' : '') : gate.reason,
    });
}

const genClass = (name) => (ws.generatedFields?.has(name) ? 'sb-generated' : '');

async function sheetBody(tab, c) {
    switch (tab) {
        case 'details': return detailsTab(c);
        case 'relations': return relationsTab(c);
        case 'story': return storyTab(c);
        case 'image': return imageTab(c);
        case 'gm': return gmTab(c);
        case 'quest': return c.isNew ? overviewTab(c) : renderQuestTab(c.entry);
        default: return overviewTab(c);
    }
}

function overviewTab({ type, entry, isNew, defs, doc }) {
    const narrative = isNew ? '' : doc.narrative[entry.id]?.text ?? '';
    if (ws.editing) {
        return h('div', { class: 'sb-tabpane' },
            h('div', { dataset: { field: 'description' } }, fieldWithTools('Description', textArea('description', ws.draft.description, 5), [spark('description', ws.draft.description)], 'The setting\'s description - true in every chat on this setting.', genClass('description'))),
            !isNew && type.scope === 'world' ? field('Current description (this chat)', textArea('narrative', ws.draft.narrative, 4, { placeholder: 'Only when the story has changed it - a forest after the fire. Replaces the description above in this chat.' }),
                'Used instead of the description in this chat\'s guidance and image prompts. Leave empty to use the description.') : null);
    }
    const base = h('div', {},
        h('div', { class: 'sb-section-title' }, 'Description', h('span', { class: 'sb-spacer' }), readSpark('description', entry.description)),
        entry.description ? h('div', { class: 'sb-prose sb-editable', title: 'Click to edit', onclick: () => editField('description') }, entry.description) : h('div', { class: 'sb-muted sb-editable', onclick: () => editField('description') }, 'No description yet - click to write one, or let the sparkle do it.'));
    const glance = defs.filter((d) => !isEmpty(entry.base?.[d.name] ?? entry[d.name]) && d.kind !== 'refs' && d.kind !== 'ref').slice(0, 4);
    return h('div', { class: 'sb-tabpane' },
        narrative ? h('div', { class: 'sb-narrative' },
            h('div', { class: 'sb-section-title' }, icon('fa-hourglass-half'), ' Now, in this story',
                h('span', { class: 'sb-spacer' }),
                h('span', { class: 'sb-iconbtn', title: 'Back to the previous text', onclick: () => { revertNarrative(ws.ctx.chatKey, entry.id); void syncNow(); } }, icon('fa-rotate-left')),
                h('span', { class: 'sb-iconbtn', title: 'Clear - use the description again', onclick: () => { setNarrative(ws.ctx.chatKey, entry.id, ''); void syncNow(); } }, icon('fa-xmark'))),
            h('div', { class: 'sb-prose' }, narrative)) : null,
        narrative ? h('details', { class: 'sb-base-desc' }, h('summary', {}, 'Original description'), base) : base,
        glance.length ? h('dl', { class: 'sb-glance' }, glance.flatMap((d) => [h('dt', {}, d.label), h('dd', {}, String(entry.base?.[d.name] ?? entry[d.name]))])) : null);
}

function detailsTab({ type, entry, isNew, defs, all, names, parents }) {
    const { settingId } = ws.ctx;
    if (ws.editing) {
        let parentField = null;
        let envCard = null;
        if (type.id === 'location') {
            const ids = (all.location ?? []).map((e) => e.id);
            const blocked = isNew ? new Set() : new Set([entry.id, ...descendantsOf(parents, ids, entry.id)]);
            const label = (id) => pathOf(parents, id).map((x) => names.get(x)?.name).filter(Boolean).join(' › ');
            const options = (all.location ?? []).filter((e) => !blocked.has(e.id)).map((e) => ({ value: e.id, label: label(e.id) || e.name })).sort((a, b) => a.label.localeCompare(b.label));
            parentField = field('Inside', select([{ value: '', label: '(a top-level region)' }, ...options], ws.draft.meta.parentId, { onchange: (e) => set('meta.parentId', e.target.value) }), 'Where this place is. You can also drag it in the tree.');
            const envGate = canGenerateFor(settingId, isNew ? null : entry.id);
            const rollClimate = () => { set('meta.climate', randomClimate(ws.draft.meta.climate)); rerender({ force: true }); };
            const writeClimate = async () => {
                ws.envBusy = true;
                rerender({ force: true });
                try {
                    const envById = Object.fromEntries(Object.entries(getSettingDoc(settingId).entries).map(([id, m]) => [id, m.environment]));
                    const parentId = ws.draft.meta.parentId || null;
                    const inherited = parentId ? inheritedEnvironment(parents, envById, parentId) : {};
                    const v = await suggestEnvironment({
                        place: { name: ws.draft.name || entry.name, description: ws.draft.description, path: parentId ? pathOf(parents, parentId).map((x) => names.get(x)?.name).filter(Boolean) : [] },
                        inherited: { climate: inherited.climate?.value ?? '', lighting: inherited.lighting?.value ?? '' },
                        overview: getOverview(settingId),
                        brief: ws.genBrief ?? '',
                    });
                    if (v.climateZone) set('meta.climate', v.climateZone);
                    for (const k of ['climate', 'lighting', 'rules']) if (v[k]) set(`meta.environment.${k}`, v[k]);
                    toast('info', 'Climate written - review it and save.');
                } catch (err) {
                    toast('error', `Could not write the climate: ${err?.message ?? err}`);
                }
                ws.envBusy = false;
                rerender({ force: true });
            };
            envCard = h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, 'Environment', h('small', { class: 'sb-hint' }, ' - places inside inherit it unless they set their own'),
                h('span', { class: 'sb-spacer' }),
                h('span', { class: 'sb-iconbtn', title: 'A random climate for the weather here', onclick: rollClimate }, icon('fa-dice')),
                h('span', { class: `sb-iconbtn${envGate.ok && !ws.envBusy ? '' : ' sb-disabled'}`, title: envGate.ok ? 'Write a climate that fits this place (steer it with the box above, e.g. "frozen and windswept")' : envGate.reason, onclick: envGate.ok && !ws.envBusy ? () => void writeClimate() : null }, icon(ws.envBusy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'))),
                h('div', { class: 'sb-row' },
                    field('Climate', textInput('meta.environment.climate', ws.draft.meta.environment.climate, { placeholder: 'inherited when empty' })),
                    field('Lighting', textInput('meta.environment.lighting', ws.draft.meta.environment.lighting, { placeholder: 'inherited when empty' }))),
                field('Local rules', textInput('meta.environment.rules', ws.draft.meta.environment.rules, { placeholder: 'inherited when empty' })),
                h('div', { class: 'sb-row' },
                    field('Weather follows', select([{ value: '', label: '(inherited)' }, ...CLIMATES.map(([id, label]) => ({ value: id, label }))], ws.draft.meta.climate, { onchange: (e) => set('meta.climate', e.target.value) }),
                        'The climate the simulated weather and temperature follow here and in the places inside.'),
                    field('Sky', select([{ value: '', label: '(inherited)' }, { value: 'open', label: 'Open sky - sun, moons and weather seen' }, { value: 'none', label: 'No sky - underground or enclosed' }], ws.draft.meta.sky, { onchange: (e) => set('meta.sky', e.target.value) }))));
        }
        return h('div', { class: 'sb-tabpane' },
            parentField,
            defs.length ? h('div', { class: 'sb-fieldgrid' }, defs.map((d) => h('div', { dataset: { field: d.name } }, fieldWithTools(d.label, fieldControl(d, all), [d.kind === 'boolean' ? null : spark(d.name, ws.draft.fields[d.name])], null, genClass(d.name))))) : h('small', { class: 'sb-hint' }, 'This type has no extra fields in the setting.'),
            envCard);
    }
    // Every field, empty ones too - each with a sparkle to write or enrich it.
    const rows = defs.map((d) => {
        const value = entry.base?.[d.name] ?? entry[d.name];
        return [d, fieldDisplay(d, value, names) ?? h('span', { class: 'sb-muted' }, 'not written yet'), value];
    });
    let env = null;
    if (type.id === 'location' && !isNew) {
        const envById = Object.fromEntries(Object.entries(getSettingDoc(settingId).entries).map(([id, m]) => [id, m.environment]));
        const inherited = inheritedEnvironment(parents, envById, entry.id);
        const list = [['climate', 'Climate'], ['lighting', 'Lighting'], ['rules', 'Local rules']].filter(([k]) => inherited[k]);
        const zone = CLIMATES.find(([id]) => id === entry.meta?.climate)?.[1];
        const skyLabel = { open: 'Open sky', none: 'No sky (underground or enclosed)' }[entry.meta?.sky];
        if (list.length || zone || skyLabel) {
            env = h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, 'Environment'),
                h('dl', { class: 'sb-glance' }, list.flatMap(([k, label]) => [h('dt', {}, label), h('dd', {}, inherited[k].value,
                    inherited[k].from !== entry.id ? h('small', { class: 'sb-hint' }, ` (from ${names.get(inherited[k].from)?.name ?? 'a parent'})`) : null)]),
                zone ? [h('dt', {}, 'Weather follows'), h('dd', {}, zone)] : null,
                skyLabel ? [h('dt', {}, 'Sky'), h('dd', {}, skyLabel)] : null));
        }
    }
    return h('div', { class: 'sb-tabpane' },
        rows.length ? h('dl', { class: 'sb-details' }, rows.flatMap(([d, v, raw]) => [h('dt', {}, d.label), h('dd', { class: 'sb-dd' },
            // Click a value (or the pencil) to edit it right here.
            h('div', { class: 'sb-dd-value sb-editable', title: 'Click to edit', onclick: () => editField(d.name) }, v),
            h('span', { class: 'sb-iconbtn sb-pencil', title: 'Edit', onclick: () => editField(d.name) }, icon('fa-pen')),
            d.kind === 'boolean' ? null : readSpark(d.name, raw))])) : h('div', { class: 'sb-muted' }, 'This type has no extra fields in the setting.'),
        env,
        type.id === 'location' && !isNew ? routesCard(entry, names) : null);
}

// Routes from this place to others, with how long the journey takes - the
// clock skips ahead by it when the scene moves along a route.
function routesCard(entry, names) {
    const { settingId } = ws.ctx;
    const routes = routesFrom(entry.id, listRoutes(settingId));
    const draft = ws.routeDraft?.for === entry.id ? ws.routeDraft : (ws.routeDraft = { for: entry.id, to: '', travel: '', note: '' });
    const places = [...names.entries()].filter(([id, n]) => n.type === 'location' && id !== entry.id).map(([id, n]) => ({ value: id, label: n.name })).sort((a, b) => a.label.localeCompare(b.label));
    const add = () => {
        if (!draft.to || !draft.travel.trim()) return toast('warning', 'Pick a place and say how long the journey takes.');
        addRoute(settingId, { from: entry.id, to: draft.to, travel: draft.travel, note: draft.note });
        ws.routeDraft = null;
        void syncNow().then(() => rerender());
    };
    // Routes between the places inside this one, suggested by the model and
    // kept only as the user chooses.
    const parents = getParents(settingId);
    const inside = [...names.entries()].filter(([id, n]) => n.type === 'location' && parents[id] === entry.id).map(([id, n]) => ({ id, name: n.name }));
    const sug = ws.routeSuggest?.for === entry.id ? ws.routeSuggest : null;
    const gate = canGenerateFor(settingId, entry.id);
    const suggest = async () => {
        ws.routeSuggest = { for: entry.id, busy: true, items: [], error: '' };
        rerender();
        try {
            const all = await listEntries(ws.ctx.chatId, settingId, 'location');
            const described = inside.map((p) => ({ name: p.name, description: all.find((e) => e.id === p.id)?.description ?? '' }));
            const idOf = new Map(inside.map((p) => [p.name, p.id]));
            const existing = listRoutes(settingId).filter((r) => idOf.has(names.get(r.from)?.name) && idOf.has(names.get(r.to)?.name)).map((r) => ({ from: names.get(r.from).name, to: names.get(r.to).name }));
            const items = await suggestRoutes({ parent: { name: entry.name, description: entry.base?.description ?? entry.description ?? '' }, places: described, overview: getOverview(settingId), existing });
            ws.routeSuggest = { for: entry.id, busy: false, items: items.map((r) => ({ ...r, fromId: idOf.get(r.from), toId: idOf.get(r.to) })), error: '' };
        } catch (err) {
            ws.routeSuggest = { for: entry.id, busy: false, items: [], error: String(err?.message ?? err) };
        }
        rerender();
    };
    const keep = () => {
        for (const r of sug.items) addRoute(settingId, { from: r.fromId, to: r.toId, travel: r.travel, note: r.note });
        toast('success', `Added ${sug.items.length} route${sug.items.length === 1 ? '' : 's'}.`);
        ws.routeSuggest = null;
        void syncNow().then(() => rerender());
    };
    const suggestions = !sug ? null : h('div', { class: 'sb-callout' },
        sug.busy ? h('span', {}, icon('fa-spinner fa-spin'), ' Working out the routes…')
            : sug.error ? h('span', { class: 'sb-warn' }, `Could not suggest routes: ${sug.error}`)
                : h('div', { class: 'sb-routes' },
                    h('small', { class: 'sb-hint' }, sug.items.length ? 'Suggested - take out any you do not want, then add them:' : 'No new routes suggested.'),
                    sug.items.map((r, i) => h('div', { class: 'sb-route' },
                        h('span', {}, `${r.from} - ${r.to}: ${r.travel}`), r.note ? h('small', { class: 'sb-hint' }, ` - ${r.note}`) : null,
                        h('span', { class: 'sb-iconbtn', title: 'Leave this one out', onclick: () => { sug.items.splice(i, 1); rerender(); } }, icon('fa-xmark')))),
                    h('div', { class: 'sb-actions' },
                        sug.items.length ? button('Add these routes', keep, { iconName: 'fa-check', cls: 'sb-primary' }) : null,
                        button('Dismiss', () => { ws.routeSuggest = null; rerender(); }, { iconName: 'fa-xmark' }))));
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-route'), ' Routes', h('small', { class: 'sb-hint' }, ' - when the scene moves along one, the clock moves on by its travel time')),
        inside.length >= 2 ? h('div', { class: 'sb-actions' }, button(`Suggest routes between the ${inside.length} places inside`, () => void suggest(), { iconName: 'fa-wand-magic-sparkles', disabled: !gate.ok || sug?.busy, title: gate.reason || 'The model connects the places inside this one with routes and travel times; you choose which to keep.' })) : null,
        suggestions,
        routes.length ? h('div', { class: 'sb-routes' }, routes.map(({ route, otherId }) => h('div', { class: 'sb-route' },
            h('span', { class: 'sb-linkchip', onclick: () => openSheet(otherId) }, icon('fa-location-dot'), ` ${names.get(otherId)?.name ?? 'a place no longer in the library'}`),
            // The time is edited in place; a guess stops being one once changed.
            h('input', { class: 'text_pole sb-route-time', value: route.travel, title: 'Travel time - change it here', onchange: (e) => {
                const travel = e.target.value.trim();
                if (!travel || travel === route.travel) return;
                updateRoute(settingId, route.id, { travel, ...(route.guessed ? { guessed: false, note: route.note === 'guessed - edit if wrong' ? '' : route.note } : {}) });
                void syncNow().then(() => rerender());
            } }),
            route.guessed ? h('span', { class: 'sb-badge', title: 'Guessed from the places\' size and the world\'s technology when the scene first moved along it. Change the time to make it yours.' }, 'guess') : null,
            route.note && !route.guessed ? h('small', { class: 'sb-hint' }, ` - ${route.note}`) : null,
            h('span', { class: 'sb-iconbtn', title: 'Remove this route', onclick: () => { removeRoute(settingId, route.id); void syncNow().then(() => rerender()); } }, icon('fa-xmark'))))) : h('small', { class: 'sb-muted' }, 'No routes yet.'),
        h('div', { class: 'sb-row' },
            select([{ value: '', label: 'To…' }, ...places], draft.to, { onchange: (e) => {
                draft.to = e.target.value;
                // Start from a guess, to change or keep.
                if (draft.to && !draft.travel.trim()) {
                    const guess = guessRoute(entry.id, draft.to, { up: (id) => [...pathOf(parents, id)].reverse(), places: new Map([...names.entries()].map(([id, n]) => [id, { name: n.name }])), techLevel: getOverview(settingId)?.tech?.level ?? '' })
                        ?? guessRoute(entry.id, draft.to, { up: (id) => [id], places: new Map([...names.entries()].map(([id, n]) => [id, { name: n.name }])), techLevel: getOverview(settingId)?.tech?.level ?? '' });
                    if (guess) draft.travel = guess.travel;
                }
                rerender();
            } }),
            h('input', { class: 'text_pole', placeholder: 'Travel time - "2 hours", "half a day"', value: draft.travel, oninput: (e) => { draft.travel = e.target.value; } }),
            h('input', { class: 'text_pole', placeholder: 'Note - the coast road, a hidden passage', value: draft.note, oninput: (e) => { draft.note = e.target.value; } }),
            button('Add route', add, { iconName: 'fa-plus' })));
}

async function relationsTab({ entry, isNew, allEntries, names, parents, defs }) {
    if (isNew) return h('div', { class: 'sb-muted' }, 'Save the entry first.');
    const { chatId, settingId } = ws.ctx;
    const labels = new Map(defs.map((d) => [d.name, d.label]));
    const rel = relationsOf(entry, allEntries, parents, (typeId, f) => (typeId === entry.type ? labels.get(f) : null) ?? f.replace(/_/g, ' '));
    const act = (fn) => async () => {
        try {
            await fn();
            await syncNow();
            rerender();
        } catch (err) {
            toast('error', `Could not change it: ${err?.message ?? err}`);
        }
    };
    // A link chip with an x that takes the link out of the field holding it.
    const unlink = (title, ownerId, field, targetId) => h('span', {
        class: 'sb-iconbtn sb-unlink', title,
        onclick: act(async () => {
            if (!await removeLink(chatId, settingId, ownerId, field, targetId)) throw new Error('State Engine refused the change');
        }),
    }, icon('fa-xmark'));
    const group = (title, items) => (items.length ? h('div', { class: 'sb-relgroup' }, h('div', { class: 'sb-section-title' }, title), h('div', { class: 'sb-chips' }, items)) : null);
    const incoming = new Map();
    for (const r of rel.incoming) {
        const key = `${names.get(r.id)?.type ?? ''}:${r.label}:${r.field}`;
        if (!incoming.has(key)) incoming.set(key, { label: r.label, field: r.field, ids: [] });
        incoming.get(key).ids.push(r.id);
    }
    const sections = [
        group('Inside', rel.parentPath.slice(-1).map((id) => chip(id, names))),
        group('Places inside', rel.children.map((id) => chip(id, names))),
        ...rel.outgoing.map((o) => group(o.label, o.ids.map((id) => h('span', { class: 'sb-linkchip' }, chip(id, names), unlink('Remove this link', entry.id, o.field, id))))),
        // On another object's field: removing it edits that object.
        ...[...incoming.values()].map((g) => group(`Linked as "${g.label}" by`, g.ids.map((id) => h('span', { class: 'sb-linkchip' }, chip(id, names), unlink(`Remove ${entry.name} from this`, id, g.field, entry.id))))),
    ].filter(Boolean);

    // Add a link through one of this entry's reference fields.
    const refDefs = defs.filter((d) => d.kind === 'ref' || d.kind === 'refs');
    let linkForm = null;
    if (refDefs.length) {
        const form = ws.linkForm?.entryId === entry.id ? ws.linkForm : (ws.linkForm = { entryId: entry.id, field: refDefs[0].name, target: '' });
        const def = refDefs.find((d) => d.name === form.field) ?? refDefs[0];
        const targets = allEntries.filter((e) => e.type === def.refType && e.id !== entry.id).sort((x, y) => x.name.localeCompare(y.name));
        linkForm = h('div', { class: 'sb-row sb-addform' },
            select(refDefs.map((d) => ({ value: d.name, label: d.label })), form.field, { onchange: (e) => { form.field = e.target.value; form.target = ''; rerender(); } }),
            select([{ value: '', label: `Choose a ${def.refType}…` }, ...targets.map((t) => ({ value: t.id, label: t.name }))], form.target, { onchange: (e) => { form.target = e.target.value; } }),
            button('Link', act(async () => {
                if (!form.target) throw new Error(`choose a ${def.refType} first`);
                if (!await addLink(chatId, settingId, entry.id, def.name, form.target, { multiple: def.kind === 'refs' })) throw new Error('State Engine refused the change');
                form.target = '';
            }), { iconName: 'fa-link' }));
    }

    // Authored relationships.
    const relations = listRelations(settingId);
    const mine = relationsFor(entry.id, relations);
    const others = allEntries.filter((e) => e.id !== entry.id).sort((x, y) => x.name.localeCompare(y.name));
    const draft = ws.relDraft?.entryId === entry.id ? ws.relDraft : (ws.relDraft = { entryId: entry.id, to: '', kind: 'ally', note: '', mutual: true, editing: null, flip: false });
    const resetDraft = () => Object.assign(draft, { to: '', note: '', editing: null, flip: false });
    const authored = mine.length ? h('div', { class: 'sb-relgroup' }, mine.map((m) => h('div', { class: 'sb-rel' },
        icon(m.rel.mutual ? 'fa-arrows-left-right' : (m.direction === 'out' ? 'fa-arrow-right' : 'fa-arrow-left')),
        h('span', { class: 'sb-chip sb-chip-on' }, m.kind),
        names.get(m.otherId) ? chip(m.otherId, names) : h('span', { class: 'sb-chip sb-chip-missing' }, 'deleted entry'),
        m.rel.note ? h('small', { class: 'sb-hint' }, m.rel.note) : null,
        h('span', { class: 'sb-push' },
            h('span', { class: 'sb-iconbtn', title: 'Edit', onclick: () => { Object.assign(draft, { to: m.otherId, kind: m.rel.kind, note: m.rel.note, mutual: m.rel.mutual, editing: m.rel.id, flip: m.direction === 'in' }); rerender(); } }, icon('fa-pen')),
            h('span', { class: 'sb-iconbtn sb-danger', title: 'Remove', onclick: act(async () => removeRelation(settingId, m.rel.id)) }, icon('fa-trash')))))) : h('div', { class: 'sb-muted' }, 'None yet.');
    const custom = draft.kind === '' || !RELATION_KINDS.includes(draft.kind);
    const kindSel = h('select', {
        class: 'text_pole',
        onchange: (e) => { draft.kind = e.target.value === '__custom__' ? '' : e.target.value; draft.mutual = MUTUAL_KINDS.has(draft.kind); rerender(); },
    }, RELATION_KINDS.map((k) => h('option', { value: k, selected: k === draft.kind }, k)), h('option', { value: '__custom__', selected: custom }, 'Your own…'));
    const relForm = h('div', { class: 'sb-addform' },
        h('div', { class: 'sb-row' },
            h('b', {}, draft.flip ? '…' : entry.name), kindSel,
            custom ? h('input', { class: 'text_pole', value: draft.kind, placeholder: 'e.g. sworn to', oninput: (e) => { draft.kind = e.target.value; } }) : null,
            select([{ value: '', label: 'Choose who or what…' }, ...others.map((o) => ({ value: o.id, label: `${o.name} (${o.type})` }))], draft.to, { onchange: (e) => { draft.to = e.target.value; } }),
            draft.flip ? h('b', {}, `→ ${entry.name}`) : null),
        h('div', { class: 'sb-row' },
            h('input', { class: 'text_pole', value: draft.note, placeholder: 'A note (optional) - e.g. "since the siege of Veylan"', oninput: (e) => { draft.note = e.target.value; } }),
            h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: draft.mutual, onchange: (e) => { draft.mutual = e.target.checked; } }), h('span', {}, 'Both ways')),
            button(draft.editing ? 'Save' : 'Add', act(async () => {
                if (!draft.to) throw new Error('choose who or what first');
                if (!String(draft.kind).trim()) throw new Error('say what the relationship is');
                if (draft.editing) removeRelation(settingId, draft.editing);
                const [from, to] = draft.flip ? [draft.to, entry.id] : [entry.id, draft.to];
                addRelation(settingId, { from, to, kind: draft.kind, note: draft.note, mutual: draft.mutual });
                resetDraft();
            }), { iconName: draft.editing ? 'fa-floppy-disk' : 'fa-plus', cls: 'sb-primary' }),
            draft.editing || draft.to ? button('Cancel', () => { resetDraft(); rerender(); }, { iconName: 'fa-xmark' }) : null));

    // What the story has made of it (Archivist) - read-only; corrected by
    // writing your own relationship for the pair.
    let story;
    if (!hasArchivist()) {
        story = h('div', { class: 'sb-muted' }, 'Install Archivist to see the relationships the story has formed.');
    } else {
        const rels = await storyRelationships(entry);
        story = rels.length ? h('div', { class: 'sb-relgroup' }, rels.map((r) => {
            const covered = !!r.otherId && pairCovered(entry.id, r.otherId, relations);
            const other = r.otherId && names.get(r.otherId) ? chip(r.otherId, names) : h('b', {}, r.otherName);
            return h('div', { class: `sb-rel${covered ? ' sb-superseded' : ''}` },
                h('span', { title: r.direction === 'out' ? `How ${entry.name} sees them` : `How they see ${entry.name}` }, icon(r.direction === 'out' ? 'fa-arrow-right' : 'fa-arrow-left')),
                other,
                r.type ? h('span', { class: 'sb-chip' }, r.type) : null,
                h('span', { class: `sb-pol ${r.polarity < 0 ? 'sb-pol-neg' : r.polarity > 0 ? 'sb-pol-pos' : ''}` }, `${r.polarityLabel} (${r.polarity > 0 ? '+' : ''}${r.polarity})`),
                r.intensity ? h('small', { class: 'sb-hint' }, `${r.intensity} intensity`) : null,
                r.trend ? h('small', { class: 'sb-hint' }, r.trend) : null,
                h('span', { class: 'sb-push' }, covered
                    ? h('small', { class: 'sb-hint' }, 'replaced by your relationship')
                    : (r.otherId ? button('Correct it', () => { Object.assign(draft, { to: r.otherId, kind: r.type || 'knows', note: r.text, mutual: false, editing: null, flip: r.direction === 'in' }); rerender(); }, { iconName: 'fa-pen', title: 'Write your own version - it replaces this one in guidance and generation' }) : null)),
                r.text ? h('div', { class: 'sb-hint', style: 'flex-basis: 100%' }, r.text) : null);
        })) : h('div', { class: 'sb-muted' }, 'No relationships compiled for it yet in this chat.');
    }

    return h('div', { class: 'sb-tabpane' },
        h('div', { class: 'sb-section-title' }, icon('fa-link'), ' Links in the setting'),
        sections.length ? sections : h('div', { class: 'sb-muted' }, 'No links yet.'),
        linkForm,
        h('div', { class: 'sb-section-title' }, icon('fa-people-arrows'), ' Relationships'),
        authored,
        relForm,
        h('div', { class: 'sb-section-title' }, icon('fa-book-open-reader'), ' From the story'),
        story,
        h('small', { class: 'sb-hint' }, 'Story relationships come from Archivist and are read-only here; "Correct it" writes your own version, which takes precedence.'));
}

async function storyTab({ entry, isNew, doc }) {
    if (isNew) return h('div', { class: 'sb-muted' }, 'Save the entry first.');
    const history = entityHistory(doc, entry.id);
    let memories;
    const archivist = window.StateEngineArchivist;
    if (!archivist?.getMemoriesForEntity) {
        memories = h('div', { class: 'sb-muted' }, 'Install Archivist to see what the story remembers about this entry.');
    } else {
        let list = [];
        try {
            list = archivist.getMemoriesForEntity(entry.id) ?? [];
        } catch (err) {
            console.warn(LOG_PREFIX, 'could not read memories', err);
        }
        const rank = { high: 0, medium: 1, low: 2 };
        list = [...list].sort((a, b) => (rank[a.importance] ?? 3) - (rank[b.importance] ?? 3)).slice(0, 30);
        memories = list.length ? h('div', { class: 'sb-memories' }, list.map((m) => h('div', { class: `sb-memory sb-imp-${m.importance ?? 'low'}` },
            h('small', { class: 'sb-hint' }, [m.subtype, m.importance].filter(Boolean).join(' · ')),
            h('div', {}, m.text))))
            : h('div', { class: 'sb-muted' }, 'No memories about this entry in this chat yet.');
    }
    return h('div', { class: 'sb-tabpane' },
        h('div', { class: 'sb-section-title' }, icon('fa-clock-rotate-left'), ' In this chat'),
        history.length ? h('div', { class: 'sb-timeline' }, history.map((x) => h('div', { class: `sb-tl-item sb-tl-${x.kind}` },
            h('small', { class: 'sb-hint' }, new Date(x.at).toLocaleString()), h('span', {}, x.text)))) : h('div', { class: 'sb-muted' }, 'Nothing has happened here yet.'),
        h('div', { class: 'sb-section-title' }, icon('fa-brain'), ' What the story remembers'),
        memories);
}

async function imageTab({ type, entry, isNew, doc, parents }) {
    if (isNew) return h('div', { class: 'sb-muted' }, 'Save the entry first, then give it a picture.');
    const envById = Object.fromEntries(Object.entries(getSettingDoc(ws.ctx.settingId).entries).map(([id, m]) => [id, m.environment]));
    const inherited = inheritedEnvironment(parents, envById, entry.id);
    return renderImagePanel({
        type, entry,
        narrative: doc.narrative[entry.id]?.text ?? '',
        environment: { climate: inherited.climate?.value ?? '', lighting: inherited.lighting?.value ?? '' },
        overview: getOverview(ws.ctx.settingId),
    });
}

function gmTab({ entry }) {
    if (ws.editing) {
        return h('div', { class: 'sb-tabpane' },
            field('Secrets and GM notes', textArea('meta.gmNotes', ws.draft.meta.gmNotes, 6), 'Never put into the guidance.'),
            field('Tags', h('input', { class: 'text_pole', value: csv(ws.draft.meta.tags), placeholder: 'comma-separated', oninput: (e) => set('meta.tags', fromCsv(e.target.value)) })),
            h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: ws.draft.meta.pinned, onchange: (e) => set('meta.pinned', e.target.checked) }), h('span', {}, 'Pin to the top of the chapter')),
            h('label', { class: 'checkbox_label', title: 'For canon you do not want embellished: generated detail is never added to this entry.' },
                h('input', { type: 'checkbox', checked: ws.draft.meta.canonLocked, onchange: (e) => set('meta.canonLocked', e.target.checked) }),
                h('span', {}, 'Canon - never add generated detail')));
    }
    const origin = { story: 'Introduced by the story', import: 'Imported', user: 'Created by you' }[entry.meta?.origin];
    return h('div', { class: 'sb-tabpane' },
        h('div', { class: 'sb-gm-note' }, icon('fa-user-secret'), h('small', {}, ' For your eyes only - never sent to the model.')),
        h('div', { class: 'sb-chips' },
            entry.meta?.canonLocked ? h('span', { class: 'sb-chip' }, icon('fa-lock'), ' Canon - no generated detail') : null,
            origin ? h('span', { class: 'sb-chip' }, origin) : null,
            entry.meta?.generated?.length ? h('span', { class: 'sb-chip', title: 'Fields written by generation' }, icon('fa-wand-magic-sparkles'), ` ${entry.meta.generated.join(', ')}`) : null),
        entry.meta?.gmNotes ? h('div', { class: 'sb-prose' }, entry.meta.gmNotes) : h('div', { class: 'sb-muted' }, 'No secrets yet.'));
}

// ---- actions

async function saveSheet(type, entry, defs, isNew) {
    const { chatId, chatKey, settingId } = ws.ctx;
    const d = ws.draft;
    const patch = { name: d.name.trim(), aliases: splitAliases(d.aliases), description: d.description };
    for (const def of defs) if (d.fields[def.name] !== undefined) patch[def.name] = d.fields[def.name] ?? (def.kind === 'refs' || def.kind === 'list' ? [] : '');
    if (!patch.name) return toast('warning', 'Give it a name first.');
    const meta = { tags: d.meta.tags, pinned: d.meta.pinned, canonLocked: d.meta.canonLocked, gmNotes: d.meta.gmNotes };
    // Which fields came from generation (SB-136), shown on the GM tab.
    if (ws.generatedFields?.size) meta.generated = [...new Set([...(entry.meta?.generated ?? []), ...ws.generatedFields])].filter((f) => f !== 'name');
    if (isNew) meta.origin = 'user';
    if (type.id === 'location') Object.assign(meta, { environment: d.meta.environment, climate: d.meta.climate, sky: d.meta.sky });
    try {
        if (isNew) {
            const similar = await findSimilar(chatId, settingId, type.id, patch.name);
            if (similar.length && !await confirmAction(`The library already has ${similar.map((s) => `"${s.name}"`).join(', ')}.\nCreate a new ${type.noun} anyway?`)) return;
            const created = await createEntry(chatId, settingId, type.id, patch, meta);
            if (!created) return toast('error', 'State Engine refused to create it - see the console.');
            if (type.id === 'location' && d.meta.parentId) setParent(settingId, created.id, d.meta.parentId);
            for (const r of d.pendingRelations ?? []) addRelation(settingId, { from: created.id, to: r.otherId, kind: r.kind });
            ws.entryId = created.id;
        } else {
            if (!await updateEntry(chatId, settingId, entry.id, patch)) return toast('error', 'State Engine refused the change - see the console.');
            setEntryMeta(settingId, entry.id, meta);
            if (type.id === 'location' && (d.meta.parentId || null) !== (entry.meta?.parentId ?? null) && !setParent(settingId, entry.id, d.meta.parentId || null)) {
                toast('warning', 'A place cannot go inside itself or one of its own parts.');
            }
            if (type.scope === 'world') setNarrative(chatKey, entry.id, d.narrative);
        }
        ws.editing = false;
        ws.dirty = false;
        ws.draft = null;
        ws.generatedFields = new Set();
        toast('success', 'Saved.');
        await syncNow();
        rerender();
    } catch (err) {
        console.warn(LOG_PREFIX, 'save failed', err);
        toast('error', `Could not save: ${err?.message ?? err}`);
    }
}

async function removeEntry(entry) {
    const { chatId, chatKey, settingId } = ws.ctx;
    const doc = getChatDoc(chatKey);
    const referrers = await findReferrers(chatId, settingId, entry.id, doc.canonical);
    const lines = referrers.map((r) => `• ${r.name} ${r.detail}`);
    const question = `Delete "${entry.name}"? This cannot be undone.${lines.length ? `\n\nIt is referred to by:\n${lines.join('\n')}\n\nThose references are removed; places inside it move up a level.` : ''}`;
    if (!await confirmAction(question)) return;
    if (doc.canonical.locationId === entry.id) setCanonical(chatKey, { locationId: '' }, { source: 'user', note: `Deleted ${entry.name}`, chatId });
    if (doc.canonical.castIds.includes(entry.id)) setCanonical(chatKey, { castIds: doc.canonical.castIds.filter((id) => id !== entry.id) }, { source: 'user', note: `Deleted ${entry.name}`, chatId });
    if (doc.canonical.creatureIds.includes(entry.id)) setCanonical(chatKey, { creatureIds: doc.canonical.creatureIds.filter((id) => id !== entry.id) }, { source: 'user', note: `Deleted ${entry.name}`, chatId });
    if (!await deleteEntry(chatId, settingId, entry.id)) return toast('error', 'State Engine refused to delete it.');
    closeSheet();
}

// A user change to the canonical scene; the story variables and the
// guidance follow at once.
export async function setScene(patch, note) {
    const { chatId, chatKey } = ws.ctx;
    const before = structuredClone(getChatDoc(chatKey).canonical);
    setCanonical(chatKey, patch, { source: 'user', note, chatId });
    // A move or a change of who is here, made by hand: it holds over the
    // story's reading for a few replies, the model is told, and the game
    // master's briefing is written again for the new scene.
    const after = getChatDoc(chatKey).canonical;
    const sceneChanged = before.locationId !== after.locationId || JSON.stringify(before.castIds) !== JSON.stringify(after.castIds) || JSON.stringify(before.creatureIds) !== JSON.stringify(after.creatureIds);
    if (sceneChanged) await holdUserScene(chatId, chatKey, before);
    await pushCanonicalToObserved(chatId, chatKey);
    await syncNow();
    if (sceneChanged && getSettings().director.enabled) {
        void runDirector(chatId, chatKey, { type: 'continue', force: true }).then(() => syncNow());
    }
}
