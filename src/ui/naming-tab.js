// The Naming tab (docs/DESIGN - NAMING.md, section 6): the world default
// culture and why it was chosen, the world's own cultures and their editor
// (seed languages, mutation, sound shifts, family names, the user's own
// example names, an alien tongue's sounds, how each kind of thing is
// named, banned names), who uses which culture, live sample names, and a
// test bench.

import { STOCKS, REAL_CULTURES } from '../naming/stocks/index.js';
import { cultureChoices, resolveCulture, CULTURE_KINDS, STYLE_KINDS, STYLE_CHOICES, describeShift, PRESETS } from '../naming/cultures.js';
import {
    worldDefault, setWorldDefault, addCulture, updateCulture, rerollShifts, removeCulture, cultureHolders, setEntryCulture, banName, sampleNames,
} from '../naming/run.js';
import { listEntries } from '../library/library.js';
import { getSettingDoc } from '../store/setting-store.js';
import { confirmAction } from './confirm.js';
import { ws, rerender } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

const SAMPLE_KINDS = Object.freeze([
    { key: 'men', label: 'Men', typeId: 'character', brief: 'a man' },
    { key: 'women', label: 'Women', typeId: 'character', brief: 'a woman' },
    { key: 'towns', label: 'Towns and cities', typeId: 'location', brief: 'a town' },
    { key: 'regions', label: 'Regions and realms', typeId: 'location', brief: 'a kingdom' },
    { key: 'features', label: 'Woods, rivers, mountains', typeId: 'location', brief: 'a forest' },
    { key: 'inns', label: 'Inns and taverns', typeId: 'location', brief: 'a tavern' },
    { key: 'houses', label: 'Noble houses', typeId: 'faction', brief: 'a noble house' },
    { key: 'business', label: 'Businesses', typeId: 'faction', brief: 'a business' },
    { key: 'orders', label: 'Orders and guilds', typeId: 'faction', brief: 'an order' },
]);

const MUTATIONS = Object.freeze([
    [0, 'None - a blend that sounds like the real languages'],
    [1, 'Light - a few sound shifts of its own'],
    [2, 'Strong - more shifts, and endings of its own'],
    [3, 'Wild - shifted and recombined, barely recognisable'],
]);

const languages = () => Object.values(STOCKS).map((s) => ({ value: s.id, label: s.label })).sort((a, b) => a.label.localeCompare(b.label));
const csvOf = (list) => (list ?? []).join(', ');
const listOf = (text) => String(text ?? '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

// Text that commits when the box loses focus (no redraw while typing).
function commitInput(value, onCommit, attrs = {}) {
    const el = h('input', { class: 'text_pole', value: value ?? '', ...attrs });
    el.addEventListener('change', () => onCommit(el.value));
    return el;
}
function commitArea(value, onCommit, rows = 3, attrs = {}) {
    const el = h('textarea', { class: 'text_pole', rows, ...attrs });
    el.value = value ?? '';
    el.addEventListener('change', () => onCommit(el.value));
    return el;
}

// ---- the left column

function defaultCard(settingId, naming) {
    const d = worldDefault(settingId);
    const options = [
        { value: '', label: `Automatic - ${d.automatic.label}` },
        ...cultureChoices(naming).map((c) => ({ value: c.value, label: `${c.group}: ${c.label}` })),
    ];
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-earth-americas'), ' World default'),
        select(options, d.auto ? '' : d.id, { onchange: (e) => { setWorldDefault(settingId, e.target.value); rerender(); } }),
        h('small', { class: 'sb-hint' }, d.auto
            ? `${d.label} - ${d.automatic.why}. Used for anything not inside a place or faction with a culture of its own.`
            : `${d.label}, chosen by you. Automatic would be ${d.automatic.label} (${d.automatic.why}).`),
        d.id && !naming.cultures?.[d.id] ? h('div', { class: 'sb-actions' }, button('Make it this world\'s own', () => {
            ws.namingCulture = addCulture(settingId, d.id.startsWith('auto:') ? 'blank' : d.id);
            setWorldDefault(settingId, ws.namingCulture);
            rerender();
        }, { iconName: 'fa-pen-to-square', title: 'A copy you can edit, set as the world default' })) : null);
}

