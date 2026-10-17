import { vi } from 'vitest';

const state = { doc: null, calls: [] };
vi.mock('../src/store/chat-store.js', () => ({ getChatDoc: () => structuredClone(state.doc), updateChatDoc: vi.fn() }));
vi.mock('../src/state/canonical.js', () => ({ setCanonical: (chatKey, patch, info) => { state.calls.push({ patch, info }); return { patch }; } }));
vi.mock('../src/settings.js', () => ({ getSettings: () => ({}) }));
vi.mock('../src/store/setting-store.js', () => ({ getSettingDoc: vi.fn(), updateSettingDoc: vi.fn() }));
vi.mock('../src/library/library.js', () => ({}));
vi.mock('../src/generate/enrich.js', () => ({ enqueueEnrichment: vi.fn() }));

const { sceneArrivals } = await import('../src/library/intake.js');

const docWith = (canonical, held = []) => ({ canonical: { castIds: [], creatureIds: [], ...canonical }, held, turn: 5 });

describe('things detected in the story join the scene', () => {
    beforeEach(() => { state.calls = []; });

    it('adds a newly taken-in creature to the scene', () => {
        state.doc = docWith({ creatureIds: ['rats'] });
        sceneArrivals('c', 'k', { creatureIds: ['zombies'] }, new Map([['zombies', 'Zombies']]));
        expect(state.calls).toHaveLength(1);
        expect(state.calls[0].patch).toEqual({ creatureIds: ['rats', 'zombies'] });
        expect(state.calls[0].info.note).toBe('Detected in the story, now in the scene: Zombies');
    });

    it('leaves out what the user took out by hand, and what is already there', () => {
        state.doc = docWith({ creatureIds: ['rats'] }, [{ field: 'creatures', op: 'remove', objectId: 'zombies', until: 8 }]);
        expect(sceneArrivals('c', 'k', { creatureIds: ['zombies', 'rats'] })).toBeNull();
        expect(state.calls).toHaveLength(0);
    });
});
