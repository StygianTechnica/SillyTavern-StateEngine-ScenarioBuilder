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

// The prompt that rewrites one person's description as a group's: what
// they look like as a type, how they work in numbers. Pure.
export function buildGroupPrompt({ name = '', description = '', role = '', overview = '' } = {}) {
    const user = [
        clean(overview) ? `# The setting\n${clean(overview).slice(0, 400)}` : '',
        `# ${clean(name)} - written as if one person\n${clean(description) || '(no description)'}${clean(role) ? `\nRole: ${clean(role)}` : ''}`,
        '# Your task',
        `"${clean(name)}" are not one person but a group - nameless people who turn up in numbers. Rewrite the description for the group as a type: what one of them looks like and wears, how they carry themselves and work together, and what marks them as one of this group. Two to four sentences, plural throughout ("they", never he or she), keeping what still fits and dropping anything only one person could have (a name, a single scar, a life story). No preamble.`,
    ].filter(Boolean).join('\n\n');
    return { system: 'You write short descriptions for a roleplay\'s world. You answer with the description only.', user, plain: true };
}

async function groupDescription(entry, settingId) {
    try {
        const { askReliably } = await import('../generate/run.js');
        const { getOverview } = await import('./library.js');
        const base = entry.base ?? entry;
        const o = getOverview(settingId);
        const prompt = buildGroupPrompt({ name: entry.name, description: base.description ?? entry.description, role: typeof base.role === 'string' ? base.role : entry.role, overview: [o?.premise, o?.tone && `Tone: ${o.tone}.`].filter(Boolean).join(' ') });
        const result = await askReliably(prompt, (_p, text) => {
            const t = clean(String(text ?? '').replace(/^\s*description\s*:\s*/i, '').replace(/^["']|["']$/g, ''));
            return t.length >= 20 ? { values: t.slice(0, 1500), dropped: [], error: null } : { values: '', dropped: [], error: 'no description' };
        }, 400);
        return result.error ? '' : result.values;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not rewrite the description for the group', err);
        return '';
    }
}

// -> the new creature's id, or '' (nothing changed). Never throws.
export async function makeGroup(chatId, chatKey, settingId, characterId) {
    try {
        const entry = await getEntry(chatId, settingId, characterId);
        if (!entry || entry.type !== 'character') return '';
        const base = entry.base ?? entry;
        // Its description rewritten for the group (one call); the old one
        // if that fails.
        const description = await groupDescription(entry, settingId) || clean(base.description ?? entry.description);
        const created = await createEntry(chatId, settingId, 'creature', {
            name: entry.name,
            aliases: base.aliases ?? entry.aliases ?? [],
            description,
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
