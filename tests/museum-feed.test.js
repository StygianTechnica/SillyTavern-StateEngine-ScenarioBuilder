// Assassins Inc, message 729: Cyril took over the museum's cameras to find
// the crew and Inji. Inji, "he" for 700 messages, came back "she"; Tadam Chi,
// held at gunpoint, was told "not in this scene"; and the narrator wrote
// Cyril talking, deciding and setting off.
import { pronounSlips, fixPronounsIn } from '../src/guidance/canon.js';
import { buildNow, looksThrough } from '../src/guidance/build.js';
import { elsewhereNow } from '../src/guidance/spoken.js';

const inji = { name: 'Inji Miyama', aliases: ['Inji'], gender: 'm' };
const others = ['Cyril', 'Zane', 'Enrique Medina', 'Doc', 'Inji Miyama'];
const rest = [{ name: 'Cyril', gender: 'm' }, { name: 'Zane', gender: 'm' }, { name: 'Enrique Medina', gender: 'm' }, { name: 'Doc', gender: 'f' }];
const reply729 = `"Ah, there," he murmurs, pointing at a screen showing the alcove where he instructed Inji to head. Sure enough, she's visible - but not alone. Two figures in dark clothing, likely Enrique's men, are closing in on her from either side, flanking her position.*`;
const post728 = 'He went to the console and promptly used his implant to take over the surveillance feed and pinpoint the rest of the invading crew (and hopefully Inji as well). He was hoping that Inji had found them by now.';

describe('a he or she with no one else it could be', () => {
    it('is seen when the name is not at the start', () => {
        expect(pronounSlips([inji], reply729, { others })).toEqual([{ name: 'Inji Miyama', gender: 'm' }]);
    });
    it('is seen through the narrator\'s asterisks', () => {
        expect(pronounSlips([inji], '*Inji nodded, her jaw tight.*', { others })).toHaveLength(1);
    });
    it('is put right, and the sentence after it', () => {
        expect(fixPronounsIn(reply729, inji, rest).text).toBe(`"Ah, there," he murmurs, pointing at a screen showing the alcove where he instructed Inji to head. Sure enough, he's visible - but not alone. Two figures in dark clothing, likely Enrique's men, are closing in on him from either side, flanking his position.*`);
    });
    it('is left alone when it could be someone else', () => {
        for (const t of ['Doc looked at Inji. She sighed.', 'She eyed Inji. She sighed.', 'The guard saw Inji. She sighed.', 'A woman stood by Inji. She sighed.', 'Cyril glanced at Inji. Doc frowned, and she sighed.']) {
            expect(pronounSlips([inji], t, { others })).toEqual([]);
            expect(fixPronounsIn(t, inji, rest).count).toBe(0);
        }
    });
    it('works the other way, in another genre', () => {
        const maelis = { name: 'Maelis', gender: 'f' };
        expect(fixPronounsIn('The rider bowed to no one. Word came of Maelis. His ship was late.', maelis, []).text).toBe('The rider bowed to no one. Word came of Maelis. Her ship was late.');
    });
});

