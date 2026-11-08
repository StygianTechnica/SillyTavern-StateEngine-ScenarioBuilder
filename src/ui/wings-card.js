// "Part of" on a faction's sheet (src/library/wings.js): the faction it sits
// inside - a wing, department, chapter, family or cell of a bigger one - and
// the wings inside it, any number and any depth. Each wing is a faction of
// its own, with its own head and chain of command. A job one of them runs is
// crewed from their own wing; another wing's people come only as the
// specialists it needs. Saves at once.

import { h, icon } from './dom.js';
import { ws, rerender, openSheet } from './ws.js';
import { syncNow } from '../guidance/sync.js';
import { confirmAction } from './confirm.js';
import { listRelations, addRelation, removeRelation } from '../library/relations-edit.js';
import { WING_KIND, parentOf, wingsOf, allWingsOf, ancestorsOf } from '../library/wings.js';

const isWingTie = (r) => String(r?.kind ?? '').trim().toLowerCase() === WING_KIND;

export function wingsCard(type, entry, all) {
    if (type.id !== 'faction' || !entry?.id) return null;
    const { settingId } = ws.ctx;
    const factions = all.faction ?? [];
    const ids = new Set(factions.map((f) => f.id));
    const relations = listRelations(settingId);
    const nameOf = (id) => factions.find((f) => f.id === id)?.name ?? '(gone)';
    const done = () => { void syncNow(); rerender({ force: true }); };
    // One parent each: a new one replaces the old tie.
    const setParent = (wingId, parentId) => {
        for (const r of listRelations(settingId).filter((x) => x.from === wingId && isWingTie(x))) removeRelation(settingId, r.id);
        if (parentId) addRelation(settingId, { from: wingId, to: parentId, kind: WING_KIND, mutual: false });
        done();
    };

    const parent = parentOf(entry.id, relations, ids);
    const chain = ancestorsOf(entry.id, relations, ids);
    const below = new Set([entry.id, ...allWingsOf(entry.id, relations, ids)]);
    // Never inside itself or one of its own wings.
    const parentChoices = factions.filter((f) => !below.has(f.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const wings = wingsOf(entry.id, relations, ids);
    // A wing to add: not this one, not above it, not already a wing here.
    const above = new Set(chain);
    const wingChoices = factions.filter((f) => f.id !== entry.id && !above.has(f.id) && !wings.includes(f.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));

    return h('div', { class: 'sb-card sb-roster sb-wings' },
        h('div', { class: 'sb-card-title' }, icon('fa-diagram-project'), ' Part of'),
        h('small', { class: 'sb-hint' }, 'A wing, department, chapter, family or cell inside a bigger faction - with its own head and chain of command. Its people are of both. A job one of them runs is crewed from their own wing; another wing\'s people come along only as the specialists it needs.'),
        h('div', { class: 'sb-roster-head' },
            h('select', {
                class: 'text_pole sb-roster-add', title: 'The faction this one sits inside',
                onchange: (e) => setParent(entry.id, e.target.value),
            },
            h('option', { value: '', selected: !parent }, '(its own - inside no other)'),
            ...parentChoices.map((f) => h('option', { value: f.id, selected: f.id === parent }, `inside ${f.name}`))),
            chain.length > 1 ? h('small', { class: 'sb-muted' }, ` ${chain.map(nameOf).join(' › ')}`) : null),
        wings.length ? h('div', { class: 'sb-roster-tier' },
            h('div', { class: 'sb-roster-tiername' }, 'Its wings'),
            ...wings.map((w) => h('div', { class: 'sb-roster-head' },
                h('a', { class: 'sb-link', title: `Open ${nameOf(w)}`, onclick: () => openSheet(w) }, nameOf(w)),
                wingsOf(w, relations, ids).length ? h('small', { class: 'sb-muted' }, ` (${wingsOf(w, relations, ids).length} inside)`) : null,
                h('span', {
                    class: 'sb-iconbtn', title: `${nameOf(w)} is no longer part of ${entry.name}`,
                    onclick: async () => {
                        if (!await confirmAction(`Take ${nameOf(w)} out of ${entry.name}? It stays a faction of its own, with its people.`)) return;
                        setParent(w, '');
                    },
                }, icon('fa-xmark'))))) : null,
        wingChoices.length ? h('div', { class: 'sb-roster-foot' },
            h('select', {
                class: 'text_pole sb-roster-add',
                onchange: (e) => { if (e.target.value) setParent(e.target.value, entry.id); },
            }, h('option', { value: '' }, '+ add a wing'), ...wingChoices.map((f) => h('option', { value: f.id }, parentOf(f.id, relations, ids) ? `${f.name} (move from ${nameOf(parentOf(f.id, relations, ids))})` : f.name)))) : null);
}
