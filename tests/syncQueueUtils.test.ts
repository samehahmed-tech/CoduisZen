import { describe, it, expect } from 'vitest';
import { assertOfflinePaymentPolicy, assertSupportedSyncOperation, buildDedupeKey, classifySyncError, computeNextAttempt, isSyncLockStale, mergeConflictPayload } from '../src/services/syncQueueUtils';

describe('syncQueueUtils', () => {
    it('builds stable dedupe keys with ids', () => {
        const key = buildDedupeKey('order', 'CREATE', { id: 'o-1' });
        expect(key).toBe('order:CREATE:o-1');
    });

    it('builds stable dedupe keys without ids', () => {
        const key1 = buildDedupeKey('order', 'CREATE', { a: 1, b: 2 });
        const key2 = buildDedupeKey('order', 'CREATE', { a: 1, b: 2 });
        expect(key1).toBe(key2);
    });

    it('keeps identical mutations isolated between branches', () => {
        const payload = { id: 'warehouse-1', name: 'Main' };
        expect(buildDedupeKey('warehouse', 'UPDATE', payload, 'branch-a'))
            .not.toBe(buildDedupeKey('warehouse', 'UPDATE', payload, 'branch-b'));
    });

    it('computes backoff with cap', () => {
        const now = Date.now();
        const next = computeNextAttempt(5, 2000);
        expect(next).toBeGreaterThan(now);
    });

    it('recovers stale worker leases instead of leaving items locked forever', () => {
        expect(isSyncLockStale(Date.now() - 3 * 60 * 1000)).toBe(true);
        expect(isSyncLockStale(Date.now() - 10 * 1000)).toBe(false);
    });

    it('separates conflicts from transient retry failures', () => {
        expect(classifySyncError({ status: 409, message: 'ORDER_VERSION_CONFLICT' })).toBe('CONFLICT');
        expect(classifySyncError({ status: 503, message: 'DATABASE_UNAVAILABLE' })).toBe('RETRY');
    });

    it('quarantines branch, auth, unsupported, and business conflicts instead of retrying', () => {
        expect(classifySyncError(new Error('OFFLINE_BRANCH_MISMATCH'))).toBe('CONFLICT');
        expect(classifySyncError(Object.assign(new Error('Forbidden'), { status: 403 }))).toBe('CONFLICT');
        expect(classifySyncError(new Error('UNSUPPORTED_OFFLINE_OPERATION:branch:CREATE'))).toBe('CONFLICT');
        expect(classifySyncError(Object.assign(new Error('Validation conflict'), { status: 422 }))).toBe('CONFLICT');
        expect(classifySyncError(Object.assign(new Error('network timeout'), { status: 503 }))).toBe('RETRY');
    });

    it('fails closed for unsupported offline operations', () => {
        expect(assertSupportedSyncOperation('warehouse', 'UPDATE')).toBe(true);
        expect(() => assertSupportedSyncOperation('warehouse', 'ARCHIVE')).toThrow('UNSUPPORTED_OFFLINE_OPERATION');
        expect(() => assertSupportedSyncOperation('unknownEntity', 'CREATE')).toThrow('UNSUPPORTED_OFFLINE_OPERATION');
    });

    it('allows local settlement for offline mutations without requiring a gateway', () => {
        expect(assertOfflinePaymentPolicy({ payment_method: 'CASH' })).toBe(true);
        expect(assertOfflinePaymentPolicy({ paymentMethod: 'SPLIT', payments: [{ method: 'CASH', amount: 100 }] })).toBe(true);
        expect(assertOfflinePaymentPolicy({ paymentMethod: 'VISA' })).toBe(true);
        expect(assertOfflinePaymentPolicy({ payment_method: 'SPLIT', payments: [{ method: 'CASH', amount: 50 }, { method: 'INSTAPAY', amount: 50 }] })).toBe(true);
        expect(() => assertOfflinePaymentPolicy({ paymentMethod: 'SPLIT', payments: [] })).toThrow('OFFLINE_NON_CASH_PAYMENT_UNSUPPORTED');
    });

    it('allows local non-cash tender offline when no external gateway is configured', () => {
        for (const method of ['CARD', 'VISA', 'WALLET', 'VODAFONE_CASH', 'INSTAPAY', 'BANK_TRANSFER']) {
            expect(assertOfflinePaymentPolicy({ paymentMethod: method, payments: [{ method, amount: 100 }] })).toBe(true);
        }
    });

    it('merges conflict payloads conservatively with server precedence', () => {
        expect(mergeConflictPayload(
            { id: 'item-1', name: 'Offline name', metadata: { localOnly: true, shared: 'local' } },
            { id: 'item-1', name: 'Server name', metadata: { shared: 'server' }, status: 'published' },
        )).toEqual({
            id: 'item-1',
            name: 'Server name',
            metadata: { shared: 'server', localOnly: true },
            status: 'published',
        });
    });
});
