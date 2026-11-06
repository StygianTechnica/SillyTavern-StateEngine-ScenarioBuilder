// The Scenario Builder workspace (spec SB-701): a window over SillyTavern
// that works in its own space -
//   - it stays open until its own Close button: clicking outside it or
//     pressing Escape does NOT close it (unlike SillyTavern's popups);
//   - keys typed inside it never reach SillyTavern's own shortcuts;
//   - Minimise folds it into a small pill so the chat can be read, and
//     brings it back exactly where it was.
// Tabs: Catalog (catalog.js + sheet.js), Graph (graph.js), Scene, GM Plan (gm-plan.js), Review,
// History, Import (import-panel.js), Worlds (worlds-tab.js), Preview (panels.js),
// Naming (naming-tab.js), Bloodlines (bloodlines-tab.js).

import { getSettings, saveSettings } from '../settings.js';
import { LOG_PREFIX } from '../constants.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { getChatDoc, SCENARIO_CHANGED_EVENT } from '../store/chat-store.js';
import { LIBRARY_CHANGED_EVENT } from '../store/setting-store.js';
import { ensureBoundSetting, getSettingSummary, listAllSettings, switchSetting } from '../library/library.js';
import { DRIFT_CHANGED_EVENT } from '../validate/reconcile.js';
import { syncNow, GUIDANCE_CHANGED_EVENT } from '../guidance/sync.js';
import { setEditingCheck, ENRICH_EVENT } from '../generate/enrich.js';
import { QUESTS_EVENT } from '../quests/sync.js';
import { renderCatalog } from './catalog.js';
import { renderGraph } from './graph.js';
import { renderScene, renderReview, renderHistory, renderPreview } from './panels.js';
import { renderCalendar } from './calendar.js';
import { renderGmPlan } from './gm-plan.js';
import { PLANNER_EVENT } from '../planner/run.js';
import { renderImport } from './import-panel.js';
import { renderWorlds } from './worlds-tab.js';
import { renderNaming } from './naming-tab.js';
import { renderBloodlines } from './bloodlines-tab.js';
import { WORLDS_EVENT } from '../worlds/run.js';
import { IMPORT_EVENT } from '../import/run.js';
import { DIRECTOR_EVENT } from '../director/run.js';
import { confirmAction } from './confirm.js';
import { ws, setRedraw, rerender, stopEditing } from './ws.js';
import { h, icon, select, toast } from './dom.js';

const TABS = Object.freeze([
    ['catalog', 'Catalog', 'fa-book-atlas'],
    ['graph', 'Graph', 'fa-diagram-project'],
    ['scene', 'Scene', 'fa-clapperboard'],
    ['plan', 'GM Plan', 'fa-chess-knight'],
    ['calendar', 'Calendar', 'fa-calendar-days'],
    ['naming', 'Naming', 'fa-signature'],
    ['bloodlines', 'Bloodlines', 'fa-dna'],
    ['review', 'Review', 'fa-seedling'],
    ['history', 'History', 'fa-clock-rotate-left'],
    ['import', 'Import', 'fa-file-import'],
    ['worlds', 'Worlds', 'fa-earth-americas'],
    ['preview', 'Preview', 'fa-eye'],
]);

let overlay = null;
let pill = null;
let renderToken = 0;
let restored = false;
let listening = false;

async function bindContext() {
    const ref = getCurrentChatRef();
    if (!ref) return null;
    const settingId = await ensureBoundSetting(ref.chatId);
    return { chatId: ref.chatId, chatKey: chatKeyFor(ref), settingId };
}

async function close() {
    if (ws.dirty && !await confirmAction('Close Scenario Builder? You have unsaved changes.')) return;
    overlay?.remove();
    pill?.remove();
    overlay = null;
    pill = null;
    ws.open = false;
    ws.minimized = false;
    stopEditing();
}

function minimize() {
    if (!overlay) return;
    ws.minimized = true;
    overlay.hidden = true;
    pill ??= h('div', { class: 'sb-pill', title: 'Back to Scenario Builder', onclick: restore }, icon('fa-book-atlas'), h('span', {}, 'Scenario Builder'));
    document.body.append(pill);
}

function restore() {
    ws.minimized = false;
    if (overlay) overlay.hidden = false;
    pill?.remove();
    rerender({ force: false });
}

