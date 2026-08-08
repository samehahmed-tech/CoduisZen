import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayCloseService } from '../server/services/dayCloseService';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('day close idempotency', () => {
    it('returns the immutable existing snapshot before checking the advanced business date', async () => {
        const existing = {
            branchId: 'branch-1',
            date: '2026-07-27',
            status: 'CLOSED',
            closedSnapshot: { orders: { total: 3 } },
        };
        vi.spyOn(dayCloseService, 'getClosedReport').mockResolvedValue(existing as any);

        const result = await dayCloseService.closeDay(
            'branch-1',
            '2026-07-27',
            'user-1',
            { enforceShiftsClosed: true },
        );

        expect(result).toBe(existing);
        expect(dayCloseService.getClosedReport).toHaveBeenCalledTimes(1);
    });
});
