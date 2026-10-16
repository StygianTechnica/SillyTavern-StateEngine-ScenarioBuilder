// Which chat is open, as Scenario Builder identifies it. A SillyTavern chat
// id is only the chat's file name, and two characters can each have a chat
// with the same name, so per-chat data is keyed by a CHAT KEY pairing the
// chat id with its owner (the Archivist convention, spec SB-603):
//
//   char:<avatar>:<chatId>   a solo chat
//   group:<groupId>:<chatId> a group chat

// -> { chatId, characterAvatar, groupId, displayName } or null.
export function getCurrentChatRef() {
    const context = SillyTavern.getContext();
    const chatId = context.chatId;
    if (!chatId) return null;

    if (context.groupId) {
        const group = (context.groups || []).find((g) => g.id === context.groupId);
        return { chatId: String(chatId), characterAvatar: null, groupId: String(context.groupId), displayName: group?.name || '' };
    }
    const character = context.characters?.[context.characterId];
    if (!character?.avatar) return null;
    return { chatId: String(chatId), characterAvatar: character.avatar, groupId: null, displayName: character.name || '' };
}

export function chatKeyFor(ref) {
    return ref.groupId ? `group:${ref.groupId}:${ref.chatId}` : `char:${ref.characterAvatar}:${ref.chatId}`;
}

// The open chat's key, or null.
export function getCurrentChatKey() {
    const ref = getCurrentChatRef();
    return ref ? chatKeyFor(ref) : null;
}

// A message's stable id for drift and history records (spec SB-223):
// <chatId>#<index>@<send_date>.
export function sourceMessageId(chatId, index, message) {
    return `${chatId}#${index}@${message?.send_date ?? ''}`;
}

// The index part of a source message id, or -1.
export function sourceIndex(source) {
    const match = /#(\d+)@/.exec(String(source ?? ''));
    return match ? Number(match[1]) : -1;
}
