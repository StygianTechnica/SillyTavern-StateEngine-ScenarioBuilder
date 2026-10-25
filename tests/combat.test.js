import { nextFight, fightFacts, fightGuidance, normalizeFight } from '../src/director/fight.js';
import { protectionOf, mayDie, protectedText, normalizeCombatMeta, foeSteady, allySteady } from '../src/director/combat.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';
import { readEntrants, foeMatcher } from '../src/events/setup.js';

const foe = (name, condition) => ({ name, condition, side: 'foe' });
const ally = (name, condition) => ({ name, condition, side: 'ally' });
const of = (fight, name) => fight.fighters.find((f) => f.name === name);
const entry = (name, combat = {}) => ({ id: `chr_${name}`, name, meta: { combat } });
const traits = (map) => (name) => map[name] ?? {};

describe('power ratings in a fight', () => {
    it('a deadly foe holds out longer than a standard one when nothing lands', () => {
        const run = (power) => {
            let fight = nextFight(null, [foe('Dragon', 'unhurt')], { traitsOf: traits({ Dragon: { power } }), limit: 30 });
            for (let i = 0; i < 4; i += 1) fight = nextFight(fight, [foe('Dragon', 'unhurt')], { traitsOf: traits({ Dragon: { power } }), limit: 30 });
            return of(fight, 'Dragon').condition;
        };
        expect(run('')).toBe('wounded');
        expect(run('deadly')).toBe('hurt');
        expect(foeSteady('deadly')).toBe(4);
        expect(foeSteady('minor', 'quickly')).toBe(1);
    });

    it('a deadly foe is not felled from fresh in one reply', () => {
        let fight = nextFight(null, [foe('Dragon', 'unhurt')], { traitsOf: traits({ Dragon: { power: 'deadly' } }) });
        fight = nextFight(fight, [foe('Dragon', 'slain')]);
        expect(of(fight, 'Dragon').condition).toBe('hurt');
        expect(fight.ended).toBe(false);
        fight = nextFight(fight, [foe('Dragon', 'badly wounded')]);
        expect(of(fight, 'Dragon').condition).toBe('wounded');
    });

    it('a minor foe breaks quickly once hurt', () => {
        let fight = nextFight(null, [foe('Goblin', 'unhurt')], { traitsOf: traits({ Goblin: { power: 'minor' } }) });
        fight = nextFight(fight, [foe('Goblin', 'hurt')]);
        expect(of(fight, 'Goblin').condition).toBe('wounded');
    });

    it('a strong foe draws the fight out, and the longest it was stands', () => {
        let fight = nextFight(null, [foe('Graxx', 'wounded')], { traitsOf: traits({ Graxx: { power: 'strong' } }), limit: 3 });
        expect(fight.limit).toBe(4);
        for (let i = 0; i < 2; i += 1) fight = nextFight(fight, [foe('Graxx', 'wounded')], { limit: 3 });
        expect(fight.ended).toBe(false);
        fight = nextFight(fight, [foe('Graxx', 'wounded')], { limit: 3 });
        expect(fight.round).toBe(4);
        expect(fight.ended).toBe(true);
        expect(fightFacts(nextFight(null, [foe('Graxx', 'hurt')], { traitsOf: traits({ Graxx: { power: 'strong' } }), limit: 3 }), 3))
            .toContain('Graxx (foe, strong): hurt. A fight ends within 4 replies');
    });

    it('allies are worn down only when the user wants it, or a hard foe hits them', () => {
        expect(allySteady('spared', '')).toBe(0);
        expect(allySteady('spared', 'deadly')).toBe(2);
        expect(allySteady('hard', 'strong')).toBe(1);
        let fight = nextFight(null, [foe('Ghoul', 'unhurt'), ally('Varyn', 'unhurt')], { alliesPressed: 'hard', limit: 30 });
        for (let i = 0; i < 6; i += 1) fight = nextFight(fight, [foe('Ghoul', 'unhurt'), ally('Varyn', 'unhurt')], { alliesPressed: 'hard', limit: 30 });
        expect(of(fight, 'Varyn').condition).toBe('badly wounded');
        // Against a deadly foe, worn down every reply - but never past failing.
        const opts = { alliesPressed: 'hard', limit: 30, traitsOf: traits({ Wyrm: { power: 'deadly' } }) };
        let hard = nextFight(null, [foe('Wyrm', 'unhurt'), ally('Varyn', 'unhurt')], opts);
        for (let i = 0; i < 11; i += 1) hard = nextFight(hard, [foe('Wyrm', 'unhurt'), ally('Varyn', 'unhurt')], opts);
        expect(hard.ended).toBe(false);
        expect(of(hard, 'Varyn').condition).toBe('failing');
    });

    it('survives being stored with its traits', () => {
        const fight = nextFight(null, [foe('Graxx', 'hurt')], { traitsOf: traits({ Graxx: { power: 'strong', protect: 'flee' } }) });
        expect(normalizeFight(JSON.parse(JSON.stringify(fight)))).toEqual(fight);
    });
});

