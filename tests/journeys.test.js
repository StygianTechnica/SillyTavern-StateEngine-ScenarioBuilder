import { pathBetween, placesFurtherOn, headingAlong } from '../src/library/routes.js';
import { buildDirectorPrompt, dossierText, routeName, looksLikePlaceName } from '../src/director/prompt.js';
import { shapeOf } from '../src/planner/shapes.js';
import { emptyGm, setOutline, beatsOf } from '../src/planner/model.js';
import { buildOutlinePrompt, beatsPerAct } from '../src/planner/prompts.js';

// God War's roads: the fortress, the Roadside Ruin, the road to the bridge,
// the bridge, and the cathedral beyond it.
const routes = [
    { id: 'r1', from: 'fortress', to: 'ruin', travel: '4 hours' },
    { id: 'r2', from: 'ruin', to: 'road', travel: '4 hours' },
    { id: 'r3', from: 'road', to: 'bridge', travel: '6 hours' },
    { id: 'r4', from: 'ruin', to: 'bridge', travel: 'half a day' },
    { id: 'r5', from: 'bridge', to: 'cathedral', travel: '8 hours', guessed: true },
];

describe('journeys go straight to where the party is heading', () => {
    it('finds the fewest routes between two places', () => {
        expect(pathBetween('ruin', 'bridge', routes).map((r) => r.id)).toEqual(['r4']);
        expect(pathBetween('fortress', 'cathedral', routes).map((r) => r.id)).toEqual(['r1', 'r4', 'r5']);
        expect(pathBetween('ruin', 'ruin', routes)).toEqual([]);
        expect(pathBetween('fortress', 'nowhere', routes)).toBeNull();
        expect(pathBetween('fortress', 'cathedral', routes, 2)).toBeNull();
    });

    it('lists the places further on, with the way on to each', () => {
        expect(placesFurtherOn('fortress', routes)).toEqual([{ id: 'road', via: 'ruin' }, { id: 'bridge', via: 'ruin' }, { id: 'cathedral', via: 'ruin' }]);
        expect(placesFurtherOn('fortress', routes, 2)).toEqual([{ id: 'road', via: 'ruin' }, { id: 'bridge', via: 'ruin' }]);
        expect(placesFurtherOn('ruin', routes)).toEqual([{ id: 'cathedral', via: 'bridge' }]);
    });

    it('setting out for a place further on heads there, not to the first stop', () => {
        const ways = [{ id: 'bridge', names: ['The Blackened Bridge'] }, { id: 'road', names: ['Eastern Road to the Broken Bridge'] }, { id: 'cathedral', names: ['The Crumbling Cathedral'] }];
        expect(headingAlong('They mounted up and rode out for the Crumbling Cathedral.', ways)).toEqual({ id: 'cathedral', name: 'The Crumbling Cathedral', together: true });
    });

    it('shows the director the places further on and tells it to go straight there', () => {
        const input = {
            location: { path: ['Roadside Ruin'], routes: [{ name: 'The Blackened Bridge', travel: 'half a day' }], further: [{ name: 'The Crumbling Cathedral', via: 'The Blackened Bridge' }] },
            cast: [{ name: 'Remus', player: true }, { name: 'Niamh' }],
            messages: [{ name: 'Remus', isUser: true, text: 'We ride for the bridge.' }],
        };
        expect(dossierText(input)).toContain('Further on: The Crumbling Cathedral (by way of The Blackened Bridge).');
        const { prompt } = buildDirectorPrompt(input);
        expect(prompt).toContain('A journey goes straight to where Remus is heading');
        expect(prompt).toContain('makes camp for the night');
        expect(prompt).not.toContain('one of the ways on when it fits');
        const night = buildDirectorPrompt({ ...input, travelAtNight: true }).prompt;
        expect(night).toContain('travels on through the night');
        expect(night).not.toContain('makes camp for the night');
    });
});

