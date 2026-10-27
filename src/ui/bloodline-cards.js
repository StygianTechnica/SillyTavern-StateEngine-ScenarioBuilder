// The bloodline cards on an entry's sheet (docs/DESIGN - BLOODLINES.md):
// a Lore entry's bloodline block, a character's bloodline, a place's mix
// and a faction's members - and the mix editor the Bloodlines tab shares.
// Each saves at once, like the sheet's fight and gifts cards.

import { setEntryMeta, getParents } from '../library/library.js';
import { getSettingDoc } from '../store/setting-store.js';
import { syncNow } from '../guidance/sync.js';
import {
    BLOODLINE_KINDS, SHARES, LIFESPANS, KNOWN, NAMING_MODES, HUMANS,
    bloodlinesOf, choicesOf, normalizeBloodline, normalizeLineage, normalizePlacePopulation, normalizeMembers,
    wordsOf, lineageOf, mixAt, mixText, emptyBloodline,
} from '../library/bloodlines.js';
import { setBloodline } from '../library/bloodline-store.js';
import { cultureChoices } from '../naming/cultures.js';
import { ws, rerender, openSheet, markDirty } from './ws.js';
import { h, icon, button, select, field } from './dom.js';

const after = () => { void syncNow(); rerender({ force: true }); };

// Text that commits when the box loses focus (no redraw while typing).
export function commitInput(value, onCommit, attrs = {}) {
    const el = h('input', { class: 'text_pole', value: value ?? '', ...attrs });
    el.addEventListener('change', () => onCommit(el.value));
    return el;
}
export function commitArea(value, onCommit, rows = 2, attrs = {}) {
    const el = h('textarea', { class: 'text_pole', rows, ...attrs });
    el.value = value ?? '';
    el.addEventListener('change', () => onCommit(el.value));
    return el;
}

const nameOf = (b) => (b.id === HUMANS ? 'Humans (implicit)' : b.name);

// A mix as rows of bloodline and share, with a row to add one.
// choices: every bloodline a mix can name; onChange(mix).
export function mixEditor(mix, choices, onChange, { emptyText = 'Nobody set - inherited.' } = {}) {
    const byId = new Map(choices.map((b) => [b.id, b]));
    const rows = mix.filter((r) => byId.has(r.id));
    const left = choices.filter((b) => !rows.some((r) => r.id === b.id));
    const shareOptions = SHARES.map(([id, label]) => ({ value: id, label }));
    return h('div', { class: 'sb-mix' },
        rows.length ? rows.map((r) => h('div', { class: 'sb-mix-row' },
            h('span', { class: 'sb-mix-name' }, nameOf(byId.get(r.id))),
            select(shareOptions, r.share, { onchange: (e) => onChange(rows.map((x) => (x.id === r.id ? { id: x.id, share: e.target.value } : x))) }),
            h('span', { class: 'sb-iconbtn', title: 'Take it out of the mix', onclick: () => onChange(rows.filter((x) => x.id !== r.id)) }, icon('fa-xmark'))))
            : h('small', { class: 'sb-hint' }, emptyText),
        left.length ? select([{ value: '', label: 'Add a bloodline…' }, ...left.map((b) => ({ value: b.id, label: nameOf(b) }))], '', {
            onchange: (e) => { if (e.target.value) onChange([...rows, { id: e.target.value, share: 'some' }]); },
        }) : null);
}

// ---- a Lore entry: the bloodline block

