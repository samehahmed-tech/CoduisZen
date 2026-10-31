import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const service = readFileSync(fileURLToPath(new URL('../server/services/customerMergeService.ts', import.meta.url)), 'utf8');
const controller = readFileSync(fileURLToPath(new URL('../server/controllers/customerController.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/customerRoutes.ts', import.meta.url)), 'utf8');

describe('customer merge contract', () => {
    it('requires explicit confirmation and a privileged route', () => {
        expect(routes).toContain("router.post('/:id/merge'");
        expect(routes).toContain("requireRoles('SUPER_ADMIN', 'CALL_CENTER_MANAGER')");
        expect(controller).toContain("req.body?.confirmation !== 'MERGE_CUSTOMER'");
    });

    it('moves linked records in one transaction and archives the source', () => {
        expect(service).toContain('return db.transaction(async (tx) =>');
        expect(service).toContain('tx.update(orders).set({ customerId: targetCustomerId })');
        expect(service).toContain('tx.update(loyaltyLedger).set({ customerId: targetCustomerId })');
        expect(service).toContain('deletedAt: new Date()');
        expect(service).toContain('Wallet balance transferred');
    });
});
