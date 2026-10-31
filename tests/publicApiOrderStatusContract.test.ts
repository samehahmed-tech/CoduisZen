import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/publicApiController.ts', import.meta.url)), 'utf8');

describe('public order status contract', () => {
    it('exposes a branch-scoped detail controller and tracking URL', () => {
        expect(source).toContain('export const getPublicApiOrder');
        expect(source).toContain('eq(orders.id, orderId), eq(orders.branchId, branchId)');
        expect(source).toContain('trackingUrl');
    });

    it('does not select customer contact fields for the public detail projection', () => {
        const detailStart = source.indexOf('export const getPublicApiOrder');
        const detailEnd = source.indexOf('export const getPublicApiMenu', detailStart);
        const detail = source.slice(detailStart, detailEnd);
        expect(detail).not.toContain('customerPhone: orders.customerPhone');
        expect(detail).not.toContain('deliveryAddress: orders.deliveryAddress');
    });
});