function culturesCard(settingId, naming) {
    const own = Object.values(naming.cultures ?? {});
    const fromOptions = [
        { value: '', label: 'Add a culture…' },
        ...PRESETS.map((p) => ({ value: `preset:${p.id}`, label: `From ${p.label}` })),
        { value: 'sound', label: 'An alien tongue - built from sounds' },
        { value: 'blank', label: 'From scratch' },
        ...REAL_CULTURES.map((r) => ({ value: r.id, label: `Real world: ${r.label}` })),
    ];
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-language'), ' This world\'s cultures',
            h('small', { class: 'sb-hint' }, ' - peoples, nations, species: whose names are whose')),
        own.length ? h('div', { class: 'sb-naming-list' }, own.map((c) => h('div', {
            class: `sb-naming-item${ws.namingCulture === c.id ? ' active' : ''}`,
            onclick: () => { ws.namingCulture = c.id; rerender(); },
        }, h('b', {}, c.name), h('small', { class: 'sb-hint' }, ` ${CULTURE_KINDS.find(([k]) => k === c.kind)?.[1].split(' - ')[0] ?? ''}`)))) : h('small', { class: 'sb-hint' }, 'None yet - every name comes from the world default.'),
        select(fromOptions, '', {
            onchange: (e) => {
                if (!e.target.value) return;
                ws.namingCulture = addCulture(settingId, e.target.value);
                rerender();
            },
        }));
}

function holdersCard(settingId, naming, places, factions) {
    const byId = new Map([...places, ...factions].map((e) => [e.id, e]));
    const label = (id) => resolveCulture(id, { naming, seed: naming.seed || 'world' })?.label ?? id;
    const holders = cultureHolders(settingId).filter((x) => byId.has(x.id));
    let pickEntry = '';
    let pickCulture = '';
    const entryOptions = [{ value: '', label: 'A place or faction…' }, ...[...places, ...factions].filter((e) => !holders.some((x) => x.id === e.id)).map((e) => ({ value: e.id, label: `${e.name} (${e.type === 'location' ? 'place' : 'faction'})` })).sort((a, b) => a.label.localeCompare(b.label))];
    const cultureOptions = [{ value: '', label: 'uses…' }, ...cultureChoices(naming).map((c) => ({ value: c.value, label: `${c.group}: ${c.label}` }))];
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-map-location-dot'), ' Who uses which',
            h('small', { class: 'sb-hint' }, ' - places pass their culture to the places inside them; a faction\'s people take its names')),
        holders.length ? holders.map((x) => h('div', { class: 'sb-alias-row' },
            h('strong', {}, byId.get(x.id).name), h('small', { class: 'sb-hint' }, ` ${label(x.culture)}`),
            h('span', { class: 'sb-iconbtn', title: 'Back to inheriting', onclick: () => { setEntryCulture(settingId, x.id, ''); rerender(); } }, icon('fa-xmark')))) : h('small', { class: 'sb-hint' }, 'No place or faction has a culture of its own yet.'),
        h('div', { class: 'sb-row' },
            select(entryOptions, '', { onchange: (e) => { pickEntry = e.target.value; } }),
            select(cultureOptions, '', { onchange: (e) => { pickCulture = e.target.value; } }),
            button('Set', () => {
                if (!pickEntry || !pickCulture) return toast('info', 'Pick a place or faction and a culture.');
                setEntryCulture(settingId, pickEntry, pickCulture);
                rerender();
            }, { iconName: 'fa-check' })));
}

// ---- the editor

