// The Scenario Builder drawer in SillyTavern's Extensions settings
// (spec SB-700): enable/pause, the Scenario State preset shortcut and the
// Scene Context hint (SB-204, SB-205), the bound setting, Curator status
// (SB-315), token budget and section toggles, validation policies, and
// the button that opens the workspace. Rendered from settings.html and
// appended to #extensions_settings2, as the sibling extensions do. What it
// says comes from src/ui/status-model.js.

import { LOG_PREFIX } from '../constants.js';
import { getSettings, saveSettings } from '../settings.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { getChatDoc, SCENARIO_CHANGED_EVENT } from '../store/chat-store.js';
import { getPresetStatus, setScenarioPresetActive, PRESET_STATUS_EVENT } from '../preset/scenario-preset.js';
import { getBoundSettingId, getSettingSummary } from '../library/library.js';
import { getObject } from '../api/objects.js';
import { SECTIONS, timeText } from '../guidance/build.js';
import { requestSync, GUIDANCE_CHANGED_EVENT } from '../guidance/sync.js';
import { FIELD_LABELS, POLICY_VALUES } from '../validate/drift.js';
import { DRIFT_CHANGED_EVENT } from '../validate/reconcile.js';
import { curatorStatus, curatorLine, presetLine, sceneLine } from './status-model.js';
import { openWorkspace } from './workspace.js';
import { listConnectionProfiles } from './connection-profiles.js';
import { witnessCoverage, POV_MODES } from '../director/perspective.js';
import { h, icon, toast } from './dom.js';

// SillyTavern resolves extension templates relative to
// public/scripts/extensions/, i.e. "third-party/<folder name>". Derived
// from this file's own URL so a renamed install folder still works.
const EXTENSION_FOLDER = decodeURIComponent(new URL('../../', import.meta.url).pathname.split('/').filter(Boolean).pop());
const TEMPLATE_PATH = `third-party/${EXTENSION_FOLDER}`;

const byId = (id) => document.getElementById(id);
const POLICY_LABELS = { canonical: 'canonical', observed: 'story', ask: 'ask' };

let renderToken = 0;

async function renderChat() {
    const token = ++renderToken;
    const ref = getCurrentChatRef();
    const status = ref ? await getPresetStatus(ref.chatId) : { exists: false, active: false, sceneContextActive: false };
    const settingId = ref ? await getBoundSettingId(ref.chatId) : null;
    const setting = settingId ? await getSettingSummary(settingId) : null;
    let scene = '';
    if (ref) {
        const doc = getChatDoc(chatKeyFor(ref));
        const location = doc.canonical.locationId ? await getObject(ref.chatId, doc.canonical.locationId) : null;
        scene = sceneLine({
            locationName: location?.name ?? '',
            time: timeText({ day: doc.canonical.day, dayPart: doc.canonical.dayPart }),
            weather: doc.canonical.weather,
            pending: doc.adopted.length + doc.drift.filter((d) => d.status === 'pending').length + doc.candidates.length,
        });
    }
    if (token !== renderToken || !byId('sb_preset_status')) return;

    const line = presetLine(status, !!ref);
    const presetEl = byId('sb_preset_status');
    presetEl.textContent = line.text;
    presetEl.classList.toggle('sb-warn', line.warn);
    const hint = byId('sb_scene_context_hint');
    hint.textContent = line.hint;
    hint.hidden = !line.hint;

    const toggle = byId('sb_preset_toggle');
    toggle.hidden = !ref;
    toggle.replaceChildren(icon(status.active ? 'fa-toggle-on' : 'fa-toggle-off'), h('span', {}, status.active ? 'Deactivate' : 'Activate'));
    toggle.dataset.active = String(status.active);

    byId('sb_setting_line').textContent = ref ? `Setting: ${setting?.name ?? '(none)'} - chosen in State Engine.` : '';
    byId('sb_scene_line').textContent = ref && status.active ? scene : '';

    const curator = curatorLine(curatorStatus(SillyTavern.getContext().extensionSettings), getSettings().stateBlockEnabled);
    const curatorEl = byId('sb_curator_line');
    curatorEl.textContent = curator.text;
    curatorEl.classList.toggle('sb-warn', curator.warn);
    await witnessNote();
}

// How much of this chat's memory says who was present: perspective works
// from it, and older chats were extracted without it.
async function witnessNote() {
    const note = byId('sb_director_witness_note');
    if (!note) return;
    note.hidden = true;
    const archivist = window.StateEngineArchivist;
    if (getSettings().director.perspective === false || typeof archivist?.getAllMemories !== 'function') return;
    try {
        const { total, witnessed } = witnessCoverage(await archivist.getAllMemories());
        if (!total || witnessed / total >= 0.6) return;
        note.textContent = `Only ${witnessed} of this chat's ${total} memories record who was present, so perspective has little to go on for what came before. Archivist's "Rebuild memories from chat" (in its memory browser) reads the chat again and fills it in.`;
        note.hidden = false;
    } catch {
        // No memories to look at.
    }
}

