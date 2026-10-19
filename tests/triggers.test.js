// Story triggers: a condition watched through a State Engine variable (a
// prompted flag, or a calculated check on the canonical scene), and what it
// sets off - told to the game master once, for the reply it fired on.
import { triggerVariableDef, firedTriggers, triggerLines, normalizeTrigger, triggerPresetName, triggerVariableName, sameWhen } from '../src/triggers/model.js';
import { normalizeGm, triggerSection } from '../src/planner/model.js';
import { readOutline } from '../src/planner/prompts.js';

const tomb = { id: 'trg1', kind: 'story', when: "Remus opens his predecessor's tomb", then: 'the corrupted champion rises and attacks', status: 'armed', variable: 'trg_x_trg1' };

describe('watching a condition', () => {
    it('a story condition is a prompted flag that stays true once set', () => {
        const def = triggerVariableDef(tomb);
        expect(def).toMatchObject({ type: 'boolean', flagMode: true, behaviors: { prompted: true }, scope: 'chat', showInTracker: false });
        expect(def.prompted.instructions).toMatch(/true once the story has SHOWN this happen: Remus opens his predecessor's tomb\. Not when it is only planned/);
    });

    it('a place or a person is a calculated check on the canonical scene', () => {
        expect(triggerVariableDef({ kind: 'place', target: 'loc_bridge', when: 'x' })).toMatchObject({ type: 'calculated', dependencies: ['sb__canon_location'], expression: 'sb__canon_location == "loc_bridge"' });
        expect(triggerVariableDef({ kind: 'person', target: 'chr_maziel', when: 'x' })).toMatchObject({ type: 'calculated', dependencies: ['sb__canon_characters'], expression: 'sb__canon_characters.contains("chr_maziel")' });
        expect(triggerVariableDef({ kind: 'day', day: 5 })).toBeNull();
    });

    it('fires on a true flag, a met check or the day reached - only while armed', () => {
        const day = { id: 'trg2', kind: 'day', day: 5, then: 'the horde reaches Redhaven', status: 'armed' };
        const place = { id: 'trg3', kind: 'place', target: 'loc_bridge', then: 'trolls', status: 'armed', variable: 'trg_x_trg3' };
        expect(firedTriggers([tomb, day, place], { values: { trg_x_trg1: 'true', trg_x_trg3: 0 }, day: 4 })).toEqual(['trg1']);
        expect(firedTriggers([tomb, day, place], { values: { trg_x_trg3: 1 }, day: 5 })).toEqual(['trg2', 'trg3']);
        expect(firedTriggers([{ ...tomb, status: 'fired' }], { values: { trg_x_trg1: true } })).toEqual([]);
    });
});

describe('what it sets off', () => {
    it('is told to the game master for the reply it fired on - again on a swipe, not the next turn', () => {
        const fired = normalizeTrigger({ ...tomb, status: 'fired' });
        expect(triggerLines([fired], 12)[0]).toMatch(/^- Now, because Remus opens his predecessor's tomb: the corrupted champion rises and attacks - make it happen/);
        expect(triggerLines([{ ...fired, shownFor: 12 }], 12)).toHaveLength(1);
        expect(triggerLines([{ ...fired, shownFor: 12 }], 14)).toHaveLength(0);
        expect(triggerSection(normalizeGm({ triggers: [fired] }), 12)).toMatch(/^TRIGGERED \(private/);
        expect(triggerSection(normalizeGm({}), 12)).toBe('');
    });
});

describe('the bookkeeping', () => {
    it('each chat has its own preset, and each trigger its own variable name', () => {
        expect(triggerPresetName('chat-a')).not.toBe(triggerPresetName('chat-b'));
        expect(triggerVariableName('chat-a', 'trg_9k2')).toMatch(/^trg_[a-z0-9]+_trg9k2$/);
    });

    it('the outline may ask for at most three', () => {
        const parsed = readOutline({ acts: [{ title: 'A', beats: [{ text: 'x' }] }], triggers: [{ when: 'a', then: 'b' }, { when: 'c', then: 'd' }, { when: 'e', then: 'f' }, { when: 'g', then: 'h' }, { when: 'no then' }] });
        expect(parsed.triggers).toHaveLength(3);
    });

    it('knows the same condition in other words', () => {
        expect(sameWhen("Remus opens his predecessor's tomb", "Remus finally opens the tomb of his predecessor")).toBe(true);
        expect(sameWhen("Remus opens his predecessor's tomb", 'Maziel attacks them at the exit')).toBe(false);
    });
});
