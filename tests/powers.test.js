import { powersAtWork, powersText, powersNarratorText, giftsText, isPower, normalizePowerMeta } from '../src/library/powers.js';
import { parseDirectorNote, dossierText } from '../src/director/prompt.js';
import { offerText } from '../src/quests/missions.js';
import { normalizeEntryMeta } from '../src/store/schema.js';

const ferunox = { id: 'ferunox', name: 'Ferunox', role: 'god of chaos', meta: { power: { on: true, acts: 'whispers in the dark and twisted luck' } } };
const elyon = { id: 'elyon', name: 'Elyon', role: 'god of light', meta: { power: { on: true } } };
const varyn = { id: 'varyn', name: 'Varyn', meta: { patrons: ['ferunox'], gifts: 'a chaos-touched blade that warps what it strikes' } };
const remus = { id: 'remus', name: 'Remus', meta: { patrons: ['elyon'] } };
const base = { powers: [ferunox, elyon], cast: [varyn, remus], turn: 50, every: 8 };

describe('a power at work', () => {
    it('is kept as a character with no body, its gifts and patrons on the entry', () => {
        expect(isPower(ferunox)).toBe(true);
        expect(normalizePowerMeta(null)).toEqual({ on: false, acts: '' });
        expect(normalizeEntryMeta({ power: { on: true, acts: 'storms' }, patrons: ['elyon'], gifts: 'light' })).toMatchObject({ power: { on: true, acts: 'storms' }, patrons: ['elyon'], gifts: 'light' });
    });

    it('is left out when nothing calls for it - most replies', () => {
        expect(powersAtWork({ ...base, lastActed: { ferunox: 48, elyon: 49 } })).toEqual([]);
    });

    it('comes when anyone calls on it, champion or not', () => {
        const [p] = powersAtWork({ ...base, cast: [remus], recentText: '"Ferunox! Give Varyn back!" Remus screamed.', lastActed: { ferunox: 49, elyon: 49 } });
        expect(p).toMatchObject({ id: 'ferunox', champions: [] });
        expect(p.why).toMatch(/^called on or named in the latest messages - by anyone/);
    });

    it('comes when its champion is failing in a fight, a moment for a blessing', () => {
        const fight = { fighters: [{ name: 'Varyn', side: 'ally', condition: 'failing' }, { name: 'Maziel', side: 'foe', condition: 'hurt' }] };
        const [p] = powersAtWork({ ...base, fight, lastActed: { ferunox: 45, elyon: 49 } });
        expect(p.id).toBe('ferunox');
        expect(p.why).toContain('Varyn - its champion - is failing in the fight');
    });

    it('takes its occasional turn when its champion is here and it has been quiet a while, at most two at once', () => {
        const list = powersAtWork({ ...base, lastActed: {} });
        expect(list.map((p) => p.id)).toEqual(['ferunox', 'elyon']);
        expect(powersAtWork({ ...base, lastActed: {}, every: 0 })).toEqual([]);
        expect(powersAtWork({ ...base, lastActed: {}, max: 1 })).toHaveLength(1);
    });

    it('is told to the director in a line, and a person\'s gifts go with them', () => {
        const text = powersText(powersAtWork({ ...base, lastActed: { elyon: 49 } }));
        expect(text).toBe('- Ferunox (god of chaos); champion: Varyn; makes itself known by whispers in the dark and twisted luck - its champion Varyn is here, and it has been quiet a while.');
        expect(giftsText(varyn, (id) => (id === 'ferunox' ? 'Ferunox' : ''))).toBe('gifts: a chaos-touched blade that warps what it strikes; champion of Ferunox');
        expect(dossierText({ cast: [{ name: 'Remus', player: true }], powersText: text })).toContain('POWERS AT WORK (gods and forces with no body');
    });

    it('reports what it did, and the price it demands', () => {
        const parsed = parseDirectorNote('POWER | Ferunox | gave Varyn back | price: Remus must carry the shard to the rift\nPOWER | Elyon | a warm light\n\nThe crypt shudders.');
        expect(parsed.powers).toEqual([{ name: 'Ferunox', what: 'gave Varyn back', price: 'Remus must carry the shard to the rift' }, { name: 'Elyon', what: 'a warm light', price: '' }]);
        expect(parsed.note).toBe('The crypt shudders.');
    });

    it('gives its missions in dreams and visions', () => {
        const m = { name: 'The Shard', task: 'Carry the shard to the rift.', reward: 'his favour' };
        expect(offerText(m, { giverName: 'Ferunox', takerName: 'Varyn', vision: true })).toMatch(/^Ferunox sends Varyn a task in a dream or vision, the next time Varyn sleeps, prays or is alone: "The Shard"/);
        expect(offerText(m, { giverName: 'Ferunox', takerName: 'Varyn', vision: true, now: true })).toMatch(/^Ferunox comes to Varyn in a vision or a dream with a task/);
    });
});

describe('powers with weight', () => {
    const remusChampion = { id: 'remus', name: 'Remus', meta: { patrons: ['elyon'] } };
    const varynDead = { id: 'varyn', name: 'Varyn', meta: { patrons: ['ferunox'] } };

    it('answers when its own champion calls on it, and the narrator hears of it', () => {
        const [p] = powersAtWork({ powers: [elyon], cast: [remusChampion], caller: remusChampion, callerText: '"Elyon, hear me!" Remus cried.', recentText: '"Elyon, hear me!" Remus cried.', turn: 10, lastActed: { elyon: 9 } });
        expect(p.answers).toBe(true);
        expect(p.why).toMatch(/^its own champion Remus calls on it - it answers in this reply/);
        expect(p.narrator).toBe("Remus has called on Elyon, whose champion Remus is: Elyon answers in this reply, in Elyon's own way - never in person.");
    });

    it('comes forward when its champion lies dead, and may restore him at a price', () => {
        const [p] = powersAtWork({ powers: [ferunox], cast: [remusChampion], dead: [varynDead], caller: remusChampion, callerText: 'Ferunox, give Varyn back!', recentText: 'Ferunox, give Varyn back!', turn: 10 });
        expect(p.answers).toBe(false);
        expect(p.why).toContain('its champion Varyn lies dead - a moment it may claim, avenge or restore its own');
        expect(p.narrator).toContain("Ferunox's champion Varyn lies dead");
        expect(powersNarratorText([p])).toBe(p.narrator);
    });

    it('carries what it wants and what it last did', () => {
        const withWants = { ...ferunox, base: { goals: 'to see the old order burn' } };
        const [p] = powersAtWork({ powers: [withWants], cast: [varyn], turn: 30, lastActed: { ferunox: 10 }, lastDid: { ferunox: 'set the bridge alight' } });
        expect(powersText([p])).toContain('wants: to see the old order burn');
        expect(powersText([p])).toContain('last acted 20 replies ago: set the bridge alight');
    });
});