function refresh() {
    void renderChat().catch((err) => console.warn(LOG_PREFIX, 'could not show the drawer status', err));
}

function renderSettings() {
    const settings = getSettings();
    byId('sb_enabled').checked = settings.enabled === true;
    byId('sb_paused').checked = settings.paused === true;
    byId('sb_token_budget').value = settings.tokenBudget;
    byId('sb_state_block').checked = settings.stateBlockEnabled === true;
    byId('sb_correction_turns').value = settings.correctionTurns;
    byId('sb_director').checked = settings.director.enabled === true;
    byId('sb_director_create').checked = settings.director.allowCreate === true;
    byId('sb_director_ahead').checked = settings.director.thinkAhead === true;
    byId('sb_triggers_on_message').checked = settings.triggers?.onMessage !== false;
    byId('sb_director_perspective').checked = settings.director.perspective !== false;
    byId('sb_director_pov').value = POV_MODES.includes(settings.director.pov) ? settings.director.pov : 'free';
    byId('sb_director_night').checked = settings.director.travelAtNight === true;
    byId('sb_changes_suggest').checked = settings.changes?.suggest !== false;
    byId('sb_changes_auto').checked = settings.changes?.auto === true;
    byId('sb_director_timeout').value = settings.director.timeout;
    byId('sb_director_context').value = settings.director.contextTokens;
    byId('sb_director_fight').value = settings.director.fightReplies;
    byId('sb_director_powers').value = settings.director.powersEvery;

    byId('sb_sections').replaceChildren(...SECTIONS.map((s) => h('label', { class: 'checkbox_label' },
        h('input', {
            type: 'checkbox', checked: settings.sections[s.key] !== false,
            onchange: (e) => { settings.sections[s.key] = e.target.checked; changed(); },
        }),
        h('span', {}, s.title))));

    byId('sb_policies').replaceChildren(...Object.entries(FIELD_LABELS).map(([field, label]) => h('label', { class: 'sb-field sb-policy' },
        h('span', {}, label),
        h('select', { class: 'text_pole', onchange: (e) => { settings.policies[field] = e.target.value; saveSettings(); } },
            POLICY_VALUES.map((p) => h('option', { value: p, selected: settings.policies[field] === p }, POLICY_LABELS[p]))))));
}

function changed() {
    saveSettings();
    requestSync();
    refresh();
}

