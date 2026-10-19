// New GM ideas are announced - how many, never what (the plan may be veiled).
import { ideasNoticeText } from '../src/ui/status-model.js';
import { normalizeChatDoc } from '../src/store/schema.js';

const withIdeas = (statuses) => {
    const doc = normalizeChatDoc({});
    doc.gm.ideas = statuses.map((status, i) => ({ id: `idea_${i}`, kind: 'quest', name: `Secret plan ${i}`, text: 'A twist', status }));
    return doc;
};

describe('the GM ideas notice', () => {
    it('counts the ideas waiting for an answer', () => {
        expect(ideasNoticeText(withIdeas(['proposed']))).toBe('Scenario Builder: 1 new GM idea to look at - click to open the GM Plan.');
        expect(ideasNoticeText(withIdeas(['proposed', 'accepted', 'proposed', 'dismissed']))).toMatch(/^Scenario Builder: 2 new GM ideas/);
    });
    it('says nothing of what they are, and nothing when none wait', () => {
        expect(ideasNoticeText(withIdeas(['proposed']))).not.toContain('Secret');
        expect(ideasNoticeText(withIdeas(['accepted', 'dismissed']))).toBe('');
        expect(ideasNoticeText(normalizeChatDoc({}))).toBe('');
        expect(ideasNoticeText(null)).toBe('');
    });
});
