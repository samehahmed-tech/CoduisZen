import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('coupon cancellation release contract', () => {
    it('releases a cancelled order coupon exactly once with an atomic claim', () => {
        const lifecycle = fs.readFileSync('server/services/orderLifecycleService.ts', 'utf8');
        expect(lifecycle).toContain('const releaseCouponUsageForCancelledOrder');
        expect(lifecycle).toContain('isNull(orders.couponUsageReleasedAt)');
        expect(lifecycle).toContain('couponUsageReleasedAt: new Date()');
        expect(lifecycle).toContain('coalesce(${coupons.usedCount}, 0) - 1');
        expect(lifecycle).toContain('releaseCouponUsageForCancelledOrder(order)');
        expect(lifecycle).toContain("eventType: 'COUPON_USAGE_RELEASED_ON_CANCELLATION'");
    });

    it('persists the release marker with additive SQL Server support', () => {
        const schema = fs.readFileSync('src/db/schema.ts', 'utf8');
        const repair = fs.readFileSync('scripts/sqlserver-schema-repair.sql', 'utf8');
        expect(schema).toContain("couponUsageReleasedAt: datetime2('coupon_usage_released_at')");
        expect(repair).toContain("COL_LENGTH(N'dbo.orders', N'coupon_usage_released_at') IS NULL");
    });

    it('documents that refunds do not automatically release a redeemed coupon', () => {
        const lifecycle = fs.readFileSync('server/services/orderLifecycleService.ts', 'utf8');
        expect(lifecycle).toContain('Refunds deliberately do not release it');
    });
});
