import { vi } from 'vitest';
import { normalizeChatDoc } from '../src/store/schema.js';

const state = { doc: null, values: {}, ran: [], slow: false };
vi.mock('../src/store/chat-store.js', () => ({
    getChatDoc: () => structuredClone(state.doc),
    updateChatDoc: (_key, mutate) => { mutate(state.doc); state.doc = normalizeChatDoc(state.doc); return structuredClone(state.doc); },
}));
vi.mock('../src/api/presets.js', () => ({
    findPreset: vi.fn(), createPreset: vi.fn(), activatePreset: vi.fn(),
    runPreset: (chatId, name) => {
        state.ran.push(name);
        // The flag is answered while the preset runs.
        return state.slow ? new Promise(() => {}) : Promise.resolve().then(() => { state.values.trg_flag = true; });
    },
}));
vi.mock('../src/api/variables.js', () => ({ createVariable: vi.fn(), deleteVariable: vi.fn(), getVariableValues: async (_c, names) => Object.fromEntries(names.filter((n) => n in state.values).map((n) => [n, state.values[n]])) }));

const { checkTriggersOnMessage } = await import('../src/triggers/run.js');

const armed = { id: 't1', kind: 'story', when: 'Remus opens the sarcophagus', then: 'the champion rises', variable: 'trg_flag', status: 'armed', source: 'planner' };

describe("story triggers checked against the player's message", () => {
    beforeEach(() => { state.values = {}; state.ran = []; state.slow = false; });

    it('runs the chat\'s trigger preset, waits for it, and fires what the message met', async () => {
        state.doc = normalizeChatDoc({ gm: { triggers: [armed] } });
        const fired = await checkTriggersOnMessage('chat', 'key');
        expect(state.ran).toHaveLength(1);
        expect(fired.map((t) => t.id)).toEqual(['t1']);
        expect(state.doc.gm.triggers[0].status).toBe('fired');
    });

    it('makes no call when nothing is armed', async () => {
        state.doc = normalizeChatDoc({ gm: { triggers: [{ ...armed, status: 'done' }] } });
        expect(await checkTriggersOnMessage('chat', 'key')).toEqual([]);
        expect(state.ran).toHaveLength(0);
    });

    it('never holds the reply longer than it may', async () => {
        state.slow = true;
        state.doc = normalizeChatDoc({ gm: { triggers: [armed] } });
        const started = Date.now();
        expect(await checkTriggersOnMessage('chat', 'key', { waitMs: 50 })).toEqual([]);
        expect(Date.now() - started).toBeLessThan(1000);
    });
});
