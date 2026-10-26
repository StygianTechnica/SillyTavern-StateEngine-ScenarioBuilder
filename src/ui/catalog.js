// The catalog browser (spec 6.3) - the setting book: a front page (the
// setting overview and a table of contents), then a chapter per object
// type, browsable as cards (the codex view), a compact list, or - for
// locations - a tree you rearrange by dragging (SB-141). Choosing an entry
// opens its sheet (sheet.js).

import { getSettings, saveSettings } from '../settings.js';
import { getChatDoc } from '../store/chat-store.js';
import { getObjectTypes, CHAPTER_LABELS, listEntries, getParents, setParent, getOverview, setOverview, getSettingSummary, isCanonOnly, setCanonOnly } from '../library/library.js';
import { getSettingDoc } from '../store/setting-store.js';
import { buildTree, wouldCreateCycle, childrenOf, pathOf } from '../library/hierarchy.js';
import { truncate } from '../guidance/build.js';
import { safeImageSrc } from '../images/attach.js';
import { filterEntries, sortEntries, tagsOf, chatStatusOf, STATUS_LABELS } from './catalog-model.js';
import { renderSheet } from './sheet.js';
import { ws, rerender, openSheet, markDirty, stopEditing } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';
import { chipSelect, selectWithCustom, diceButton, sparkButton, fieldWithTools } from './controls.js';
import {
    WORLD_TYPES, TONES, THEMES, MAGIC_KINDS, MAGIC_PRESENCE, MAGIC_POWER, MAGIC_RESTRICTIONS, TECH_LEVELS, TECH_FLAVORS, TECH_SPREAD, TECH_ABSENT_SUGGESTIONS,
    eraGroups, randomFor, techForEra, splitList, joinList,
} from '../library/world-options.js';
import { generateOverview, generateEntry, rollEntryName } from '../generate/run.js';
import { cultureOptions, markNameDeclined } from '../naming/run.js';
import { fieldDefs, wantsNsfwNote } from './sheet.js';
import { renderQuestBoard } from './quest-board.js';
import { locationMap } from './map.js';
import { runLoreSync, hasArchivistLore } from '../library/lore-sync.js';
import { syncNow } from '../guidance/sync.js';

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

const viewOf = (typeId) => getSettings().catalog.views[typeId] ?? (typeId === 'location' ? 'tree' : typeId === 'quest' ? 'board' : 'grid');

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
        const type = types.find((t) => t.id === ws.chapter);
        const board = type.id === 'quest' && viewOf('quest') === 'board' ? await renderQuestBoard(type) : null;
        content = chapterPage(type, all, doc, board);
    }
    return h('div', { class: 'sb-catalog' }, rail, h('div', { class: 'sb-content' }, content));
}

