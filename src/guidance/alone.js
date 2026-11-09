// The player character alone: the reply stays with them, and those the story
// sent after them are the next thing to happen. Assassins Inc: Cyril stormed
// out, Adam said "We need to find a way to bring him back", and later, with
// Cyril crying in an alley, the narrator cut away to a warehouse where a man
// no one had met took orders over a radio. Pure.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOT = /\b(?:not|never|don't|won't|can't|shouldn't|no need|let (?:him|her|them) go|leave (?:him|her|them) be)\b/i;

// The latest thing said about going after the player character, or null.
// replies: oldest first. people: every known name but the player's.
// -> { said, who: [names in that reply] } or null.
export function sentAfter(replies = [], { player = '', people = [] } = {}) {
    const first = clean(player).split(/\s+/)[0];
    if (first.length < 2) return null;
    const me = `(?:${escape(first)}|him|her|them)`;
    const FETCH = new RegExp(`\\b(?:(?:bring|get|fetch|drag|talk)\\s+${me}\\s+back|go(?:ing)?\\s+after\\s+${me}|track\\s+${me}\\s+down|(?:find|look\\s+for|search\\s+for)\\s+${me})\\b`, 'i');
    const named = (n, t) => clean(n).length >= 3 && new RegExp(`(^|[^\\p{L}])${escape(clean(n))}(?!\\p{L})`, 'iu').test(t);
    for (const reply of [...(replies ?? [])].reverse()) {
        const text = String(reply ?? '');
        if (!named(first, text)) continue;
        const said = text.split(/(?<=[.!?…]["”]?)\s+|\n+/).map(clean).find((s) => FETCH.test(s) && !NOT.test(s));
        if (!said) continue;
        return { said: said.replace(/^["“*]+|["”*]+$/g, ''), who: (people ?? []).filter((n) => named(n, text) || named(clean(n).split(/\s+/)[0], text)).slice(0, 3) };
    }
    return null;
}

// The order for the note nearest the reply, or ''.
export function aloneOrder({ player = '', sent = null } = {}) {
    const who = clean(player);
    if (!who) return '';
    const stays = `${who} is alone. The reply stays with ${who} where ${who} is - no cutting away to another place, and no one else's plans overheard.`;
    if (!sent?.who?.length) return stays;
    return `${stays} ${sent.who.join(' and ')} ${sent.who.length === 1 ? 'was' : 'were'} last heard on this: "${sent.said}" That is what happens next: whoever was sent reaches ${who} in this reply or the next, and nothing new gets in ahead of it.`;
}
