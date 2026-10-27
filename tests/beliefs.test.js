import { describe, it, expect } from 'vitest';
import { authoredKnowledge, sceneKnowledge, knowledgeOf, normalizeKnowledgeItem, normalizeBeliefsSeen } from '../src/library/knowledge.js';
import { buildCast } from '../src/guidance/build.js';
import { dossierText } from '../src/director/prompt.js';
import { frictionLines } from '../src/planner/model.js';
import { normalizeChatDoc } from '../src/store/schema.js';

const names = { chr_cyril: 'Cyril Moriarty', chr_mara: 'Mara Quill', chr_doc: 'Dr. Ines Halloran', chr_vex: 'Vex', fac_omicron: 'Omicron Innovations' };
const nameOf = (id) => names[id] ?? '';
const dead = (extra = {}) => authoredKnowledge([{ id: 'b1', kind: 'belief', text: 'Cyril Moriarty is dead - killed in the Omicron lab', about: ['chr_cyril'], everyone: true, knownBy: ['chr_doc'], truth: 'he survived; the eye keeps him alive', reaction: 'a ghost or a clone', ...extra }], nameOf);
const cast = [
    { id: 'chr_cyril', name: 'Cyril Moriarty', aliases: ['Cyril'], player: true },
    { id: 'chr_mara', name: 'Mara Quill' },
    { id: 'chr_doc', name: 'Dr. Ines Halloran' },
];

describe('a belief that is not so', () => {
    it('is stored with who it is about and who holds it', () => {
        const b = normalizeKnowledgeItem({ kind: 'belief', text: 'x', about: ['a'], heldBy: ['fac_omicron'], everyone: 'yes', status: 'nonsense' });
        expect(b).toMatchObject({ kind: 'belief', about: ['a'], heldBy: ['fac_omicron'], everyone: false, status: 'held' });
        expect(normalizeBeliefsSeen({ b1: { chr_mara: 3, bad: 'x' }, '': {} })).toEqual({ b1: { chr_mara: 3 } });
        expect(normalizeChatDoc({}).beliefsSeen).toEqual({});
    });

    it('shocks a holder meeting its subject for the first time', () => {
        const { rules, members, newlySeen } = sceneKnowledge(dead(), cast, { seen: {}, turn: 4 });
        expect(newlySeen).toEqual([{ beliefId: 'b1', personId: 'chr_mara' }]);
        const rule = rules.find((r) => r.startsWith('Belief:'));
        expect(rule).toContain('Mara Quill believes it - and Cyril Moriarty is here.');
        expect(rule).toContain('they react to it now');
        expect(rule).toContain('They may take it for a ghost or a clone.');
        expect(rule).toContain('Anyone else here who knew of Cyril Moriarty is just as startled.');
        // The one who knows the truth is not shocked, and knows it.
        expect(rule).not.toContain('Halloran');
        expect(members.get('chr_doc').knows[0]).toBe('Not so, though most believe it: Cyril Moriarty is dead - killed in the Omicron lab. The truth: he survived; the eye keeps him alive.');
        // The player's mind is their own.
        expect(members.get('chr_cyril').believes).toEqual([]);
    });

    it('keeps the shock for that turn, then they know better', () => {
        const same = sceneKnowledge(dead(), cast, { seen: { b1: { chr_mara: 4 } }, turn: 4 });
        expect(same.newlySeen).toEqual([]);
        expect(same.rules.some((r) => r.includes('Mara Quill believes it'))).toBe(true);
        const later = sceneKnowledge(dead(), cast, { seen: { b1: { chr_mara: 4 } }, turn: 5 });
        expect(later.rules.some((r) => r.includes('Mara Quill believes it'))).toBe(false);
        // Everyone believes it: bystanders are still startled.
        expect(later.rules.find((r) => r.startsWith('Belief:'))).toContain('a passer-by, a guard');
        expect(later.members.get('chr_mara').knows).toEqual(['Not so, though they believed it: Cyril Moriarty is dead - killed in the Omicron lab. They have seen it for themselves.']);
    });

    it('is simply believed while its subject is away', () => {
        const away = cast.filter((c) => c.id !== 'chr_cyril');
        const { rules, members, newlySeen } = sceneKnowledge(dead(), away, { seen: {}, turn: 2 });
        expect(rules.filter((r) => r.startsWith('Belief:'))).toEqual([]);
        expect(newlySeen).toEqual([]);
        expect(members.get('chr_mara').believes).toEqual(['Cyril Moriarty is dead - killed in the Omicron lab.']);
        expect(buildCast({ cast: away.map((c) => ({ ...c, ...members.get(c.id) })) })).toContain('Believes: Cyril Moriarty is dead - killed in the Omicron lab');
        expect(dossierText({ cast: away.map((c) => ({ ...c, ...members.get(c.id) })) })).toContain('believes (wrongly): Cyril Moriarty is dead');
    });

    it('can be held by a faction - its members hold it', () => {
        const k = dead({ everyone: false, heldBy: ['fac_omicron'] });
        const withVex = [...cast, { id: 'chr_vex', name: 'Vex' }];
        const { newlySeen, rules } = sceneKnowledge(k, withVex, { turn: 1, memberships: new Map([['chr_vex', ['fac_omicron']]]) });
        expect(newlySeen.map((s) => s.personId)).toEqual(['chr_vex']);
        expect(rules[0]).toContain('Vex believes it');
        expect(rules[0]).not.toContain('just as startled');
        // Nobody who holds it here: nothing to say.
        expect(sceneKnowledge(k, cast, { turn: 1 }).rules).toEqual([]);
    });

    it('stays believed to their face when the sight does not undo it', () => {
        const disguise = authoredKnowledge([{ id: 'b2', kind: 'belief', text: 'The masked envoy is a Concord diplomat', about: ['chr_cyril'], everyone: true, bySight: false }], nameOf);
        const { rules, members, newlySeen } = sceneKnowledge(disguise, cast, { turn: 1 });
        expect(rules).toEqual([]);
        expect(newlySeen).toEqual([]);
        expect(members.get('chr_mara').believes).toEqual(['The masked envoy is a Concord diplomat.']);
        expect(normalizeKnowledgeItem({ kind: 'belief', text: 'x' }).bySight).toBe(true);
    });

    it('says nothing once dispelled', () => {
        expect(sceneKnowledge(dead({ status: 'dispelled' }), cast, { turn: 1 }).rules).toEqual([]);
    });

    it('is listed on the sheets of who it is about and who holds it, and feeds the planner', () => {
        const k = dead({ heldBy: ['fac_omicron'] });
        expect(knowledgeOf({ id: 'fac_omicron', name: 'Omicron Innovations' }, k)).toHaveLength(1);
        expect(knowledgeOf({ id: 'chr_cyril', name: 'Cyril Moriarty' }, k)).toHaveLength(1);
        expect(frictionLines({ knowledge: k })).toContain('Believed by most people, but not so (the truth known to Dr. Ines Halloran): Cyril Moriarty is dead - killed in the Omicron lab');
    });
});
