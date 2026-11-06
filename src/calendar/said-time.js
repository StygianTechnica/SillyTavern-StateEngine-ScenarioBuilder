// The time of day a reply's narration opens on: "As dusk settled over
// Arcadia City, Miller's techs called a halt" - and the clock stayed at
// midday (Assassins Inc). Only the narration's first sentences, outside
// speech, and only what says the time has come ("as night fell", "by
// sunset", "the sun had set") - not a plan for it ("we move at dusk").
// -> a phrase timeOfDayFraction reads ('dusk', 'evening', ...), or null. Pure.

const PART = '(dusk|twilight|sunset|sundown|nightfall|night|evening|afternoon|noon|midday|late afternoon|early evening)';
const CAME = '(?:settled|fell|had fallen|came|had come|descended|crept in|crept over|arrived|drew in|deepened|rolled in|set in|wore on|gave way)';
const SAYS = [
    new RegExp(`\\b(?:as|when|once|while|by the time)\\s+(?:the\\s+)?${PART}\\s+${CAME}\\b`, 'i'),
    new RegExp(`\\b(?:the\\s+)?${PART}\\s+(?:had\\s+)?${CAME}\\b`, 'i'),
    new RegExp(`^\\s*(?:by|at|come)\\s+(?:the\\s+)?${PART}\\b`, 'i'),
    new RegExp(`\\b(?:it was|it had become|it was already|it was nearly|it was well into (?:the )?)\\s*(?:the\\s+)?(?:late\\s+|early\\s+)?${PART}\\b`, 'i'),
];
const SUN_DOWN = /\bthe sun (?:had )?(?:set|sank|dipped below|slipped below|went down|disappeared below)\b/i;
const NOT_YET = /\b(?:will|would|until|before|tonight we|we move|we go|we leave|at dusk we|plan|planned|scheduled|wait(?:ing)? for)\b/i;
const AS_SAID = { sundown: 'sunset', nightfall: 'dusk', noon: 'midday' };

export function saidTimeOfDay(text) {
    // Narration only: speech taken out.
    const told = String(text ?? '').replace(/["“][^"”]*["”]/g, ' ');
    const sentences = told.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 2);
    for (const s of sentences) {
        if (NOT_YET.test(s)) continue;
        if (SUN_DOWN.test(s)) return 'sunset';
        for (const re of SAYS) {
            const m = s.match(re);
            if (m) { const p = m[1].toLowerCase(); return AS_SAID[p] ?? p; }
        }
    }
    return null;
}
