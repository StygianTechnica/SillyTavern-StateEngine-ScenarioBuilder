// The catalog browser (spec 6.3) - the setting book: a front page (the
// setting overview and a table of contents), then a chapter per object
// type, browsable as cards (the codex view), a compact list, or - for
// locations - a tree you rearrange by dragging (SB-141). Choosing an entry
// opens its sheet (sheet.js).

import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc } from '../store/chat-store.js';
import { getObjectTypes, CHAPTER_LABELS, listEntries, getParents, setParent, getOverview, setOverview, getSettingSummary, isCanonOnly, setCanonOnly } from '../library/library.js';
import { buildTree, wouldCreateCycle, childrenOf, pathOf } from '../library/hierarchy.js';
import { truncate } from '../guidance/build.js';
import { safeImageSrc } from '../images/attach.js';
import { filterEntries, sortEntries, tagsOf, chatStatusOf, STATUS_LABELS } from './catalog-model.js';
import { renderSheet } from './sheet.js';
import { ws, rerender, openSheet, markDirty } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';
import { chipSelect, selectWithCustom, diceButton, sparkButton, fieldWithTools } from './controls.js';
import { WORLD_TYPES, CAPABILITY_LEVELS, TONES, THEMES, eraGroups, randomFor } from '../library/world-options.js';
import { generateOverview, generateEntry } from '../generate/run.js';
import { fieldDefs } from './sheet.js';

const CHAPTER_BLURBS = Object.freeze({
    character: 'The people of the setting - allies, rivals, shopkeepers.',
    location: 'Regions, towns, buildings and rooms, nested inside each other.',
    faction: 'Guilds, houses, cults - the groups that pull the strings.',
    item: 'Artifacts, weapons, keys and other things that matter.',
    creature: 'Monsters, beasts and spirits.',
    lore: 'History, religion, the rules of magic.',
    quest: 'Main plot, side quests and hooks - for this chat.',
    scene: 'Prepared encounters and set pieces - for this chat.',
    event: 'Festivals, raids and scheduled happenings - for this chat.',
});

// Types whose entries sit somewhere (a "location" field), so "Within" applies.
const PLACED = new Set(['location', 'item', 'creature', 'scene']);

const viewOf = (typeId) => getSettings().catalog.views[typeId] ?? (typeId === 'location' ? 'tree' : 'grid');

function setView(typeId, view) {
    getSettings().catalog.views[typeId] = view;
    saveSettings();
    rerender();
}

export async function renderCatalog() {
    const { chatId, settingId, chatKey } = ws.ctx;
    const types = await getObjectTypes();
    const all = {};
    for (const t of types) all[t.id] = await listEntries(chatId, settingId, t.id);
    const doc = getChatDoc(chatKey);

    const rail = h('nav', { class: 'sb-rail' },
        railItem('overview', 'fa-book-open', 'Front page', null, null),
        h('div', { class: 'sb-rail-label' }, 'Chapters'),
        types.map((t) => railItem(t.id, t.icon, CHAPTER_LABELS[t.id] ?? t.plural, all[t.id].length, t.color)));

    let content;
    if (ws.entryId) {
        const type = types.find((t) => t.id === ws.chapter) ?? types[0];
        content = await renderSheet(type, all);
    } else if (ws.chapter === 'overview') {
        content = await frontPage(types, all);
    } else {
        content = chapterPage(types.find((t) => t.id === ws.chapter), all, doc);
    }
    return h('div', { class: 'sb-catalog' }, rail, h('div', { class: 'sb-content' }, content));
}

function railItem(key, iconName, label, count, color) {
    return h('div', {
        class: `sb-rail-item${ws.chapter === key ? ' active' : ''}`,
        onclick: () => {
            ws.chapter = key;
            ws.entryId = null;
            ws.editing = false;
            ws.dirty = false;
            ws.search = '';
            ws.tag = '';
            ws.status = '';
            ws.within = '';
            rerender();
        },
    }, h('i', { class: `fa-solid ${iconName}`, style: color ? `color: ${color}` : null }), h('span', {}, label), count === null ? null : h('small', { class: 'sb-count' }, String(count)));
}

