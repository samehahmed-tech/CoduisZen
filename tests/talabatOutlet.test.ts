import { describe, it, expect } from 'vitest';
import {
    buildOutletBody,
    busyMinutesToClosedUntil,
} from '../server/modules/talabat/talabatOutletService';

describe('talabat outlet', () => {
    it('builds OPEN body without reason', () => {
        expect(buildOutletBody({ status: 'OPEN' })).toEqual({ ok: true, body: { status: 'OPEN' } });
    });

    it('requires closed_until for CLOSED_UNTIL', () => {
        expect(buildOutletBody({ status: 'CLOSED_UNTIL' } as any)).toEqual({ ok: false, code: 'OUTLET_UNTIL_REQUIRED' });
        const r = buildOutletBody({ status: 'CLOSED_UNTIL', closed_reason: 'TOO_BUSY_KITCHEN', closed_until: '2024-09-30T10:00:36Z' });
        expect(r).toEqual({ ok: true, body: { status: 'CLOSED_UNTIL', closed_reason: 'TOO_BUSY_KITCHEN', closed_until: '2024-09-30T10:00:36.000Z' } });
    });

    it('rejects unknown status and reason', () => {
        expect(buildOutletBody({ status: 'NAP' } as any)).toEqual({ ok: false, code: 'OUTLET_STATUS_INVALID' });
        expect(buildOutletBody({ status: 'CLOSED_TODAY', closed_reason: 'LAZY' } as any)).toEqual({ ok: false, code: 'OUTLET_REASON_INVALID' });
    });

    it('converts busy minutes to UTC ISO', () => {
        const iso = busyMinutesToClosedUntil(30, new Date('2024-09-30T10:00:00Z'));
        expect(iso).toBe('2024-09-30T10:30:00.000Z');
    });
});
