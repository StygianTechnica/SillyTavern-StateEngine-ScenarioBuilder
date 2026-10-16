// The one place Scenario Builder calls a model, for content generation
// (spec SB-134). It goes through the generation connection profile chosen in
// the drawer (SillyTavern's Connection Manager), or the active connection
// when none is chosen - the same two paths State Engine's background calls
// use. Calls run one at a time.
//
// Why not a State Engine independent preset: interactive generation needs
// its own creative prompt and a free-form JSON answer whose keys depend on
// the object's fields, and presets frame every call as a variable update
// with shared per-preset context. State Engine does not expose its own
// per-connection queue to extensions yet (docs/ROADMAP.md); when it does,
// only this file changes. Lorebook import (bulk, resumable) is meant to use
// independent presets (SB-152).

import { LOG_PREFIX } from '../constants.js';
import { getSettings } from '../settings.js';

let chain = Promise.resolve();

function textOf(result) {
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
        if (typeof result.content === 'string') return result.content;
        if (typeof result.text === 'string') return result.text;
        const choice = Array.isArray(result.choices) ? result.choices[0] : null;
        if (typeof choice?.message?.content === 'string') return choice.message.content;
        if (typeof choice?.text === 'string') return choice.text;
    }
    return '';
}

async function callNow(messages, maxTokens) {
    const context = SillyTavern.getContext();
    const profileId = getSettings().connectionProfileId;
    if (profileId) {
        const svc = context.ConnectionManagerRequestService;
        if (typeof svc?.sendRequest !== 'function') throw new Error('The chosen connection profile cannot be used (Connection Manager is unavailable).');
        const result = await svc.sendRequest(profileId, messages, maxTokens, { extractData: true, stream: false });
        const text = textOf(result);
        if (!text) throw new Error('The connection profile returned no text.');
        return text;
    }
    if (typeof context.generateRaw !== 'function') throw new Error('SillyTavern cannot generate in the background here.');
    const text = textOf(await context.generateRaw({ prompt: messages, responseLength: maxTokens }));
    if (!text) throw new Error('The model returned no text.');
    return text;
}

// messages: [{ role: 'system' | 'user', content }]. Resolves to the reply
// text; rejects with a readable reason.
export function callModel(messages, maxTokens = 900) {
    const run = chain.then(() => callNow(messages, maxTokens));
    chain = run.catch((err) => console.warn(LOG_PREFIX, 'generation failed', err));
    return run;
}

// The director's call (src/director/run.js): a reply is waiting on it, so
// it does not queue behind background enrichment.
export function callModelFirst(messages, maxTokens = 700) {
    return callNow(messages, maxTokens);
}
