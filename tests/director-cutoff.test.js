import { buildDirectorPrompt, parseDirectorNote, tidyBriefing } from '../src/director/prompt.js';

// The God War chat's #452: the director told the story instead of briefing
// it, ran out of tokens mid-quote and wrote no format line.
const GOD_WAR_452 = `The early morning sun slowly pierces through the crumbling walls of the Roadside Ruin, casting long shadows across the dusty floor. The air still carries an eerie chill from the night before, though it's tempered by the promise of a new day ahead.

Niamh and Kael remain on guard duty, their eyes scanning the horizon for any signs of approaching danger. Arin is absent, her purpose unknown to Remus but driven by an urgent resolve. Varyn paces restlessly nearby, his thoughts consumed by Ferunox and the uncertain path he's chosen.

As the early morning chill begins to dissipate, the group slowly stirs, each member lost in their own reflections. Niamh breaks the silence, her emerald eyes never leaving the horizon as she speaks of the day's plans. "According to my map, we should make it to the Blackened Bridge today," she says, her husky rasp carrying a hint of reverence mixed with caution. "We'll need to be vigilant; that place has an ominous name for a reason."

The mention of the Blackened Bridge seems to rouse Varyn from his reverie. He steps closer to Niamh, his gaze intense as he asks, "You're sure it's not just a pile of rubble?" His tone carries a note of concern, but also an undercurrent of excitement.

As they discuss their plans and the potential dangers ahead, Arin slips back into view, her raven hair dusted with morning dew. She approaches silently, her piercing green eyes scanning the group before settling on Remus. "I found a trail that should lead us to the bridge," she reports, her voice soft but steady. "It's about an`;

const input = {
    overview: { premise: 'Gods at war.' },
    location: { path: ['Roadside Ruin'], description: 'Crumbling walls.' },
    cast: [{ name: 'Remus', player: true }, { name: 'Niamh' }],
    messages: [{ name: 'Remus', isUser: true, text: 'We head out at first light.' }],
};

describe('a director reply that runs long or tells the story', () => {
    it('trims a truncated, prose-only reply to whole sentences and drops the dialogue', () => {
        const parsed = parseDirectorNote(GOD_WAR_452);
        expect(parsed.flaws).toEqual(['cut off', 'narrated']);
        expect(parsed.time).toBeNull();
        expect(parsed.move).toBeNull();
        // Where things stand survives; the scripted dialogue and the cut-off quote do not.
        expect(parsed.note).toContain('Roadside Ruin');
        expect(parsed.note).toContain('Varyn paces restlessly nearby');
        expect(parsed.note).not.toMatch(/["“”]/);
        expect(parsed.note).not.toContain("It's about an");
        expect(parsed.note).toMatch(/[.!?]$/);
        // No "Next:" was ever written, so no paragraph is passed off as direction.
        expect(parsed.direction).toBe('');
        expect(parsed.summary).toBe(parsed.note);
    });

    it('only trims an unfinished last sentence', () => {
        expect(tidyBriefing('Mira wipes the bar. Tobin eyes the door and')).toEqual({ text: 'Mira wipes the bar.', flaws: ['cut off'] });
        // A last line with no full stop at all is kept.
        expect(tidyBriefing('Mira wipes the bar.\n\nNext: Tobin makes for the door')).toEqual({ text: 'Mira wipes the bar.\n\nNext: Tobin makes for the door', flaws: [] });
        // A quoted name is not dialogue.
        expect(tidyBriefing('They ride for "the Blackened Bridge" and "the Old Mill" by noon.').flaws).toEqual([]);
    });

    it('keeps a sound briefing as it is', () => {
        const parsed = parseDirectorNote('Mira watches Tobin from behind the bar, counting what he owes.\n\nNext: Mira presses him for the forty crowns.');
        expect(parsed.flaws).toEqual([]);
        expect(parsed.direction).toBe('Mira presses him for the forty crowns.');
    });

    it('reads the format lines when they come first, even if the briefing is cut off', () => {
        const raw = [
            'TIME | 2 hours | the walk to the bridge',
            'SCENE | Road to the Bridge',
            'SITUATION | Niamh leads the others along the old road.',
            'MOVE | Blackened Bridge | Niamh, Kael | outdoors',
            'ENTERS | Arin',
            '',
            'Niamh sets a hard pace along the old road, her map folded in one fist. Kael keeps to the rear and',
        ].join('\n');
        const parsed = parseDirectorNote(raw);
        expect(parsed.time).toEqual({ text: '2 hours', why: 'the walk to the bridge' });
        expect(parsed.scene).toBe('Road to the Bridge');
        expect(parsed.situation).toBe('Niamh leads the others along the old road.');
        expect(parsed.move).toEqual({ place: 'Blackened Bridge', along: ['Niamh', 'Kael'], indoor: false });
        expect(parsed.enters).toEqual(['Arin']);
        expect(parsed.note).toBe('Niamh sets a hard pace along the old road, her map folded in one fist.');
        expect(parsed.flaws).toEqual(['cut off']);
    });

    it('asks for the format lines before the briefing', () => {
        const { prompt } = buildDirectorPrompt(input);
        const formatAt = prompt.indexOf('START WITH THE FORMAT LINES');
        expect(formatAt).toBeGreaterThan(-1);
        expect(prompt.indexOf('TIME |')).toBeGreaterThan(formatAt);
        expect(prompt.indexOf('THEN WRITE THE BRIEFING')).toBeGreaterThan(prompt.indexOf('MOVE |'));
        expect(prompt).not.toContain('After the briefing, on its own line');
    });
});
