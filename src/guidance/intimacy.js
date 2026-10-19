// Intimate (NSFW) scenes: each character may carry an optional note on how
// they are in such a scene (entry meta `nsfw`, written on their sheet). It
// reaches the narrator only while the scene is flagged as intimate - by
// the story (State Engine's sb__scene_nsfw reading) or by the user's
// choice on the Scene tab (doc.nsfwMode: 'auto' | 'on' | 'off') - and only
// for the people present who are not the player character. Pure.

export const NSFW_MODES = Object.freeze(['auto', 'on', 'off']);

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

// Whether the scene is intimate now. mode: the user's choice; reading:
// the story's (sb__scene_nsfw - true, 'true', or anything else).
export function isIntimate(mode, reading) {
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return reading === true || String(reading ?? '').trim().toLowerCase() === 'true';
}

// The guidance section: how each person present (not the player) is in an
// intimate scene. cast: [{ name, player, nsfw }]. -> { full, compact } or null.
export function intimacySection({ intimate, cast }) {
    if (!intimate) return null;
    const people = (cast ?? []).filter((c) => !c.player && clean(c.name) && clean(c.nsfw));
    if (!people.length) return null;
    const lead = 'This scene is intimate. Play each of them true to how they are in such moments - their own pace, wants and limits:';
    return {
        full: [lead, ...people.map((c) => `- ${clean(c.name)}: ${cut(c.nsfw, 600)}`)].join('\n'),
        compact: [lead, ...people.map((c) => `- ${clean(c.name)}: ${cut(c.nsfw, 200)}`)].join('\n'),
    };
}
