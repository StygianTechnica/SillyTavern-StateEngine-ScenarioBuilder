import { unknownsFor, unknownsLines } from '../src/director/perspective.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';

const cast = [
    { id: 'chr_remus', name: 'Remus', player: true },
    { id: 'chr_varyn', name: 'Varyn' },
    { id: 'chr_graxx', name: 'Graxx' },
];
const names = { chr_remus: 'Remus', chr_varyn: 'Varyn', chr_graxx: 'Graxx' };
const nameOf = (id) => names[id] ?? '';
let n = 0;
const mem = (text, fields = {}) => ({
    id: `mem_${++n}`, text, importance: 'medium', entity_ids: ['chr_remus'], witness_ids: ['chr_remus', 'chr_varyn', 'chr_graxx'],
    source_message_id: `God War#${fields.at ?? n}@d`, ...fields,
});

describe('unknownsFor', () => {
    it('lists, per person other than the player, what they did not witness', () => {
        const vision = mem('Remus dreamed of a burning gate and a voice calling him by a god\'s name.', { private: true, witness_ids: ['chr_remus'], importance: 'high' });
        const power = mem('Remus called down divine fire on the bandits at the ford.', { witness_ids: ['chr_remus', 'chr_varyn'], importance: 'high' });
        const shared = mem('The three of them reached the ruined shrine at dusk.');
        const out = unknownsFor([vision, power, shared], { cast, nameOf });
        expect(out.map((u) => u.name)).toEqual(['Varyn', 'Graxx']);
        const varyn = out.find((u) => u.name === 'Varyn').unknown;
        expect(varyn).toHaveLength(1);
        expect(varyn[0]).toMatch(/^Remus dreamed of a burning gate.*\(private to Remus\)$/);
        const graxx = out.find((u) => u.name === 'Graxx').unknown;
        expect(graxx.some((t) => t.startsWith('Remus called down divine fire'))).toBe(true);
        expect(graxx.join(' ')).not.toContain('ruined shrine');
    });

    it('skips low importance, memories with no witnesses recorded, and memories about no one here', () => {
        const out = unknownsFor([
            mem('Remus bought bread.', { importance: 'low', witness_ids: ['chr_remus'] }),
            mem('Remus hid the relic under the altar.', { witness_ids: [] }),
            mem('Old Senna sold the mill to strangers.', { entity_ids: ['chr_senna'], witness_ids: ['chr_senna'] }),
        ], { cast, nameOf });
        expect(out).toEqual([]);
    });

    it('drops what the person was told later', () => {
        const vision = mem('Remus dreamed of a burning gate and a calling voice.', { private: true, witness_ids: ['chr_remus'], at: 10 });
        const told = mem('Remus told Varyn about the burning gate dream and the calling voice.', { witness_ids: ['chr_remus', 'chr_varyn'], at: 14 });
        const out = unknownsFor([vision, told], { cast, nameOf });
        expect(out.find((u) => u.name === 'Varyn')).toBeUndefined();
        expect(out.find((u) => u.name === 'Graxx').unknown[0]).toContain('burning gate');
    });

    it('keeps the most important first, at most a few per person, within the token cap', () => {
        const many = Array.from({ length: 8 }, (_, i) => mem(`Remus did secret thing number ${i} in the dark tunnels.`, { witness_ids: ['chr_remus'], importance: i === 2 ? 'high' : 'medium' }));
        const [first] = unknownsFor(many, { cast, nameOf });
        expect(first.unknown).toHaveLength(3);
        expect(first.unknown[0]).toContain('number 2');
        const tight = unknownsFor(many, { cast, nameOf, maxTokens: 20 });
        expect(tight.flatMap((u) => u.unknown)).toHaveLength(1);
    });

    it('prefers what the latest chat is about, and only looks at recent memories', () => {
        const old = mem('Remus spoke with the sea witch about his mother.', { witness_ids: ['chr_remus'], at: 1 });
        const filler = Array.from({ length: 5 }, (_, i) => mem(`Remus walked the market alone on errand ${i}.`, { witness_ids: ['chr_remus'], at: 50 + i }));
        const lantern = mem('Remus found the silver lantern in the crypt.', { witness_ids: ['chr_remus'], at: 40 });
        const [varyn] = unknownsFor([old, lantern, ...filler], { cast, nameOf, recentText: 'Varyn asks where the silver lantern came from.', window: 6 });
        expect(varyn.unknown[0]).toContain('silver lantern');
        expect(varyn.unknown.join(' ')).not.toContain('sea witch');
    });

    it('reads an older memory with no witnesses as private when it is someone\'s vision or dream', () => {
        const legacy = (text, at, entityIds = ['chr_remus']) => mem(text, { witness_ids: [], at, entity_ids: entityIds, importance: 'high' });
        const nap = legacy('Remus had disturbing visions during his nap, showing the old war.', 224);
        const fought = legacy('Remus fought off the raiders at the bridge.', 225);
        const [varyn] = unknownsFor([nap, fought], { cast, nameOf });
        expect(varyn.unknown).toEqual(['Remus had disturbing visions during his nap, showing the old war (private to Remus)']);
        // Told later: to whoever was there, or to Varyn himself.
        expect(unknownsFor([nap, legacy('Remus described the visions from his nap as horrifying.', 226)], { cast, nameOf })).toEqual([]);
        const comforted = legacy('Varyn reassured Remus about the visions.', 227, ['chr_varyn', 'chr_remus']);
        expect(unknownsFor([nap, comforted], { cast, nameOf }).map((u) => u.name)).toEqual(['Graxx']);
        // Spoken of in the memory itself: not private.
        expect(unknownsFor([legacy('Remus mentioned his visions of the war.', 228)], { cast, nameOf })).toEqual([]);
    });

    it('shows two memories of the same vision once', () => {
        const a = mem('Remus had a vivid vision of the temple.', { private: true, witness_ids: ['chr_remus'], at: 433 });
        const b = mem('Remus had a prophetic vision of the temple and the village.', { private: true, witness_ids: ['chr_remus'], at: 433 });
        expect(unknownsFor([a, b], { cast, nameOf })[0].unknown).toHaveLength(1);
    });

    it('is empty with no one but the player, or no memories', () => {
        expect(unknownsFor([mem('x happened here.')], { cast: [cast[0]] })).toEqual([]);
        expect(unknownsFor(null, { cast })).toEqual([]);
    });
});

