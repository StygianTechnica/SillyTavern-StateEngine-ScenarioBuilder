// When the player character questions or objects (Assassins Inc: "Adam said
// this was our mission. Why are they coming along?"), the others answered
// as one - Inji, Zane and Doc in turn defending Doc and Galice, Zane telling
// Cyril he had "been through a lot recently" - though Adam's plan named
// only Cyril, Inji and Zane. Two lines for the in-chat note, no call:
//   - each answers for themselves: no closing ranks, and one who sees the
//     point may say so;
//   - the job as the plan gives it, and who it gives no part, when the post
//     asks about them.
// Pure.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (c) => [clean(c?.name), clean(String(c?.name ?? '').split(/\s+/)[0]), ...(c?.aliases ?? []).map(clean)].filter((n) => n.length >= 3);
const named = (text, c) => names(c).some((n) => new RegExp(String.raw`(?:^|[^\p{L}])${escape(n)}(?=$|[^\p{L}])`, 'iu').test(text));
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

const OBJECTS = /\?|\b(?:hang on|hold on|wait a|no way|that's not|that isn't|i don't (?:think|agree|buy)|why (?:are|is|would|should|did|do)|this (?:is|was) (?:our|my)|says? who|since when)\b/i;

// An argument that has gone on long enough. Assassins Inc's debrief: Cyril
// answered every charge and asked to leave three times, while Inji, Zane and
// Adam took turns, and Inji made up a plan to accuse him of breaking. "They do
// not close ranks" was in the note all along and lost to ten replies of it.
const DEFENDS = /\b(?:i (?:was|did)(?: not|n't)|i wasn't|i didn't|it wasn't|i (?:followed|fired|disarmed|cleared|blocked|had to)|if i hadn't|you're saying|you are saying|what (?:the \w+ )?are you talking|back me up|with all due respect|that's unfair|not fair|what was the plan)\b/i;
const WANTS_OUT = /\b(?:can i (?:go|leave)|may i (?:go|leave)|let me (?:go|leave)|i'?m done|i am done|i'?m (?:leaving|walking|out of here)|i am (?:leaving|walking)|am i (?:done|free to go)|is that all)\b/i;
const CRITICISM = /\b(?:reckless\w*|impulsive\w*|inexperience\w*|discipline\w*|deviated|diverged|mistakes?|missteps?|trigger-?happy|should have|rookie|newbie|novice|critiques?|your (?:actions|methods|performance|conduct|behaviou?r)|disobey\w*|insubordinat\w*|you failed)\b/i;
export const WIND_DOWN_AFTER = 3;
// posts: the player's posts, replies: the replies - each oldest first.
// -> the order for the note nearest the reply, or ''.
export function windDown({ posts = [], replies = [], player = '' } = {}) {
    const who = clean(player) || 'the player character';
    const said = (posts ?? []).map((p) => String(p ?? '').replace(/[’]/g, "'").replace(/\*/g, '')).slice(-6);
    if ((replies ?? []).slice(-3).filter((r) => CRITICISM.test(String(r ?? ''))).length < 2) return '';
    let run = 0;
    for (const p of [...said].reverse()) {
        if (!(OBJECTS.test(p) || DEFENDS.test(p) || WANTS_OUT.test(p))) break;
        run += 1;
    }
    const leaving = said.slice(-5).some((p) => WANTS_OUT.test(p));
    if (run < (leaving ? 2 : WIND_DOWN_AFTER)) return '';
    return `This argument ends in this reply. ${who} has answered it again and again${leaving ? ' and has asked to go' : ''}: at least one of them plainly grants something specific ${who} said, the criticism stops, and no one keeps ${who} here or starts on anything new against ${who}. What ${who} says ${who} did stands; no one claims a plan, order or agreement the story never showed.`;
}

// A pile-on. Assassins Inc: Cyril told Vex "butt out or I'm done" and said he
// was being ganged up on; Vex answered "Inji's right, Cyril" three replies
// running. The replies never used a word windDown counts as criticism - "we
// just want what's best for the team" - so what is looked for here is the
// shape of it: one of them backing another against the player character, the
// player saying so, and someone told to stay out who has not.
const GANGED = /\bgang(?:ing|ed|s)? up\b|\bsid(?:ing|ed|es?) against\b|\b(?:all|every(?:one|body)) (?:of (?:you|them) )?(?:is |are |were |was )?against\b|\bhive[- ]?(?:mind|brain)\b|\bclos(?:ing|ed|e) ranks\b|\bteam(?:ing|ed) up on\b/i;
const DISMISS = /\b(?:butt out|stay out of (?:this|it)|go somewhere else|go away|leave us(?: alone)?|leave me alone|mind your own business|(?:don't|do not|didn't|did not) (?:want|need) to (?:talk|speak) to you)\b/i;
const COLD = /\b(?:rival\w*|enem(?:y|ies)|hate[sd]?|hatred|distrust\w*|hostile|despis\w*|contempt\w*|loath\w*|nemesis)\b/i;
const WARM = /\b(?:lovers?|love[sd]?|attracted|friends?|friendly|ally|allies|allied|devoted|loyal\w*|trust\w*|partners?|fond\w*|comrades?|mentor|protective)\b/i;
export const PILE_ON_AFTER = 2;

const plainPost = (p) => String(p ?? '').replace(/[’]/g, "'").replace(/\*/g, '');
const backingOf = (c) => new RegExp(String.raw`(?:^|[^\p{L}])(?:(?:${names(c).map(escape).join('|')})(?:'s| is) (?:right|correct)|(?:${names(c).map(escape).join('|')})(?:'s got| has) a point|(?:agree with|listen to) (?:${names(c).map(escape).join('|')}))(?=$|[^\p{L}])`, 'iu');
const backs = (text, c) => backingOf(c).test(plainPost(text));

// The last one named before a telling-off, or just after it.
function dismissed(post, others) {
    const m = DISMISS.exec(post);
    if (!m) return null;
    const before = post.slice(Math.max(0, m.index - 200), m.index);
    const lastAt = (c) => Math.max(...names(c).map((n) => before.toLowerCase().lastIndexOf(n.toLowerCase())));
    const near = others.filter((c) => lastAt(c) >= 0).sort((a, b) => lastAt(b) - lastAt(a))[0];
    return near ?? others.find((c) => named(post.slice(m.index, m.index + m[0].length + 40), c)) ?? null;
}

// Who stays out of it: told so in the last two posts, and not spoken to since.
function toldToGo(said, others) {
    const newest = said.at(-1) ?? '';
    const here = dismissed(newest, others);
    if (here) return here;
    const before = said.length > 1 ? dismissed(said.at(-2), others) : null;
    return before && !named(newest, before) ? before : null;
}

// Who breaks from the others: warm toward the player character if anyone is,
// never someone who is against them, and not the voice the rest are backing.
function breaksRanks(others, { player, told, replies }) {
    const toward = (c) => (c.relations ?? []).map(clean).filter((r) => names({ name: player }).some((n) => r.toLowerCase().startsWith(`toward ${n.toLowerCase()}`))).join(' ');
    const open = others.filter((c) => c !== told && !COLD.test(toward(c)));
    const warm = open.filter((c) => WARM.test(toward(c)));
    const backed = (c) => replies.filter((r) => backs(r, c)).length;
    const mentioned = (c) => replies.filter((r) => named(r, c)).length;
    return [...(warm.length ? warm : open)].sort((a, b) => backed(a) - backed(b) || mentioned(a) - mentioned(b))[0] ?? null;
}

// posts, replies: oldest first; cast: [{ name, aliases, player, relations }]
// here; ending: the argument is already being wound down, so only who was
// told to go is said. -> the order for the note nearest the reply, or ''.
export function pileOn({ posts = [], replies = [], player = '', cast = [], ending = false } = {}) {
    const who = clean(player) || 'the player character';
    const others = (cast ?? []).filter((c) => !c.player && clean(c.name));
    if (!others.length) return '';
    const said = (posts ?? []).map(plainPost).slice(-2);
    const lately = (replies ?? []).map(plainPost).slice(-4);
    const told = toldToGo(said, others);
    const out = [];
    if (told) out.push(`${who} told ${clean(told.name)} to stay out of it: ${clean(told.name)} goes, or says nothing more to ${who} in this reply.`);
    const playerBacked = backs(lately.at(-1) ?? '', { name: player });
    const runs = lately.filter((r) => others.some((c) => backs(r, c))).length >= PILE_ON_AFTER;
    if (!ending && others.length >= 2 && !playerBacked && (runs || said.some((p) => GANGED.test(p)))) {
        const ally = breaksRanks(others, { player, told, replies: lately });
        out.push(`${who} feels ganged up on, and it has gone far enough: in this reply no one backs another against ${who} or says another is right, and no one gives ${who} another talking-to.${ally ? ` ${clean(ally.name)} breaks from the others and says aloud that something ${who} said is fair.` : ''}`);
    }
    return out.join(' ');
}

// post: the player's latest post; player: their name; cast: [{ name,
// aliases, player }] here; beat: the active beat { text, people: [names it
// gives a part] }. -> { fair: '', team: '' }
export function pushBack({ post = '', player = '', cast = [], beat = null } = {}) {
    const text = clean(post);
    const others = (cast ?? []).filter((c) => !c.player && clean(c.name));
    const out = { fair: '', team: '' };
    if (!text || !OBJECTS.test(text) || others.length < 2) return out;
    const who = clean(player) || 'the player character';
    out.fair = `${who} questions it: each here answers for themselves, from what they know and think - they do not close ranks or speak for one another, someone who sees ${who}'s point can say so, and no one lectures ${who} or talks down to ${who}.`;
    const inBeat = (c) => (beat?.people ?? []).some((p) => names({ name: p }).some((n) => names(c).some((m) => m.toLowerCase() === n.toLowerCase())));
    const left = others.filter((c) => !inBeat(c) && named(text, c));
    if (clean(beat?.text) && (beat?.people ?? []).length && left.length) {
        const leftNames = andList(left.map((c) => clean(c.name)));
        out.team = `The job as it was given: ${clean(beat.text).replace(/[.!]+$/, '')}. ${leftNames} ${left.length === 1 ? 'was' : 'were'} given no part in it - no one here can say they were sent, and they answer for coming themselves.`;
    }
    return out;
}
