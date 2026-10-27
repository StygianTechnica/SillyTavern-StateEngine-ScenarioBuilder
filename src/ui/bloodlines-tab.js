// The Bloodlines tab (docs/DESIGN - BLOODLINES.md, section 8): the world's
// bloodlines as cards (each opens its Lore sheet), new ones from a preset
// or by hand, who lives where - the world's mix, its notes and the "only
// these" switch, then the places and factions that set their own - and a
// bench that rolls characters' bloodlines in a place or faction, with no
// model call.

import { listEntries, getParents } from '../library/library.js';
import { getSettingDoc } from '../store/setting-store.js';
import { syncNow } from '../guidance/sync.js';
import {
    BLOODLINE_KINDS, SHARES, normalizeBloodline, normalizePopulation, normalizePlacePopulation, normalizeMembers,
    bloodlinesOf, choicesOf, wordsOf, mixFor, mixText, rollBloodline, whoIsAboutLine, onlyRule,
} from '../library/bloodlines.js';
import { presetGroups } from '../library/bloodline-presets.js';
import { addBloodline, setWorldPopulation } from '../library/bloodline-store.js';
import { resolveCulture } from '../naming/cultures.js';
import { safeImageSrc } from '../images/attach.js';
import { mixEditor, commitInput } from './bloodline-cards.js';
import { ws, rerender, openSheet } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

const after = () => { void syncNow(); rerender(); };
const kindLabel = (k) => BLOODLINE_KINDS.find(([id]) => id === k)?.[1].split(' - ')[0] ?? '';
const shareLabel = (s) => SHARES.find(([id]) => id === s)?.[1].split(' - ')[0] ?? '';

function listCard(settingId, bloodlines, world) {
    const doc = getSettingDoc(settingId);
    const add = async (opts) => {
        ws.bloodlineBusy = true;
        rerender();
        try {
            const made = await addBloodline(ws.ctx.chatId, settingId, opts);
            if (!made) toast('error', 'State Engine refused to create it - see the console.');
            else toast('success', `${made.name} added - its share in the world is "some" until you change it.`);
        } finally {
            ws.bloodlineBusy = false;
            after();
        }
    };
    const taken = new Set(bloodlines.map((b) => normalizeBloodline(b.meta?.bloodline).preset).filter(Boolean));
    const groups = presetGroups(doc.overview.worldType);
    const presetPicker = h('select', { class: 'text_pole', onchange: (e) => { if (e.target.value) void add({ presetId: e.target.value }); } },
        h('option', { value: '' }, 'Add from a preset…'),
        groups.map((g) => h('optgroup', { label: g.label }, g.presets.filter((p) => !taken.has(p.id)).map((p) => h('option', { value: p.id }, p.name)))));
    const nameBox = h('input', { class: 'text_pole', placeholder: 'Or name your own: the Vaskari, crystal-singers…' });
    const share = new Map(world.mix.map((r) => [r.id, r.share]));
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-dna'), ' This world\'s bloodlines',
            h('small', { class: 'sb-hint' }, ' - races, species, made and changed kinds: what a character can be')),
        bloodlines.length ? h('div', { class: 'sb-bloodline-cards' }, bloodlines.map((b) => {
            const bl = normalizeBloodline(b.meta?.bloodline);
            const src = safeImageSrc(b.image);
            const culture = bl.culture ? resolveCulture(bl.culture, { naming: doc.naming, seed: doc.naming.seed || 'world' })?.label : '';
            return h('div', { class: 'sb-bloodline-card', title: 'Open its sheet', onclick: () => openSheet(b.id, 'lore') },
                src ? h('img', { src, alt: b.name }) : h('div', { class: 'sb-bloodline-noimg' }, icon('fa-dna')),
                h('div', {},
                    h('b', {}, b.name),
                    h('div', { class: 'sb-hint' }, [kindLabel(bl.kind), share.has(b.id) ? shareLabel(share.get(b.id)).toLowerCase() : 'not in the world\'s mix', culture ? `names: ${culture}` : ''].filter(Boolean).join(' · ')),
                    bl.look ? h('small', {}, bl.look) : null));
        })) : h('small', { class: 'sb-hint' }, 'None yet - everyone is human, as far as anyone knows. Add one from a preset, or name your own.'),
        h('div', { class: 'sb-row' }, presetPicker),
        h('div', { class: 'sb-row' }, nameBox, button(ws.bloodlineBusy ? 'Adding…' : 'Add', () => {
            const name = nameBox.value.trim();
            if (!name) return toast('info', 'Give it a name first.');
            void add({ name });
        }, { iconName: ws.bloodlineBusy ? 'fa-spinner fa-spin' : 'fa-plus', disabled: !!ws.bloodlineBusy })),
        h('small', { class: 'sb-hint' }, 'A bloodline is a Lore entry: its sheet holds how they look, how they live here, whose names they carry and how to draw them. Any lore entry can be marked as one on its sheet.'));
}

