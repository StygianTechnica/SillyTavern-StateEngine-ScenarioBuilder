// Reverting an enrichment (spec SB-133b; docs/ROADMAP.md - "I need to be
// able to"). Every time generation writes fields of an entry - the
// background enrichment, or generation saved from the sheet, which may
// replace the user's own text - what each field held before and what was
// written is recorded on the entry (meta.enrichments, the latest few). A
// field, or the whole enrichment, can then be put back; a field changed
// since is only put back when the user agrees.
//
// The record and the comparisons are pure (and tested); the runner never
// throws.

export const ENRICHMENTS_KEPT = 10;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// What counts as empty, so "" and [] and null all match.
const blank = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
const equal = (a, b) => (blank(a) && blank(b)) || same(a, b);

export function normalizeEnrichments(list) {
    return (Array.isArray(list) ? list : []).filter((e) => isObject(e) && str(e.id) && isObject(e.fields)).map((e) => ({
        id: str(e.id),
        at: str(e.at),
        // 'auto': the background enrichment; 'sheet': generated on the sheet.
        source: e.source === 'sheet' ? 'sheet' : 'auto',
        fields: Object.fromEntries(Object.entries(e.fields).filter(([, f]) => isObject(f)).map(([k, f]) => [k, { before: f.before ?? null, after: f.after ?? null }])),
        reverted: (Array.isArray(e.reverted) ? e.reverted : []).filter((k) => typeof k === 'string'),
    })).filter((e) => Object.keys(e.fields).length).slice(-ENRICHMENTS_KEPT);
}

// A new record from what was there and what was written; fields where
// nothing changed are left out. -> the record, or null.
export function enrichmentRecord({ id, at = '', source = 'auto', before = {}, after = {} }) {
    const fields = {};
    for (const [key, value] of Object.entries(after ?? {})) {
        if (key === 'name' || equal(before?.[key], value)) continue;
        fields[key] = { before: before?.[key] ?? null, after: value ?? null };
    }
    return Object.keys(fields).length ? { id, at, source: source === 'sheet' ? 'sheet' : 'auto', fields, reverted: [] } : null;
}

// What reverting would do. current: the entry's fields now; keys: the
// fields to put back (all of the record's still-standing ones when null).
// -> { patch, changedSince: [key] } - changedSince: edited after the
// enrichment wrote them (the user should agree first).
export function revertPlan(record, current = {}, keys = null) {
    const open = Object.keys(record?.fields ?? {}).filter((k) => !(record.reverted ?? []).includes(k));
    const want = keys ? open.filter((k) => keys.includes(k)) : open;
    const patch = {};
    const changedSince = [];
    for (const key of want) {
        const f = record.fields[key];
        if (!equal(current?.[key], f.after)) changedSince.push(key);
        patch[key] = f.before ?? (Array.isArray(f.after) ? [] : '');
    }
    return { patch, changedSince };
}

// ---- runner

// Puts fields of an enrichment back. -> { reverted: [key] } or null when
// State Engine refused. Never throws.
export async function revertEnrichment(chatId, settingId, objectId, recordId, keys = null) {
    try {
        const { getEntryMeta } = await import('../store/setting-store.js');
        const { updateEntry, setEntryMeta, getEntry } = await import('../library/library.js');
        const meta = getEntryMeta(settingId, objectId);
        const records = normalizeEnrichments(meta.enrichments);
        const record = records.find((r) => r.id === recordId);
        if (!record) return null;
        const entry = await getEntry(chatId, settingId, objectId);
        if (!entry) return null;
        const base = entry.base ?? entry;
        const current = Object.fromEntries(Object.keys(record.fields).map((k) => [k, base[k] ?? entry[k]]));
        const { patch } = revertPlan(record, current, keys);
        const reverted = Object.keys(patch);
        if (!reverted.length) return { reverted: [] };
        if (!await updateEntry(chatId, settingId, objectId, patch)) return null;
        setEntryMeta(settingId, objectId, {
            enrichments: records.map((r) => (r.id === recordId ? { ...r, reverted: [...new Set([...r.reverted, ...reverted])] } : r)),
            // Put back, so no longer generated - unless another enrichment
            // still stands on the same field.
            generated: (meta.generated ?? []).filter((k) => !reverted.includes(k) || records.some((r) => r.id !== recordId && k in r.fields && !r.reverted.includes(k))),
        });
        return { reverted };
    } catch (err) {
        console.warn('[ScenarioBuilder] could not revert the enrichment', err);
        return null;
    }
}

// Records an enrichment on the entry (the latest ENRICHMENTS_KEPT kept).
export async function recordEnrichment(settingId, objectId, record) {
    if (!record) return;
    try {
        const { getEntryMeta } = await import('../store/setting-store.js');
        const { setEntryMeta } = await import('../library/library.js');
        setEntryMeta(settingId, objectId, { enrichments: normalizeEnrichments([...(getEntryMeta(settingId, objectId).enrichments ?? []), record]) });
    } catch (err) {
        console.warn('[ScenarioBuilder] could not record the enrichment', err);
    }
}
