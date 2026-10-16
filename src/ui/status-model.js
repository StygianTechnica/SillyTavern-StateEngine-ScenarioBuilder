// What the drawer and the status lines say, as plain functions (no
// SillyTavern imports, unit-tested).

import { qualifiedNameOf } from './names.js';

// Whether Curator injects the outputs (SB-315), read from Curator's own
// settings (extension_settings.curator.variableInjections[name].enabled).
// -> { installed, guidance, stateBlock } with null where unknown.
export function curatorStatus(extensionSettings) {
    const curator = extensionSettings?.curator;
    if (!curator || typeof curator !== 'object') return { installed: false, guidance: null, stateBlock: null };
    const injections = curator.variableInjections ?? {};
    return {
        installed: true,
        guidance: injections[qualifiedNameOf('guidance')]?.enabled === true,
        stateBlock: injections[qualifiedNameOf('state_block')]?.enabled === true,
    };
}

// The Curator line in the drawer: { text, warn }.
export function curatorLine(status, stateBlockEnabled) {
    if (!status.installed) return { text: 'Curator is not installed: the guidance is still written to sb__guidance, for State Engine macros or a World Info entry.', warn: false };
    if (!status.guidance) return { text: 'Curator: "Narrative guidance" is not ticked in its State Engine Variables bank - nothing is injected yet.', warn: true };
    if (stateBlockEnabled && !status.stateBlock) return { text: 'Curator injects the guidance. "Canonical scene state" is written but not ticked.', warn: false };
    return { text: 'Curator injects the guidance.', warn: false };
}

// The preset line: { text, warn, hint } (SB-203, SB-205).
export function presetLine(status, chatOpen) {
    if (!chatOpen) return { text: 'Open a chat to use Scenario Builder.', warn: false, hint: '' };
    const hint = status.active && status.sceneContextActive ? 'Scene Context is not needed - Scenario State covers it. Leaving both active costs prompt space.' : '';
    if (!status.exists) return { text: 'The Scenario State preset is missing. Activate it to restore it.', warn: true, hint };
    if (!status.active) return { text: 'Scenario State is not active in this chat - the guidance is empty.', warn: true, hint };
    return { text: 'Scenario State is active in this chat.', warn: false, hint };
}

// A one-line summary of the canonical scene: "Brass Market · day 3, evening
// · Rainy · 2 to review".
export function sceneLine({ locationName, time, weather, pending }) {
    const parts = [locationName || 'No location set'];
    if (time) parts.push(time);
    if (weather?.length) parts.push(weather.join(', '));
    if (pending) parts.push(`${pending} to review`);
    return parts.join(' · ');
}
