// Assassins Inc: on a swipe the director made "the street outside Signal Box
// HQ" (a swipe moves nothing), and the check after the reply took its
// "Street outside White Cerberus Headquarters" as a second, unconfirmed
// street - and moved the scene there, out of reach of a merge.
import { vi } from 'vitest';

const post = { is_user: true, mes: 'Cyril stepped out into the street outside the Signal Box.', send_date: '2026-11-06T20:50:08.042Z' };
globalThis.SillyTavern = { getContext: () => ({ chat: [post, { is_user: false, mes: 'Zane emerged…', send_date: '2026-11-06T21:03:42.649Z' }], eventSource: { on: vi.fn() }, eventTypes: {} }) };
const { directorMadeNow } = await import('../src/validate/reconcile.js');

const street = { id: 'loc_st', name: 'the street outside Signal Box HQ', createdAt: Date.parse('2026-11-06T21:03:35.319Z'), meta: { origin: 'director' } };
const old = { id: 'loc_club', name: 'The Club', createdAt: Date.parse('2026-11-05T22:34:09.679Z'), meta: { origin: 'director' } };
const mine = { id: 'loc_m', name: 'Museum', createdAt: Date.parse('2026-11-06T21:00:00Z'), meta: { origin: 'user' } };

describe('the place the director made for this post', () => {
    it('is the one the reply tells of', () => {
        expect(directorMadeNow([street, old, mine])?.id).toBe('loc_st');
    });
    it('not when it made none, or more than one', () => {
        expect(directorMadeNow([old, mine])).toBeNull();
        expect(directorMadeNow([street, { ...street, id: 'loc_2' }])).toBeNull();
    });
});
