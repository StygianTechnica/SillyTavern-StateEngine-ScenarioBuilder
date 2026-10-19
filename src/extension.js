// Scenario Builder bootstrap (spec SB-500): dependency check -> claim the
// namespace, register with State Engine (variables, capabilities) ->
// restore the Scenario State preset -> load settings -> start following
// the chat (validation, guidance) -> the drawer and the public API.
//
// The dependency check runs FIRST and gates everything else (SB-001): if
// State Engine is not installed, not enabled, or its API cannot be
// reached, this shows one popup and returns.

import { GUIDANCE_PARTS } from './guidance/build.js';
import { installOverflowTooltips } from './ui/overflow-tooltips.js';
import { EXTENSION_ID, NAMESPACE, LOG_PREFIX } from './constants.js';
import { ensureStateEngineAvailable, warnStateEngineMissing } from './api/dependency-check.js';
import { claimNamespace } from './api/namespace.js';
import { registerWithStateEngine } from './api/registration.js';
import { declareCapabilities } from './api/capabilities.js';
import { qualifiedName } from './api/variables.js';
import { getSettings } from './settings.js';
import { ensureScenarioPreset } from './preset/scenario-preset.js';
import { ALL_VARIABLES } from './preset/blueprint.js';
import { startGuidanceSync } from './guidance/sync.js';
import { startLifecycle } from './state/lifecycle.js';
import { addSettingsDrawer } from './ui/settings-drawer.js';
import { exposeScenarioBuilderApi } from './public-api.js';
import { startReviewNotice } from './ui/review-notice.js';
import { registerSlashCommands } from './ui/slash-commands.js';
import { pruneSettingDocs } from './store/setting-store.js';
import { listAllSettings } from './library/library.js';

const OUTPUTS = ['guidance', ...GUIDANCE_PARTS.map(([name]) => name), 'cast', 'state_block'].map(qualifiedName);

// What Scenario Builder provides (SB-002, SB-310): each output offered to
// Curator for injection, as a user message by default (the user may change
// the role in Curator) - plus the scenario.* capabilities for other
// extensions. The state block's capability is declared even when it is
// switched off: it is then simply ''.
const CAPABILITIES = [
    ...OUTPUTS.flatMap((name) => [`curator.inject:${name}`, `curator.inject.role:user:${name}`]),
    'scenario.library',
    'scenario.state',
];

export async function initExtension() {
    // Cut-off text shows in full on hover (src/ui/overflow-tooltips.js).
    installOverflowTooltips();
    const available = await ensureStateEngineAvailable();
    if (!available) {
        warnStateEngineMissing();
        console.warn(`${LOG_PREFIX} State Engine was not found (not installed, not enabled, or not ready) - initialization aborted.`);
        return;
    }

    try {
        await claimNamespace(EXTENSION_ID, NAMESPACE);
        await registerWithStateEngine(EXTENSION_ID, {
            namespace: NAMESPACE,
            variables: ALL_VARIABLES.map(([name]) => qualifiedName(name)),
            capabilities: CAPABILITIES,
            description: 'The narrative director: a setting library, canonical world state checked against the story, and narrative guidance for Curator to inject.',
        });
        await declareCapabilities(EXTENSION_ID, CAPABILITIES);
        console.log(`${LOG_PREFIX} initialized - namespace "${NAMESPACE}" claimed.`);
    } catch (err) {
        warnStateEngineMissing();
        console.warn(`${LOG_PREFIX} State Engine calls failed unexpectedly - initialization aborted.`, err);
        return;
    }

    // Scenario Builder's own startup - a failure here is ours, not State
    // Engine's, so it is logged rather than shown as the missing-dependency
    // popup (SB-802).
    getSettings();
    try {
        // Library data of settings State Engine no longer has (SB-601).
        pruneSettingDocs((await listAllSettings()).map((s) => s.id));
    } catch (err) {
        console.warn(`${LOG_PREFIX} could not tidy up library data.`, err);
    }
    try {
        await ensureScenarioPreset();
    } catch (err) {
        console.error(`${LOG_PREFIX} could not set up the Scenario State preset.`, err);
    }
    try {
        startLifecycle();
        startGuidanceSync();
    } catch (err) {
        console.error(`${LOG_PREFIX} could not start following the chat.`, err);
    }
    try {
        await addSettingsDrawer();
    } catch (err) {
        console.error(`${LOG_PREFIX} the settings drawer failed to load.`, err);
    }
    try {
        await startReviewNotice();
    } catch (err) {
        console.error(`${LOG_PREFIX} the review notification failed to start.`, err);
    }
    // /sb-request and /sb-requests (best-effort; never stops loading).
    registerSlashCommands();
    exposeScenarioBuilderApi();
}
