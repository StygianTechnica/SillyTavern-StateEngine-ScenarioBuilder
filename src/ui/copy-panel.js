// "Copy to another world" on a sheet: the entry (and, for a place, the
// places inside it) copied into another State Engine setting - a character
// from one world showing up in another. The copy is a new object there;
// what it points at follows when the other world has something of the same
// name (src/worlds/run.js copyEntriesTo).

import { listAllSettings, getParents } from '../library/library.js';
import { descendantsOf } from '../library/hierarchy.js';
import { copyEntriesTo } from '../worlds/run.js';
import { ws, rerender } from './ws.js';
import { h, icon, button, select, toast } from './dom.js';

export async function openCopyPanel(entry) {
    if (ws.copyFor === entry.id) {
        ws.copyFor = null;
        return rerender();
    }
    const settings = (await listAllSettings()).filter((s) => s.id !== ws.ctx.settingId);
    ws.copyFor = entry.id;
    ws.copyTargets = settings;
    ws.copyTo = settings[0]?.id ?? '';
    ws.copyInside = false;
    rerender();
}

export function copyPanel(entry, type) {
    const close = () => { ws.copyFor = null; rerender(); };
    const targets = ws.copyTargets ?? [];
    const parents = type.id === 'location' ? getParents(ws.ctx.settingId) : {};
    const inside = type.id === 'location' ? descendantsOf(parents, Object.keys(parents), entry.id) : [];
    const run = async () => {
        if (!ws.copyTo) return;
        const ids = [entry.id, ...(ws.copyInside ? inside : [])];
        try {
            const out = await copyEntriesTo(ws.ctx.settingId, ids, ws.copyTo);
            const target = targets.find((s) => s.id === ws.copyTo)?.name ?? 'the other world';
            const lost = Object.values(out.droppedFields).flat();
            toast('success', `Copied ${out.copied === 1 ? `"${entry.name}"` : `${out.copied} entries`} to ${target}.${lost.length ? ` That world has no field for: ${[...new Set(lost)].join(', ')} - left out.` : ''}`);
            ws.copyFor = null;
            rerender();
        } catch (err) {
            toast('error', err?.message ?? String(err));
        }
    };
    return h('div', { class: 'sb-merge' },
        h('div', { class: 'sb-card-title' }, icon('fa-clone'), `Copy "${entry.name}" to another world`,
            h('span', { class: 'sb-spacer' }), h('span', { class: 'sb-iconbtn', title: 'Close', onclick: close }, icon('fa-xmark'))),
        targets.length
            ? [
                select(targets.map((s) => ({ value: s.id, label: s.name })), ws.copyTo, { onchange: (e) => { ws.copyTo = e.target.value; } }),
                inside.length ? h('label', { class: 'checkbox_label sb-option' },
                    h('input', { type: 'checkbox', checked: ws.copyInside === true, onchange: (e) => { ws.copyInside = e.target.checked; } }),
                    h('span', {}, `Also copy the ${inside.length} place${inside.length === 1 ? '' : 's'} inside it`)) : null,
                h('small', { class: 'sb-hint' }, 'The copy is a new entry in that world; this one is not changed. What it points at (an owner, a home, a faction) is linked to the other world\'s entry of the same name, or left empty.'),
                h('div', { class: 'sb-actions' }, button('Copy', () => void run(), { iconName: 'fa-clone', cls: 'sb-primary' })),
            ]
            : h('div', { class: 'sb-muted' }, 'There is no other world to copy it to yet.'));
}
