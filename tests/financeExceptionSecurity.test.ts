import { describe, expect, it } from 'vitest';
import { canAccessFinanceException, canRetryFinanceExceptionStatus, sanitizeFinanceException } from '../server/utils/financeExceptionSecurity';

describe('finance exception security', () => {
    it('requires exact branch ownership unless caller is SUPER_ADMIN', () => {
        expect(canAccessFinanceException({ effectiveBranchId: 'b1', exceptionBranchId: 'b1', role: 'ACCOUNTANT' })).toBe(true);
        expect(canAccessFinanceException({ effectiveBranchId: 'b1', exceptionBranchId: 'b2', role: 'ACCOUNTANT' })).toBe(false);
        expect(canAccessFinanceException({ effectiveBranchId: 'b1', exceptionBranchId: undefined, role: 'ACCOUNTANT' })).toBe(false);
        expect(canAccessFinanceException({ effectiveBranchId: undefined, exceptionBranchId: 'b2', role: 'SUPER_ADMIN' })).toBe(true);
    });

    it('removes the original journal payload from operator list responses', () => {
        const safe = sanitizeFinanceException({ id: 'e1', branchId: 'b1', payload: { account: 'secret' }, reason: 'NO_OPEN_PERIOD' });
        expect(safe).toMatchObject({ id: 'e1', branchId: 'b1', reason: 'NO_OPEN_PERIOD' });
        expect(safe).not.toHaveProperty('payload');
    });

    it('allows manual retry only from retryable states', () => {
        expect(canRetryFinanceExceptionStatus('PENDING')).toBe(true);
        expect(canRetryFinanceExceptionStatus('DEAD_LETTER')).toBe(true);
        expect(canRetryFinanceExceptionStatus('PROCESSING')).toBe(false);
        expect(canRetryFinanceExceptionStatus('RESOLVED')).toBe(false);
    });
});
