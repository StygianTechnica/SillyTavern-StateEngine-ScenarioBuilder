// Going in circles. A small model, left to itself, keeps a task going
// forever: a trial of souls where every one freed brings "yet another orb",
// and "Is this the last?" is answered "No, many more await". Two signs are
// read from the chat itself - no model call - and when either shows, the
// director and the narrator are told to end it or turn it in this reply:
//   - the player asks whether it is over ("Is this the last? Will this
//     complete the trial?");
//   - the replies repeat themselves (the latest shares several phrases with
//     the ones before), or the player's message repeats their last one.
// Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// The player asking whether a task, a trial or a fight is over.
const ASKS_TO_FINISH = /\b(is (this|that|it|he|she) (the )?(last|final|over|done|finished|enough|complete|the end)|(will|does|did) (this|that) (complete|finish|end|do it)|are we (done|finished|through)|is (the|this|my) (trial|test|task|ordeal|fight) (over|complete|done|finished)|how many more|is there (any )?more)\b/i;

export function asksToFinish(text) {
    return ASKS_TO_FINISH.test(clean(text));
}

// Runs of four words, lower-cased.
function phrases(text) {
    const words = clean(text).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    const out = new Set();
    for (let i = 0; i + 4 <= words.length; i += 1) out.add(words.slice(i, i + 4).join(' '));
    return out;
}

// How much of `a` is also in `b`, by words.
function overlap(a, b) {
    const wa = new Set(clean(a).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
    const wb = new Set(clean(b).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
    if (!wa.size || !wb.size) return 0;
    return [...wa].filter((w) => wb.has(w)).length / Math.min(wa.size, wb.size);
}

// messages: [{ text, isUser }] oldest first (the recent chat).
// -> { asks, circling, line } - line: what the director and the narrator are
//    told ('' when neither sign shows).
export function circling(messages = [], { repeatedPhrases = 4 } = {}) {
    const replies = messages.filter((m) => !m.isUser).map((m) => m.text);
    const player = messages.filter((m) => m.isUser).map((m) => m.text);
    const latestPlayer = player[player.length - 1] ?? '';
    const asks = asksToFinish(latestPlayer);
    // The latest reply against the two before it: several shared phrases
    // with each is the same beat again.
    const [a, b, c] = replies.slice(-3).reverse();
    const shared = (x, y) => [...phrases(x)].filter((p) => phrases(y).has(p)).length;
    const repeatsReplies = !!(a && b && c) && shared(a, b) >= repeatedPhrases && shared(a, c) >= repeatedPhrases;
    const repeatsPlayer = player.length >= 2 && clean(latestPlayer).length > 40 && overlap(latestPlayer, player[player.length - 2]) >= 0.85;
    const circlingNow = repeatsReplies || repeatsPlayer;
    const lines = [];
    if (asks) lines.push('The player character asks whether this is over. Unless the story has set a clear reason it is not, it is: bring it to its end in this reply, or name exactly one final step - never "there are many more", never another wave of the same.');
    if (circlingNow) lines.push('The story is going in circles - the last replies repeat the same beat. In this reply, end it or turn it: finish the task, answer plainly, or change what happens.');
    return { asks, circling: circlingNow, line: lines.join(' ') };
}
