import { describe, expect, it } from 'vitest';
import { reconcileOvertime } from '../server/utils/overtimeReconciliation';

describe('overtime reconciliation', () => {
    it('uses attendance when both sources agree', () => {
        expect(reconcileOvertime(90, 90)).toEqual({
            attendanceMinutes: 90,
            approvedManualMinutes: 90,
            reconciledMinutes: 90,
            source: 'ATTENDANCE',
            deltaMinutes: 0,
        });
    });

    it('uses approved manual overtime when it is higher and exposes the discrepancy', () => {
        expect(reconcileOvertime(60, 120)).toMatchObject({
            reconciledMinutes: 120,
            source: 'MANUAL_APPROVED',
            deltaMinutes: 60,
        });
    });

    it('never lets negative input reduce payable overtime', () => {
        expect(reconcileOvertime(-20, 0).reconciledMinutes).toBe(0);
    });
});