describe('the director prompt', () => {
    const input = {
        cast,
        messages: [{ name: 'Remus', text: 'I wake and rub my eyes.', isUser: true }],
        unknowns: [
            { id: 'chr_varyn', name: 'Varyn', unknown: ['Remus dreamed of a burning gate (private to Remus)'] },
            { id: 'chr_graxx', name: 'Graxx', unknown: ['Remus dreamed of a burning gate (private to Remus)', 'Remus called down divine fire'] },
        ],
    };

    it('shows what each person does not know, each memory once, and asks the briefing to say so', () => {
        const { prompt } = buildDirectorPrompt(input);
        expect(prompt).toContain('WHAT EACH PERSON DOES NOT KNOW');
        expect(prompt).toContain('- Remus dreamed of a burning gate (private to Remus) - not known to Varyn, Graxx.');
        expect(prompt).toContain('- Remus called down divine fire - not known to Graxx.');
        expect(prompt).toContain('Varyn did not see the vision - he only saw Remus sleep restlessly');
    });

    it('leaves both out when no one is missing anything (perspective off)', () => {
        const { prompt } = buildDirectorPrompt({ ...input, unknowns: [] });
        expect(prompt).not.toContain('DOES NOT KNOW');
        expect(unknownsLines([])).toEqual([]);
    });
});