function railItem(key, iconName, label, count, color) {
    return h('div', {
        class: `sb-rail-item${ws.chapter === key ? ' active' : ''}`,
        onclick: () => {
            stopEditing();
            ws.chapter = key;
            ws.entryId = null;
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
        const m = overview.magic;
        const t = overview.tech;
        const empty = !['premise', 'worldType', 'tone', 'themes', 'era', 'rules'].some((k) => String(overview[k] ?? '').trim())
            && !m.presence && !m.kinds.length && !m.notes && !t.level && !t.notes;
        const label = (list, id) => list.find(([k]) => k === id)?.[1] ?? id;
        const meta = [
            ['World', overview.worldType ? label(WORLD_TYPES, overview.worldType) : ''],
            ['Era', overview.era], ['Tone', overview.tone], ['Themes', overview.themes],
        ].filter(([, v]) => String(v).trim());
        return h('div', { class: 'sb-front' },
            h('div', { class: 'sb-front-head' },
                h('div', {}, h('small', { class: 'sb-kicker' }, 'Setting'), h('h2', {}, setting?.name ?? 'Setting')),
                h('div', { class: 'sb-actions' },
                    bookGraphToggle(),
                    empty ? button('Surprise me', () => { ws.editing = true; ws.overviewDraft = null; ws.surprise = true; rerender(); }, { iconName: 'fa-dice', title: 'Roll a random world and write its front page' }) : null,
                    button('Edit', () => { ws.editing = true; ws.overviewDraft = null; rerender(); }, { iconName: 'fa-pen', cls: 'sb-primary' }))),
            empty ? h('div', { class: 'sb-callout' }, icon('fa-feather'), h('span', {}, 'Every setting starts with a premise. Click Edit to choose its world, tone and era - or Surprise me to roll one and have it written for you.'))
                : [
                    overview.premise ? h('p', { class: 'sb-premise' }, overview.premise) : null,
                    meta.length ? h('div', { class: 'sb-chips' }, meta.map(([k, v]) => h('span', { class: 'sb-chip' }, h('b', {}, `${k}: `), v))) : null,
                    systemsRead(overview),
                    overview.rules ? h('div', { class: 'sb-front-rules' }, h('h4', {}, 'Society and law'), h('p', { class: 'sb-prose' }, overview.rules)) : null,
                    overview.gmStyle ? h('div', { class: 'sb-front-rules' }, h('h4', {}, 'How the game master runs this story'), h('p', { class: 'sb-prose' }, overview.gmStyle)) : null,
                ],
            canonCard(settingId),
            h('h4', {}, 'Contents'),
            toc);
    }

    // ---- edit: one draft, so rolling and generating never lose input
    const d = ws.overviewDraft ?? (ws.overviewDraft = structuredClone(overview));
    // set('era', v) or set('magic.presence', v)
    const set = (path, value) => {
        const [a, b] = path.split('.');
        if (b) d[a][b] = value; else d[a] = value;
        markDirty();
    };
    const get = (path) => {
        const [a, b] = path.split('.');
        return b ? d[a][b] : d[a];
    };
    // The era suggests a technology level, until the user picks one.
    const followEra = () => {
        const suggested = techForEra(d.era);
        if (suggested && (!d.tech.level || d.tech.levelFromEra)) { d.tech.level = suggested; d.tech.levelFromEra = true; }
    };
    const reroll = (path) => () => {
        set(path, randomFor(path, d));
        if (path === 'era') followEra();
        if (path === 'tech.level') d.tech.levelFromEra = d.tech.level === techForEra(d.era);
        rerender({ force: true });
    };
    const canonBlocked = isCanonOnly(settingId) ? 'This setting is canon-only - turn that off on the front page to generate text.' : '';
    const busy = ws.generating?.scope === 'overview' ? ws.generating.field : null;

    const write = async (fields) => {
        ws.generating = { scope: 'overview', field: fields.length > 1 ? 'all' : fields[0] };
        rerender({ force: true });
        try {
            const { values } = await generateOverview({ ctx: ws.ctx, fields, overview: d, all, brief: ws.overviewBrief ?? '' });
            for (const [key, value] of Object.entries(values)) {
                if (key === 'magicNotes') d.magic.notes = value;
                else if (key === 'techNotes') d.tech.notes = value;
                else d[key] = value;
            }
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
        for (const key of ['worldType', 'era', 'tone', 'themes', 'magic.presence', 'magic.power', 'magic.kinds', 'magic.restrictions', 'tech.flavors', 'tech.spread']) set(key, randomFor(key, d));
        d.tech.level = '';
        followEra();
        if (!d.tech.level) d.tech.level = randomFor('tech.level', d);
    };
    const textFields = () => ['premise', 'rules', ...(d.magic.presence === 'none' ? [] : ['magicNotes']), 'techNotes'];
    if (ws.surprise) {
        ws.surprise = false;
        rollAll();
        if (!canonBlocked) queueMicrotask(() => void write(textFields()));
    }

    const PATHS = { magicNotes: 'magic.notes', techNotes: 'tech.notes' };
    const textArea = (key, rows, placeholder = '') => {
        const path = PATHS[key] ?? key;
        const el = h('textarea', { class: `text_pole${busy === key || busy === 'all' ? ' sb-gen-busy' : ''}`, rows, placeholder, oninput: (e) => set(path, e.target.value) });
        el.value = get(path) ?? '';
        return el;
    };
    const spark = (key) => sparkButton(() => void write([key]), { title: get(PATHS[key] ?? key) ? 'Enrich - keep it and add more' : 'Write it from the choices above', busy: busy === key || busy === 'all', disabledReason: canonBlocked });
    const pick = (path, list, onchange = null) => select([{ value: '', label: '—' }, ...list.map(([v, l]) => ({ value: v, label: l }))], get(path), {
        onchange: (e) => { set(path, e.target.value); onchange?.(); rerender({ force: true }); },
    });
    // Chips over an array value; a kind chosen on one side leaves the other.
    const chips = (path, options, placeholder, other = null, titles = {}) => chipSelect({
        options: [...options], value: joinList(get(path)), placeholder, titles, cls: path.endsWith('.absent') ? 'sb-chipselect-absent' : '',
        onChange: (v) => {
            const list = splitList(v);
            set(path, list);
            if (other && get(other).some((k) => list.includes(k))) {
                set(other, get(other).filter((k) => !list.includes(k)));
                rerender({ force: true });
            }
        },
    });
    const noMagic = d.magic.presence === 'none';

    const magicCard = h('div', { class: 'sb-card sb-systems' },
        h('div', { class: 'sb-card-title' }, icon('fa-hat-wizard'), ' Magic'),
        h('div', { class: 'sb-fieldgrid' },
            fieldWithTools('How widespread', pick('magic.presence', MAGIC_PRESENCE), [diceButton(reroll('magic.presence'))]),
            noMagic ? null : fieldWithTools('How powerful it can get', pick('magic.power', MAGIC_POWER), [diceButton(reroll('magic.power'))])),
        noMagic ? null : fieldWithTools('Kinds of magic that exist', chips('magic.kinds', MAGIC_KINDS, 'Add your own kind…', 'magic.absent'), [diceButton(reroll('magic.kinds'))]),
        noMagic ? null : fieldWithTools('Rules that restrict magic',
            chips('magic.restrictions', MAGIC_RESTRICTIONS.map(([label]) => label), 'Add your own rule…', null, Object.fromEntries(MAGIC_RESTRICTIONS)),
            [diceButton(reroll('magic.restrictions'))], 'Hover a rule to see what it means. These are hard rules for the model, like the limits below.'),
        fieldWithTools(noMagic ? 'Never mention' : 'Kinds that do NOT exist', chips('magic.absent', MAGIC_KINDS, 'e.g. arcane', 'magic.kinds'), [],
            'A hard limit: these never appear in generated content or the guidance - not even as rumour.'),
        noMagic ? null : fieldWithTools('How magic works', textArea('magicNotes', 3, 'Your own description - e.g. "great magic is rare, but nearly everyone knows a household charm or two"'), [spark('magicNotes')]));

    const techCard = h('div', { class: 'sb-card sb-systems' },
        h('div', { class: 'sb-card-title' }, icon('fa-gears'), ' Technology'),
        h('div', { class: 'sb-fieldgrid' },
            fieldWithTools('Level', pick('tech.level', TECH_LEVELS, () => { d.tech.levelFromEra = false; }), [diceButton(reroll('tech.level'))],
                [
                    TECH_LEVELS.find(([k]) => k === d.tech.level)?.[2] ? `${TECH_LEVELS.find(([k]) => k === d.tech.level)[2]}.` : '',
                    d.tech.levelFromEra ? `Suggested by the era (${d.era}) - pick another to override.` : (techForEra(d.era) && d.tech.level !== techForEra(d.era) ? `The era suggests ${TECH_LEVELS.find(([k]) => k === techForEra(d.era))?.[1] ?? ''}.` : ''),
                ].filter(Boolean).join(' ') || null),
            fieldWithTools('Spread and understanding', pick('tech.spread', TECH_SPREAD), [diceButton(reroll('tech.spread'))])),
        fieldWithTools('Flavour', chips('tech.flavors', TECH_FLAVORS, 'Add your own…'), [diceButton(reroll('tech.flavors'))]),
        fieldWithTools('Technology that does NOT exist', chips('tech.absent', TECH_ABSENT_SUGGESTIONS, 'e.g. gunpowder'), [], 'A hard limit, like the magic one.'),
        fieldWithTools('How technology works', textArea('techNotes', 3, 'Your own description - e.g. "the clans run salvaged sky-ships nobody alive could build"'), [spark('techNotes')]));

    return h('div', { class: 'sb-front' },
        h('div', { class: 'sb-front-head' },
            h('div', {}, h('small', { class: 'sb-kicker' }, 'Setting'), h('h2', {}, setting?.name ?? 'Setting')),
            h('div', { class: 'sb-actions' },
                button('Roll everything', () => { rollAll(); rerender({ force: true }); }, { iconName: 'fa-dice', title: 'Roll world type, era, tone, themes, magic and technology' }),
                button('Write front page', () => void write(textFields()), { iconName: 'fa-wand-magic-sparkles', disabled: !!canonBlocked || !!busy, title: canonBlocked || 'Write (or enrich) the premise, society, magic and technology from your choices' }))),
        h('div', { class: 'sb-card' },
            h('div', { class: 'sb-fieldgrid' },
                fieldWithTools('World type', select([{ value: '', label: '—' }, ...WORLD_TYPES.map(([v, l]) => ({ value: v, label: l }))], d.worldType, { onchange: (e) => { set('worldType', e.target.value); rerender({ force: true }); } }), [diceButton(reroll('worldType'))]),
                fieldWithTools('Era', selectWithCustom({ groups: eraGroups(d.worldType).map((g) => ({ label: g.label, items: g.eras })), value: d.era, onChange: (v) => { set('era', v); const before = d.tech.level; followEra(); if (d.tech.level !== before) rerender({ force: true }); } }), [diceButton(reroll('era'))])),
            fieldWithTools('Tone', chipSelect({ options: [...TONES], value: d.tone, onChange: (v) => set('tone', v) }), [diceButton(reroll('tone'))], 'Pick as many as fit.'),
            fieldWithTools('Themes', chipSelect({ options: [...THEMES], value: d.themes, onChange: (v) => set('themes', v), placeholder: 'Add your own theme…' }), [diceButton(reroll('themes'))])),
        h('div', { class: 'sb-systems-row' }, magicCard, techCard),
        h('div', { class: 'sb-card' },
            fieldWithTools('Premise', textArea('premise', 5), [spark('premise')], 'The pitch: what this world is and what stories happen in it.'),
            fieldWithTools('Society and law', textArea('rules', 4), [spark('rules')], 'Power, law, customs, taboos. Kept short in the guidance.'),
            field('How the game master runs this story', textArea('gmStyle', 3, 'e.g. "NPCs pursue their own agendas and act without waiting for Remus. Keep danger real; consequences stick."'),
                'Your standing instructions, in your own words: given to the game master (the director) and the narrator before every reply.'),
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

// Book / Graph: the front page's view toggle - the same setting as a book
// of chapters, or as a map of how its entries connect (graph.js).
function bookGraphToggle() {
    return h('div', { class: 'sb-viewtoggle', title: 'See the setting as a book, or as a graph of how everything connects' },
        h('div', { class: 'sb-viewbtn active', title: 'Book' }, icon('fa-book-open'), ' Book'),
        h('div', { class: 'sb-viewbtn', title: 'Graph', onclick: () => { ws.tab = 'graph'; rerender(); } }, icon('fa-diagram-project'), ' Graph'),
        h('div', { class: 'sb-viewbtn', title: 'Map of the places, one level at a time', onclick: () => openLocationMap() }, icon('fa-map'), ' Map'));
}

// The Locations chapter in its Map view (src/ui/map.js).
export function openLocationMap() {
    getSettings().catalog.views.location = 'map';
    saveSettings();
    ws.tab = 'catalog';
    ws.chapter = 'location';
    ws.entryId = null;
    rerender();
}

// The front page's read view of magic and technology: what exists, how
// much, and - struck through - what does not.
function systemsRead(o) {
    const m = o.magic;
    const t = o.tech;
    const lab = (list, id) => list.find(([k]) => k === id)?.[1] ?? id;
    const absent = (list) => list.map((k) => h('span', { class: 'sb-chip sb-chip-absent', title: 'Does not exist in this world' }, icon('fa-ban'), k));
    const magic = m.presence || m.kinds.length || m.absent.length || m.restrictions.length || m.notes ? h('div', { class: 'sb-card sb-systems' },
        h('div', { class: 'sb-card-title' }, icon('fa-hat-wizard'), ' Magic'),
        m.presence === 'none' ? h('div', {}, 'There is no magic in this world.') : h('div', { class: 'sb-chips' },
            m.presence ? h('span', { class: 'sb-chip' }, h('b', {}, 'Widespread: '), lab(MAGIC_PRESENCE, m.presence).split(' - ')[0]) : null,
            m.power ? h('span', { class: 'sb-chip' }, h('b', {}, 'Power: '), lab(MAGIC_POWER, m.power).split(' - ')[0]) : null,
            m.kinds.map((k) => h('span', { class: 'sb-chip sb-chip-on' }, k))),
        m.presence !== 'none' && m.restrictions.length ? h('div', { class: 'sb-chips' }, m.restrictions.map((r) => h('span', {
            class: 'sb-chip sb-chip-rule', title: MAGIC_RESTRICTIONS.find(([label]) => label === r)?.[1] ?? '',
        }, icon('fa-scale-balanced'), r))) : null,
        m.absent.length ? h('div', { class: 'sb-chips' }, absent(m.absent)) : null,
        m.notes ? h('p', { class: 'sb-prose' }, m.notes) : null) : null;
    const tech = t.level || t.flavors.length || t.spread || t.absent.length || t.notes ? h('div', { class: 'sb-card sb-systems' },
        h('div', { class: 'sb-card-title' }, icon('fa-gears'), ' Technology'),
        h('div', { class: 'sb-chips' },
            t.level ? h('span', { class: 'sb-chip' }, h('b', {}, 'Level: '), lab(TECH_LEVELS, t.level)) : null,
            t.spread ? h('span', { class: 'sb-chip' }, lab(TECH_SPREAD, t.spread)) : null,
            t.flavors.map((f) => h('span', { class: 'sb-chip sb-chip-on' }, f))),
        t.absent.length ? h('div', { class: 'sb-chips' }, absent(t.absent)) : null,
        t.notes ? h('p', { class: 'sb-prose' }, t.notes) : null) : null;
    return magic || tech ? h('div', { class: 'sb-systems-row' }, magic, tech) : null;
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

// Lore from Archivist's compiled memory, on demand (src/library/lore-sync.js).
async function scanLore() {
    const { chatId, chatKey, settingId } = ws.ctx;
    ws.loreScanning = true;
    rerender();
    try {
        const out = await runLoreSync(chatId, chatKey, settingId, { scan: true });
        if (!out) toast('warning', 'A scan is already running.');
        else toast('success', out.created || out.linked || out.updated ? `Lore: ${out.created} new, ${out.updated} updated, ${out.linked} linked.` : 'Nothing new in Archivist\'s lore.');
        await syncNow();
    } finally {
        ws.loreScanning = false;
        rerender({ force: true });
    }
}

function chapterPage(type, all, doc, board = null) {
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
    if (type.id === 'location') views.unshift(['tree', 'fa-sitemap', 'Tree - places inside places', 'Tree'], ['map', 'fa-map', 'Map - places where they lie, one level at a time', 'Map']);
    if (type.id === 'quest') views.unshift(['board', 'fa-table-columns', 'Board', 'Board']);

    const toolbar = h('div', { class: 'sb-toolbar' },
        h('div', { class: 'sb-search' }, icon('fa-magnifying-glass'), h('input', {
            class: 'text_pole', type: 'search', placeholder: `Search ${type.plural.toLowerCase()}…`, value: ws.search,
            oninput: (e) => { ws.search = e.target.value; clearTimeout(chapterPage.t); chapterPage.t = setTimeout(rerender, 250); },
        })),
        tags.length ? select([{ value: '', label: 'Any tag' }, ...tags.map((t) => ({ value: t, label: `#${t}` }))], ws.tag, { title: 'Tag', onchange: (e) => { ws.tag = e.target.value; rerender(); } }) : null,
        select([{ value: '', label: 'Any status' }, ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))], ws.status, { title: 'Status in this chat', onchange: (e) => { ws.status = e.target.value; rerender(); } }),
        PLACED.has(type.id) && locations.length ? select([{ value: '', label: 'Anywhere' }, ...locations.map((l) => ({ value: l.id, label: `Within ${pathLabel(l.id) || l.name}` })).sort((a, b) => a.label.localeCompare(b.label))], ws.within, { title: 'Where', onchange: (e) => { ws.within = e.target.value; rerender(); } }) : null,
        view !== 'tree' && view !== 'map' ? select([{ value: 'name', label: 'A–Z' }, { value: 'recent', label: 'Recently edited' }, { value: 'status', label: 'In play first' }], sort, { title: 'Sort', onchange: (e) => { getSettings().catalog.sort = e.target.value; saveSettings(); rerender(); } }) : null,
        h('div', { class: 'sb-viewtoggle' }, views.map(([v, i, label, text]) => h('div', { class: `sb-viewbtn${view === v ? ' active' : ''}`, title: label, onclick: () => setView(type.id, v) }, icon(i), text ? ` ${text}` : null))),
        type.id === 'lore' && hasArchivistLore() ? button(ws.loreScanning ? 'Scanning…' : 'Scan Archivist', () => void scanLore(), { iconName: ws.loreScanning ? 'fa-spinner fa-spin' : 'fa-book-open-reader', disabled: !!ws.loreScanning, title: 'Take the lore Archivist has found in this chat into the library' }) : null,
        button('Generate', () => { ws.genPanel = ws.genPanel === type.id ? null : type.id; rerender(); }, { iconName: 'fa-wand-magic-sparkles', title: `Generate a new ${type.noun} - from your idea, or a surprise` }),
        button(`New ${type.noun}`, () => openSheet('new'), { iconName: 'fa-plus', cls: 'sb-primary' }));

    let body;
    // The quest board has its own empty state (with the Scan button).
    if (board && !filtering) {
        body = board;
    } else if (!entries.length) {
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
    } else if (view === 'map' && !filtering) {
        body = locationMap(entries, doc);
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
        (view === 'tree' || view === 'map') && filtering ? h('small', { class: 'sb-hint' }, `Filtering shows a flat list; clear the filters to see the ${view}.`) : null,
        body);
}

// "Generate a new ..." - from the user's idea, or a surprise. The result
// opens as a new sheet in edit mode: nothing is created until Save (SB-133).
function generatePanel(type, all, pathLabel) {
    const busy = ws.generating?.scope === 'create';
    const placed = type.id === 'location' || PLACED.has(type.id);
    const g = ws.genInput ?? (ws.genInput = { brief: '', parentId: '', name: '', rolled: '', culture: '', gender: '' });
    const brief = h('textarea', { class: 'text_pole', rows: 2, placeholder: `What do you want? e.g. "${EXAMPLES[type.id] ?? 'something unexpected'}" - or leave empty for a surprise`, oninput: (e) => { g.brief = e.target.value; } });
    brief.value = g.brief;
    const locations = (all.location ?? []).map((l) => ({ value: l.id, label: pathLabel(l.id) || l.name })).sort((a, b) => a.label.localeCompare(b.label));
    // The name: typed, rolled with the dice, or (left empty) rolled when it
    // is generated - in the chosen culture (src/naming/).
    const nameBox = h('input', { class: 'text_pole', value: g.name ?? '', placeholder: 'Leave empty to roll one when it is generated', oninput: (e) => { g.name = e.target.value; } });
    const reroll = () => {
        if (g.rolled && g.name === g.rolled) markNameDeclined(ws.ctx.settingId, g.rolled);
        const name = rollEntryName({ ctx: ws.ctx, type, brief: g.brief, all, parentId: g.parentId || null, naming: { cultureId: g.culture, gender: g.gender } });
        if (!name) return toast('info', `Nothing to roll for this ${type.noun} - the model will name it in plain words.`);
        g.name = name;
        g.rolled = name;
        nameBox.value = name;
    };
    const run = async (useBrief) => {
        ws.generating = { scope: 'create' };
        rerender();
        try {
            const fields = await fieldDefs(type);
            const naming = { name: (g.name ?? '').trim(), cultureId: g.culture, gender: g.gender };
            const { values, dropped } = await generateEntry({ task: 'create', type, ctx: ws.ctx, fields, all, brief: useBrief ? g.brief : '', parentId: g.parentId || null, naming });
            g.name = '';
            g.rolled = '';
            ws.prefill = { values, parentId: g.parentId || null };
            // Its intimate-scene note follows on the sheet, when the setting writes one.
            ws.pendingNsfw = type.id === 'character' && wantsNsfwNote();
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
            field('Name', h('div', { class: 'sb-row sb-gen-name' }, nameBox, diceButton(reroll, 'Roll a name in this culture - never one already used'))),
            field('Culture', select(cultureOptions(ws.ctx.settingId), g.culture, { onchange: (e) => { g.culture = e.target.value; } }), 'Whose names it takes'),
            type.id === 'character' ? field('Gender', select([{ value: '', label: 'From the idea, or either' }, { value: 'f', label: 'Female' }, { value: 'm', label: 'Male' }], g.gender, { onchange: (e) => { g.gender = e.target.value; } })) : null),
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
    const player = ws.ctx?.settingId && getSettingDoc(ws.ctx.settingId).playerId === entry.id
        ? h('span', { class: 'sb-badge sb-badge-player', title: 'The character you play' }, icon('fa-gamepad'), ' Player') : null;
    return [player, status === 'unused' ? null : h('span', { class: `sb-badge sb-badge-${status}` }, STATUS_LABELS[status])];
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
