import { unknownsFor, toldInChat, mergeTold, memoryKey, witnessCoverage, povRule, povBrief } from '../src/director/perspective.js';
import { buildGuidance } from '../src/guidance/build.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';

const cast = [
    { id: 'chr_remus', name: 'Remus', player: true },
    { id: 'chr_varyn', name: 'Varyn' },
];
const vision = { id: 'mem_v', text: 'Remus dreamed of a burning gate and a voice calling him by a god\'s name.', private: true, importance: 'high', entity_ids: ['chr_remus'], witness_ids: ['chr_remus'] };

describe('what the player tells the people with them', () => {
    it('is heard by everyone present, from the player\'s own words', () => {
        const told = toldInChat([vision], { cast, messages: [{ isUser: true, text: 'I tell Varyn about my dream: a burning gate, and a voice calling me by a name.' }] });
        expect(told).toEqual({ mem_v: ['chr_varyn'] });
        expect(unknownsFor([vision], { cast, told })).toEqual([]);
        expect(unknownsFor([vision], { cast })).toHaveLength(1);
    });

    it('not from the narrator, and not from talk about something else', () => {
        expect(toldInChat([vision], { cast, messages: [{ isUser: false, text: 'Varyn speaks of the burning gate from your dream.' }] })).toEqual({});
        expect(toldInChat([vision], { cast, messages: [{ isUser: true, text: 'I tell Varyn we should eat.' }] })).toEqual({});
    });

    it('is kept, merged', () => {
        expect(mergeTold({ a: ['x'] }, { a: ['y'], b: ['x'] })).toEqual({ a: ['x', 'y'], b: ['x'] });
        expect(memoryKey({ text: 'no id here' })).toBe('no id here');
    });
});

describe('witness coverage', () => {
    it('counts the memories that say who was present', () => {
        expect(witnessCoverage([vision, { text: 'old one' }, { text: '' }])).toEqual({ total: 2, witnessed: 1 });
    });
});

describe('point of view', () => {
    it('gives the narrator and the director a rule, none when free', () => {
        expect(povRule('free', 'Remus')).toBe('');
        expect(povRule('limited', 'Remus')).toContain('close on Remus');
        expect(povRule('second', 'Remus')).toContain('"you" is Remus');
        expect(povBrief('omniscient')).toContain('all-seeing');
    });

    it('goes into the guidance with the perspective rule', () => {
        const g = buildGuidance({ cast: [{ name: 'Remus', player: true }, { name: 'Varyn' }], pov: 'limited', budget: 2000 });
        expect(JSON.stringify(g)).toContain('close on Remus');
    });

    it('goes into the director\'s instructions', () => {
        const { system } = buildDirectorPrompt({ pov: 'limited', userName: 'Remus', messages: [{ name: 'Remus', text: 'Hello', isUser: true }] });
        expect(system).toContain('stays with Remus\'s senses');
    });
});

describe('a whole group taking something in', () => {
    const cast = [{ id: 'chr_remus', name: 'Remus', player: true }, { id: 'chr_varyn', name: 'Varyn' }, { id: 'chr_graxx', name: 'Graxx' }];
    const vision = { id: 'm1', text: 'Remus had a dream of a burning gate and a voice calling him by a god\'s name.', importance: 'high', private: true, entity_ids: ['chr_remus'], witness_ids: ['chr_remus'], source_message_id: 'God War#1@d' };
    it('counts for everyone, so no one is said not to know', () => {
        expect(unknownsFor([vision], { cast })).not.toEqual([]);
        for (const words of ['the group', 'everyone', 'the others', 'all of them', 'the party', 'the companions']) {
            const heard = { id: 'm2', text: `Around the campfire ${words} pondered the dream of the burning gate.`, importance: 'medium', entity_ids: [], witness_ids: [], source_message_id: 'God War#2@d' };
            expect(unknownsFor([vision, heard], { cast }), words).toEqual([]);
        }
    });
    it('needs the group as whole words, not inside another word', () => {
        const heard = { id: 'm3', text: 'Around the campfire noeveryones pondered the dream of the burning gate.', importance: 'medium', entity_ids: [], witness_ids: [], source_message_id: 'God War#3@d' };
        expect(unknownsFor([vision, heard], { cast })).not.toEqual([]);
    });
});
