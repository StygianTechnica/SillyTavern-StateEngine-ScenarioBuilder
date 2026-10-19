// Shared state of the workspace window, so the shell (workspace.js), the
// catalog browser (catalog.js), the entity sheet (sheet.js) and the other
// tabs (panels.js) can read it and ask for a redraw without importing each
// other in a circle.

export const ws = {
    open: false,
    minimized: false,
    tab: 'catalog',
    ctx: null,              // { chatId, chatKey, settingId }

    // Catalog browser
    chapter: 'overview',    // 'overview' | object type id
    search: '',
    tag: '',
    status: '',             // '' | 'scene' | 'play' | 'unused'
    within: '',             // location id

    // Entity sheet
    entryId: null,          // the entry whose sheet is open, or 'new'
    sheetTab: 'overview',
    editing: false,         // the sheet is in edit mode
    dirty: false,           // unsaved input - don't redraw under it
};

let redraw = () => {};

export function setRedraw(fn) {
    redraw = fn;
}

// Redraws the workspace (unless `force` is false and there is unsaved input).
export function rerender({ force = true } = {}) {
    // A background update waits while the user is editing - or dragging on
    // the map, which a redraw would cut short.
    if (!ws.open || (!force && (ws.dirty || ws.mapDragging))) return;
    void redraw();
}

export function markDirty() {
    ws.dirty = true;
}

// Opens an entry's sheet (from anywhere: a relationship chip, the scene tab).
export function openSheet(entryId, chapter = null) {
    if (chapter) ws.chapter = chapter;
    ws.tab = 'catalog';
    ws.entryId = entryId;
    ws.sheetTab = 'overview';
    ws.editing = entryId === 'new';
    ws.draftFor = null;
    ws.generatedFields = new Set();
    ws.dirty = false;
    rerender();
}

// Leaves edit mode cleanly - the one way out of it: the draft and the marker
// of whose draft it was go together, and an unsaved new entry is dropped.
export function stopEditing() {
    ws.editing = false;
    ws.dirty = false;
    ws.draft = null;
    ws.draftFor = null;
    ws.overviewDraft = null;
    ws.generatedFields = new Set();
    ws.pendingGen = null;
    if (ws.entryId === 'new') ws.entryId = null;
}

export function closeSheet() {
    stopEditing();
    ws.entryId = null;
    rerender();
}