// ---- the front page

async function frontPage(types, all) {
    const { settingId } = ws.ctx;
    const setting = await getSettingSummary(settingId);
    const overview = getOverview(settingId);
    const editing = ws.editing && ws.chapter === 'overview';

    const toc = h('div', { class: 'sb-toc' }, types.map((t) => h('div', {
        class: 'sb-toc-card', style: `--sb-accent: ${t.color}`,
        onclick: () => { ws.chapter = t.id; rerender(); },
    }, h('i', { class: `fa-solid ${t.icon}` }), h('b', {}, CHAPTER_LABELS[t.id] ?? t.plural), h('small', {}, `${all[t.id].length} ${all[t.id].length === 1 ? t.noun : t.plural.toLowerCase()}`))));

    if (!editing) {
        const empty = !Object.values(overview).some((v) => String(v).trim());
        const label = (list, id) => list.find(([k]) => k === id)?.[1] ?? id;
        const meta = [
            ['World', overview.worldType ? label(WORLD_TYPES, overview.worldType) : ''],
            ['Magic / tech', overview.magicLevel ? label(CAPABILITY_LEVELS, overview.magicLevel) : ''],
            ['Era', overview.era], ['Tone', overview.tone], ['Themes', overview.themes],
        ].filter(([, v]) => String(v).trim());
        return h('div', { class: 'sb-front' },
            h('div', { class: 'sb-front-head' },
                h('div', {}, h('small', { class: 'sb-kicker' }, 'Setting'), h('h2', {}, setting?.name ?? 'Setting')),
                h('div', { class: 'sb-actions' },
                    empty ? button('Surprise me', () => { ws.editing = true; ws.overviewDraft = null; ws.surprise = true; rerender(); }, { iconName: 'fa-dice', title: 'Roll a random world and write its front page' }) : null,
                    button('Edit', () => { ws.editing = true; ws.overviewDraft = null; rerender(); }, { iconName: 'fa-pen', cls: 'sb-primary' }))),
            empty ? h('div', { class: 'sb-callout' }, icon('fa-feather'), h('span', {}, 'Every setting starts with a premise. Click Edit to choose its world, tone and era - or Surprise me to roll one and have it written for you.'))
                : [
                    overview.premise ? h('p', { class: 'sb-premise' }, overview.premise) : null,
                    meta.length ? h('div', { class: 'sb-chips' }, meta.map(([k, v]) => h('span', { class: 'sb-chip' }, h('b', {}, `${k}: `), v))) : null,
                    overview.rules ? h('div', { class: 'sb-front-rules' }, h('h4', {}, 'How the world works'), h('p', { class: 'sb-prose' }, overview.rules)) : null,
                ],
            canonCard(settingId),
            h('h4', {}, 'Contents'),
            toc);
    }

    // ---- edit: one draft, so rolling and generating never lose input
    const d = ws.overviewDraft ?? (ws.overviewDraft = { ...overview });
    const set = (key, value) => { d[key] = value; markDirty(); };
    const reroll = (key) => () => { set(key, randomFor(key, d)); rerender({ force: true }); };
    const canonBlocked = isCanonOnly(settingId) ? 'This setting is canon-only - turn that off on the front page to generate text.' : '';
    const busy = ws.generating?.scope === 'overview' ? ws.generating.field : null;

    const write = async (fields) => {
        ws.generating = { scope: 'overview', field: fields.length > 1 ? 'all' : fields[0] };
        rerender({ force: true });
        try {
            const { values } = await generateOverview({ ctx: ws.ctx, fields, overview: d, all, brief: ws.overviewBrief ?? '' });
            Object.assign(d, values);
            ws.dirty = true;
            toast('success', 'Written - check it, change anything, then Save.');
        } catch (err) {
            toast('error', `Could not generate: ${err?.message ?? err}`);
        } finally {
            ws.generating = null;
            rerender({ force: true });
        }
    };
    const rollAll = () => {
        for (const key of ['worldType', 'magicLevel', 'era', 'tone', 'themes']) d[key] = randomFor(key, d);
        markDirty();
    };
    if (ws.surprise) {
        ws.surprise = false;
        rollAll();
        if (!canonBlocked) queueMicrotask(() => void write(['premise', 'rules']));
    }

    const textArea = (key, rows) => {
        const el = h('textarea', { class: `text_pole${busy === key || busy === 'all' ? ' sb-gen-busy' : ''}`, rows, oninput: (e) => set(key, e.target.value) });
        el.value = d[key] ?? '';
        return el;
    };
    const spark = (key) => sparkButton(() => void write([key]), { title: d[key] ? 'Enrich - keep it and add more' : 'Write it from the choices above', busy: busy === key || busy === 'all', disabledReason: canonBlocked });

    return h('div', { class: 'sb-front' },
        h('div', { class: 'sb-front-head' },
            h('div', {}, h('small', { class: 'sb-kicker' }, 'Setting'), h('h2', {}, setting?.name ?? 'Setting')),
            h('div', { class: 'sb-actions' },
                button('Roll everything', () => { rollAll(); rerender({ force: true }); }, { iconName: 'fa-dice', title: 'Roll world type, magic, era, tone and themes' }),
                button('Write front page', () => void write(['premise', 'rules']), { iconName: 'fa-wand-magic-sparkles', disabled: !!canonBlocked || !!busy, title: canonBlocked || 'Write (or enrich) the premise and the rules from your choices' }))),
        h('div', { class: 'sb-card' },
            h('div', { class: 'sb-fieldgrid' },
                fieldWithTools('World type', select([{ value: '', label: '—' }, ...WORLD_TYPES.map(([v, l]) => ({ value: v, label: l }))], d.worldType, { onchange: (e) => { set('worldType', e.target.value); rerender({ force: true }); } }), [diceButton(reroll('worldType'))]),
                fieldWithTools('Magic / technology', select([{ value: '', label: '—' }, ...CAPABILITY_LEVELS.map(([v, l]) => ({ value: v, label: l }))], d.magicLevel, { onchange: (e) => set('magicLevel', e.target.value) }), [diceButton(reroll('magicLevel'))]),
                fieldWithTools('Era', selectWithCustom({ groups: eraGroups(d.worldType).map((g) => ({ label: g.label, items: g.eras })), value: d.era, onChange: (v) => set('era', v) }), [diceButton(reroll('era'))])),
            fieldWithTools('Tone', chipSelect({ options: [...TONES], value: d.tone, onChange: (v) => set('tone', v) }), [diceButton(reroll('tone'))], 'Pick as many as fit.'),
            fieldWithTools('Themes', chipSelect({ options: [...THEMES], value: d.themes, onChange: (v) => set('themes', v), placeholder: 'Add your own theme…' }), [diceButton(reroll('themes'))])),
        h('div', { class: 'sb-card' },
            fieldWithTools('Premise', textArea('premise', 5), [spark('premise')], 'The pitch: what this world is and what stories happen in it.'),
            fieldWithTools('How the world works', textArea('rules', 4), [spark('rules')], 'Magic, technology, law, taboos. Kept short in the guidance.'),
            field('Steer the writing (optional)', h('input', { class: 'text_pole', value: ws.overviewBrief ?? '', placeholder: 'e.g. "a coastal trading republic sinking into the sea"', oninput: (e) => { ws.overviewBrief = e.target.value; } }))),
        h('div', { class: 'sb-savebar' },
            button('Save', () => {
                setOverview(settingId, d);
                ws.editing = false;
                ws.dirty = false;
                ws.overviewDraft = null;
                toast('success', 'Front page saved.');
                rerender();
            }, { iconName: 'fa-floppy-disk', cls: 'sb-primary' }),
            button('Cancel', () => { ws.editing = false; ws.dirty = false; ws.overviewDraft = null; rerender(); }, { iconName: 'fa-xmark' })));
}