describe('God War: "continued on to the Blackened Bridge"', () => {
    const ways = [{ id: 'bridge', names: ['The Blackened Bridge'] }, { id: 'road', names: ['Eastern Road to the Broken Bridge'] }];

    it('reads the player setting out for the bridge', () => {
        expect(headingAlong('At long last, now rested, the party continued on to the Blackened Bridge hoping to get there by nightfall to make camp.', ways)).toEqual({ id: 'bridge', name: 'The Blackened Bridge', together: true });
        expect(headingAlong('The party goes to the Blackened Bridge.', ways)?.id).toBe('bridge');
        expect(headingAlong('We pressed on toward the Blackened Bridge.', ways)?.id).toBe('bridge');
        // Still only a plan.
        expect(headingAlong("Tomorrow we'll continue on to the Blackened Bridge.", ways)).toBeNull();
    });

    it('never makes the scenery a place', () => {
        expect(looksLikePlaceName('Barren plains stretching into the distance')).toBe(false);
        expect(looksLikePlaceName('rocky terrain rising ahead')).toBe(false);
        expect(looksLikePlaceName('The Ruined Temple')).toBe(true);
        expect(looksLikePlaceName('the old landing')).toBe(true);
        expect(looksLikePlaceName('The Wilderness')).toBe(true);
    });
});

describe('a way to somewhere is not a place', () => {
    it('reads road, path and trail names as ways, with where they lead', () => {
        expect(routeName('Eastern Road to the Broken Bridge')).toEqual({ to: 'the Broken Bridge' });
        expect(routeName('The trail toward Liston')).toEqual({ to: 'Liston' });
        expect(routeName('On the road to the Blackened Bridge')).toEqual({ to: 'the Blackened Bridge' });
        expect(routeName('The path between the ruin and the bridge')).toEqual({ to: '' });
    });

    it('leaves real places alone, even ones on the way', () => {
        for (const name of ['The Ashen Ford', "King's Road", 'The Blackened Bridge', 'Old Interstate', 'Roadside Ruin', 'Eastern Road', 'The Crossroads Inn']) expect(routeName(name)).toBeNull();
    });
});

describe('the outline keeps its chapters for real turns', () => {
    const serial = shapeOf('adventure-serial');

    it('sizes the acts by the pace', () => {
        expect(beatsPerAct('gentle')).toBe('four to six');
        expect(beatsPerAct('fast')).toBe('two to three');
        expect(beatsPerAct('off')).toBe('two to four');
        const prompt = buildOutlinePrompt({ dossier: '', shape: serial, outline: null, pacing: 'gentle' }).prompt;
        expect(prompt).toContain('four to six beats each');
        expect(prompt).toContain('are never beats');
        expect(prompt).toContain('Each beat happens in one place');
    });

    it('a review never writes an everyday moment down as a finished beat', () => {
        const gm = emptyGm();
        setOutline(gm, { acts: [
            { title: 'The call', beats: [{ text: 'Remus and Varyn prepare for their expedition', status: 'done' }] },
            { title: 'Episodes', beats: [{ text: 'The group makes camp in a ruined settlement', status: 'active' }, { text: 'Bandits test the party on the road', status: 'pending' }] },
        ] });
        setOutline(gm, { acts: [
            { title: 'The call', beats: [{ id: 'b1', text: 'Remus and Varyn prepare for their expedition', status: 'done' }] },
            { title: 'Episodes', beats: [
                { text: 'Arin volunteers for the first watch of the night', status: 'done' },
                { id: 'b2', text: 'The group makes camp in a ruined settlement', status: 'active' },
                { id: 'b3', text: 'Bandits test the party on the road', status: 'pending' },
            ] },
        ] }, { review: true });
        const texts = beatsOf(gm.outline).map((b) => b.text);
        expect(texts.some((t) => /first watch/.test(t))).toBe(false);
        expect(texts).toHaveLength(3);
    });

    it('a story taken over still sums up what has happened', () => {
        const gm = emptyGm();
        setOutline(gm, { acts: [{ title: 'The call', beats: [{ text: 'Remus swears his oath to Elyon', status: 'done' }, { text: 'They set out', status: 'active' }] }] });
        expect(beatsOf(gm.outline).map((b) => b.status)).toEqual(['done', 'active']);
    });
});
