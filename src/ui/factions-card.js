// "Factions" on a person's sheet: the factions they belong to and their rank
// and title in each - the same chain of command the faction's own sheet
// shows (src/ui/roster-card.js), set from the person's side so the user need
// not go to the faction. Join a faction, pick a rank, give a title, leave.
// Saves at once.

import { h, icon } from './dom.js';
import { ws, rerender, openSheet } from './ws.js';
import { syncNow } from '../guidance/sync.js';
import { confirmAction } from './confirm.js';
import { setEntryMeta } from '../library/library.js';
import { listRelations, addRelation } from '../library/relations-edit.js';
import { rosterOf, placePerson, removePerson, setTitle } from '../library/roster.js';
import { factionsOf } from '../library/person-factions.js';
import { takeOutOfFaction } from './roster-card.js';

const NO_RANK = '';

export function factionsCard(type, entry, all) {
    if (type.id !== 'character' || !entry?.id) return null;
    const { settingId } = ws.ctx;
    const factions = all.faction ?? [];
    if (!factions.length) return null;
    const mine = factionsOf(entry.id, factions, listRelations(settingId));
    const done = () => { void syncNow(); rerender({ force: true }); };
    const saveRoster = (faction, roster) => { setEntryMeta(settingId, faction.id, { roster }); done(); };

    // A rank among the faction's tiers, or none (they still belong).
    const rankPick = (faction, place) => {
        const roster = rosterOf(faction);
        if (!roster.tiers.length) return h('small', { class: 'sb-hint', title: 'Add tiers on the faction\'s Chain of command' }, 'no ranks set up');
        const current = place ? roster.tiers[place.tier]?.id ?? NO_RANK : NO_RANK;
        return h('select', {
            class: 'text_pole sb-roster-add', title: 'Rank',
            onchange: (e) => saveRoster(faction, e.target.value ? placePerson(roster, entry.id, e.target.value) : removePerson(roster, entry.id)),
        },
        h('option', { value: NO_RANK, selected: current === NO_RANK }, 'no rank yet'),
        ...roster.tiers.map((t, i) => h('option', { value: t.id, selected: t.id === current }, `${i + 1}. ${t.name || `Tier ${i + 1}`}`)));
    };

    const row = ({ faction, place }) => h('div', { class: 'sb-roster-tier sb-faction-row' },
        h('div', { class: 'sb-roster-head' },
            h('a', { class: 'sb-roster-tiername sb-link', title: `Open ${faction.name}`, onclick: () => openSheet(faction.id) }, faction.name),
            rankPick(faction, place),
            place ? h('input', {
                class: 'text_pole sb-roster-title', value: place.title ?? '', placeholder: 'title', size: Math.max(5, (place.title ?? '').length),
                title: 'Their own title (e.g. Power Broker)',
                onchange: (e) => saveRoster(faction, setTitle(rosterOf(faction), entry.id, e.target.value)),
            }) : null,
            h('span', {
                class: 'sb-iconbtn', title: `Take out of ${faction.name}`,
                onclick: async () => {
                    if (!await confirmAction(`Take ${entry.name} out of ${faction.name}?`)) return;
                    await takeOutOfFaction(faction, entry.id);
                    rerender({ force: true });
                },
            }, icon('fa-xmark'))));

    // Into a faction they are not in: a "member of" tie, no rank yet - the
    // rank is picked on the row it makes.
    const inside = new Set(mine.map((m) => m.faction.id));
    const choices = factions.filter((f) => !inside.has(f.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const join = choices.length ? h('select', {
        class: 'text_pole sb-roster-add',
        onchange: (e) => {
            if (!e.target.value) return;
            addRelation(settingId, { from: entry.id, to: e.target.value, kind: 'member of' });
            done();
        },
    }, h('option', { value: '' }, '+ join a faction'), ...choices.map((f) => h('option', { value: f.id }, f.name))) : null;

    return h('div', { class: 'sb-card sb-roster sb-person-factions' },
        h('div', { class: 'sb-card-title' }, icon('fa-sitemap'), ' Factions'),
        mine.length ? null : h('small', { class: 'sb-hint' }, 'Not one of any faction\'s people yet.'),
        ...mine.map(row),
        join ? h('div', { class: 'sb-roster-foot' }, join) : null);
}
