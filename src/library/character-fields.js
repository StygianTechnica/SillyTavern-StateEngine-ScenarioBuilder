// A character's own fields, beyond State Engine's defaults (personality,
// role, goals, relationships): their Background, kept apart from what they
// look like, and their Voice & mannerisms, so each one sounds like no one
// else. Added once to a setting's character fields (its object preset -
// SB-100: never a parallel field system); a field the user later removes
// is not added back.

import { LOG_PREFIX } from '../constants.js';
import { getObjectFields, setObjectFields } from '../api/objects.js';
import { getSettingDoc, updateSettingDoc } from '../store/setting-store.js';

export const CHARACTER_EXTRA_FIELDS = Object.freeze([
    {
        name: 'background', label: 'Background', scope: 'global', type: 'string', multiline: true,
        description: 'where they come from and what shaped them - upbringing, history, losses, loyalties and turning points; several sentences, never their looks',
    },
    {
        name: 'voice', label: 'Voice & mannerisms', scope: 'global', type: 'string', multiline: true,
        description: 'how they talk and carry themselves - speech patterns, pet phrases, accent, tone, what they never say, gestures, habits and tells - so they sound like no one else',
    },
]);

// The fields missing from `defs` that should be added. -> [def]
export function missingCharacterFields(defs) {
    const have = new Set((defs ?? []).map((d) => d?.name));
    return CHARACTER_EXTRA_FIELDS.filter((f) => !have.has(f.name)).map((f) => ({ ...f }));
}

// Background and Voice & mannerisms as they were first added - single-line
// text, which State Engine cuts at 300 characters ("…") - made long text.
// -> the defs to save, or null when none needs it.
export function lengthenCharacterFields(defs) {
    const names = new Set(CHARACTER_EXTRA_FIELDS.map((f) => f.name));
    let changed = false;
    const out = (defs ?? []).map((d) => {
        if (!names.has(d?.name) || d.type !== 'string' || d.multiline === true) return d;
        changed = true;
        return { ...d, multiline: true };
    });
    return changed ? out : null;
}

// Adds Background and Voice & mannerisms to the setting's characters, once
// - and, once, makes those added before as short text long text.
// -> true when added (or already there). Never throws.
export async function ensureCharacterFields(settingId) {
    try {
        if (!settingId) return true;
        const doc = getSettingDoc(settingId);
        if (doc.characterFieldsAdded && !doc.characterFieldsLong) {
            const longer = lengthenCharacterFields(await getObjectFields(settingId, 'character'));
            if (longer && !await setObjectFields(settingId, 'character', longer)) return false;
            updateSettingDoc(settingId, (d) => { d.characterFieldsLong = true; });
            if (longer) console.info(LOG_PREFIX, 'Background and Voice & mannerisms now hold long text (they were cut at 300 characters)');
        }
        if (getSettingDoc(settingId).characterFieldsAdded) return true;
        const defs = await getObjectFields(settingId, 'character');
        const missing = missingCharacterFields(defs);
        if (missing.length && !await setObjectFields(settingId, 'character', [...defs, ...missing])) return false;
        updateSettingDoc(settingId, (d) => { d.characterFieldsAdded = true; d.characterFieldsLong = true; });
        if (missing.length) console.info(LOG_PREFIX, `added ${missing.map((f) => f.label).join(' and ')} to the setting's characters`);
        return true;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not add the character fields', err);
        return false;
    }
}