// Keeps keys inside the window: SillyTavern listens on the document for
// shortcuts (Escape, arrows for swipes, Enter to send...).
function isolate(el) {
    for (const type of ['keydown', 'keyup', 'keypress']) {
        el.addEventListener(type, (e) => e.stopPropagation());
    }
}

export async function openWorkspace({ tab = null } = {}) {
    const ctx = await bindContext();
    if (!ctx) return toast('info', 'Open a chat first - the library belongs to the chat\'s setting.');
    if (!ctx.settingId) return toast('warning', 'This chat has no State Engine setting yet.');
    ws.ctx = ctx;
    // The tab and chapter last open, after a reload.
    if (!restored) {
        restored = true;
        const lastSeen = getSettings().catalog.last;
        if (lastSeen && TABS.some(([key]) => key === lastSeen.tab)) ws.tab = lastSeen.tab;
        if (lastSeen?.chapter) ws.chapter = lastSeen.chapter;
    }
    if (tab) ws.tab = tab;
    if (!overlay) {
        overlay = h('div', { class: 'sb-workspace', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Scenario Builder' });
        isolate(overlay);
        watchScroll(overlay);
        document.body.append(overlay);
    }
    ws.open = true;
    setRedraw(render);
    listen();
    if (ws.minimized) restore();
    await render();
}

function listen() {
    if (listening) return;
    listening = true;
    const { eventSource, eventTypes } = SillyTavern.getContext();
    const later = redrawLater;
    for (const event of [SCENARIO_CHANGED_EVENT, LIBRARY_CHANGED_EVENT, DRIFT_CHANGED_EVENT]) eventSource.on(event, later);
    eventSource.on(GUIDANCE_CHANGED_EVENT, () => { if (ws.tab === 'preview') later(); });
    eventSource.on(ENRICH_EVENT, later);
    eventSource.on(QUESTS_EVENT, later);
    eventSource.on(PLANNER_EVENT, () => { if (ws.tab === 'plan') later(); });
    // The import's progress redraws the Import tab (no unsaved input there).
    eventSource.on(IMPORT_EVENT, () => { if (ws.tab === 'import') rerender(); });
    eventSource.on(DIRECTOR_EVENT, () => { if (ws.tab === 'preview') rerender(); });
    eventSource.on(WORLDS_EVENT, () => { if (ws.tab === 'worlds') later(); });
    // Background enrichment holds off an entry the user is editing.
    setEditingCheck((id) => ws.open && ws.editing && ws.entryId === id);
    eventSource.on(eventTypes.CHAT_CHANGED, async () => {
        if (!ws.open) return;
        const ctx = await bindContext();
        if (!ctx) return void close();
        ws.ctx = ctx;
        stopEditing();
        ws.entryId = null;
        rerender();
    });
}

function reviewCount() {
    const doc = getChatDoc(ws.ctx.chatKey);
    return doc.adopted.length + doc.candidates.length + doc.drift.filter((d) => d.status === 'pending').length;
}

async function render() {
    if (!overlay || ws.minimized) return;
    const token = ++renderToken;
    // Every scrolling area keeps its place across a redraw of the same view
    // (a sparkle, a save, a background update) - and starts at the top when
    // the view changes (another chapter, sheet or tab).
    const view = [ws.tab, ws.chapter, ws.entryId, ws.sheetTab].join('|');
    const remembered = getSettings().catalog.last;
    if (remembered?.tab !== ws.tab || remembered?.chapter !== ws.chapter) {
        getSettings().catalog.last = { tab: ws.tab, chapter: ws.chapter };
        saveSettings();
    }
    const sameView = view === lastView;
    lastView = view;
    let body;
    try {
        body = await ({ graph: renderGraph, import: renderImport, worlds: renderWorlds, scene: renderScene, plan: renderGmPlan, calendar: renderCalendar, naming: renderNaming, bloodlines: renderBloodlines, review: renderReview, history: renderHistory, preview: renderPreview }[ws.tab] ?? renderCatalog)();
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not render the workspace', err);
        body = h('div', { class: 'sb-error' }, `Something went wrong: ${err?.message ?? err}`);
    }
    const setting = await getSettingSummary(ws.ctx.settingId);
    const settings = await listAllSettings();
    if (token !== renderToken || !overlay) return;

    const count = reviewCount();
    const header = h('div', { class: 'sb-ws-header' },
        h('div', { class: 'sb-ws-title' }, icon('fa-book-atlas'), h('b', {}, 'Scenario Builder')),
        h('nav', { class: 'sb-tabs' }, TABS.map(([key, label, iconName]) => h('div', {
            class: `sb-tab${ws.tab === key ? ' active' : ''}`,
            onclick: async () => {
                if (key === ws.tab) return;
                if (ws.dirty && !await confirmAction('Leave without saving your changes?')) return;
                stopEditing();
                ws.tab = key;
                rerender();
            },
        }, icon(iconName), h('span', {}, label), key === 'review' && count ? h('span', { class: 'sb-tab-badge' }, String(count)) : null))),
        h('label', { class: 'sb-ws-setting', title: 'The State Engine setting this chat uses. Switching changes it for this chat.' },
            icon('fa-earth-americas'),
            select(settings.map((s) => ({ value: s.id, label: s.name })), setting?.id, { onchange: (e) => void onSwitchSetting(e.target.value, e.target) })),
        h('div', { class: 'sb-ws-buttons' },
            h('div', { class: 'sb-iconbtn', title: 'Minimise - keep your place and look at the chat', onclick: minimize }, icon('fa-window-minimize')),
            h('div', { class: 'sb-iconbtn', title: 'Close', onclick: () => void close() }, icon('fa-xmark'))));

    overlay.replaceChildren(h('div', { class: 'sb-ws-panel' }, header, h('div', { class: 'sb-ws-body' }, body)));
    // Where the user is now (not when this redraw began); a new view starts
    // at the top.
    if (sameView && view === lastView) restoreScroll({ ...kept });
    else if (view === lastView) { kept = {}; restoring = null; }
}

const SCROLLERS = Object.freeze(['.sb-ws-body', '.sb-content', '.sb-rail', '.sb-sheet-body']);
let lastView = '';

// Where each scrolling area is, kept as the user scrolls - not read when a
// redraw starts: a background redraw that took a moment put the GM plan
// back where it was when it began, and set before the page had its full
// height (images still loading) it was clamped to the top.
let kept = {};
let userAt = 0;          // the user's last scroll, wheel, touch or key
let restoring = null;    // { wanted, until } while a redraw puts them back
const scrollerOf = (el) => SCROLLERS.find((sel) => el?.matches?.(sel)) ?? null;

function watchScroll(el) {
    el.addEventListener('scroll', (e) => {
        const sel = scrollerOf(e.target);
        if (!sel || restoring) return;
        kept[sel] = e.target.scrollTop;
    }, true);
    // The user's own hand ends a restore at once.
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
        el.addEventListener(type, () => { userAt = Date.now(); restoring = null; }, { capture: true, passive: true });
    }
}

// Puts each area back, frame by frame while the page grows into it (for a
// second at most), until the user scrolls.
function restoreScroll(wanted) {
    restoring = { wanted, until: Date.now() + 1000 };
    const mine = restoring;
    const step = () => {
        if (restoring !== mine || !overlay) return;
        let short = false;
        for (const [sel, top] of Object.entries(wanted)) {
            const el = overlay.querySelector(sel);
            if (!el) continue;
            if (Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
            if (el.scrollTop < top - 1) short = true;
        }
        if (short && Date.now() < mine.until) requestAnimationFrame(step);
        else requestAnimationFrame(() => { if (restoring === mine) restoring = null; });
    };
    step();
}

// A background redraw waits while the user is scrolling, and a burst of
// changes is one redraw.
let laterTimer = null;
function redrawLater() {
    clearTimeout(laterTimer);
    laterTimer = setTimeout(() => {
        if (Date.now() - userAt < 1200) return redrawLater();
        rerender({ force: false });
    }, 250);
}

async function onSwitchSetting(settingId, el) {
    if (!settingId || settingId === ws.ctx.settingId) return;
    if (!await confirmAction('Switch this chat to another setting? The library shown will be that setting\'s, and the current scene may name places that are not in it.')) {
        el.value = ws.ctx.settingId;
        return;
    }
    await switchSetting(ws.ctx.chatId, settingId);
    ws.ctx.settingId = settingId;
    ws.entryId = null;
    ws.chapter = 'overview';
    await syncNow();
    rerender();
}