// The canon switch: a fixed setting (from a published lorebook, say) that
// nothing generated should be added to.
function canonCard(settingId) {
    const on = isCanonOnly(settingId);
    return h('label', { class: `sb-canon${on ? ' sb-canon-on' : ''}` },
        h('input', { type: 'checkbox', checked: on, onchange: (e) => { setCanonOnly(settingId, e.target.checked); rerender(); } }),
        icon(on ? 'fa-lock' : 'fa-lock-open'),
        h('div', {},
            h('b', {}, 'Canon only'),
            h('small', { class: 'sb-hint' }, on
                ? 'This setting is fixed canon: no generated detail is added to its entries, and places or characters the story invents wait in Review instead of joining the library.'
                : 'Off: the setting grows with the story - what the roleplay invents joins the library, ready to be fleshed out. Turn on for a fixed, published canon.')));
}

// ---- a chapter

function chapterPage(type, all, doc) {
    const { settingId } = ws.ctx;
    const entries = all[type.id];
    const parents = getParents(settingId);
    const locations = all.location ?? [];
    const names = new Map(Object.values(all).flat().map((e) => [e.id, e.name]));
    const pathLabel = (id) => pathOf(parents, id).map((x) => names.get(x)).filter(Boolean).join(' › ');
    const view = viewOf(type.id);
    const sort = getSettings().catalog.sort;

    const filtered = sortEntries(filterEntries(entries, { search: ws.search, tag: ws.tag, status: ws.status, within: ws.within }, { doc, parents }), sort, doc);
    const filtering = !!(ws.search || ws.tag || ws.status || ws.within);

    const tags = tagsOf(entries);
    const views = [['grid', 'fa-grip', 'Cards'], ['list', 'fa-list', 'List']];
    if (type.id === 'location') views.unshift(['tree', 'fa-sitemap', 'Tree']);

    const toolbar = h('div', { class: 'sb-toolbar' },
        h('div', { class: 'sb-search' }, icon('fa-magnifying-glass'), h('input', {
            class: 'text_pole', type: 'search', placeholder: `Search ${type.plural.toLowerCase()}…`, value: ws.search,
            oninput: (e) => { ws.search = e.target.value; clearTimeout(chapterPage.t); chapterPage.t = setTimeout(rerender, 250); },
        })),
        tags.length ? select([{ value: '', label: 'Any tag' }, ...tags.map((t) => ({ value: t, label: `#${t}` }))], ws.tag, { title: 'Tag', onchange: (e) => { ws.tag = e.target.value; rerender(); } }) : null,
        select([{ value: '', label: 'Any status' }, ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))], ws.status, { title: 'Status in this chat', onchange: (e) => { ws.status = e.target.value; rerender(); } }),
        PLACED.has(type.id) && locations.length ? select([{ value: '', label: 'Anywhere' }, ...locations.map((l) => ({ value: l.id, label: `Within ${pathLabel(l.id) || l.name}` })).sort((a, b) => a.label.localeCompare(b.label))], ws.within, { title: 'Where', onchange: (e) => { ws.within = e.target.value; rerender(); } }) : null,
        view !== 'tree' ? select([{ value: 'name', label: 'A–Z' }, { value: 'recent', label: 'Recently edited' }, { value: 'status', label: 'In play first' }], sort, { title: 'Sort', onchange: (e) => { getSettings().catalog.sort = e.target.value; saveSettings(); rerender(); } }) : null,
        h('div', { class: 'sb-viewtoggle' }, views.map(([v, i, label]) => h('div', { class: `sb-viewbtn${view === v ? ' active' : ''}`, title: label, onclick: () => setView(type.id, v) }, icon(i)))),
        button('Generate', () => { ws.genPanel = ws.genPanel === type.id ? null : type.id; rerender(); }, { iconName: 'fa-wand-magic-sparkles', title: `Generate a new ${type.noun} - from your idea, or a surprise` }),
        button(`New ${type.noun}`, () => openSheet('new'), { iconName: 'fa-plus', cls: 'sb-primary' }));

    let body;
    if (!entries.length) {
        body = h('div', { class: 'sb-callout sb-callout-big' },
            h('i', { class: `fa-solid ${type.icon}`, style: `color: ${type.color}` }),
            h('div', {}, h('b', {}, `No ${type.plural.toLowerCase()} yet.`), h('div', {}, CHAPTER_BLURBS[type.id] ?? '')),
            h('div', { class: 'sb-actions' },
                button(`Create the first ${type.noun}`, () => openSheet('new'), { iconName: 'fa-plus', cls: 'sb-primary' }),
                button('Generate one', () => { ws.genPanel = type.id; rerender(); }, { iconName: 'fa-wand-magic-sparkles' })));
    } else if (!filtered.length) {
        body = h('div', { class: 'sb-callout' }, icon('fa-filter-circle-xmark'), h('span', {}, 'Nothing matches.'), button('Clear filters', () => { ws.search = ''; ws.tag = ''; ws.status = ''; ws.within = ''; rerender(); }));
    } else if (view === 'tree' && !filtering) {
        body = locationTree(entries, doc, parents);
    } else if (view === 'list') {
        body = h('div', { class: 'sb-listview' }, filtered.map((e) => listRow(e, type, doc, pathLabel)));
    } else {
        body = h('div', { class: 'sb-grid' }, filtered.map((e) => card(e, type, doc, pathLabel)));
    }

    return h('div', { class: 'sb-chapter' },
        h('div', { class: 'sb-chapter-head', style: `--sb-accent: ${type.color}` },
            h('i', { class: `fa-solid ${type.icon}` }),
            h('div', {}, h('h2', {}, CHAPTER_LABELS[type.id] ?? type.plural), h('small', { class: 'sb-hint' }, CHAPTER_BLURBS[type.id] ?? '')),
            h('span', { class: 'sb-count-big' }, filtering ? `${filtered.length} of ${entries.length}` : String(entries.length))),
        toolbar,
        ws.genPanel === type.id ? generatePanel(type, all, pathLabel) : null,
        view === 'tree' && filtering ? h('small', { class: 'sb-hint' }, 'Filtering shows a flat list; clear the filters to see the tree.') : null,
        body);
}

