import { describe, expect, it } from 'vitest';
import { isSessionExpired } from '../server/services/sessionPolicy';

describe('session expiry policy', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');

    it('expires missing, malformed, and past timestamps', () => {
        expect(isSessionExpired(undefined, now)).toBe(true);
        expect(isSessionExpired('not-a-date', now)).toBe(true);
        expect(isSessionExpired('2026-01-01T11:59:59.999Z', now)).toBe(true);
    });

    it('keeps a session alive before expiry and expires at the boundary', () => {
        const expiry = '2026-01-01T12:00:01.000Z';
        expect(isSessionExpired(expiry, now)).toBe(false);
        expect(isSessionExpired(expiry, now + 1000)).toBe(true);
    });
});
