// "Chain of command" on a faction's sheet (src/library/roster.js): named
// tiers top to bottom, each holding its people as chips with a title of
// their own. Drag a chip to another tier to move them up or down; people in
// one tier are peers. Those who belong only through the faction's Members
// field or a "member of" relationship wait in Unplaced until dragged in.
// "Suggest" lays one out with a model call, named for the kind of group it
// is. Saves at once.

import { h, icon, button, toast } from './dom.js';
import { ws, rerender } from './ws.js';
import { syncNow } from '../guidance/sync.js';
import { confirmAction } from './confirm.js';
import { setEntryMeta, updateEntry, getOverview } from '../library/library.js';
import { listRelations, removeRelation, addRelation } from '../library/relations-edit.js';
import { libraryMemberships, MEMBER_KINDS } from '../library/faction-sync.js';
import { LOG_PREFIX } from '../constants.js';
import {
    rosterOf, rosterIds, hasRoster, addTier, renameTier, removeTier, moveTier, placePerson, setTitle, removePerson,
    buildRosterPrompt, readRoster, setStyle,
} from '../library/roster.js';

const DRAG = 'text/sb-roster-person';
let suggesting = false;

// Out of a faction altogether: its chain, its Members field and any "member
// of" relationship to it. Used from the faction's sheet and the person's.
export async function takeOutOfFaction(faction, personId) {
    const { settingId, chatId } = ws.ctx;
    const members = Array.isArray(faction.base?.members ?? faction.members) ? (faction.base?.members ?? faction.members) : [];
    if (members.includes(personId)) await updateEntry(chatId, settingId, faction.id, { members: members.filter((m) => m !== personId) });
    for (const r of listRelations(settingId)) if (r.from === personId && r.to === faction.id && MEMBER_KINDS.has(String(r.kind).toLowerCase())) removeRelation(settingId, r.id);
    setEntryMeta(settingId, faction.id, { roster: removePerson(rosterOf(faction), personId) });
    void syncNow();
}