export async function addSettingsDrawer() {
    if (byId('scenario_builder_settings')) return;
    let html;
    try {
        html = await SillyTavern.getContext().renderExtensionTemplateAsync(TEMPLATE_PATH, 'settings');
    } catch (err) {
        console.error(LOG_PREFIX, 'failed to load settings.html template', err);
        return;
    }
    const container = byId('extensions_settings2');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', html);

    const settings = getSettings();
    byId('sb_enabled').addEventListener('change', (e) => { settings.enabled = e.target.checked; changed(); });
    byId('sb_paused').addEventListener('change', (e) => { settings.paused = e.target.checked; changed(); });
    byId('sb_state_block').addEventListener('change', (e) => { settings.stateBlockEnabled = e.target.checked; changed(); });
    byId('sb_token_budget').addEventListener('change', (e) => {
        const value = Math.round(Number(e.target.value));
        settings.tokenBudget = Number.isFinite(value) ? Math.min(8000, Math.max(50, value)) : 2000;
        e.target.value = settings.tokenBudget;
        changed();
    });
    byId('sb_correction_turns').addEventListener('change', (e) => {
        const value = Math.round(Number(e.target.value));
        settings.correctionTurns = Number.isFinite(value) ? Math.min(10, Math.max(1, value)) : 2;
        e.target.value = settings.correctionTurns;
        saveSettings();
    });
    byId('sb_director').addEventListener('change', (e) => { settings.director.enabled = e.target.checked; changed(); });
    byId('sb_director_create').addEventListener('change', (e) => { settings.director.allowCreate = e.target.checked; saveSettings(); });
    byId('sb_director_ahead').addEventListener('change', (e) => { settings.director.thinkAhead = e.target.checked; saveSettings(); });
    byId('sb_triggers_on_message').addEventListener('change', (e) => { settings.triggers = { ...(settings.triggers ?? {}), onMessage: e.target.checked }; saveSettings(); });
    byId('sb_director_perspective').addEventListener('change', (e) => { settings.director.perspective = e.target.checked; saveSettings(); refresh(); });
    byId('sb_director_pov').addEventListener('change', (e) => { settings.director.pov = e.target.value; changed(); });
    byId('sb_director_night').addEventListener('change', (e) => { settings.director.travelAtNight = e.target.checked; saveSettings(); });
    byId('sb_changes_suggest').addEventListener('change', (e) => { settings.changes = { ...(settings.changes ?? {}), suggest: e.target.checked }; saveSettings(); });
    byId('sb_changes_auto').addEventListener('change', (e) => { settings.changes = { ...(settings.changes ?? {}), auto: e.target.checked }; saveSettings(); });
    byId('sb_director_timeout').addEventListener('change', (e) => {
        const value = Math.round(Number(e.target.value));
        settings.director.timeout = Number.isFinite(value) ? Math.min(300, Math.max(5, value)) : 45;
        e.target.value = settings.director.timeout;
        saveSettings();
    });
    byId('sb_director_context').addEventListener('change', (e) => {
        const value = Math.round(Number(e.target.value));
        settings.director.contextTokens = Number.isFinite(value) ? Math.min(200000, Math.max(2048, value)) : 8192;
        e.target.value = settings.director.contextTokens;
        saveSettings();
    });
    byId('sb_director_powers').addEventListener('change', (e) => {
        const value = Math.round(Number(e.target.value));
        settings.director.powersEvery = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 8;
        e.target.value = settings.director.powersEvery;
        saveSettings();
    });
    byId('sb_director_fight').addEventListener('change', (e) => {
        const value = Math.round(Number(e.target.value));
        settings.director.fightReplies = Number.isFinite(value) ? Math.min(30, Math.max(2, value)) : 5;
        e.target.value = settings.director.fightReplies;
        saveSettings();
    });
    byId('sb_open_workspace').addEventListener('click', () => void openWorkspace());

    // Generation: its own connection profile, detail level and answer size.
    const connection = byId('sb_gen_connection');
    const fillConnections = () => {
        const chosen = settings.connectionProfileId || '';
        const options = [{ id: '', name: 'Same as the chat' }, ...listConnectionProfiles()];
        if (chosen && !options.some((o) => o.id === chosen)) options.push({ id: chosen, name: '(profile no longer exists)' });
        connection.replaceChildren(...options.map((o) => h('option', { value: o.id, selected: o.id === chosen }, o.name)));
    };
    fillConnections();
    connection.addEventListener('focus', fillConnections);
    connection.addEventListener('change', (e) => { settings.connectionProfileId = e.target.value; saveSettings(); });
    byId('sb_auto_enrich').checked = settings.generation.autoEnrich === true;
    byId('sb_auto_enrich').addEventListener('change', (e) => { settings.generation.autoEnrich = e.target.checked; saveSettings(); });
    // Generating the note is only offered while the notes are shown.
    const nsfwEnrich = byId('sb_nsfw_enrich');
    const syncNsfw = () => { nsfwEnrich.disabled = settings.generation.showNsfw !== true; nsfwEnrich.closest('label').classList.toggle('sb-off-row', nsfwEnrich.disabled); };
    byId('sb_nsfw_show').checked = settings.generation.showNsfw === true;
    byId('sb_nsfw_show').addEventListener('change', (e) => { settings.generation.showNsfw = e.target.checked; saveSettings(); syncNsfw(); });
    syncNsfw();
    byId('sb_nsfw_enrich').checked = settings.generation.nsfwInEnrich === true;
    byId('sb_nsfw_enrich').addEventListener('change', (e) => { settings.generation.nsfwInEnrich = e.target.checked; saveSettings(); });
    byId('sb_gen_detail').value = settings.generation.detail;
    byId('sb_gen_detail').addEventListener('change', (e) => { settings.generation.detail = e.target.value; saveSettings(); });
    byId('sb_gen_tokens').value = settings.generation.maxTokens;
    byId('sb_gen_tokens').addEventListener('change', (e) => {
        const value = Math.round(Number(e.target.value));
        settings.generation.maxTokens = Number.isFinite(value) ? Math.min(8000, Math.max(200, value)) : 1200;
        e.target.value = settings.generation.maxTokens;
        saveSettings();
    });

    const toggle = byId('sb_preset_toggle');
    toggle.addEventListener('click', async () => {
        const ref = getCurrentChatRef();
        if (!ref || toggle.dataset.busy === 'true') return;
        toggle.dataset.busy = 'true';
        try {
            const status = await setScenarioPresetActive(ref.chatId, toggle.dataset.active !== 'true');
            toast('success', status.active ? 'Scenario State is active in this chat.' : 'Scenario State is no longer active in this chat.');
        } catch (err) {
            console.warn(LOG_PREFIX, 'could not change the preset', err);
            toast('error', `Could not change the Scenario State preset: ${err?.message ?? err}`);
        } finally {
            delete toggle.dataset.busy;
            refresh();
        }
    });

    renderSettings();
    const { eventSource, eventTypes } = SillyTavern.getContext();
    for (const event of [eventTypes.CHAT_CHANGED, SCENARIO_CHANGED_EVENT, PRESET_STATUS_EVENT, DRIFT_CHANGED_EVENT, GUIDANCE_CHANGED_EVENT, eventTypes.SETTINGS_UPDATED].filter(Boolean)) {
        eventSource.on(event, refresh);
    }
    refresh();
}