describe('who is spared', () => {
    it('a plot device flees rather than going down', () => {
        let fight = nextFight(null, [foe('Maziel', 'badly wounded')], { traitsOf: traits({ Maziel: { protect: 'flee' } }) });
        fight = nextFight(fight, [foe('Maziel', 'slain')]);
        expect(of(fight, 'Maziel').condition).toBe('fled');
        expect(fight.ended).toBe(true);
    });

    it('an unkillable one goes down alive, and the narrator is told so', () => {
        let fight = nextFight(null, [foe('Graxx', 'failing')], { traitsOf: traits({ Graxx: { protect: 'spare' } }) });
        fight = nextFight(fight, [foe('Graxx', 'down')]);
        expect(of(fight, 'Graxx').condition).toBe('down');
        expect(fightGuidance(fight)).toContain('Graxx is beaten in this reply - knocked down, overpowered or taken captive, but alive');
    });

    it('fates come before the stance; a kind is never spared', () => {
        expect(protectionOf(entry('Maziel', { fate: 'plot' }))).toBe('flee');
        expect(protectionOf(entry('Graxx', { fate: 'unkillable' }))).toBe('spare');
        expect(protectionOf(entry('Varyn'), { stance: 'allies', side: 'ally' })).toBe('spare');
        expect(protectionOf(entry('Varyn'), { stance: 'allies', side: 'foe' })).toBe('');
        expect(protectionOf(entry('Varyn', { fate: 'mortal' }), { stance: 'named' })).toBe('');
        expect(protectionOf(entry('Varyn'), { stance: 'named' })).toBe('spare');
        expect(protectionOf(null, { stance: 'named' })).toBe('');
        expect(mayDie(entry('Varyn'), { stance: 'allies', wasAlly: true })).toBe(false);
        expect(mayDie(entry('Varyn'), { stance: 'free' })).toBe(true);
    });

    it('reads stored combat meta safely', () => {
        expect(normalizeCombatMeta({ power: 'deadly', fate: 'plot' })).toEqual({ power: 'deadly', fate: 'plot' });
        expect(normalizeCombatMeta({ power: 'huge', fate: 'immortal' })).toEqual({ power: '', fate: '' });
        expect(normalizeCombatMeta(null)).toEqual({ power: '', fate: '' });
    });

    it('tells the director who cannot be killed, and keeps DIES off them', () => {
        const text = protectedText([entry('Graxx', { fate: 'unkillable' }), entry('Maziel', { fate: 'plot' }), entry('Arin')], { stance: 'free' });
        expect(text).toContain('Graxx can be beaten, wounded, knocked out or captured, but never killed.');
        expect(text).toContain('Maziel - the story still needs them');
        expect(text).not.toContain('Arin');
        expect(protectedText([entry('Arin')], { stance: 'free' })).toBe('');
        const { prompt } = buildDirectorPrompt({ location: { path: ['Crypt'] }, messages: [], protectedText: text });
        expect(prompt).toContain('NEVER KILLED IN THIS STORY');
        expect(prompt).toContain('Never a DIES line for anyone under NEVER KILLED IN THIS STORY');
    });
});

describe('a tournament entrant\'s strength', () => {
    it('comes from the entry\'s power rating when the line gives none', () => {
        const match = foeMatcher([entry('Graxx', { power: 'deadly' }), entry('Arin')]);
        const read = readEntrants('Graxx\nArin\nGraxx | minor', match);
        expect(read.map((x) => x.strength)).toEqual(['deadly', 'standard', 'minor']);
        expect(read[0]).toEqual({ name: 'Graxx', objectId: 'chr_Graxx', strength: 'deadly' });
    });
});
