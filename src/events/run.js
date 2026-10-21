// Structured events - the runner (the pure half: src/events/model.js; the
// design: docs/DESIGN - STRUCTURED EVENTS.md). The event lives in the chat
// document (doc.event; finished ones in doc.eventsDone). The director's
// briefing calls eventForBriefing() before it writes - which moves the
// event on when its stage ended in an earlier reply - and eventAfterFight()
// once the fight is known. The user plans, starts and steps in from the GM
// Plan tab. No model calls of its own.

import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { arenaFromSetup, startEvent, beginReply, afterFight, markStage, isRunning, normalizeEvent } from './model.js';

export const EVENTS_EVENT = 'scenario_builder_events_changed';

function emit(chatKey) {
    try {
        SillyTavern.getContext().eventSource.emit(EVENTS_EVENT, chatKey);
    } catch {
        // No event bus (tests).
    }
}

export const getEvent = (chatKey) => getChatDoc(chatKey).event;

// Writes the chat's event; a finished one makes way (kept in eventsDone).
function save(chatKey, event, { retire = false } = {}) {
    updateChatDoc(chatKey, (d) => {
        if (retire && d.event && !isRunning(d.event) && d.event.status !== 'planned') d.eventsDone = [...d.eventsDone, d.event];
        d.event = event;
    });
    emit(chatKey);
    return getChatDoc(chatKey).event;
}

// An arena set up, not yet begun (replaces a plan; never a running event).
// setup: { name, placeId, opponents: [{ name, objectId }], intro, close, prize }.
export function planArena(chatKey, setup) {
    if (isRunning(getEvent(chatKey))) throw new Error('An event is under way - end it first.');
    const event = arenaFromSetup(setup);
    if (!event) throw new Error('An arena needs at least one opponent.');
    return save(chatKey, event, { retire: true });
}

export function startPlannedEvent(chatKey) {
    const doc = getChatDoc(chatKey);
    if (doc.event?.status !== 'planned') return doc.event;
    return save(chatKey, startEvent(doc.event, doc.turn));
}

export function discardPlannedEvent(chatKey) {
    if (getEvent(chatKey)?.status === 'planned') save(chatKey, null);
}

// The user's hand: 'won' | 'lost' | 'skip' | 'end'.
export function markEventStage(chatKey, action) {
    const doc = getChatDoc(chatKey);
    return save(chatKey, markStage(doc.event, action, doc.turn));
}

// Before a briefing: the event as this reply begins. -> the event or null.
export function eventForBriefing(chatKey) {
    const doc = getChatDoc(chatKey);
    if (!isRunning(doc.event)) return doc.event;
    const next = beginReply(doc.event, doc.turn);
    if (JSON.stringify(next) !== JSON.stringify(normalizeEvent(doc.event))) save(chatKey, next);
    return next;
}

// After a briefing: a bout decided by the fight.
export function eventAfterFight(chatKey, fight) {
    const doc = getChatDoc(chatKey);
    if (!isRunning(doc.event)) return;
    const next = afterFight(doc.event, fight, doc.turn);
    if (JSON.stringify(next) !== JSON.stringify(normalizeEvent(doc.event))) save(chatKey, next);
}
