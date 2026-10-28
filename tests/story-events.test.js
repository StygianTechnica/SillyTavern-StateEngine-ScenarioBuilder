// An event the story had (2026-10-28): the director makes it from the chat,
// and its enrichment wrote a made-up nightclub fight with strangers named
// from the pool - it saw only a title. Now the enrichment is given the chat
// it came from and told to write only what happened, with no names offered.
import { buildGenerationPrompt } from '../src/generate/prompt.js';
import { generateEntry } from '../src/generate/run.js';
import { getObject } from '../src/api/objects.js';
import { enqueueEnrichment } from '../src/generate/enrich.js';

vi.mock('../src/generate/run.js', () => ({ generateEntry: vi.fn(async () => ({ values: { description: 'Cyril threw a fork.' } })) }));
vi.mock('../src/api/objects.js', () => ({ getObject: vi.fn() }));
vi.mock('../src/store/chat-store.js', () => ({ updateChatDoc: vi.fn() }));
vi.mock('../src/store/setting-store.js', () => ({ getEntryMeta: () => ({ generated: [] }) }));
vi.mock('../src/library/library.js', () => ({
    getObjectType: async () => ({ id: 'event', noun: 'event' }),
    getObjectTypes: async () => [],
    listEntries: async () => [],
    updateEntry: vi.fn(async () => true),
    setEntryMeta: vi.fn(),
    mayAddGeneratedDetail: () => true,
}));
vi.mock('../src/library/fields.js', () => ({ baselineFields: async () => [] }));
vi.mock('../src/generate/revert.js', () => ({ recordEnrichment: vi.fn(), enrichmentRecord: () => null }));

const type = { id: 'event', noun: 'event' };
const chat = 'He took a fork from the table and flung it across the café; it struck the man in the poster in the left eye.';
const pool = { people: ['Tholomew Awkinoue', 'Kente Watsuo'], places: ['Oakdale'] };

describe('an event the story had', () => {
    it('is written from the chat it came from, with nothing made up', () => {
        const { user } = buildGenerationPrompt({ task: 'fill', type, fields: [], entry: { name: 'The fork incident', values: {} }, story: chat });
        expect(user).toContain('# What happened in the story (this event is taken from it)');
        expect(user).toContain('struck the man in the poster');
        expect(user).toContain('Write only what happened there');
        expect(user).toContain('invent no names');
    });

    it('also holds for a single field', () => {
        const { user } = buildGenerationPrompt({ task: 'field', targetField: 'description', type, fields: [], entry: { name: 'The fork incident', values: {} }, story: chat });
        expect(user).toContain('Write only what happened there');
    });

    it('changes nothing for an entry without a story', () => {
        const { user } = buildGenerationPrompt({ task: 'fill', type, fields: [], entry: { name: 'The Bleakfast', values: {} }, namePool: pool });
        expect(user).not.toContain('What happened in the story');
        expect(user).toContain('Tholomew Awkinoue');
    });

    it('reaches the generator from the enrichment queue', async () => {
        getObject.mockResolvedValue({ id: 'evt_1', type: 'event', name: 'The fork incident', base: { description: 'The fork incident' } });
        enqueueEnrichment({ settingId: 's', chatId: 'c', chatKey: 'k', objectId: 'evt_1', name: 'The fork incident', story: chat });
        await vi.waitFor(() => expect(generateEntry).toHaveBeenCalled());
        expect(generateEntry.mock.calls[0][0].story).toBe(chat);
    });
});
