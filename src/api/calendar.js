// Thin wrappers around State Engine's calendar API (formatting, date parts,
// definitions, advancing a moment). No additional logic belongs in this
// file - see the State Engine API Reference, "Calendar formatting API" and
// "Calendar definition API".

import { getStateEngine } from './state-engine.js';
import { EXTENSION_ID } from '../constants.js';

export async function listCalendarDefinitions() {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.listCalendarDefinitions?.(EXTENSION_ID, instanceId) ?? [];
}

export async function getCalendarDefinition(calendarId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.getCalendarDefinition?.(EXTENSION_ID, instanceId, calendarId) ?? null;
}

export async function createCalendarDefinition(def) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.createCalendarDefinition(EXTENSION_ID, instanceId, def);
}

export async function generateRandomCalendarDefinition(options = {}) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.generateRandomCalendarDefinition(EXTENSION_ID, instanceId, options);
}

// -> { year, month, day, hour, minute, second, weekdayName, ..., time, calendar }
export async function getDateTimeParts(calendarId, scalarTime) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.getDateTimeParts(EXTENSION_ID, instanceId, calendarId, scalarTime);
}

// options: { style: 'full' | 'date' | 'time' | 'month' | 'year' | 'custom', pattern }
export async function formatDateTime(calendarId, scalarTime, options = {}) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.formatDateTime(EXTENSION_ID, instanceId, calendarId, scalarTime, options);
}

// The moment after `text`'s worth of time ("2 hours", "the next morning"),
// or null. Undefined when this State Engine has no advanceDateTime yet.
export async function advanceDateTime(calendarId, scalarTime, text) {
    const { stateEngine, instanceId } = await getStateEngine();
    if (typeof stateEngine.advanceDateTime !== 'function') return undefined;
    return stateEngine.advanceDateTime(EXTENSION_ID, instanceId, calendarId, scalarTime, text);
}

// Points one of our datetime variables at a calendar.
export async function assignCalendarToVariable(ref, calendarId) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.assignCalendarToVariable(EXTENSION_ID, instanceId, ref, calendarId);
}