// "Generate a new ..." - from the user's idea, or a surprise. The result
// opens as a new sheet in edit mode: nothing is created until Save (SB-133).
function generatePanel(type, all, pathLabel) {
    const busy = ws.generating?.scope === 'create';
    const placed = type.id === 'location' || PLACED.has(type.id);
    const g = ws.genInput ?? (ws.genInput = { brief: '', parentId: '' });
    const brief = h('textarea', { class: 'text_pole', rows: 2, placeholder: `What do you want? e.g. "${EXAMPLES[type.id] ?? 'something unexpected'}" - or leave empty for a surprise`, oninput: (e) => { g.brief = e.target.value; } });
    brief.value = g.brief;
    const locations = (all.location ?? []).map((l) => ({ value: l.id, label: pathLabel(l.id) || l.name })).sort((a, b) => a.label.localeCompare(b.label));
    const run = async (useBrief) => {
        ws.generating = { scope: 'create' };
        rerender();
        try {
            const fields = await fieldDefs(type);
            const { values, dropped } = await generateEntry({ task: 'create', type, ctx: ws.ctx, fields, all, brief: useBrief ? g.brief : '', parentId: g.parentId || null });
            ws.prefill = { values, parentId: g.parentId || null };
            ws.genPanel = null;
            if (dropped.length) toast('info', `Left out what did not fit: ${dropped.slice(0, 4).join('; ')}`);
            openSheet('new');
        } catch (err) {
            toast('error', `Could not generate: ${err?.message ?? err}`);
        } finally {
            ws.generating = null;
            rerender();
        }
    };
    return h('div', { class: 'sb-genpanel', style: `--sb-accent: ${type.color}` },
        h('div', { class: 'sb-card-title' }, icon('fa-wand-magic-sparkles'), ` Generate a ${type.noun}`,
            h('small', { class: 'sb-hint' }, ' - written to fit this setting; you review it before anything is saved')),
        brief,
        h('div', { class: 'sb-row' },
            placed && locations.length ? field(type.id === 'location' ? 'Inside' : 'Located in', select([{ value: '', label: type.id === 'location' ? '(a new region)' : '(anywhere)' }, ...locations], g.parentId, { onchange: (e) => { g.parentId = e.target.value; } })) : null,
            h('div', { class: 'sb-actions sb-push' },
                button(busy ? 'Writing…' : 'Generate', () => void run(true), { iconName: busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles', cls: 'sb-primary', disabled: busy }),
                button('Surprise me', () => void run(false), { iconName: 'fa-dice', disabled: busy, title: 'Ignore the idea box and invent something' }),
                button('', () => { ws.genPanel = null; rerender(); }, { iconName: 'fa-xmark', title: 'Close' }))));
}

const EXAMPLES = Object.freeze({
    character: 'a smuggler with a conscience who owes the wrong people',
    location: 'a tavern where deals are sealed in blood',
    faction: 'a guild of cartographers who erase places from maps',
    item: 'a compass that points to what you fear',
    creature: 'something that nests in shipwrecks',
    lore: 'why the bells ring at low tide',
    quest: 'recover a debt ledger before it is burned',
    scene: 'a tense auction interrupted by a fire',
    event: 'the night the lighthouse goes dark',
});

// A one-line subtitle for an entry: role, place, category...
function subtitleOf(entry, pathLabel) {
    const base = entry.base ?? entry;
    if (entry.type === 'location') {
        const path = pathLabel(entry.id).split(' › ');
        return path.length > 1 ? path.slice(0, -1).join(' › ') : (base.region || '');
    }
    for (const key of ['role', 'category', 'danger_level']) if (typeof base[key] === 'string' && base[key]) return base[key];
    if (typeof base.location === 'string' && base.location) return pathLabel(base.location);
    return '';
}

function statusBadge(entry, doc) {
    const status = chatStatusOf(entry.id, doc);
    return status === 'unused' ? null : h('span', { class: `sb-badge sb-badge-${status}` }, STATUS_LABELS[status]);
}

function thumb(entry, type, cls) {
    const src = safeImageSrc(entry.image);
    return src ? h('div', { class: cls }, h('img', { src, alt: '', loading: 'lazy' }))
        : h('div', { class: `${cls} sb-noimg`, style: `--sb-accent: ${type.color}` }, h('i', { class: `fa-solid ${type.icon}` }));
}

function card(entry, type, doc, pathLabel) {
    const subtitle = subtitleOf(entry, pathLabel);
    return h('div', { class: `sb-card-entry${entry.confirmed === false ? ' sb-unconfirmed' : ''}`, onclick: () => openSheet(entry.id), title: entry.name },
        thumb(entry, type, 'sb-card-img'),
        h('div', { class: 'sb-card-body' },
            h('div', { class: 'sb-card-name' }, entry.meta?.pinned ? icon('fa-thumbtack') : null, h('span', {}, entry.name)),
            subtitle ? h('small', { class: 'sb-card-sub' }, subtitle) : null,
            entry.description ? h('p', { class: 'sb-card-desc' }, truncate(entry.description, 110)) : null,
            h('div', { class: 'sb-card-foot' }, statusBadge(entry, doc), (entry.meta?.tags ?? []).slice(0, 3).map((t) => h('span', { class: 'sb-tag' }, `#${t}`)))));
}

function listRow(entry, type, doc, pathLabel) {
    const subtitle = subtitleOf(entry, pathLabel);
    return h('div', { class: `sb-listrow${entry.confirmed === false ? ' sb-unconfirmed' : ''}`, onclick: () => openSheet(entry.id) },
        thumb(entry, type, 'sb-list-img'),
        h('div', { class: 'sb-listrow-main' },
            h('div', { class: 'sb-listrow-head' }, entry.meta?.pinned ? icon('fa-thumbtack') : null, h('b', {}, entry.name), subtitle ? h('small', { class: 'sb-hint' }, subtitle) : null),
            entry.description ? h('small', { class: 'sb-listrow-desc' }, truncate(entry.description, 140)) : null),
        h('div', { class: 'sb-listrow-side' }, statusBadge(entry, doc), (entry.meta?.tags ?? []).slice(0, 3).map((t) => h('span', { class: 'sb-tag' }, `#${t}`))));
}

// The location tree: drag a place onto another to put it inside, onto the
// top strip to make it a region of its own; "+" adds a place inside.
function locationTree(entries, doc, parents) {
    const { settingId } = ws.ctx;
    const ids = entries.map((e) => e.id);
    const byId = new Map(entries.map((e) => [e.id, e]));
    const tree = buildTree(entries.map((e) => ({ id: e.id, name: e.name })), parents);
    const type = { color: '#4caf50', icon: 'fa-map-location-dot' };
    const collapsed = ws.collapsed ?? (ws.collapsed = new Set());

    const drop = (targetId) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('sb-drop');
        const id = e.dataTransfer.getData('text/x-sb-location');
        if (!id || id === targetId) return;
        if (targetId && wouldCreateCycle(parents, id, targetId)) return toast('warning', 'A place cannot go inside itself or one of its own parts.');
        setParent(settingId, id, targetId);
    };
    const over = (e) => { e.preventDefault(); e.currentTarget.classList.add('sb-drop'); };
    const leave = (e) => e.currentTarget.classList.remove('sb-drop');

    const node = (n, depth) => {
        const entry = byId.get(n.id);
        const kids = childrenOf(parents, ids, n.id).length;
        const isCollapsed = collapsed.has(n.id);
        const row = h('div', { class: 'sb-tree-row', style: `--sb-depth: ${depth}`, draggable: 'true', onclick: () => openSheet(n.id) },
            h('span', {
                class: `sb-twisty${kids ? '' : ' sb-leaf'}`,
                onclick: (e) => { e.stopPropagation(); if (!kids) return; if (isCollapsed) collapsed.delete(n.id); else collapsed.add(n.id); rerender(); },
            }, kids ? icon(isCollapsed ? 'fa-caret-right' : 'fa-caret-down') : icon('fa-circle')),
            thumb(entry, type, 'sb-tree-img'),
            h('span', { class: 'sb-tree-name' }, entry.name),
            kids ? h('small', { class: 'sb-count', title: 'places inside' }, String(kids)) : null,
            statusBadge(entry, doc),
            h('span', { class: 'sb-tree-add', title: `Add a place inside ${entry.name}`, onclick: (e) => { e.stopPropagation(); ws.newParent = n.id; openSheet('new'); } }, icon('fa-plus')));
        row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-sb-location', n.id); e.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragover', over);
        row.addEventListener('dragleave', leave);
        row.addEventListener('drop', drop(n.id));
        return [row, ...(isCollapsed ? [] : n.children.map((c) => node(c, depth + 1)))];
    };

    return h('div', { class: 'sb-tree' },
        h('div', { class: 'sb-drop-root', ondragover: over, ondragleave: leave, ondrop: drop(null) }, icon('fa-arrow-up'), ' Drop here to make a top-level region'),
        tree.map((n) => node(n, 0)));
}
