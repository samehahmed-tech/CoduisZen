import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { branches, orders } from '../src/db/schema';
import { FISCAL_SELLER_ENV_KEYS, fiscalService } from '../server/services/fiscalService';
import { submitOrderToFiscal } from '../server/services/fiscalSubmitService';

const savedEnv = new Map<string, string | undefined>();
const sellerValues: Record<string, string> = {
    ETA_RIN: '123456789',
    ETA_COMPANY_NAME: 'Test Restaurant',
    ETA_BRANCH_CODE: '1',
    ETA_COUNTRY: 'EG',
    ETA_GOVERNATE: 'Cairo',
    ETA_CITY: 'Cairo',
    ETA_STREET: 'Test Street',
    ETA_BUILDING: '10',
};

const order = {
    id: 'test-fiscal-payload-order',
    status: 'COMPLETED',
    createdAt: new Date('2026-07-01T10:00:00Z'),
    subtotal: 100,
    tax: 14,
    total: 114,
    paymentMethod: 'CASH',
} as any;

describe('fiscal safety', () => {
    beforeEach(() => {
        for (const key of FISCAL_SELLER_ENV_KEYS) {
            savedEnv.set(key, process.env[key]);
            process.env[key] = sellerValues[key];
        }
    });

    afterEach(async () => {
        await db.delete(orders).where(inArray(orders.id, ['test-fiscal-branch-order']));
        await db.delete(branches).where(inArray(branches.id, ['test-fiscal-branch-a', 'test-fiscal-branch-b']));
        for (const key of FISCAL_SELLER_ENV_KEYS) {
            const value = savedEnv.get(key);
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        savedEnv.clear();
    });

    it('refuses to fabricate a fiscal item code', () => {
        expect(() => fiscalService.prepareETAReceipt(order, [{
            name: 'Unmapped item', quantity: 1, price: 100, tax: 14,
        } as any])).toThrow('FISCAL_ITEM_CODE_MISSING');
    });

    it('uses configured item code and exact stored tax', () => {
        const payload = fiscalService.prepareETAReceipt(order, [{
            name: 'Mapped item', quantity: 2, price: 50, tax: 14, fiscalCode: '6221234567890',
        } as any]);

        expect(payload.itemData[0]).toMatchObject({
            itemType: 'GS1',
            itemCode: '6221234567890',
            netSale: 100,
            total: 114,
            taxableItems: [{ amount: 14, rate: 14 }],
        });
    });

    it('rejects fiscal submission for an order in another branch', async () => {
        await db.insert(branches).values([
            { id: 'test-fiscal-branch-a', name: 'Fiscal A' },
            { id: 'test-fiscal-branch-b', name: 'Fiscal B' },
        ]).onConflictDoNothing();
        await db.insert(orders).values({
            id: 'test-fiscal-branch-order',
            type: 'TAKEAWAY',
            branchId: 'test-fiscal-branch-b',
            status: 'PENDING',
            subtotal: 100,
            tax: 14,
            total: 114,
        });

        await expect(submitOrderToFiscal('test-fiscal-branch-order', { branchId: 'test-fiscal-branch-a' }))
            .rejects.toThrow('FORBIDDEN_BRANCH_ACCESS');
    });
});
