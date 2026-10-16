// Plugs State Engine's forgiving JSON reader (its public JSON API,
// parseModelJson - the same repair its own prompted updates use) into the
// generation parser. On a State Engine without that API, the local reader
// in src/generate/prompt.js is used. Called once before a generation.

import { LOG_PREFIX } from '../constants.js';
import { getStateEngine } from '../api/state-engine.js';
import { setJsonParser } from './prompt.js';

let tried = false;

export async function useStateEngineJsonParser() {
    if (tried) return;
    tried = true;
    try {
        const { stateEngine } = await getStateEngine();
        if (typeof stateEngine.parseModelJson === 'function') setJsonParser((text) => stateEngine.parseModelJson(text));
        else console.info(LOG_PREFIX, 'State Engine has no JSON API yet - using Scenario Builder\'s own JSON reader');
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not reach State Engine\'s JSON reader', err);
    }
}
