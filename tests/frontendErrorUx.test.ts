import { describe, expect, it } from 'vitest';
import { getActionableErrorMessage } from '../services/api/core';

describe('frontend error UX mapping', () => {
    it('maps conflict code to actionable arabic guidance', () => {
        const message = getActionableErrorMessage({ code: 'ORDER_VERSION_CONFLICT' }, 'ar');
        expect(message).toContain('تم تعديله');
    });

    it('maps permission code to actionable english guidance', () => {
        const message = getActionableErrorMessage({ code: 'FORBIDDEN' }, 'en');
        expect(message).toContain('permission');
    });

    it('maps missing customer references to order recovery guidance', () => {
        const message = getActionableErrorMessage({ code: 'INVALID_CUSTOMER_REFERENCE' }, 'en');
        expect(message).toContain('Select/save the customer');
    });

    it('maps stale shift references to actionable guidance', () => {
        const branchMessage = getActionableErrorMessage({ code: 'INVALID_SHIFT_BRANCH' }, 'en');
        const closedMessage = getActionableErrorMessage({ code: 'SHIFT_CLOSED' }, 'ar');

        expect(branchMessage).toContain('different branch');
        expect(closedMessage).toContain('شيفت جديد');
    });

    it('maps database query failures without leaking SQL details', () => {
        const message = getActionableErrorMessage({ code: 'DATABASE_QUERY_FAILED' }, 'en');
        expect(message).toContain('related data is inconsistent');
        expect(message).not.toContain('Failed query');
    });

    it('maps unsupported report exports to actionable guidance', () => {
        const message = getActionableErrorMessage({ code: 'UNSUPPORTED_REPORT_EXPORT' }, 'ar');
        expect(message).toContain('CSV/Excel');
        expect(message).toContain('PDF');
    });

    it('falls back to original message when code is unknown', () => {
        const message = getActionableErrorMessage({ code: 'SOME_UNKNOWN', message: 'Custom failure' }, 'en');
        expect(message).toBe('Custom failure');
    });
});