function whereCard(settingId, bloodlines, all) {
    const doc = getSettingDoc(settingId);
    const world = normalizePopulation(doc.overview.population);
    const choices = choicesOf(bloodlines);
    const byId = Object.fromEntries(choices.map((b) => [b.id, b]));
    const places = (all.location ?? []).filter((e) => normalizePlacePopulation(doc.entries[e.id]?.population).mix.length);
    const factions = (all.faction ?? []).filter((e) => normalizeMembers(doc.entries[e.id]?.members).mix.length);
    const rule = onlyRule(world, byId);
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-map-location-dot'), ' Who lives where'),
        h('div', { class: 'sb-section-title' }, 'The world'),
        mixEditor(world.mix, choices, (mix) => { setWorldPopulation(settingId, { mix }); after(); }, { emptyText: 'Not said - the story decides.' }),
        field('Notes', commitInput(world.notes, (x) => { setWorldPopulation(settingId, { notes: x }); after(); }, { placeholder: 'e.g. elves keep to the arcologies' })),
        h('label', { class: 'checkbox_label', title: 'Off: others may turn up rarely when the story wants them.' },
            h('input', { type: 'checkbox', checked: world.only, onchange: (e) => { setWorldPopulation(settingId, { only: e.target.checked }); after(); } }),
            h('span', {}, 'These bloodlines and no others')),
        rule ? h('small', { class: 'sb-hint' }, `Told to the narrator with the world's limits: "${rule}"`) : null,
        h('div', { class: 'sb-section-title' }, 'Places and factions with their own'),
        places.length || factions.length ? [...places, ...factions].map((e) => {
            const own = e.type === 'faction' ? normalizeMembers(doc.entries[e.id]?.members) : normalizePlacePopulation(doc.entries[e.id]?.population);
            return h('div', { class: 'sb-alias-row sb-link', onclick: () => openSheet(e.id, e.type) },
                h('strong', {}, e.name),
                h('small', { class: 'sb-hint' }, ` ${e.type === 'faction' ? 'takes' : own.mode === 'replace' ? 'only' : 'changes'}: ${mixText(own.mix, byId)}`));
        }) : h('small', { class: 'sb-hint' }, 'None yet - set one on a place\'s or faction\'s sheet ("Who lives here", "Who it takes").'));
}

// Rolls bloodlines for five characters in a place or faction - the mix at
// work, as Generate will use it.
function benchCard(settingId, bloodlines, all) {
    const st = ws.bloodlineBench ?? (ws.bloodlineBench = { where: '', rolled: [] });
    const doc = getSettingDoc(settingId);
    const choices = choicesOf(bloodlines);
    const byId = Object.fromEntries(choices.map((b) => [b.id, b]));
    const [kind, id] = st.where.split(':');
    const at = mixFor({ world: doc.overview.population, parents: getParents(settingId), metaById: doc.entries, placeId: kind === 'location' ? id : null, factionId: kind === 'faction' ? id : null });
    const options = [{ value: '', label: 'Anywhere in the world' },
        ...(all.location ?? []).map((e) => ({ value: `location:${e.id}`, label: `In ${e.name}` })).sort((a, b) => a.label.localeCompare(b.label)),
        ...(all.faction ?? []).map((e) => ({ value: `faction:${e.id}`, label: `A member of ${e.name}` })).sort((a, b) => a.label.localeCompare(b.label))];
    const line = kind === 'location' ? whoIsAboutLine(at, byId) : '';
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-dice'), ' Try it',
            h('small', { class: 'sb-hint' }, ' - five people met here, by the mix (no model call)')),
        h('div', { class: 'sb-row' },
            select(options, st.where, { onchange: (e) => { st.where = e.target.value; st.rolled = []; rerender(); } }),
            button('Roll five', () => { st.rolled = Array.from({ length: 5 }, () => rollBloodline(at.mix)); rerender(); }, { iconName: 'fa-dice' })),
        h('small', { class: 'sb-hint' }, `The mix here: ${mixText(at.mix, byId) || 'not said'}.`),
        st.rolled.length ? h('div', { class: 'sb-chips' }, st.rolled.map((r) => h('span', { class: 'sb-chip' }, r ? wordsOf(byId[r] ?? { id: r }).singular : 'nobody - no mix'))) : null,
        line ? field('Told to the narrator when the scene is here', h('div', { class: 'sb-prose' }, line)) : null);
}

export async function renderBloodlines() {
    const { chatId, settingId } = ws.ctx;
    if (!settingId) return h('div', { class: 'sb-muted' }, 'This chat has no setting yet.');
    const [lore, location, faction] = await Promise.all(['lore', 'location', 'faction'].map((t) => listEntries(chatId, settingId, t).catch(() => [])));
    const all = { lore, location, faction };
    const bloodlines = bloodlinesOf(lore);
    const world = normalizePopulation(getSettingDoc(settingId).overview.population);
    return h('div', { class: 'sb-naming' },
        h('div', { class: 'sb-scene-cols' },
            h('div', { class: 'sb-gm-col' }, listCard(settingId, bloodlines, world)),
            h('div', { class: 'sb-gm-col' }, whereCard(settingId, bloodlines, all), benchCard(settingId, bloodlines, all))));
}

