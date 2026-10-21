import { vi } from 'vitest';
import { normalizeChatDoc } from '../src/store/schema.js';

const state = { doc: null };
vi.mock('../src/store/chat-store.js', () => ({
    getChatDoc: () => structuredClone(state.doc),
    updateChatDoc: (_key, mutate) => { mutate(state.doc); state.doc = normalizeChatDoc(state.doc); return structuredClone(state.doc); },
}));
vi.mock('../src/api/objects.js', () => ({ markObjectPresent: vi.fn(), markObjectAbsent: vi.fn(), getObject: vi.fn() }));

const { setCanonical } = await import('../src/state/canonical.js');

const fresh = () => normalizeChatDoc({ canonical: { castIds: ['chr_remus'] }, dead: [{ id: 'chr_aldric', name: 'Lord Aldric', how: 'slain' }] });

describe('the dead stay dead', () => {
    it('never come back by the director, the story or the review', () => {
        for (const source of ['director', 'validation', 'review']) {
            state.doc = fresh();
            setCanonical('k', { castIds: ['chr_remus', 'chr_aldric', 'chr_varyn'] }, { source });
            expect(state.doc.canonical.castIds).toEqual(['chr_remus', 'chr_varyn']);
            expect(state.doc.dead.map((d) => d.id)).toEqual(['chr_aldric']);
        }
    });

    it('come back when the user brings them in by hand', () => {
        state.doc = fresh();
        setCanonical('k', { castIds: ['chr_remus', 'chr_aldric'] }, { source: 'user' });
        expect(state.doc.canonical.castIds).toEqual(['chr_remus', 'chr_aldric']);
        expect(state.doc.dead).toEqual([]);
    });
});
