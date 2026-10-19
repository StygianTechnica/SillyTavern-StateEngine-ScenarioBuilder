// An older SillyTavern tab stops when a newer one opens: it must not save
// its out-of-date settings over the newer tab's work.
import { tabVerdict, blocksSave } from '../src/ui/tab-guard.js';

describe('which tab gives way', () => {
    const me = { id: 'b', at: 2000 };
    it('the older tab, when a newer one announces itself', () => {
        expect(tabVerdict(me, { id: 'c', at: 3000 })).toBe('stale');
    });
    it('the newer tab answers an older one, so it learns', () => {
        expect(tabVerdict(me, { id: 'a', at: 1000 })).toBe('answer');
    });
    it('a tie goes by id, and its own or a garbled message is ignored', () => {
        expect(tabVerdict(me, { id: 'z', at: 2000 })).toBe('stale');
        expect(tabVerdict(me, { id: 'a', at: 2000 })).toBe('answer');
        expect(tabVerdict(me, { id: 'b', at: 9000 })).toBe('ignore');
        expect(tabVerdict(me, { id: 'x' })).toBe('ignore');
        expect(tabVerdict(me, null)).toBe('ignore');
    });
});

describe('what an older tab may not send', () => {
    it("drops SillyTavern's settings saves only", () => {
        expect(blocksSave('/api/settings/save', { method: 'POST' })).toBe(true);
        expect(blocksSave('/api/settings/get', { method: 'POST' })).toBe(false);
        expect(blocksSave('/api/chats/save', { method: 'POST' })).toBe(false);
        expect(blocksSave('/api/settings/save', {})).toBe(false);
    });
});
