// Shared loader for the State Engine API, used by the wrappers in
// src/api/presets.js, variables.js and objects.js (the Archivist pattern:
// the template's original wrappers each import these paths themselves;
// the newer wrappers share this one module instead).
//
// Adjust these two paths if your State Engine folder is named differently.
// They are DYNAMIC imports for the reason given in src/api/namespace.js:
// nothing here runs until State Engine has been confirmed present.
const API_PATH = '../../../SillyTavern-StateEngine/src/api/index.js';
const IDENTITY_PATH = '../../../SillyTavern-StateEngine/src/api/identity.js';

// -> { stateEngine, instanceId } for an identity-checked call.
export async function getStateEngine() {
    const { stateEngine } = await import(API_PATH);
    const { ensureInstanceId } = await import(IDENTITY_PATH);
    return { stateEngine, instanceId: ensureInstanceId() };
}
