// The workspace's Import tab (spec 6.6, SB-701): bring lorebooks (World
// Info books) into the library. Choose books and options, let it read the
// entries, review the plan - what fills which object's blank fields, what
// becomes a new object - and apply it. See src/import/run.js.

import { getObjectTypes } from '../library/library.js';
import { listBooks, startAnalysis, applyImport, cancelImport, clearImport, getImportJob, listImports, undoImport } from '../import/run.js';
import { confirmAction } from './confirm.js';
import { syncNow } from '../guidance/sync.js';
import { ws, rerender, openSheet } from './ws.js';
import { h, icon, button, toast } from './dom.js';

const DEFAULT_OPTIONS = Object.freeze({ fill: true, create: true, skipDisabled: true, canonLock: false, canonOnly: false });

const OPTION_TEXT = Object.freeze([
    ['fill', 'Fill blank fields of objects already in the library', 'An entry about an existing object (same name, alias or keyword) adds what the object is missing. Nothing it already has is replaced.'],
    ['create', 'Create objects for entries the library does not have', 'Each one becomes a character, place, faction, item, creature or lore entry, from the entry\'s own words.'],
    ['skipDisabled', 'Skip entries switched off in the lorebook', ''],
    ['canonLock', 'Canon-lock what the import touches', 'Generated detail will never be added to these entries later - the lorebook\'s words stay the canon.'],
    ['canonOnly', 'Mark this setting canon-only', 'For a published canon: nothing generated is added to any entry, and story inventions wait for review.'],
]);

export async function renderImport() {
    const job = getImportJob();
    if (!job || job.state === 'error' && !job.proposals.length) return chooseStep(job);
    if (job.state === 'analysing') return progressStep(job, 'Reading the lorebook');
    if (job.state === 'applying') return progressStep(job, 'Adding to the library');
    if (job.state === 'done') return doneStep(job);
    return reviewStep(job);
}

async function chooseStep(failed) {
    const form = ws.importForm ?? (ws.importForm = { books: new Set(), options: { ...DEFAULT_OPTIONS } });
    const books = await listBooks();
    const bookList = books.length
        ? h('div', { class: 'sb-booklist' }, books.map((name) => h('label', { class: `sb-book${form.books.has(name) ? ' on' : ''}` },
            h('input', { type: 'checkbox', checked: form.books.has(name), onchange: (e) => { if (e.target.checked) form.books.add(name); else form.books.delete(name); rerender(); } }),
            icon('fa-book'), h('span', {}, name))))
        : h('div', { class: 'sb-muted' }, 'No lorebooks found. Create or import one in SillyTavern\'s World Info panel first.');
    return h('div', { class: 'sb-import' },
        h('h3', {}, icon('fa-file-import'), ' Import from lorebooks'),
        h('small', { class: 'sb-hint' }, 'Turn World Info entries into library entries. The books themselves are never changed. You see the full plan before anything is added.'),
        failed?.error ? h('div', { class: 'sb-callout sb-warn' }, icon('fa-triangle-exclamation'), h('span', {}, `The last import failed: ${failed.error}`)) : null,
        h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, 'Books'), bookList),
        h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, 'Options'),
            OPTION_TEXT.map(([key, label, hint]) => h('label', { class: 'checkbox_label sb-option', title: hint || null },
                h('input', { type: 'checkbox', checked: form.options[key] === true, onchange: (e) => { form.options[key] = e.target.checked; } }),
                h('span', {}, label, hint ? h('small', { class: 'sb-hint' }, ` - ${hint}`) : null)))),
        pastImports(),
        h('div', { class: 'sb-savebar' },
            button(form.books.size ? `Read ${form.books.size} book${form.books.size === 1 ? '' : 's'}` : 'Choose a book first', () => {
                if (!form.books.size) return toast('info', 'Tick at least one lorebook.');
                void startAnalysis({ ...ws.ctx, books: [...form.books], options: form.options });
            }, { iconName: 'fa-magnifying-glass', cls: 'sb-primary', disabled: !form.books.size })));
}

