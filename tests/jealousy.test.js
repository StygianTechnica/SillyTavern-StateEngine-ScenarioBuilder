import { describe, it, expect } from 'vitest';
import {
    bondsOf, heartsSection, heartsFormat, takeHearts, noteBrokenVows, isLive, addGrievance, soothe, emptyHearts, normalizeHearts,
    canBeJealous, isRomantic, isVowOfLove, strengthOf,
} from '../src/director/jealousy.js';
import { buildDirectorPrompt, parseDirectorNote } from '../src/director/prompt.js';
import { normalizeEntryMeta } from '../src/store/schema.js';

let n = 0;
const newId = () => `g${++n}`;
const names = { mira: 'Mira', aldric: 'Aldric', sera: 'Sera', kesh: 'Kesh', pc: 'Remus', bran: 'Bran' };
const nameOf = (id) => names[id] ?? '';
const resolve = (name) => Object.entries(names).find(([, v]) => v.toLowerCase() === String(name).toLowerCase())?.[0] ?? null;
const here = (...ids) => ids.map((id) => ({ id, name: names[id], player: id === 'pc' }));

describe('jealousy - who is bound to whom', () => {
    it('reads romance from the user\'s relationships, the story\'s, and vows of love', () => {
        const bonds = bondsOf({
            authored: [{ from: 'mira', to: 'aldric', kind: 'betrothed', note: '', mutual: true }, { from: 'bran', to: 'sera', kind: 'brother', note: 'loves his sister dearly', mutual: false }],
            story: [{ fromId: 'kesh', toId: 'pc', type: 'romantic', polarity: 2, text: 'smitten since the harbour' }, { fromId: 'sera', toId: 'pc', type: 'friendship', polarity: 3, text: '' }, { fromId: 'bran', toId: 'pc', type: 'friendship', polarity: 1, text: '' }],
            oaths: [{ kind: 'oath', text: 'Aldric swore to marry Sera', status: 'pending', madeBy: [{ id: 'aldric', name: 'Aldric' }], madeTo: [{ id: 'sera', name: 'Sera' }] }],
            nameOf,
        });
        const has = (who, to) => bonds.find((b) => b.who === who && b.to === to);
        expect(has('mira', 'aldric')).toMatchObject({ romantic: true, strength: 3, label: 'betrothed' });
        expect(has('aldric', 'mira')).toBeTruthy();
        expect(has('bran', 'sera')).toBeUndefined();
        expect(has('kesh', 'pc')).toMatchObject({ romantic: true, strength: 2 });
        expect(has('sera', 'pc')).toMatchObject({ romantic: false, label: 'devoted' });
        expect(has('bran', 'pc')).toBeUndefined();
        expect(has('sera', 'aldric')).toMatchObject({ romantic: true, label: 'promised by Aldric' });
    });

    it('knows romance and vows of love when it sees them', () => {
        expect(isRomantic('lover')).toBe(true);
        expect(isRomantic('loves her brother')).toBe(false);
        expect(isVowOfLove('swore to be faithful')).toBe(true);
        expect(isVowOfLove('swore to guard the gate')).toBe(false);
    });

    it('lets each character override the chat either way', () => {
        expect(canBeJealous('', true)).toBe(true);
        expect(canBeJealous('', false)).toBe(false);
        expect(canBeJealous('jealous', false)).toBe(true);
        expect(canBeJealous('never', true)).toBe(false);
        expect(normalizeEntryMeta({ jealousy: 'jealous' }).jealousy).toBe('jealous');
        expect(normalizeEntryMeta({ jealousy: 'wildly' }).jealousy).toBe('');
    });
});