function seedRows(seeds, onChange) {
    const langs = languages();
    const rows = seeds.map((sd, i) => h('div', { class: 'sb-alias-row' },
        select(langs, sd.language, { onchange: (e) => onChange(seeds.map((x, j) => (j === i ? { ...x, language: e.target.value } : x))) }),
        select([1, 2, 3, 4, 5].map((w) => ({ value: w, label: `weight ${w}` })), sd.weight, { onchange: (e) => onChange(seeds.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x))) }),
        seeds.length > 1 ? h('span', { class: 'sb-iconbtn', title: 'Remove', onclick: () => onChange(seeds.filter((_, j) => j !== i)) }, icon('fa-xmark')) : null));
    return h('div', {}, rows,
        select([{ value: '', label: 'Add a language…' }, ...langs], '', { onchange: (e) => { if (e.target.value) onChange([...seeds, { language: e.target.value, weight: 1 }]); } }));
}

function inventedFields(settingId, def) {
    const set = (mutate) => { updateCulture(settingId, def.id, mutate); rerender(); };
    const familyMode = def.family.from === 'places' ? 'places' : def.family.seeds.length ? 'own' : 'same';
    return [
        field('Grown from', seedRows(def.seeds, (seeds) => set((d) => { d.seeds = seeds; })), 'Real-world name lists, blended by weight - the first is its root, the one it is most like.'),
        field('How far from the real names', select(MUTATIONS.map(([value, label]) => ({ value, label })), def.mutation, {
            onchange: (e) => { set((d) => { d.mutation = Number(e.target.value); }); rerollShifts(settingId, def.id); rerender(); },
        })),
        def.mutation ? h('div', { class: 'sb-field' }, h('span', { class: 'sb-field-label' }, 'Its sound shifts'),
            h('div', { class: 'sb-chips' }, (def.shifts.length ? def.shifts : ['(rolled when names are made)']).map((s) => h('span', { class: 'sb-chip' }, def.shifts.length ? describeShift(s) : s))),
            h('div', { class: 'sb-actions' }, button('Roll other shifts', () => { rerollShifts(settingId, def.id); rerender(); }, { iconName: 'fa-dice', title: 'Its names drift a different way - every name it makes changes' }))) : null,
        field('Family names', select([
            { value: 'same', label: 'From the same languages' },
            { value: 'own', label: 'From other languages' },
            { value: 'places', label: 'Made like place names (houses named for where they are from)' },
        ], familyMode, {
            onchange: (e) => set((d) => {
                d.family.from = e.target.value === 'places' ? 'places' : '';
                d.family.seeds = e.target.value === 'own' ? (d.family.seeds.length ? d.family.seeds : [{ language: d.seeds[0].language, weight: 1 }]) : [];
            }),
        }), 'Surnames often sound younger than given names: give them their own languages, or older forms.'),
        familyMode === 'own' ? field('Family names from', seedRows(def.family.seeds, (seeds) => set((d) => { d.family.seeds = seeds; }))) : null,
        h('div', { class: 'sb-row' },
            field('Family names: how far', select(MUTATIONS.map(([value, label]) => ({ value, label: label.split(' - ')[0] })), def.family.mutation, { onchange: (e) => set((d) => { d.family.mutation = Number(e.target.value); }) })),
            h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: def.family.old, onchange: (e) => set((d) => { d.family.old = e.target.checked; }) }), h('span', {}, 'Older forms (farm and house names, not modern surnames)'))),
        field('Your own example names', commitArea(def.learned.join(', '), (v) => set((d) => { d.learned = listOf(v); }), 3, { placeholder: 'Names this people should sound like - they join the blend, and are never handed out themselves' })),
        def.learned.length ? field('How much your names count', select([1, 2, 3, 4, 5].map((w) => ({ value: w, label: `weight ${w}` })), def.learnedWeight, { onchange: (e) => set((d) => { d.learnedWeight = Number(e.target.value); }) })) : null,
    ];
}