// Undo one whole import: what it created is deleted, what it filled goes
// back to how it was.
async function undo(rec) {
    const what = [rec.created.length ? `delete the ${rec.created.length} ${rec.created.length === 1 ? 'entry' : 'entries'} it created` : '', rec.filled.length ? `put back the blank fields it filled on ${rec.filled.length} ${rec.filled.length === 1 ? 'entry' : 'entries'}` : ''].filter(Boolean).join(' and ');
    if (!await confirmAction(`Undo the import of ${rec.books.join(', ')}?
This will ${what}.
Anything you changed in those fields since will be undone too.`)) return;
    const out = await undoImport(ws.ctx.chatId, ws.ctx.settingId, rec.id);
    if (!out) return toast('error', 'That import is no longer on record.');
    toast(out.failed ? 'warning' : 'success', `Undone: ${out.deleted} deleted, ${out.restored} restored${out.failed ? `, ${out.failed} failed (see the console)` : ''}.`);
    await syncNow();
    if (getImportJob()?.importId === rec.id) clearImport();
    rerender();
}

function pastImports() {
    const recs = listImports(ws.ctx.settingId);
    if (!recs.length) return null;
    return h('div', { class: 'sb-card' }, h('div', { class: 'sb-card-title' }, icon('fa-clock-rotate-left'), ' Earlier imports'),
        recs.map((rec) => h('div', { class: 'sb-row sb-past-import' },
            h('span', {}, rec.books.join(', ')),
            h('small', { class: 'sb-hint' }, `${new Date(rec.at).toLocaleString()} · ${rec.created.length} created, ${rec.filled.length} filled in`),
            h('span', { class: 'sb-push' }, button('Undo', () => void undo(rec), { iconName: 'fa-rotate-left', title: 'Delete what it created and put back what it filled' })))));
}

function progressStep(job, title) {
    const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
    return h('div', { class: 'sb-import' },
        h('h3', {}, icon('fa-spinner fa-spin'), ` ${title}`),
        h('div', { class: 'sb-progress' }, h('div', { class: 'sb-progress-bar', style: `width: ${pct}%` })),
        h('small', { class: 'sb-hint' }, `${job.done} of ${job.total || '…'}${job.current ? ` - ${job.current}` : ''}. One entry at a time; you can keep using SillyTavern meanwhile.`),
        h('div', { class: 'sb-actions' }, button('Stop', () => cancelImport(), { iconName: 'fa-stop' })));
}

const ACTION_TEXT = { fill: 'Fill blanks of', replace: 'Update', create: 'New', skip: 'Skip' };

