// Someone the turn only reaches from a distance is not in the scene. The
// museum: Cyril radioed Inji and Zane from the storage rooms and both were
// read as having joined him (the user had just taken them out by hand);
// Inji stayed "present" while Cyril hunted for him on the security cameras,
// and the narrator was told he was in the room. Pure.

import { RADIO } from '../ops/model.js';

// Looking at something that shows what is elsewhere - by the story's own
// means: a feed, a sensor, a scrying glass.
export const LOOKS = /\b(?:pinpoint\w*|scan\w*|search\w*|check\w*|look\w*\s+(?:at|for|through|over|into)|peer\w*|stud(?:y|ies|ied|ying)|track\w*|locate\w*|gaz\w*\s+into|consult\w*|pull\w*\s+up)\b/i;
export const VIEWER = /\b((?:(?:surveillance|security|camera|video)\s+)?feeds?|(?:(?:surveillance|security)\s+)?cameras?|screens?|monitors?|sensors?|scanners?|radar|drones?|scrying\s+(?:orb|mirror|glass|pool|bowl)s?|crystal\s+ball|seeing\s+stone|spyglass|telescope|binoculars)\b/i;

// The link in use, not merely on someone ("tapped his earpiece").
const USES = /\b(?:over|on|through|via|into|activat\w*|receiv\w*|call\w*|answer\w*)\b/i;
const REACHED = /\b(?:radio(?:s|ed|ing)|phon(?:es|ed|ing)|texted|messag(?:es|ed|ing))\b/i;
// With the player character after all.
const IN_PERSON = /\b(?:arriv\w*|walk\w*\s+in|enter\w*|burst\w*\s+in|join\w*|show\w*\s+up|turn\w*\s+up|beside|next\s+to|alongside|c[ao]mes?\s+in|stepp?\w*\s+in|rush\w*\s+in|at\s+(?:his|her|their|my)\s+side)\b/i;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sentences = (text) => String(text ?? '').replace(/["“][^"”]*["”]/g, ' ').split(/(?<=[.!?…])\s+|\n+/).map((s) => s.replace(/^[\s*_-]+/, '').trim()).filter(Boolean);
const wordAt = (name, s) => s.search(new RegExp(`\\b${esc(name)}\\b`, 'i'));

// Whether the turn has this person only at a distance from the player
// character: their post calls them or looks for them on a screen, or the
// reply has them hear the player over a link - and nothing brings them
// in person. Someone in the room with a radio of their own stays: the
// post's sentence must not open with them, and the reply's must name the
// player. names: what they are called. -> bool.
export function reachedAfar(names = [], { post = '', reply = '', player = '' } = {}) {
    const known = names.filter((n) => String(n ?? '').length >= 3);
    if (!known.length) return false;
    const has = (s) => known.some((n) => wordAt(n, s) >= 0);
    const inPost = sentences(post).filter(has);
    const inReply = sentences(reply).filter(has);
    if ([...inPost, ...inReply].some((s) => IN_PERSON.test(s))) return false;
    const linked = (s) => (RADIO.test(s) && USES.test(s)) || REACHED.test(s);
    // After the looking, and not sitting with them: "checked the monitor with Inji".
    const sought = (s) => VIEWER.test(s) && LOOKS.test(s) && known.some((n) => {
        const at = wordAt(n, s);
        return at > s.search(LOOKS) && !/\bwith\s+$/i.test(s.slice(0, at));
    });
    const opens = (s) => known.some((n) => wordAt(n, s) === 0);
    const first = String(player ?? '').trim().split(/\s+/)[0];
    return inPost.some((s) => !opens(s) && (linked(s) || sought(s)))
        || (first.length >= 2 && inReply.some((s) => linked(s) && wordAt(first, s) >= 0));
}