export function bloodlineCard(entry, all) {
    if (entry.type !== 'lore') return null;
    const { settingId } = ws.ctx;
    const b = normalizeBloodline(entry.meta?.bloodline);
    if (!b.on) {
        return h('div', { class: 'sb-card sb-card-quiet' },
            h('div', { class: 'sb-row' },
                h('small', { class: 'sb-hint' }, 'Is this a bloodline - a race, species or kind of being a character can be?'),
                h('span', { class: 'sb-push' }),
                button('It is a bloodline', () => { setEntryMeta(settingId, entry.id, { bloodline: { ...emptyBloodline(), ...normalizeBloodline(entry.meta?.bloodline), on: true, playable: true } }); after(); }, { iconName: 'fa-dna' })));
    }
    const save = (patch) => { setBloodline(settingId, entry.id, patch); after(); };
    const saveVisual = (patch) => save({ visual: patch });
    const w = wordsOf(entry);
    const doc = getSettingDoc(settingId);
    const creatures = all.creature ?? [];
    const opt = (list) => [{ value: '', label: '(not set)' }, ...list.map(([id, label]) => ({ value: id, label }))];
    const v = b.visual;
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-dna'), ' Bloodline',
            h('small', { class: 'sb-hint' }, ' - who they are and how they live in this world'),
            h('span', { class: 'sb-spacer' }),
            h('span', { class: 'sb-iconbtn', title: 'Not a bloodline - plain lore again (the details are kept)', onclick: () => { setEntryMeta(settingId, entry.id, { bloodline: { ...b, on: false } }); after(); } }, icon('fa-xmark'))),
        h('div', { class: 'sb-row' },
            field('Kind', select(opt(BLOODLINE_KINDS), b.kind, { onchange: (e) => save({ kind: e.target.value }) })),
            field('One of them', commitInput(b.singular, (x) => save({ singular: x }), { placeholder: w.singular || 'elf' })),
            field('Many', commitInput(b.plural, (x) => save({ plural: x }), { placeholder: w.plural || 'elves' })),
            field('Adjective', commitInput(b.adjective, (x) => save({ adjective: x }), { placeholder: w.adjective || 'elven' }))),
        field('How they look', commitArea(b.look, (x) => save({ look: x }), 2, { placeholder: 'What anyone would see, in a sentence: tall, pointed ears, eyes that catch the light' }),
            'Said beside their name when one of them is in the scene.'),
        field('How they live here', commitArea(b.here, (x) => save({ here: x }), 2, { placeholder: 'In THIS world: awakened in 2031; old money, overrepresented in boardrooms' }),
            'The answer to "elves - but what are elves here?"'),
        h('div', { class: 'sb-row' },
            field('Lifespan', select(opt(LIFESPANS), b.lifespan, { onchange: (e) => save({ lifespan: e.target.value }) })),
            field('About their age', commitInput(b.lifespanNote, (x) => save({ lifespanNote: x }), { placeholder: 'e.g. a 300-year-old looks 30' })),
            field('Traits', commitInput(b.traits.join(', '), (x) => save({ traits: x.split(',').map((t) => t.trim()).filter(Boolean) }), { placeholder: 'darkvision, no need to sleep' }))),
        h('div', { class: 'sb-row' },
            field('Their names (culture)', select([{ value: '', label: '(the place\'s)' }, ...cultureChoices(doc.naming).map((c) => ({ value: c.value, label: `${c.group}: ${c.label}` }))], b.culture, { onchange: (e) => save({ culture: e.target.value, naming: e.target.value && !b.naming ? 'own' : b.naming }) })),
            field('Used', select(opt(NAMING_MODES), b.naming, { onchange: (e) => save({ naming: e.target.value }) }))),
        h('div', { class: 'sb-row' },
            field('Related creature', select([{ value: '', label: '(none)' }, ...creatures.map((c) => ({ value: c.id, label: c.name }))], b.related, { onchange: (e) => save({ related: e.target.value }) }), 'Trolls the bloodline, trolls under the bridge.'),
            h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: b.playable, onchange: (e) => save({ playable: e.target.checked }) }), h('span', {}, 'The player can be one')),
            h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: b.canMix, onchange: (e) => save({ canMix: e.target.checked }) }), h('span', {}, 'Children with others (half-bloods)'))),
        h('details', { class: 'sb-subcard', open: !!(v.body || v.skin || v.features) },
            h('summary', {}, icon('fa-image'), ' How to draw them (image prompts)'),
            field('How well image models know them', select(opt(KNOWN), v.known, { onchange: (e) => saveVisual({ known: e.target.value }) }),
                'Well known: the word is enough. Otherwise their body and features lead every portrait of one of them.'),
            h('div', { class: 'sb-row' },
                field('Body', commitInput(v.body, (x) => saveVisual({ body: x }), { placeholder: 'humanoid; four-armed; the size of a child' })),
                field('Skin, hide or surface', commitInput(v.skin, (x) => saveVisual({ skin: x }), { placeholder: 'slate-grey scales with a copper sheen' }))),
            field('What makes one recognisable', commitInput(v.features, (x) => saveVisual({ features: x }), { placeholder: 'no nose; three amber eyes in a row; feathered crest - most important first' })),
            field('What they wear here', commitInput(v.dress, (x) => saveVisual({ dress: x }), { placeholder: 'chrome ear cuffs, no forest garb' })),
            h('div', { class: 'sb-row' },
                field('Tags', commitInput(v.tags, (x) => saveVisual({ tags: x }), { placeholder: 'elf, pointed ears' })),
                field('Never draw', commitInput(v.negative, (x) => saveVisual({ negative: x }), { placeholder: 'human ears, hair' }))),
            field('How they differ', commitInput(v.variety, (x) => saveVisual({ variety: x }), { placeholder: 'colouring varies by clan' }))));
}

// ---- a character: their bloodline