async function reviewStep(job) {
    const types = new Map((await getObjectTypes()).map((t) => [t.id, t]));
    const live = job.proposals.filter((p) => p.action !== 'skip');
    const skipped = job.proposals.filter((p) => p.action === 'skip');
    const chosen = live.filter((p) => p.include).length;
    const row = (p) => {
        const t = types.get(p.type);
        const fields = Object.keys(p.values).filter((k) => k !== 'name');
        // Fields its own entry replaces: what they held, and what they get.
        const replaced = Object.keys(p.replaces ?? {});
        const shown = (v) => String(Array.isArray(v) ? v.join(', ') : v ?? '');
        return h('div', { class: `sb-proposal${p.include ? '' : ' sb-off-row'}`, style: `--sb-accent: ${t?.color ?? '#888'}` },
            h('input', { type: 'checkbox', checked: p.include, onchange: (e) => { p.include = e.target.checked; rerender(); } }),
            h('div', { class: 'sb-proposal-main' },
                h('div', { class: 'sb-row' },
                    h('span', { class: `sb-badge sb-act-${replaced.length ? 'replace' : p.action}` }, ACTION_TEXT[replaced.length ? 'replace' : p.action]),
                    t ? h('i', { class: `fa-solid ${t.icon}`, title: t.label }) : null,
                    h('b', {}, p.name),
                    p.action === 'create' ? h('small', { class: 'sb-hint' }, t?.noun ?? p.type) : null,
                    p.matchId ? h('span', { class: 'sb-iconbtn', title: 'Open its sheet', onclick: () => openSheet(p.matchId, p.type) }, icon('fa-arrow-up-right-from-square')) : null),
                h('small', { class: 'sb-hint' }, `From "${p.entry.title || p.entry.keys[0] || p.entry.uid}" (${p.entry.book})`
                    + `${fields.length ? ` · ${fields.join(', ')}` : ''}${p.locatedIn ? ` · inside ${p.locatedIn}` : ''}${p.relations?.length ? ` · ${p.relations.map((r) => `${r.kind} ${r.name}`).join(', ')}` : ''}${p.note ? ` · ${p.note}` : ''}`),
                p.values.description && p.action === 'create' ? h('div', { class: 'sb-proposal-desc' }, String(p.values.description).slice(0, 220)) : null,
                replaced.length ? h('div', { class: 'sb-proposal-replaces' },
                    replaced.map((k) => h('div', {},
                        h('b', {}, `${k}: `),
                        h('s', {}, shown(p.replaces[k]).slice(0, 160)),
                        ' → ',
                        h('span', {}, shown(p.values[k]).slice(0, 260))))) : null));
    };
    return h('div', { class: 'sb-import' },
        h('h3', {}, icon('fa-list-check'), ' The plan'),
        job.cancelled ? h('small', { class: 'sb-hint' }, 'Stopped early - the plan covers the entries read so far.') : null,
        h('small', { class: 'sb-hint' }, `${live.filter((p) => p.action === 'fill').length} to fill in, ${live.filter((p) => p.action === 'create').length} to create, ${skipped.length} skipped. Untick anything you don't want.`),
        h('div', { class: 'sb-actions' },
            button('All', () => { live.forEach((p) => { p.include = true; }); rerender(); }, { iconName: 'fa-square-check' }),
            button('None', () => { live.forEach((p) => { p.include = false; }); rerender(); }, { iconName: 'fa-square' })),
        h('div', { class: 'sb-proposals' }, live.map(row)),
        skipped.length ? h('details', { class: 'sb-skipped' }, h('summary', {}, `${skipped.length} skipped`),
            skipped.map((p) => h('div', { class: 'sb-hint' }, `${p.entry.title || p.entry.keys[0] || p.entry.uid} (${p.entry.book}) - ${p.note}`))) : null,
        h('div', { class: 'sb-savebar' },
            button('Start over', () => clearImport(), { iconName: 'fa-rotate-left' }),
            button(`Add ${chosen} to the library`, () => void applyImport(), { iconName: 'fa-check', cls: 'sb-primary', disabled: !chosen })));
}

function doneStep(job) {
    const s = job.summary ?? {};
    const failed = job.proposals.filter((p) => p.error);
    return h('div', { class: 'sb-import' },
        h('h3', {}, icon('fa-circle-check'), ' Imported'),
        h('div', { class: 'sb-chips' },
            h('span', { class: 'sb-chip sb-chip-on' }, `${s.created ?? 0} created`),
            h('span', { class: 'sb-chip sb-chip-on' }, `${s.filled ?? 0} filled in`),
            s.placed ? h('span', { class: 'sb-chip' }, `${s.placed} placed in the tree`) : null,
            s.related ? h('span', { class: 'sb-chip' }, `${s.related} relationships`) : null,
            s.failed ? h('span', { class: 'sb-chip sb-chip-absent' }, `${s.failed} failed`) : null),
        failed.length ? h('div', {}, failed.map((p) => h('div', { class: 'sb-hint' }, `${p.name}: ${p.error}`))) : null,
        h('small', { class: 'sb-hint' }, 'Find them in the Catalog. Imported entries are marked as imported, with the entry they came from.'),
        h('div', { class: 'sb-savebar' },
            job.importId ? button('Undo this import', () => { const rec = listImports(ws.ctx.settingId).find((r) => r.id === job.importId); if (rec) void undo(rec); }, { iconName: 'fa-rotate-left', cls: 'sb-danger' }) : null,
            button('Import more', () => clearImport(), { iconName: 'fa-file-import' }),
            button('Open the catalog', () => { clearImport(); ws.tab = 'catalog'; ws.entryId = null; rerender(); }, { iconName: 'fa-book-atlas', cls: 'sb-primary' })));
}
