import { describe, expect, it } from 'vitest';
import { ETA_DEAD_LETTER_LEASE_MS, isEtaDeadLetterLeaseExpired } from '../server/utils/etaDeadLetterPolicy';

describe('ETA dead-letter lease policy', () => {
    it('detects stale claims without expiring fresh ones', () => {
        const now = Date.parse('2026-01-01T00:00:00.000Z');
        expect(isEtaDeadLetterLeaseExpired(null, now)).toBe(true);
        expect(isEtaDeadLetterLeaseExpired(new Date(now - ETA_DEAD_LETTER_LEASE_MS - 1), now)).toBe(true);
        expect(isEtaDeadLetterLeaseExpired(new Date(now - ETA_DEAD_LETTER_LEASE_MS + 1), now)).toBe(false);
    });
});
