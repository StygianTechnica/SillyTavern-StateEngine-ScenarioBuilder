// Keeping the director grounded in the scene: the player character's inner
// life stays out, the place is pinned, far-off things stay far off, and a
// scene title or situation that drifts somewhere else is not taken.
import { withoutPlayerActions, buildDirectorPrompt, strayName, alsoRelevant } from '../src/director/prompt.js';
import { buildDayPrompt } from '../src/planner/prompts.js';
import { planSection, emptyGm } from '../src/planner/model.js';

describe('the player character stays out of the briefing', () => {
    it('drops their feelings told through a lead-in, and sentences that only continue them', () => {
        const text = 'For Niamh and Varyn, this was just another brutal night defending their home. But for Remus, the battle brought a mix of fear, awe, and determination. His visions had prepared him for moments like these. He fought alongside his comrades with renewed purpose.\n\nAs they pressed their advantage, Graxx watched from the gates. He knew Remus could tip the balance.';
        expect(withoutPlayerActions(text, ['Remus', 'Remus Watt'])).toBe('For Niamh and Varyn, this was just another brutal night defending their home.\n\nAs they pressed their advantage, Graxx watched from the gates. He knew Remus could tip the balance.');
    });

    it('drops a pronoun follow-on to a dropped sentence, not one after someone else', () => {
        expect(withoutPlayerActions('As the battle rages on, Remus begins to feel the strain. He turns to Niamh, seeking her counsel. Meanwhile, Graxx grows agitated.', ['Remus']))
            .toBe('Meanwhile, Graxx grows agitated.');
        expect(withoutPlayerActions('To Remus, the hall felt cold. Niamh lit a fire. She glanced at him.', ['Remus'])).toBe('Niamh lit a fire. She glanced at him.');
    });
});

describe('the place is pinned', () => {
    const input = { messages: [], location: { path: ['Alvarand', "Niamh's Fortress", "Wall of Niamh's Fortress"] }, cast: [{ name: 'Remus', player: true }] };

    it('tells the director where the scene is and that other places are elsewhere', () => {
        const { system } = buildDirectorPrompt(input);
        expect(system).toContain("The scene is at Wall of Niamh's Fortress (Alvarand > Niamh's Fortress > Wall of Niamh's Fortress): call it by that name.");
        expect(system).toContain('the scene never moves there or takes their name unless a MOVE line takes it there');
        expect(system).toContain('cannot be reached, found or used in this scene until the story actually travels there');
        expect(system).toContain('never give someone a betrayal, an attack or a hidden scheme the story has not set up');
        expect(buildDirectorPrompt({ messages: [] }).system).not.toContain('The scene is at');
    });

    it('says a far-off item is elsewhere without saying where', () => {
        const entries = [{ id: 'itm_cache', type: 'item', name: 'The Holy Cache', base: { description: 'Weapons of the old faith.', location: 'loc_graveyard' } }];
        const relevant = alsoRelevant(entries, { recentText: 'They spoke of the Holy Cache.', sceneIds: ['loc_wall'], placeName: () => 'Graveyard by the ruined temple' });
        expect(relevant[0].where).toBe('Graveyard by the ruined temple');
        const prompt = buildDirectorPrompt({ messages: [], relevant }).prompt;
        expect(prompt).toContain('- The Holy Cache (item) - kept somewhere else, not here: Weapons of the old faith');
        expect(prompt).not.toContain('Graveyard');
        // An item here is listed without "elsewhere".
        expect(alsoRelevant([{ ...entries[0], base: { location: 'loc_wall' } }], { recentText: 'the Holy Cache', sceneIds: ['loc_wall'], placeName: () => 'x' })[0].where).toBeUndefined();
    });
});

describe('a drifting scene title or situation', () => {
    const known = [{ name: 'Redhaven', aliases: [] }, { name: "Niamh's Fortress", aliases: [] }, { name: 'Graxx', aliases: [] }];

    it('is caught when it names something nothing in the scene stands on', () => {
        const allowedText = ["Hold the wall!", 'Alvarand', "Niamh's Fortress", "Wall of Niamh's Fortress", 'Graxx', 'Niamh'].join('\n');
        expect(strayName("Undead horde besieging Redhaven's breach point", { known, allowedText })).toBe('Redhaven');
        expect(strayName("The wall of Niamh's Fortress holds", { known, allowedText })).toBe('');
        expect(strayName('Graxx watches the breach', { known, allowedText })).toBe('');
        expect(strayName('', { known, allowedText })).toBe('');
    });

    it('is allowed once the user brings the name up', () => {
        expect(strayName('Riding for Redhaven', { known, allowedText: 'We ride for Redhaven at dawn.' })).toBe('');
    });
});

describe('the planner yields to the scene', () => {
    it('the GM PLAN puts the scene as it stands first', () => {
        const gm = emptyGm();
        gm.day = { day: 1, madeTurn: 0, moments: [{ id: 'm1', text: 'An envoy arrives', status: 'pending', when: '', trigger: '', ties: [], source: '', droppable: true, note: '' }], agendas: [], offscreen: [] };
        expect(planSection(gm)).toContain('The scene as it stands comes first');
        expect(planSection(gm)).toContain('never move the scene, rename the place or change what people are doing to fit it');
    });

    it('the day pass starts from where the scene is and what is going on', () => {
        const { system, prompt } = buildDayPrompt({ dossier: '', place: "Wall of Niamh's Fortress", situation: 'The defenders hold the breach against the undead.' });
        expect(prompt).toContain("The scene is at Wall of Niamh's Fortress, where the defenders hold the breach against the undead. The day starts from there");
        expect(system).toContain('never put one place inside another');
        expect(system).toContain('no betrayals, attacks or hidden schemes the story has not set up');
        expect(buildDayPrompt({ dossier: '' }).prompt).not.toContain('The scene is at');
    });
});