describe('jealousy - the director\'s HEARTS section', () => {
    const bonds = [{ who: 'mira', to: 'pc', strength: 3, romantic: true, label: 'lover' }, { who: 'kesh', to: 'pc', strength: 3, romantic: true, label: 'wife' }, { who: 'sera', to: 'pc', strength: 2, romantic: true, label: 'in love' }];

    it('watches someone here whose love is here with a third person around', () => {
        const { text, report } = heartsSection({ present: here('pc', 'mira', 'bran'), bonds, userName: 'Remus', nameOf });
        expect(text).toMatch(/^HEARTS/);
        expect(text).toMatch(/- Mira is in love with Remus\. If Remus shows warmth, desire or favour to someone else here/);
        expect(text).toMatch(/Not here, but bound to someone who is: Kesh \(wife, toward Remus\)/);
        expect(report).toEqual({ jealous: true, romance: true, soothed: false });
        // Just the two of them: no one to come between them.
        expect(heartsSection({ present: here('pc', 'mira'), bonds: bonds.slice(0, 1), userName: 'Remus', nameOf }).text).toBe('');
    });

    it('names rivals, and leaves out those who are never jealous', () => {
        const both = heartsSection({ present: here('pc', 'mira', 'sera'), bonds, userName: 'Remus', nameOf });
        expect(both.text).toMatch(/Mira and Sera both want Remus: rivals/);
        const modeOf = (id) => (id === 'mira' ? 'never' : '');
        expect(heartsSection({ present: here('pc', 'mira', 'bran'), bonds: bonds.slice(0, 1), modeOf, userName: 'Remus', nameOf }).text).toBe('');
        // The chat's jealousy off - only one jealous by nature still minds.
        expect(heartsSection({ present: here('pc', 'mira', 'bran'), bonds: bonds.slice(0, 1), globalOn: false, userName: 'Remus', nameOf }).text).toBe('');
        const prone = heartsSection({ present: here('pc', 'mira', 'bran'), bonds: bonds.slice(0, 1), globalOn: false, modeOf: () => 'jealous', userName: 'Remus', nameOf });
        expect(prone.text).toMatch(/Mira is jealous by nature: quick to it, slow to let go/);
    });

    it('carries a grievance into later scenes until it fades or is mended', () => {
        const hearts = emptyHearts();
        addGrievance(hearts, { who: 'mira', whoName: 'Mira', over: 'pc', overName: 'Remus', rival: 'sera', rivalName: 'Sera', what: 'saw Remus kiss Sera', kind: 'seen', strength: 3, day: 4 }, { newId });
        const sect = heartsSection({ present: here('pc', 'mira', 'sera'), bonds: [], grievances: hearts.grievances, day: 6, userName: 'Remus', nameOf });
        expect(sect.text).toMatch(/Mira is still wounded and angry \(2 days ago\): saw Remus kiss Sera\. It colours how Mira treats them - toward Remus: hurt and angry/);
        expect(sect.text).toMatch(/toward Sera: cold, cutting, competitive/);
        expect(sect.report.soothed).toBe(true);
        expect(isLive(hearts.grievances[0], 14)).toBe(true);
        expect(isLive(hearts.grievances[0], 15)).toBe(false);
        expect(isLive(hearts.grievances[0], 20, { prone: true })).toBe(true);
        expect(soothe(hearts, 'mira')).toBe(1);
        expect(heartsSection({ present: here('pc', 'mira', 'sera'), bonds: [], grievances: hearts.grievances, day: 6, nameOf }).text).toBe('');
    });

    it('asks for the report lines only when they apply', () => {
        expect(heartsFormat({ jealous: true, romance: false, soothed: false }, 'Remus').join('\n')).toMatch(/JEALOUS \| <who is jealous>/);
        expect(heartsFormat({ jealous: false, romance: true, soothed: true }).join('\n')).toMatch(/ROMANCE[\s\S]*SOOTHED/);
        const withHearts = buildDirectorPrompt({ cast: [{ id: 'pc', name: 'Remus', player: true }, { id: 'mira', name: 'Mira' }], heartsText: 'HEARTS (private)\n- Mira is in love with Remus.', heartsReport: { jealous: true, romance: false, soothed: false } });
        expect(withHearts.prompt).toMatch(/\nHEARTS \(private\)\n- Mira is in love with Remus\./);
        expect(withHearts.prompt).toMatch(/JEALOUS \| <who is jealous>/);
        expect(withHearts.prompt).toMatch(/Where HEARTS bears on this moment/);
        expect(buildDirectorPrompt({ cast: [{ id: 'pc', name: 'Remus', player: true }] }).prompt).not.toMatch(/JEALOUS/);
    });
});

