// A seed or hook nothing has come of - no goal, no steps, nobody taking it
// up - is no quest yet: a passing remark Archivist noted stays a note.
import { idleSeed } from '../src/quests/model.js';

const seed = (over = {}) => ({ id: 't25', kind: 'quest seed', title: 'Zane\'s Cooking Style', text: 'Galice mentioned Zane has an interesting, possibly aggressive cooking style.', status: 'open', goal: '', steps: [], entity: null, ...over });

describe('idleSeed', () => {
    it('a passing remark waits', () => {
        expect(idleSeed(seed())).toBe(true);
        expect(idleSeed(seed({ kind: 'plot hook' }))).toBe(true);
        expect(idleSeed(seed({ status: '' }))).toBe(true);
    });

    it('becomes a quest once it has a goal, a step, or someone takes it up', () => {
        expect(idleSeed(seed({ goal: 'Learn Zane\'s recipe' }))).toBe(false);
        expect(idleSeed(seed({ steps: [{ text: 'Get in touch with Zane', status: 'active' }] }))).toBe(false);
        expect(idleSeed(seed({ status: 'active' }))).toBe(false);
    });

    it('an empty step is no step', () => {
        expect(idleSeed(seed({ steps: [{ text: ' ' }] }))).toBe(true);
    });

    it('leaves every other kind, finished threads and linked quests alone', () => {
        expect(idleSeed(seed({ kind: 'quest' }))).toBe(false);
        expect(idleSeed(seed({ kind: 'mission' }))).toBe(false);
        expect(idleSeed(seed({ status: 'resolved' }))).toBe(false);
        expect(idleSeed(seed({ entity: { type: 'quest', id: 'qst_1' } }))).toBe(false);
    });
});
