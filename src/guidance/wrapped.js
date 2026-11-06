// A player's post that closes out what their character was doing - "After
// some firing practice he was able to familiarize himself with the guns...
// He was elated." - leaves the reply nothing to answer. Assassins Inc: the
// narrator cut back to the planning in Adam's office, and the user was left
// to think up Cyril's next move alone. The reply should bring him the next
// thing instead. Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

const WRAP = /\b(?:after (?:some|a few|an hour|a while|awhile|hours|a bit|a time|several)\b|for (?:a ?while|awhile|an hour|hours|the rest of the (?:morning|afternoon|day|evening|night))|(?:until|till) (?:he|she|they|i|we) (?:was|were|had|felt) (?:done|finished|satisfied|ready|tired)|when (?:he|she|they|i|we) (?:was|were|had) (?:done|finished)|(?:finished|done) (?:with|for the)|spent (?:the|an|a|some|hours|most)|by the time (?:he|she|they|i|we)|disappeared to|(?:the )?(?:hours?|time|afternoon|morning) (?:passed|went by|slipped by|wore on))\b/i;

// Whether the post ends by closing out an activity: one of its last two
// sentences (outside speech) tells it through to its end, and it does not
// end on words or a question to someone.
export function closesOut(post) {
    const text = String(post ?? '').replace(/[“”]/g, '"').trim();
    if (!text || /["?]\s*$/.test(text)) return false;
    const plain = text.replace(/"[^"]*"/g, ' ');
    const sentences = clean(plain).match(/[^.!?…]+[.!?…]*/g) ?? [];
    return sentences.slice(-3).some((s) => WRAP.test(s));
}

// The order for the narrator's note. lead: what is set next, if anything
// (tonight's heist). -> '' or one sentence.
export function nextThingLine({ player = '', lead = '' } = {}) {
    const who = clean(player) || 'the player character';
    const next = clean(lead).replace(/[.!]+$/, '');
    return `${who}'s post closes out what they were doing: open where ${who} is now and bring them the next thing to answer - someone comes to them or calls for them, word arrives, or time moves on toward what comes next${next ? ` (${next})` : ''}. If the reply looks in on others elsewhere, keep it short and end back with ${who} and that lead.`;
}
