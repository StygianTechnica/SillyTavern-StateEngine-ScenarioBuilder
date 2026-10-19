import { storyKnowledge, authoredKnowledge, sceneKnowledge, knowledgeOf, normalizeKnowledgeItem } from '../src/library/knowledge.js';
import { buildGuidance, buildCast, guidanceParts } from '../src/guidance/build.js';
import { dossierText } from '../src/director/prompt.js';

const names = { chr_remus: 'Remus Watt', chr_varyn: 'Varyn Vance', chr_graxx: 'Graxx', chr_niamh: 'Niamh' };
const authored = authoredKnowledge([
    { id: 'k1', kind: 'secret', text: 'Remus Watt is the chosen champion of Elyon', knownBy: ['chr_remus', 'chr_varyn'] },
    { id: 'k2', kind: 'oath', text: 'to see Varyn safely to Redhaven', madeBy: ['chr_remus'], madeTo: ['chr_varyn'] },
], (id) => names[id]);
// As Archivist compiles them (world.secret / world.promise).
const story = storyKnowledge({
    secret: [
        { id: 'w12', name: 'the partnership', text: 'Remus and Varyn are lovers.', known_by: [{ id: 'chr_remus', name: 'Remus Watt' }, { id: 'chr_varyn', name: 'Varyn Vance' }], status: 'kept' },
        { id: 'w20', name: 'the scrolls', text: 'The scrolls are forgeries.', known_by: [{ id: null, name: 'Niamh' }], status: 'revealed' },
    ],
    promise: [
        { id: 'w30', name: 'the trade', text: 'trade passage through Redhaven for the scrolls', made_by: [{ id: 'chr_graxx', name: 'Graxx' }], made_to: [{ id: 'chr_remus', name: 'Remus Watt' }], status: 'pending' },
        { id: 'w31', name: 'old debt', text: 'repay the guild', made_by: [{ id: 'chr_graxx', name: 'Graxx' }], made_to: [], status: 'released' },
    ],
});
const cast = [
    { id: 'chr_remus', name: 'Remus Watt', aliases: ['Remus'], player: true },
    { id: 'chr_varyn', name: 'Varyn Vance', aliases: ['Varyn'] },
    { id: 'chr_graxx', name: 'Graxx' },
    { id: 'chr_niamh', name: 'Niamh' },
];

describe('secrets and oaths', () => {
    it('come from Archivist as well as the user, in one shape', () => {
        expect(story.map((k) => `${k.kind}:${k.status}:${k.source}`)).toEqual(['secret:kept:story', 'secret:revealed:story', 'oath:pending:story', 'oath:released:story']);
        expect(authored[0].knownBy).toEqual([{ id: 'chr_remus', name: 'Remus Watt' }, { id: 'chr_varyn', name: 'Varyn Vance' }]);
        expect(normalizeKnowledgeItem({ kind: 'oath', text: 'x', status: 'nonsense' }).status).toBe('pending');
    });

    it('tell each person what they know and have sworn, and the rest who must not know', () => {
        const { members, rules } = sceneKnowledge([...authored, ...story], cast);
        expect(members.get('chr_varyn').knows).toEqual(['Remus Watt is the chosen champion of Elyon.', 'Remus and Varyn are lovers.']);
        expect(members.get('chr_graxx').knows).toEqual([]);
        expect(members.get('chr_graxx').sworn).toEqual(['Swore to Remus Watt: trade passage through Redhaven for the scrolls.']);
        expect(members.get('chr_varyn').owed).toEqual(['Remus Watt swore to them: to see Varyn safely to Redhaven.']);
        const secret = rules.find((r) => r.includes('champion of Elyon'));
        expect(secret).toContain('Only Remus Watt and Varyn Vance know it.');
        expect(secret).toContain('Graxx and Niamh do not know it: they never act on it, hint at it or guess it unless it is revealed in front of them.');
        // A revealed secret and a released oath are no longer kept.
        expect(rules.some((r) => r.includes('forgeries') || r.includes('repay the guild'))).toBe(false);
    });

    it('reach the narrator and the director', () => {
        const { members, rules } = sceneKnowledge([...authored, ...story], cast);
        const withKnowledge = cast.map((c) => ({ ...c, ...members.get(c.id) }));
        expect(buildCast({ cast: withKnowledge })).toContain('Knows: Remus Watt is the chosen champion of Elyon');
        const built = buildGuidance({ cast: withKnowledge, secrets: rules, budget: 800 });
        expect(guidanceParts(built).guidance_scene).toContain('People know only what they saw, heard or were told in the story.');
        const dossier = dossierText({ cast: withKnowledge, secrets: rules });
        expect(dossier).toContain('SECRETS AND OATHS');
        expect(dossier).toContain('knows: Remus Watt is the chosen champion of Elyon');
    });

    it('are listed on the sheets they touch', () => {
        const all = [...authored, ...story];
        expect(knowledgeOf({ id: 'chr_graxx', name: 'Graxx' }, all).map((k) => k.id)).toEqual(['story:w30', 'story:w31']);
        expect(knowledgeOf({ id: 'chr_niamh', name: 'Niamh' }, all).map((k) => k.id)).toEqual(['story:w20']);
    });
});
