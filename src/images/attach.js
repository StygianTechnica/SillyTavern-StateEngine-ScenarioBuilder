// Getting a picture onto a catalog entry. Scenario Builder does not make
// images; it takes one the user brings - an uploaded or pasted file, or a
// URL - or asks SillyTavern's own Image Generation extension for one.
//
// Files are stored the way State Engine stores image files: through its
// Image API (importImageFile) into user/images/scenario-builder/, a
// relative path that survives reloads. The path goes on the object's own
// `image` field through the Object API (SB-011).

import { EXTENSION_ID, LOG_PREFIX } from '../constants.js';
import { getStateEngine } from '../api/state-engine.js';

export const IMAGE_FOLDER = 'scenario-builder';

// Stores an image File; resolves to its relative path. Throws with a
// reason the user can read (wrong format, too large, upload refused).
export async function importImage(file) {
    const { stateEngine, instanceId } = await getStateEngine();
    return stateEngine.importImageFile(EXTENSION_ID, instanceId, file, { folder: IMAGE_FOLDER });
}

// A src that is safe to show: http(s), data:image, or a relative path.
export function safeImageSrc(value) {
    const v = String(value ?? '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v) || /^data:image\//i.test(v)) return v;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return ''; // javascript:, file:, blob: ...
    return v.startsWith('/') ? v : `/${v}`;
}

// The first image on the clipboard as a File, or a URL the clipboard holds
// as text: { file } | { url } | null. Needs the browser's permission.
export async function readClipboardImage() {
    if (!navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
            const blob = await item.getType(type);
            return { file: new File([blob], `pasted.${type.split('/')[1] || 'png'}`, { type }) };
        }
    }
    for (const item of items) {
        if (!item.types.includes('text/plain')) continue;
        const text = (await (await item.getType('text/plain')).text()).trim();
        if (/^https?:\/\/\S+$/i.test(text)) return { url: text };
    }
    return null;
}

// Whether SillyTavern's Image Generation extension (its /imagine command)
// is loaded.
export function hasImageGenerator() {
    try {
        const context = SillyTavern.getContext();
        const commands = context.SlashCommandParser?.commands ?? {};
        return typeof context.executeSlashCommandsWithOptions === 'function' && !!(commands.imagine || commands.sd);
    } catch {
        return false;
    }
}

// Asks the Image Generation extension for a picture from `prompt`, quietly
// (nothing posted to the chat). Resolves to the image's path/URL. Throws
// when the extension isn't there or returns nothing.
export async function generateWithImageGenerator(prompt) {
    if (!hasImageGenerator()) throw new Error('SillyTavern\'s Image Generation extension is not enabled.');
    const context = SillyTavern.getContext();
    // Pipes and macros would be read as slash-command syntax.
    const text = String(prompt ?? '').replace(/\|/g, ',').replace(/\{\{|\}\}/g, '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('There is no prompt to send.');
    const name = context.SlashCommandParser.commands.imagine ? 'imagine' : 'sd';
    const result = await context.executeSlashCommandsWithOptions(`/${name} quiet=true ${text}`, { handleParserErrors: true, handleExecutionErrors: true });
    const path = String(result?.pipe ?? '').trim();
    if (!path || result?.isError) {
        console.warn(LOG_PREFIX, 'image generation returned nothing', result);
        throw new Error(result?.errorMessage || 'The Image Generation extension returned no image.');
    }
    return path;
}