describe('a wrong pronoun after the name, partway through a sentence', () => {
    const delvin = 'Delvin';
    const people = [inji, { name: 'Cyril', gender: 'm', player: true }, { name: delvin, gender: 'm' }];
    const names = [...others, delvin];
    const everyone = [...rest, { name: delvin, gender: 'm' }];
    const first = "*Suddenly, a soft chime rings out from Cyril's implant, signaling Inji's confirmation of her position near Delvin.";
    const second = 'Cyril adjusts his course, weaving through a maze of display cases until he spots Inji crouched beside a large wooden cabinet, her rifle trained on the thief.*';
    it('is seen in the real post', () => {
        for (const t of [first, second]) expect(pronounSlips(people, t, { others: names })).toEqual([{ name: 'Inji Miyama', gender: 'm' }]);
    });
    it('is put right, and nothing else in the sentence', () => {
        expect(fixPronounsIn(`${first} ${second}`, inji, everyone).text).toBe("*Suddenly, a soft chime rings out from Cyril's implant, signaling Inji's confirmation of his position near Delvin. Cyril adjusts his course, weaving through a maze of display cases until he spots Inji crouched beside a large wooden cabinet, his rifle trained on the thief.*");
    });
    it('is left alone when it could be someone else', () => {
        const withVex = [...people, { name: 'Vex', gender: 'f' }];
        const fellows = [...everyone, { name: 'Vex', gender: 'f' }];
        const allNames = [...names, 'Vex'];
        for (const t of [
            "Cyril watched Inji's hand find her shoulder.",
            'Cyril saw Inji hold Vex close, her eyes wet.',
            'Vex scowled. Cyril saw Inji turn away, her jaw tight.',
            'Cyril saw Inji help a woman up, her coat torn.',
            'Cyril heard Inji say "of her own free will, she left".',
        ]) {
            expect(pronounSlips(withVex, t, { others: allNames })).toEqual([]);
            expect(fixPronounsIn(t, inji, fellows).count).toBe(0);
        }
    });
    it('works the other way, in other genres', () => {
        const maelis = { name: 'Maelis', gender: 'f' };
        const t = 'The captain found Maelis on the rampart, his sword drawn.';
        expect(pronounSlips([maelis], t, { others: ['Maelis'] })).toHaveLength(1);
        expect(fixPronounsIn(t, maelis, []).text).toBe('The captain found Maelis on the rampart, her sword drawn.');
        const reyes = { name: 'Reyes', gender: 'f' };
        expect(fixPronounsIn('The alarm woke Reyes as he reached engineering.', reyes, []).text).toBe('The alarm woke Reyes as she reached engineering.');
        const dana = { name: 'Dana', gender: 'm' };
        expect(fixPronounsIn('He phoned Dana, who locked the diner by herself.', dana, []).text).toBe('He phoned Dana, who locked the diner by himself.');
    });
});

describe('the note nearest the reply', () => {
    const cast = [{ name: 'Cyril', player: true, gender: 'm' }, { name: 'Inji Miyama', gender: 'm' }, { name: 'Doc', gender: 'f' }];
    it('says he or she for those the post names, only them', () => {
        const note = buildNow({ cast, playerPost: 'He was hoping that Inji had found them.' });
        expect(note).toContain('Inji Miyama is he / him.');
        expect(note).not.toContain('Doc is');
        expect(buildNow({ cast, playerPost: 'He sat down.' })).toBe('');
    });
    it('reports what the viewer shows and leaves the player alone', () => {
        const note = buildNow({ cast, playerPost: post728 });
        expect(note).toContain("Cyril is looking at the surveillance feed: the reply says what it shows and stops there. Cyril only looks in this reply - no words, decisions or moves of Cyril's");
    });
    it('knows a viewer across genres, and not a plain look', () => {
        expect(looksThrough('Kiri peered into the scrying mirror for any sign of them.')).toBe('scrying mirror');
        expect(looksThrough('The captain checked the long-range sensors.')).toBe('sensors');
        expect(looksThrough('Dana pulled up the security cameras on her laptop.')).toBe('security cameras');
        expect(looksThrough('He looked at Zane and shrugged.')).toBe('');
        expect(looksThrough('"Check the feed," he said.')).toBe('');
    });
});

describe('face to face in the last reply', () => {
    const people = [{ id: 'cy', name: 'Cyril' }, { id: 'ta', name: 'Tadam Chi' }, { id: 'in', name: 'Inji Miyama' }];
    it('is not elsewhere', () => {
        const lastReply = "*Tadam Chi's eyes dart between Cyril and Zane, weighing their options.*";
        expect(elsewhereNow(people, { lastReply, playerPost: 'Zane, lock him down.', here: ['cy'], skip: ['cy'], player: 'Cyril' })).toEqual([]);
    });
    it('but one left behind is', () => {
        const lastReply = 'Inji watched Cyril storm out of the room.';
        expect(elsewhereNow(people, { lastReply, here: ['cy'], skip: ['cy'], player: 'Cyril' })).toEqual(['Inji Miyama']);
    });
});
