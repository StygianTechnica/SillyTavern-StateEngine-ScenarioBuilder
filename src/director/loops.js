// Going in circles. A small model, left to itself, keeps a task going
// forever: a trial of souls where every one freed brings "yet another orb",
// and "Is this the last?" is answered "No, many more await". Two signs are
// read from the chat itself - no model call - and when either shows, the
// director and the narrator are told to end it or turn it in this reply:
//   - the player asks whether it is over ("Is this the last? Will this
//     complete the trial?");
//   - the replies repeat themselves (the latest shares several phrases with
//     the ones before), or the player's message repeats their last one.
//   - someone keeps being asked what they want and keeps dodging it: the
//     question comes again and again (the player, or the others) and the
//     answer is a tease - "that would be telling", hints, a cryptic smile
//     (Dr. Tole at White Cerberus, three replies of it). Then the one
//     dodging says it plainly or acts, and the in-chat note says so.
// Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// The player asking whether a task, a trial or a fight is over.
const ASKS_TO_FINISH = /\b(is (this|that|it|he|she) (the )?(last|final|over|done|finished|enough|complete|the end)|(will|does|did) (this|that) (complete|finish|end|do it)|are we (done|finished|through)|is (the|this|my) (trial|test|task|ordeal|fight) (over|complete|done|finished)|how many more|is there (any )?more)\b/i;

export function asksToFinish(text) {
    return ASKS_TO_FINISH.test(clean(text));
}

// Asking someone for the point: what they want, why they are here.
const PRESSES = /\b(what do you (really )?want|what (are|is) (you|he|she|they) (really )?(after|playing at|here for|planning|getting at)|why are you (even |really )?here|get (on with it|to the point)|spit it out|spill it|out with it|enough (games|of this|theatrics|riddles)|tell (us|me) what|what('s| is) (this|the) (about|catch|deal|point)|just what (might|kind|exactly|are|is|do)|stop (stalling|dancing around|playing games)|save (us|me|us both) the (theatrics|games)|cut to the chase|what exactly (is|are|do))\b/i;
// The answer withheld: a tease instead of the point.
const DODGES = /\b(that would be telling|all in (good |due )?time|in (good|due) time|let'?s just say|you'?ll (see|find out|learn) (soon|in time|when)|(be|have) patien(t|ce)|patience, |some (secrets|things|truths) (are|can'?t|cannot|must)|wouldn'?t you like to know|more than you (know|realize|imagine)|soon enough|that remains to be seen|cryptic(ally)?|evasive(ly)?|riddles?)\b/i;

// Who dodges: the person named most in the paragraphs that tease (a
// paragraph that opens on speech belongs to whoever the one before named).
function dodgerOf(replies, names) {
    const count = new Map();
    for (const text of replies) {
        let lastNamed = [];
        for (const para of String(text ?? '').split(/\n+/)) {
            const named = names.filter((n) => nameIn(para, n));
            if (DODGES.test(para)) for (const n of (named.length ? named : lastNamed)) count.set(n, (count.get(n) ?? 0) + 1);
            if (named.length) lastNamed = named;
        }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}
// A full name, or its last word ("Dr. Adrigo Tole" is "Tole" in the prose).
function nameIn(text, name) {
    const words = clean(name).split(' ').filter((w) => w.length > 2 && !/^(dr|mr|mrs|ms|sir|lady|lord)\.?$/i.test(w));
    return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
}

// Asked again and again, answered with teases: three asks and two dodges
// in the recent chat, or four asks, with the latest reply still at it.
export function dodging(messages = [], names = []) {
    const replies = messages.filter((m) => !m.isUser).map((m) => m.text);
    const asked = messages.filter((m) => PRESSES.test(clean(m.text))).length;
    const dodged = replies.filter((t) => DODGES.test(clean(t))).length;
    const latest = clean(replies[replies.length - 1]);
    const still = PRESSES.test(latest) || DODGES.test(latest);
    if (!still || !(asked >= 4 || (asked >= 3 && dodged >= 2))) return { dodging: false, who: '', order: '', line: '' };
    const who = dodgerOf(replies, names.map(clean).filter(Boolean));
    const one = who || 'the one being asked';
    return {
        dodging: true,
        who,
        // For the narrator, in the chat: short, no story prose.
        order: `${one} has been asked what they want again and again and keeps dodging. Now ${one} says it plainly - what they want, why they are here, what happens if refused - or acts on it instead: makes their move, springs the surprise, or leaves. No more hints, teasing or "that would be telling". The others stop asking the same question; each does something of their own.`,
        // For the game master: decide it.
        line: `The scene is stuck: ${who ? `${who} has` : 'someone has'} been asked what they want ${asked} times in the last few messages and keeps answering with teases and hints, and the others keep asking the same thing. Decide now what ${one} actually wants and is here to do (from their goals and what the story has shown), and brief the narrator to have them say it outright or act on it in this reply - an offer with its price, a threat, an attack, a surprise, or walking out. The others then each do something of their own - take a side, refuse, make a move - instead of asking again.`,
    };
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
// names: who of the others is here, to name the one dodging.
// -> { asks, circling, dodging, dodger, order, line } - line: what the
//    director and the narrator are told ('' when no sign shows); order:
//    the in-chat order when someone keeps dodging.
export function circling(messages = [], { repeatedPhrases = 4, names = [] } = {}) {
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
    const stuck = dodging(messages, names);
    const lines = [];
    if (stuck.dodging) lines.push(stuck.line);
    if (asks) lines.push('The player character asks whether this is over. Unless the story has set a clear reason it is not, it is: bring it to its end in this reply, or name exactly one final step - never "there are many more", never another wave of the same.');
    if (circlingNow && !stuck.dodging) lines.push('The story is going in circles - the last replies repeat the same beat. In this reply, end it or turn it: finish the task, answer plainly, or change what happens.');
    return { asks, circling: circlingNow, dodging: stuck.dodging, dodger: stuck.who, order: stuck.order, line: lines.join(' ') };
}
