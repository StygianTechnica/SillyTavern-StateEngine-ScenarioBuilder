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