export function rosterCard(type, entry, all) {
    if (type.id !== 'faction' || !entry?.id) return null;
    const { settingId, chatId } = ws.ctx;
    const roster = rosterOf(entry);
    const people = all.character ?? [];
    const nameOf = (id) => people.find((c) => c.id === id)?.name ?? '';
    const placed = new Set(rosterIds(roster));
    const belongs = libraryMemberships([entry], listRelations(settingId));
    const unplaced = [...belongs.keys()].filter((id) => !placed.has(id) && nameOf(id));
    const save = (next) => { setEntryMeta(settingId, entry.id, { roster: next }); void syncNow(); rerender({ force: true }); };

    const leave = async (id) => {
        if (!await confirmAction(`Take ${nameOf(id)} out of ${entry.name}?`)) return;
        await takeOutOfFaction(entry, id);
        rerender({ force: true });
    };

    const chip = (id, title, { inTier = true } = {}) => h('span', {
        class: 'sb-chip sb-roster-chip', draggable: 'true', title: 'Drag to another tier',
        ondragstart: (e) => { e.dataTransfer.setData(DRAG, id); e.dataTransfer.effectAllowed = 'move'; },
    },
    icon('fa-grip-vertical'),
    h('span', { class: 'sb-roster-name' }, nameOf(id)),
    inTier ? h('input', {
        class: 'text_pole sb-roster-title', value: title ?? '', placeholder: 'title', size: Math.max(5, (title ?? '').length),
        onchange: (e) => save(setTitle(roster, id, e.target.value)),
        ondragstart: (e) => e.preventDefault(),
    }) : null,
    h('span', { class: 'sb-iconbtn', title: `Take out of ${entry.name}`, onclick: () => void leave(id) }, icon('fa-xmark')));

    const dropTo = (tierId) => ({
        ondragover: (e) => { if ([...e.dataTransfer.types].includes(DRAG)) { e.preventDefault(); e.currentTarget.classList.add('sb-drop'); } },
        ondragleave: (e) => e.currentTarget.classList.remove('sb-drop'),
        ondrop: (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('sb-drop');
            const id = e.dataTransfer.getData(DRAG);
            if (id) save(placePerson(roster, id, tierId));
        },
    });

    // Someone from the library, not yet in the faction, into a tier.
    const adder = (tierId) => {
        const choices = people.filter((c) => !placed.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
        if (!choices.length) return null;
        return h('select', {
            class: 'text_pole sb-roster-add',
            onchange: (e) => { if (e.target.value) save(placePerson(roster, e.target.value, tierId)); },
        }, h('option', { value: '' }, '+ add someone'), ...choices.map((c) => h('option', { value: c.id }, c.name)));
    };

    // Someone into the faction with no rank yet - with no tiers there is no
    // tier to add them to (Cyril could not be added to White Cerberus).
    const joiner = () => {
        const inside = new Set([...placed, ...unplaced]);
        const choices = people.filter((c) => !inside.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
        if (!choices.length) return null;
        return h('select', {
            class: 'text_pole sb-roster-add',
            onchange: (e) => {
                if (!e.target.value) return;
                addRelation(settingId, { from: e.target.value, to: entry.id, kind: 'member of' });
                void syncNow();
                rerender({ force: true });
            },
        }, h('option', { value: '' }, '+ add a member (no rank yet)'), ...choices.map((c) => h('option', { value: c.id }, c.name)));
    };

    const tiers = roster.tiers.map((t, i) => h('div', { class: 'sb-roster-tier', ...dropTo(t.id) },
        h('div', { class: 'sb-roster-head' },
            h('span', { class: 'sb-roster-rank' }, String(i + 1)),
            h('input', { class: 'text_pole sb-roster-tiername', value: t.name, placeholder: 'tier name (e.g. Underbosses)', onchange: (e) => save(renameTier(roster, t.id, e.target.value)) }),
            h('span', { class: 'sb-iconbtn', title: 'Move this tier up', onclick: () => save(moveTier(roster, t.id, -1)) }, icon('fa-arrow-up')),
            h('span', { class: 'sb-iconbtn', title: 'Move this tier down', onclick: () => save(moveTier(roster, t.id, 1)) }, icon('fa-arrow-down')),
            h('span', { class: 'sb-iconbtn', title: 'Remove this tier (its people go to Unplaced)', onclick: () => save(removeTier(roster, t.id)) }, icon('fa-trash-can'))),
        h('div', { class: 'sb-roster-people' },
            ...t.people.map((p) => chip(p.id, p.title)),
            adder(t.id))));

    const unplacedBand = unplaced.length ? h('div', { class: 'sb-roster-tier sb-roster-unplaced' },
        h('div', { class: 'sb-roster-head' }, h('span', { class: 'sb-hint' }, icon('fa-inbox'), ' Unplaced - belong, but have no rank yet. Drag them into a tier.')),
        h('div', { class: 'sb-roster-people' }, ...unplaced.map((id) => chip(id, '', { inTier: false })))) : null;

    return h('div', { class: 'sb-card sb-roster' },
        h('div', { class: 'sb-card-title' }, icon('fa-sitemap'), ' Chain of command',
            h('span', { class: 'sb-spacer' }),
            button(suggesting ? 'Suggesting…' : 'Suggest', () => void suggest(entry, all, roster, unplaced), { iconName: 'fa-wand-magic-sparkles', title: 'Lay out tiers named for this kind of group, with its people placed (one model call)', disabled: suggesting })),
        h('label', { class: 'sb-roster-style' }, h('span', { class: 'sb-field-label' }, 'Kind of group'),
            h('input', { class: 'text_pole', value: roster.style, placeholder: 'e.g. a mob family, a megacorp, a holy order - Suggest names the tiers for it', onchange: (e) => save(setStyle(roster, e.target.value)) })),
        hasRoster(roster) ? null : h('small', { class: 'sb-hint' }, 'Who is above whom. Add tiers named the way this faction names them, or let Suggest lay them out.'),
        ...tiers,
        unplacedBand,
        h('div', { class: 'sb-roster-foot' },
            joiner(),
            button('Add a tier', () => save(addTier(roster, '')), { iconName: 'fa-plus' })));
}

// One model call: tiers named for the kind of group, its people placed.
async function suggest(entry, all, roster, unplaced) {
    const { settingId } = ws.ctx;
    const people = all.character ?? [];
    const ids = [...new Set([...rosterIds(roster), ...unplaced])];
    const list = ids.map((id) => people.find((c) => c.id === id)).filter(Boolean)
        .map((c) => ({ id: c.id, name: c.name, role: typeof (c.base?.role ?? c.role) === 'string' ? (c.base?.role ?? c.role) : '', description: c.base?.description ?? c.description ?? '' }));
    if (hasRoster(roster) && !await confirmAction(`Replace ${entry.name}'s chain of command with a suggested one? (One model call.)`)) return;
    suggesting = true;
    rerender({ force: true });
    try {
        const { askReliably } = await import('../generate/run.js');
        const o = getOverview(settingId);
        const prompt = buildRosterPrompt({
            faction: { name: entry.name, description: entry.base?.description ?? entry.description ?? '', goals: entry.base?.goals ?? entry.goals ?? '' },
            people: list,
            style: roster.style,
            overview: [o?.premise, o?.tone && `Tone: ${o.tone}.`].filter(Boolean).join(' '),
        });
        const result = await askReliably(prompt, (_p, text) => {
            const r = readRoster(text, list);
            return r ? { values: r, dropped: [], error: null } : { values: null, dropped: [], error: 'no tiers' };
        }, 700);
        if (result.error || !result.values) {
            toast('warning', 'No chain of command came back - try again.');
            return;
        }
        setEntryMeta(settingId, entry.id, { roster: { ...result.values, style: roster.style } });
        void syncNow();
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not suggest a chain of command', err);
        toast('error', 'Could not suggest a chain of command.');
    } finally {
        suggesting = false;
        rerender({ force: true });
    }
}