describe('jealousy - what the director reports', () => {
    it('reads JEALOUS, ROMANCE and SOOTHED lines and keeps them out of the briefing', () => {
        const parsed = parseDirectorNote([
            'SCENE | The harbour tavern',
            'JEALOUS | Mira | Remus | Sera | saw Remus kiss Sera | wounded',
            'ROMANCE | Remus | Sera | a kiss by the fire',
            'SOOTHED | Bran | an apology over ale',
            'JEALOUS | <who is jealous> | <the one they love> | <the rival> | <what> | <how>',
            '',
            'Mira goes still at the bar, her knuckles white around the cup. Next: she leaves without a word.',
        ].join('\n'));
        expect(parsed.jealous).toEqual([{ who: 'Mira', over: 'Remus', rival: 'Sera', what: 'saw Remus kiss Sera', how: 'wounded' }]);
        expect(parsed.romance).toEqual([{ one: 'Remus', other: 'Sera', what: 'a kiss by the fire' }]);
        expect(parsed.soothed).toEqual([{ who: 'Bran', how: 'an apology over ale' }]);
        expect(parsed.note).not.toMatch(/JEALOUS|ROMANCE|SOOTHED/);
    });

    it('turns them into grievances: seen by someone here, or word for someone away', () => {
        const hearts = emptyHearts();
        const bonds = [{ who: 'mira', to: 'pc', strength: 3, romantic: true }, { who: 'kesh', to: 'pc', strength: 3, romantic: true }];
        const out = takeHearts(hearts, {
            jealous: [{ who: 'Mira', over: 'Remus', rival: 'Sera', what: 'saw Remus kiss Sera', how: 'wounded' }, { who: 'Remus', over: 'Mira', rival: 'Bran', what: 'x' }, { who: 'Kesh', over: 'Remus', rival: 'Sera', what: 'not here' }],
            romance: [{ one: 'Remus', other: 'Sera', what: 'a kiss by the fire' }],
        }, { resolve, nameOf, present: ['pc', 'mira', 'sera'], bonds, playerId: 'pc', day: 3, turn: 9, newId });
        expect(out.added.map((g) => [g.who, g.kind, g.strength])).toEqual([['mira', 'seen', 3], ['kesh', 'word', 3]]);
        expect(out.word).toEqual([{ who: 'kesh', over: 'pc', rival: 'sera', what: 'Remus and Sera - a kiss by the fire' }]);
        // The same again does not pile up.
        takeHearts(hearts, { jealous: [{ who: 'Mira', over: 'Remus', rival: 'Sera', what: 'again', how: 'stung' }] }, { resolve, nameOf, present: ['mira'], bonds, playerId: 'pc', day: 5, newId });
        expect(hearts.grievances.filter((g) => g.who === 'mira')).toHaveLength(1);
        expect(hearts.grievances.find((g) => g.who === 'mira')).toMatchObject({ strength: 3, day: 5 });
        takeHearts(hearts, { soothed: [{ who: 'Mira' }] }, { resolve });
        expect(hearts.grievances.find((g) => g.who === 'mira').soothed).toBe(true);
        expect(normalizeHearts(JSON.parse(JSON.stringify(hearts)))).toEqual(hearts);
    });

    it('notes a vow of love broken - once, and never for the player character', () => {
        const hearts = emptyHearts();
        const oaths = [
            { id: 'o1', kind: 'oath', text: 'Aldric swore to be faithful to Mira', status: 'broken', madeBy: [{ id: 'aldric', name: 'Aldric' }], madeTo: [{ id: 'mira', name: 'Mira' }] },
            { id: 'o2', kind: 'oath', text: 'Aldric swore to marry Remus', status: 'broken', madeBy: [{ id: 'aldric', name: 'Aldric' }], madeTo: [{ id: 'pc', name: 'Remus' }] },
            { id: 'o3', kind: 'oath', text: 'Aldric swore to guard the gate', status: 'broken', madeBy: [{ id: 'aldric', name: 'Aldric' }], madeTo: [{ id: 'bran', name: 'Bran' }] },
        ];
        expect(noteBrokenVows(hearts, oaths, { day: 2, playerId: 'pc', newId })).toBe(1);
        expect(hearts.grievances[0]).toMatchObject({ who: 'mira', over: 'aldric', kind: 'vow', strength: 3 });
        expect(noteBrokenVows(hearts, oaths, { day: 3, playerId: 'pc', newId })).toBe(0);
        expect(isLive(hearts.grievances[0], 30)).toBe(true);
    });

    it('reads how hard it hit', () => {
        expect(strengthOf('stung')).toBe(1);
        expect(strengthOf('Wounded')).toBe(3);
        expect(strengthOf('furious!')).toBe(3);
        expect(strengthOf('', 2)).toBe(2);
    });
});
