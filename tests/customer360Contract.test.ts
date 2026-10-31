import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controller = readFileSync(fileURLToPath(new URL('../server/controllers/customerController.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/customerRoutes.ts', import.meta.url)), 'utf8');

describe('customer 360 contract', () => {
    it('exposes a branch-scoped aggregation endpoint', () => {
        expect(routes).toContain("router.get('/:id/360'");
        expect(controller).toContain('export const getCustomer360');
        expect(controller).toContain('eq(orders.branchId, branchId)');
        expect(controller).toContain('scope: { branchId: branchId || null');
    });

    it('uses existing ledgers and excludes sensitive customer payment data', () => {
        expect(controller).toContain('loyaltyLedger');
        expect(controller).toContain('walletTransactions');
        expect(controller).toContain('giftCards');
        expect(controller).not.toContain('customer.creditCard');
        expect(controller).not.toContain('customer.password');
    });
});
