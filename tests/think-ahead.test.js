// Thinking ahead: a briefing written right after an AI reply is used for the
// player's next message only while that reply is still the latest,
// unchanged - and its prompt never pretends to know that message.
import { replyKeyOf, canUseAhead, shouldThinkAhead } from '../src/director/ahead.js';
import { buildDirectorPrompt } from '../src/director/prompt.js';
import { normalizeChatDoc } from '../src/store/schema.js';

const reply = { name: 'God War', mes: 'Graxx nods and hands Remus the map.', send_date: '2026-10-19T19:00:00Z' };
const user = { name: 'Remus Watt', mes: 'Remus studies the map.', is_user: true, send_date: '2026-10-19T19:01:00Z' };
const chat = [{ ...user, mes: 'Earlier.' }, reply];

describe('when to write ahead', () => {
    it('after an AI reply, once, with the setting on', () => {
        expect(shouldThinkAhead(null, chat, { enabled: true })).toBe(true);
        expect(shouldThinkAhead({ after: replyKeyOf(chat), raw: 'x' }, chat, { enabled: true })).toBe(false);
        expect(shouldThinkAhead(null, chat, { enabled: false })).toBe(false);
        expect(shouldThinkAhead(null, [...chat, user], { enabled: true })).toBe(false);
    });
});

describe('when a briefing written ahead is used', () => {
    const ahead = { after: replyKeyOf(chat), raw: 'The briefing.\nTIME | 5 minutes' };

    it('for the next message, the player\'s message just sent or not', () => {
        expect(canUseAhead(ahead, replyKeyOf(chat), { enabled: true, type: 'normal' })).toBe(true);
        expect(canUseAhead(ahead, replyKeyOf([...chat, user]), { enabled: true, type: 'normal' })).toBe(true);
    });

    it('never after the reply was edited or swiped, for a swipe, or with the setting off', () => {
        expect(canUseAhead(ahead, replyKeyOf([chat[0], { ...reply, mes: 'Graxx refuses.' }]), { enabled: true })).toBe(false);
        expect(canUseAhead(ahead, replyKeyOf([chat[0], { ...reply, send_date: 'later' }]), { enabled: true })).toBe(false);
        expect(canUseAhead(ahead, replyKeyOf(chat), { enabled: true, type: 'swipe' })).toBe(false);
        expect(canUseAhead(ahead, replyKeyOf(chat), { enabled: false })).toBe(false);
        expect(canUseAhead(null, replyKeyOf(chat), { enabled: true })).toBe(false);
    });

    it('is kept with the briefing record', () => {
        expect(normalizeChatDoc({ director: { note: 'n', ahead } }).director.ahead).toEqual({ after: ahead.after, raw: ahead.raw, at: '' });
        expect(normalizeChatDoc({ director: { note: 'n' } }).director.ahead).toBeNull();
    });
});

describe('the briefing written ahead', () => {
    const input = { cast: [{ name: 'Remus', player: true }, { name: 'Graxx' }], messages: [{ name: 'God War', text: reply.mes }] };

    it('says the player\'s next message is not known, and never to guess it', () => {
        const { system, prompt } = buildDirectorPrompt({ ...input, ahead: true });
        expect(system).toContain("You are writing ahead: Remus's next message is not known yet. Never assume or guess what Remus will say or do");
        expect(prompt).toContain("where things stand as Remus's turn comes");
    });

    it('the ordinary one is as before', () => {
        const { system, prompt } = buildDirectorPrompt(input);
        expect(system).not.toContain('writing ahead');
        expect(prompt).toContain('where things stand now that Remus has spoken');
    });
});