// isNew: an unsaved character - kept in the draft, saved with it.
export function lineageCard(type, entry, all, { isNew = false } = {}) {
    if (type.id !== 'character') return null;
    const { settingId } = ws.ctx;
    const bloodlines = bloodlinesOf(all.lore ?? []);
    if (!bloodlines.length) return null;
    const choices = choicesOf(bloodlines);
    const own = normalizeLineage(isNew ? ws.draft?.meta?.lineage : entry.meta?.lineage);
    const now = isNew ? { ids: own.ids, guessed: false } : lineageOf(entry, bloodlines);
    const save = (patch) => {
        const lineage = normalizeLineage({ ...own, ...patch });
        if (isNew) { ws.draft.meta.lineage = lineage; markDirty(); rerender({ force: true }); return; }
        setEntryMeta(settingId, entry.id, { lineage });
        after();
    };
    const byId = new Map(choices.map((b) => [b.id, b]));
    const first = own.ids[0] ?? '';
    const mixes = first && (normalizeBloodline(byId.get(first)?.meta?.bloodline).canMix || first === HUMANS);
    const options = [{ value: '', label: '(not set)' }, ...choices.map((b) => ({ value: b.id, label: nameOf(b) }))];
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-dna'), ' Bloodline'),
        h('div', { class: 'sb-row' },
            field('Bloodline', select(options, first, { onchange: (e) => save({ ids: [e.target.value, own.ids[1]].filter(Boolean) }) })),
            mixes ? field('Mixed with', select([{ value: '', label: '(no one)' }, ...choices.filter((b) => b.id !== first && (b.id === HUMANS || normalizeBloodline(b.meta?.bloodline).canMix)).map((b) => ({ value: b.id, label: nameOf(b) }))], own.ids[1] ?? '', { onchange: (e) => save({ ids: [first, e.target.value].filter(Boolean) }) })) : null),
        now.guessed ? h('div', { class: 'sb-row' },
            h('small', { class: 'sb-hint' }, `Read from their description: ${now.ids.map((id) => nameOf(byId.get(id))).join(' and ')}.`),
            button('That is right', () => save({ ids: now.ids }), { iconName: 'fa-check' })) : null,
        field('Their own story', commitInput(own.note, (x) => save({ note: x }), { placeholder: 'e.g. raised human; had her ears clipped at fourteen' })),
        !isNew && first && byId.get(first)?.id !== HUMANS ? h('small', { class: 'sb-hint sb-link', onclick: () => openSheet(first, 'lore') }, icon('fa-arrow-up-right-from-square'), ` About the ${wordsOf(byId.get(first)).plural}`) : null);
}

// ---- a place's mix, a faction's members

export function populationCard(type, entry, all) {
    if (type.id !== 'location' && type.id !== 'faction') return null;
    const { settingId } = ws.ctx;
    const bloodlines = bloodlinesOf(all.lore ?? []);
    if (!bloodlines.length) return null;
    const choices = choicesOf(bloodlines);
    const byId = Object.fromEntries(choices.map((b) => [b.id, b]));
    const doc = getSettingDoc(settingId);
    if (type.id === 'faction') {
        const m = normalizeMembers(entry.meta?.members);
        const save = (patch) => { setEntryMeta(settingId, entry.id, { members: normalizeMembers({ ...m, ...patch }) }); after(); };
        return h('div', { class: 'sb-card' },
            h('div', { class: 'sb-card-title' }, icon('fa-people-group'), ' Who it takes'),
            mixEditor(m.mix, choices, (mix) => save({ mix }), { emptyText: 'Anyone - as common as they are where it is.' }),
            field('Notes', commitInput(m.notes, (x) => save({ notes: x }), { placeholder: 'e.g. elves only; humans as servants' })));
    }
    const p = normalizePlacePopulation(entry.meta?.population);
    const save = (patch) => { setEntryMeta(settingId, entry.id, { population: normalizePlacePopulation({ ...p, ...patch }) }); after(); };
    const parents = getParents(settingId);
    const above = mixAt(doc.overview.population, parents, doc.entries, parents[entry.id] ?? null);
    const here = mixAt(doc.overview.population, parents, doc.entries, entry.id);
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-people-group'), ' Who lives here',
            h('small', { class: 'sb-hint' }, ' - places inside inherit it unless they set their own')),
        h('small', { class: 'sb-hint' }, `From above: ${mixText(above.mix, byId) || 'not said'}.`),
        p.mix.length ? field('This mix', select([{ value: 'adjust', label: 'Changes the one above' }, { value: 'replace', label: 'Replaces the one above' }], p.mode, { onchange: (e) => save({ mode: e.target.value }) })) : null,
        mixEditor(p.mix, choices, (mix) => save({ mix }), { emptyText: 'As above.' }),
        field('Notes', commitInput(p.notes, (x) => save({ notes: x }), { placeholder: 'e.g. androids do the service work' })),
        p.mix.length ? h('small', { class: 'sb-hint' }, `Here: ${mixText(here.mix, byId) || 'nobody'}.`) : null);
}