function soundFields(settingId, def) {
    const set = (mutate) => { updateCulture(settingId, def.id, mutate); rerender(); };
    const s = def.sound;
    return [
        h('small', { class: 'sb-hint' }, 'Sounds and how often they come: "k:3 r:3 th sh" - k and r three times as often as th and sh. Shapes: C a consonant, V a vowel ("CV:3 CVC:2 V").'),
        field('Consonants', commitInput(s.consonants, (v) => set((d) => { d.sound.consonants = v; }))),
        field('Vowels', commitInput(s.vowels, (v) => set((d) => { d.sound.vowels = v; }))),
        field('Syllable shapes', commitInput(s.shapes, (v) => set((d) => { d.sound.shapes = v; }))),
        h('div', { class: 'sb-row' },
            field('Syllables, fewest', select([1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })), s.syllables[0], { onchange: (e) => set((d) => { d.sound.syllables = [Number(e.target.value), Math.max(Number(e.target.value), d.sound.syllables[1])]; }) })),
            field('most', select([1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) })), s.syllables[1], { onchange: (e) => set((d) => { d.sound.syllables = [Math.min(d.sound.syllables[0], Number(e.target.value)), Number(e.target.value)]; }) })),
            h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: s.surnames, onchange: (e) => set((d) => { d.sound.surnames = e.target.checked; }) }), h('span', {}, 'Family names too'))),
    ];
}

function editorCard(settingId, naming, def, places, factions) {
    const set = (mutate) => { updateCulture(settingId, def.id, mutate); rerender(); };
    const byId = new Map([...places, ...factions].map((e) => [e.id, e]));
    const users = cultureHolders(settingId).filter((x) => x.culture === def.id && byId.has(x.id));
    const isDefault = naming.defaultCulture === def.id;
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-pen-to-square'), ` ${def.name}`,
            h('small', { class: 'sb-hint' }, ` - ${CULTURE_KINDS.find(([k]) => k === def.kind)?.[1] ?? ''}`)),
        h('div', { class: 'sb-row' },
            field('Name', commitInput(def.name, (v) => set((d) => { d.name = v.trim() || d.name; }))),
            h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: isDefault, onchange: (e) => { setWorldDefault(settingId, e.target.checked ? def.id : ''); rerender(); } }), h('span', {}, 'The world default'))),
        field('Notes', commitArea(def.notes, (v) => set((d) => { d.notes = v; }), 2, { placeholder: 'Who they are - harsh mountain clans whose names are boasts' })),
        ...(def.kind === 'invented' ? inventedFields(settingId, def) : []),
        def.kind === 'real' ? field('Real-world culture', select(REAL_CULTURES.map((r) => ({ value: r.id, label: r.label })), def.realId, { onchange: (e) => set((d) => { d.realId = e.target.value; }) }), 'Real names as they are, the common ones most often, with their real conventions (patronymics, two surnames, family name first).') : null,
        ...(def.kind === 'sound' ? soundFields(settingId, def) : []),
        h('div', { class: 'sb-field' }, h('span', { class: 'sb-field-label' }, 'How it names things'),
            h('div', { class: 'sb-row' }, STYLE_KINDS.map(([k, label]) => field(label, select([{ value: '', label: '(its usual way)' }, ...STYLE_CHOICES.map(([value, l]) => ({ value, label: l }))], def.style[k] ?? '', {
                onchange: (e) => set((d) => { if (e.target.value) d.style[k] = e.target.value; else delete d.style[k]; }),
            }))))),
        field('Never these names', commitArea(csvOf(def.banned), (v) => set((d) => { d.banned = listOf(v); }), 2, { placeholder: 'Names and words it must not make, comma-separated' })),
        h('div', { class: 'sb-field' }, h('span', { class: 'sb-field-label' }, 'Used by'),
            users.length ? h('div', { class: 'sb-chips' }, users.map((x) => h('span', { class: 'sb-chip' }, byId.get(x.id).name))) : h('small', { class: 'sb-hint' }, isDefault ? 'Everything, as the world default.' : 'Nothing yet - set it on places and factions under "Who uses which", or on their sheets.')),
        h('div', { class: 'sb-actions' },
            button('Delete this culture', async () => {
                if (!await confirmAction(`Delete ${def.name}? Places and factions using it go back to inheriting.`)) return;
                removeCulture(settingId, def.id);
                ws.namingCulture = null;
                rerender();
            }, { iconName: 'fa-trash' })));
}

// ---- samples and the test bench

