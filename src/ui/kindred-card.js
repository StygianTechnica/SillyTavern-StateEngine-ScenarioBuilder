// "What its people share" on a faction's sheet (src/generate/kindred.js): the
// game fills it in itself the first time it writes someone of the faction.
// Tucked away: open it only to change what it decided. Saves at once.

import { h, icon, field } from './dom.js';
import { ws } from './ws.js';
import { setEntryMeta } from '../library/library.js';
import { KINDRED_FIELDS, normalizeKindred, hasKindred } from '../generate/kindred.js';

export function kindredCard(type, entry) {
    if (type.id !== 'faction') return null;
    const k = normalizeKindred(entry.meta?.kindred);
    const save = (key, value) => {
        const next = { ...normalizeKindred(entry.meta?.kindred), [key]: value, at: new Date().toISOString() };
        entry.meta = { ...entry.meta, kindred: next };
        setEntryMeta(ws.ctx.settingId, entry.id, { kindred: next });
    };
    return h('details', { class: 'sb-card' },
        h('summary', { class: 'sb-card-title' }, icon('fa-people-group'), 'What its people share'),
        h('small', { class: 'sb-hint' }, hasKindred(k) ? 'Anyone new of this faction is written to fit this, and still as their own person. Empty means they do not share it.' : 'Worked out the first time someone of this faction is written. Fill it in yourself if you would rather decide.'),
        KINDRED_FIELDS.map(([key, , label, about]) => field(label, h('input', { class: 'text_pole', value: k[key], placeholder: about, onchange: (e) => save(key, e.target.value) }))));
}
