import { curatorStatus, curatorLine, presetLine, sceneLine, noticeText } from '../src/ui/status-model.js';
import { normalizeChatDoc, normalizeSettingDoc, emptyChatDoc } from '../src/store/schema.js';

describe('drawer status', () => {
    it('reads Curator\'s injection switches', () => {
        expect(curatorStatus({})).toEqual({ installed: false, guidance: null, stateBlock: null });
        const status = curatorStatus({ curator: { variableInjections: { sb__guidance: { enabled: true } } } });
        expect(status).toEqual({ installed: true, guidance: true, stateBlock: false });
        expect(curatorLine({ installed: true, guidance: false }, true).warn).toBe(true);
    });

    it('hints when Scene Context is also active (SB-205)', () => {
        expect(presetLine({ exists: true, active: true, sceneContextActive: true }, true).hint).toContain('Scene Context is not needed');
        expect(presetLine({ exists: true, active: false, sceneContextActive: true }, true).warn).toBe(true);
        expect(presetLine({ exists: false, active: false }, true).text).toContain('missing');
    });

    it('summarises the scene', () => {
        expect(sceneLine({ locationName: 'Market', time: 'day 2, night', weather: ['Rainy'], pending: 1 })).toBe('Market · day 2, night · Rainy · 1 to review');
        expect(sceneLine({})).toBe('No location set');
    });
});

describe('review notification', () => {
    it('counts new entries and questions, and is empty with nothing to review', () => {
        const doc = { adopted: [{ enrich: 'done' }, { enrich: 'queued' }], drift: [{ status: 'pending' }, { status: 'resolved' }], candidates: [] };
        expect(noticeText(doc)).toBe('Scenario Builder: 2 new entries in the setting (detail added), 1 question about the scene - click to review.');
        expect(noticeText({ adopted: [], drift: [], candidates: [] })).toBe('');
    });
});

describe('stored documents', () => {
    it('normalizes junk into the current shape', () => {
        const doc = normalizeChatDoc({ canonical: { weather: ['Rainy', 'Lava'], temperature: 'Boiling', day: -3 }, history: 'x' });
        expect(doc.canonical.weather).toEqual(['Rainy']);
        expect(doc.canonical.temperature).toBe('');
        expect(doc.canonical.day).toBe(1);
        expect(doc.history).toEqual([]);
        expect(normalizeChatDoc(null)).toEqual(emptyChatDoc());
        const setting = normalizeSettingDoc({ entries: { loc_1: { parentId: 'loc_2', tags: ['a', 'a', 3] } } });
        expect(setting.entries.loc_1).toMatchObject({ parentId: 'loc_2', tags: ['a'], pinned: false });
    });
});