function samplesCard(settingId, cultureId, label, all) {
    const round = ws.namingRound ?? 0;
    const rows = sampleNames(settingId, cultureId, SAMPLE_KINDS, all, { round });
    const copy = async (name) => {
        try { await navigator.clipboard.writeText(name); toast('success', `Copied "${name}".`); } catch { toast('warning', 'Could not copy - your browser blocked it.'); }
    };
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-dice'), ` Sample names - ${label}`,
            h('span', { class: 'sb-spacer' }),
            button('Roll again', () => { ws.namingRound = round + 1; rerender(); }, { iconName: 'fa-rotate' })),
        h('small', { class: 'sb-hint' }, 'Click a name to copy it; the cross bans it for good. Samples are not used up - the generator still hands out fresh names.'),
        SAMPLE_KINDS.map((k) => h('div', { class: 'sb-naming-samples' },
            h('small', { class: 'sb-field-label' }, k.label),
            h('div', { class: 'sb-chips' }, (rows[k.key] ?? []).map((s) => h('span', { class: 'sb-chip', title: s.meaning ? `"${s.meaning}"` : 'Click to copy' },
                h('span', { onclick: () => void copy(s.name) }, s.name),
                h('span', { class: 'sb-iconbtn', title: 'Never make this name', onclick: () => { banName(settingId, cultureId, s.name); rerender(); } }, icon('fa-xmark'))))))));
}

function benchCard(settingId, cultureId, all) {
    const b = ws.namingBench ?? (ws.namingBench = { typeId: 'location', brief: '', out: [] });
    const roll = () => {
        const rows = sampleNames(settingId, cultureId, [{ key: 'x', typeId: b.typeId, brief: b.brief }], all, { round: (ws.namingRound ?? 0) + 1000 + Math.floor(Math.random() * 1e6), count: 5 });
        b.out = rows.x ?? [];
        if (!b.out.length) toast('info', 'Nothing to roll for that - the model names it in plain words.');
        rerender();
    };
    const brief = h('input', { class: 'text_pole', value: b.brief, placeholder: 'a tavern by the docks, a rival corporation, a mountain range…', oninput: (e) => { b.brief = e.target.value; } });
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-flask'), ' Try it'),
        h('div', { class: 'sb-row' },
            select([{ value: 'character', label: 'A person' }, { value: 'location', label: 'A place' }, { value: 'faction', label: 'A faction' }, { value: 'item', label: 'A ship' }], b.typeId, { onchange: (e) => { b.typeId = e.target.value; } }),
            brief,
            button('Roll', roll, { iconName: 'fa-dice' })),
        b.out.length ? h('div', { class: 'sb-chips' }, b.out.map((s) => h('span', { class: 'sb-chip', title: s.meaning ? `"${s.meaning}"` : '' }, s.name))) : null);
}

export async function renderNaming() {
    const { chatId, settingId } = ws.ctx;
    if (!settingId) return h('div', { class: 'sb-muted' }, 'This chat has no setting yet.');
    const naming = getSettingDoc(settingId).naming;
    const [places, factions, characters] = await Promise.all(['location', 'faction', 'character'].map((t) => listEntries(chatId, settingId, t).catch(() => [])));
    const all = { location: places, faction: factions, character: characters };
    if (ws.namingCulture && !naming.cultures[ws.namingCulture]) ws.namingCulture = null;
    const def = ws.namingCulture ? naming.cultures[ws.namingCulture] : null;
    const shown = def ? def.id : worldDefault(settingId).id;
    const shownLabel = def ? def.name : `the world default (${worldDefault(settingId).label})`;
    return h('div', { class: 'sb-naming' },
        h('div', { class: 'sb-scene-cols' },
            h('div', { class: 'sb-gm-col' }, defaultCard(settingId, naming), culturesCard(settingId, naming), holdersCard(settingId, naming, places, factions)),
            h('div', { class: 'sb-gm-col' },
                def ? editorCard(settingId, naming, def, places, factions) : null,
                samplesCard(settingId, shown, shownLabel, all),
                benchCard(settingId, shown, all))));
}
