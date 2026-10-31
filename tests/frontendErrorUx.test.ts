import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, getActionableErrorMessage } from '../services/api/core';
import { getOfflineCapabilityCopy } from '../components/common/OnlineStatus';

describe('frontend error UX mapping', () => {
    afterEach(() => vi.unstubAllGlobals());

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

    it('explains malformed split payment payloads', () => {
        expect(getActionableErrorMessage({ code: 'OFFLINE_NON_CASH_PAYMENT_UNSUPPORTED' }, 'ar'))
            .toContain('الدفع المتعدد');
        expect(getActionableErrorMessage({ code: 'OFFLINE_NON_CASH_PAYMENT_UNSUPPORTED' }, 'en'))
            .toContain('Split payment');
    });

    it('does not imply success when a payment or day-close mutation loses the connection', () => {
        expect(getActionableErrorMessage({ code: 'NETWORK_UNAVAILABLE' }, 'ar'))
            .toContain('لم يتم تأكيد العملية');
        expect(getActionableErrorMessage({ code: 'SERVER_DRAINING' }, 'en'))
            .toContain('operation was not confirmed');
    });

    it('does not auto-retry an ambiguous mutation after a transport failure', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(apiRequest('/payments/sessions/initiate', {
            method: 'POST',
            body: JSON.stringify({ orderId: 'order-1' }),
        })).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE', status: 503 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('surfaces server draining without replaying a mutation', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({ code: 'SERVER_DRAINING', message: 'Server is restarting safely.' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(apiRequest('/day-close/branch-a/2026-10-28/close', {
            method: 'POST',
            body: '{}',
        })).rejects.toMatchObject({ code: 'SERVER_DRAINING', status: 503 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('explains every offline operating limitation in Arabic and English', () => {
        const ar = getOfflineCapabilityCopy('ar');
        const en = getOfflineCapabilityCopy('en');

        expect(ar.capabilities).toHaveLength(4);
        expect(en.capabilities).toHaveLength(4);
        expect(ar.capabilities.join(' ')).toContain('النقد فقط');
        expect(en.capabilities.join(' ')).toContain('cash only');
        expect(en.capabilities.join(' ')).toContain('local bridge');
        expect(ar.capabilities.join(' ')).toContain('مركز تعارضات المزامنة');
    });

    it('falls back to original message when code is unknown', () => {
        const message = getActionableErrorMessage({ code: 'SOME_UNKNOWN', message: 'Custom failure' }, 'en');
        expect(message).toBe('Custom failure');
    });
});
