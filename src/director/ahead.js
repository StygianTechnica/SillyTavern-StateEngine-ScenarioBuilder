// "Think after each reply" (settings.director.thinkAhead): the game master
// writes its briefing in the background right after an AI reply has
// settled, from the story so far, so the player's next message goes out
// without a wait. It costs no extra call - the same call moves. Its price:
// the briefing cannot see that next message, so it is written for whatever
// the player does (src/director/prompt.js, `ahead`).
//
// The briefing written ahead is only the model's answer (doc.director.
// ahead: { after, raw, at }). Nothing of it is applied when it is written:
// when the player's message is sent, the ordinary new-turn path takes it in
// place of a model call and applies its moves, arrivals and time then -
// once. It is used only if the AI reply it was written after is still the
// latest one, unchanged; an edit, a swipe or a newer reply means the
// ordinary briefing before the reply, as without the setting. Pure.

// A short stable hash.
function hashOf(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

// Which AI reply the chat ends on (or answers, while the player's next
// message is being sent): its place, its date and its text. '' with none.
// chat: SillyTavern's chat messages.
export function replyKeyOf(chat) {
    const list = (chat ?? []).filter((m) => m && !m.is_system && typeof m.mes === 'string');
    for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i].is_user) return `${i}@${list[i].send_date ?? ''}#${hashOf(list[i].mes)}`;
    }
    return '';
}

// Whether a briefing written ahead can be used for this reply: the setting
// is on, the reply is a new turn, and the briefing was written after the
// AI reply the chat still ends on.
export function canUseAhead(ahead, replyKey, { enabled = false, type = 'normal' } = {}) {
    if (!enabled || !(type === 'normal' || !type)) return false;
    return !!ahead?.raw && !!ahead.after && !!replyKey && ahead.after === replyKey;
}

// Whether to write one now, after a reply: the setting is on, the chat
// ends on an AI reply, and no briefing was written after it yet.
export function shouldThinkAhead(ahead, chat, { enabled = false } = {}) {
    if (!enabled) return false;
    const list = (chat ?? []).filter((m) => m && !m.is_system && typeof m.mes === 'string');
    const last = list[list.length - 1];
    if (!last || last.is_user) return false;
    const key = replyKeyOf(chat);
    return !!key && ahead?.after !== key;
}
