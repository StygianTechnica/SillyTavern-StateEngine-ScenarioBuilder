// "It's a group": a character that is really a crowd of nameless people -
// Assassins Inc's "Enrique's operatives", taken in as a character and given
// a person's sheet - made a creature of the kind form instead (src/library/
// creature-form.js): turns up in numbers, its count in the scene goes down
// as they fall, it never dies. State Engine cannot change an object's type,
// so a new creature takes its place: same name and description, in the
// scene's creatures where the character stood in the cast, its ties moved
// over; then the character goes.

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { updateSettingDoc } from '../store/setting-store.js';
import { getEntry, createEntry, deleteEntry, setEntryMeta } from './library.js';
import { guessCreatureForm } from './creature-form.js';
import { changeScene } from '../state/scene-actions.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Whether a character's name reads as a group ("Enrique's operatives",
// "the guards", "a pack of thugs"). Pure.
export function looksLikeGroup(name) {
    return guessCreatureForm(clean(name)) === 'kind';
}

// -> the new creature's id, or '' (nothing changed). Never throws.
export async function makeGroup(chatId, chatKey, settingId, characterId) {
    try {
        const entry = await getEntry(chatId, settingId, characterId);
        if (!entry || entry.type !== 'character') return '';
        const base = entry.base ?? entry;
        const created = await createEntry(chatId, settingId, 'creature', {
            name: entry.name,
            aliases: base.aliases ?? entry.aliases ?? [],
            description: clean(base.description ?? entry.description),
        }, { origin: entry.meta?.origin || 'story' });
        if (!created?.id) return '';
        setEntryMeta(settingId, created.id, { creatureForm: 'kind', parentId: entry.meta?.parentId ?? null });
        // Its ties move with it.
        updateSettingDoc(settingId, (d) => {
            d.relations = (d.relations ?? []).map((r) => ({ ...r, from: r.from === characterId ? created.id : r.from, to: r.to === characterId ? created.id : r.to }));
        });
        // In the scene: among the creatures, in unknown numbers.
        const doc = getChatDoc(chatKey);
        if (doc.canonical.castIds.includes(characterId)) {
            await changeScene(chatId, chatKey, {
                castIds: doc.canonical.castIds.filter((id) => id !== characterId),
                creatureIds: [...new Set([...doc.canonical.creatureIds, created.id])],
            }, `${entry.name} are a group, not one person - here in numbers`);
        }
        // The Review card follows it.
        updateChatDoc(chatKey, (d) => {
            d.adopted = d.adopted.map((a) => (a.objectId === characterId ? { ...a, objectId: created.id, type: 'creature' } : a));
        });
        await deleteEntry(chatId, settingId, characterId);
        return created.id;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not make it a group', err);
        return '';
    }
}
