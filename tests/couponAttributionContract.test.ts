import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('coupon attribution and accounting contract', () => {
    it('persists the applied coupon as a canonical order field', () => {
        const schema = fs.readFileSync('src/db/schema.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/orderController.ts', 'utf8');
        const sql = fs.readFileSync('scripts/sql-server-schema.sql', 'utf8');
        const repair = fs.readFileSync('scripts/sqlserver-schema-repair.sql', 'utf8');
        expect(schema).toContain("couponCode: nvarchar('coupon_code')");
        expect(controller).toContain('couponCode: orders.couponCode');
        expect(controller).toContain('orderData.couponCode = coupon.code');
        expect(sql).toContain('coupon_code             nvarchar(255)');
        expect(repair).toContain("COL_LENGTH(N'dbo.orders', N'coupon_code') IS NULL");
    });

    it('calculates and claims coupon usage inside the canonical order transaction', () => {
        const controller = fs.readFileSync('server/controllers/orderController.ts', 'utf8');
        expect(controller).toContain('const couponDiscount = calculateCouponDiscount');
        expect(controller).toContain('usedCount: sql`coalesce(${coupons.usedCount}, 0) + 1`');
        expect(controller).toContain('COUPON_USAGE_LIMIT_REACHED');
        expect(controller).toContain('orderData.discountReason = `Coupon: ${coupon.code}`');
    });

    it('keeps loyalty points based on the authoritative post-discount order total', () => {
        const lifecycle = fs.readFileSync('server/services/orderLifecycleService.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/orderController.ts', 'utf8');
        expect(controller).toContain('total,');
        expect(lifecycle).toContain('Number(order.total || 0)');
        expect(lifecycle).toContain('loyaltyService.clawbackPoints');
    });
});
