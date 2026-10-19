// /sb-request and /sb-requests (src/ui/slash-commands.js), with the
// SillyTavern-facing modules stood in for.
import { vi } from 'vitest';

const state = { active: true, planner: true, ref: { chatId: 'c1' }, settingId: 's1', gm: null, toasts: [], queued: [] };

vi.mock('../src/settings.js', () => ({ getSettings: () => ({ planner: { enabled: state.planner } }), isActive: () => state.active }));
vi.mock('../src/store/chat-ref.js', () => ({ getCurrentChatRef: () => state.ref, chatKeyFor: () => 'k1' }));
vi.mock('../src/store/chat-store.js', () => ({ getChatDoc: () => ({ gm: state.gm }) }));
vi.mock('../src/library/library.js', () => ({ getBoundSettingId: async () => state.settingId }));
vi.mock('../src/planner/run.js', () => ({
    queueRequest: (chatKey, text, urgency) => { const r = { id: `req_${state.queued.length + 1}`, text, urgency }; state.queued.push({ chatKey, ...r }); return r; },
}));
vi.mock('../src/ui/dom.js', () => ({ toast: (kind, message) => state.toasts.push([kind, message]) }));

const { requestCommand, listCommand } = await import('../src/ui/slash-commands.js');
const { emptyGm, addRequest } = await import('../src/planner/model.js');

beforeEach(() => {
    Object.assign(state, { active: true, planner: true, ref: { chatId: 'c1' }, settingId: 's1', gm: emptyGm(), toasts: [], queued: [] });
});

describe('/sb-request', () => {
    it('queues the request with its urgency and returns its id', async () => {
        expect(await requestCommand({ urgency: 'soon' }, ' a quiet scene by the fire ')).toBe('req_1');
        expect(state.queued).toEqual([{ chatKey: 'k1', id: 'req_1', text: 'a quiet scene by the fire', urgency: 'soon' }]);
        expect(state.toasts[0][0]).toBe('success');
        expect(await requestCommand({}, 'add an NPC')).toBe('req_2');
        expect(state.queued[1].urgency).toBe('whenever');
    });

    it('stays quiet when asked, but still warns', async () => {
        await requestCommand({ quiet: 'true' }, 'something');
        expect(state.toasts).toEqual([]);
        await requestCommand({ quiet: 'true' }, '');
        expect(state.toasts[0][0]).toBe('warning');
    });

    it('queues nothing without text, with a bad urgency, or when it cannot', async () => {
        expect(await requestCommand({}, '   ')).toBe('');
        expect(await requestCommand({ urgency: 'now' }, 'x')).toBe('');
        state.planner = false;
        expect(await requestCommand({}, 'x')).toBe('');
        state.planner = true;
        state.ref = null;
        expect(await requestCommand({}, 'x')).toBe('');
        state.ref = { chatId: 'c1' };
        state.settingId = null;
        expect(await requestCommand({}, 'x')).toBe('');
        expect(state.queued).toEqual([]);
        expect(state.toasts.every(([kind]) => kind === 'warning')).toBe(true);
    });
});

describe('/sb-requests', () => {
    it('lists the open requests, and says when there are none', async () => {
        expect(await listCommand()).toBe('');
        expect(state.toasts[0][0]).toBe('info');
        addRequest(state.gm, { id: 'r1', text: 'a new quest', urgency: 'today' });
        expect(await listCommand()).toBe('- a new quest (today, waiting)');
    });
});
