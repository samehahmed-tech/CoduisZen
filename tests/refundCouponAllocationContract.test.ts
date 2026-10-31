import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('refund coupon allocation contract', () => {
    it('carries canonical coupon metadata into the refund projection', () => {
        const service = fs.readFileSync('server/services/refundService.ts', 'utf8');
        const schema = fs.readFileSync('src/db/schema.ts', 'utf8');
        const repair = fs.readFileSync('scripts/sqlserver-schema-repair.sql', 'utf8');
        expect(service).toContain('couponCode: refund.couponCode || null');
        expect(service).toContain('couponDiscountAmount: Number(refund.couponDiscountAmount || 0)');
        expect(schema).toContain("couponDiscountAmount: real('coupon_discount_amount').default(0)");
        expect(repair).toContain("COL_LENGTH(N'dbo.refund_records', N'coupon_discount_amount') IS NULL");
    });

    it('allocates recorded coupon discount for item refunds instead of refunding gross line price', () => {
        const service = fs.readFileSync('server/services/refundService.ts', 'utf8');
        expect(service).toContain("import { allocateRefundPricing } from '../utils/refundPricingPolicy'");
        expect(service).toContain('const allocatedLines = allocateRefundPricing(');
        expect(service).toContain('discountAllocated: line.discountAllocated');
        expect(service).toContain('taxAllocated: line.taxAllocated');
        expect(service).toContain('refundAmount += line.refundAmount');
    });

    it('records full and partial coupon allocation from the authoritative order fields', () => {
        const service = fs.readFileSync('server/services/refundService.ts', 'utf8');
        expect(service).toContain('const couponCode = String((order as any).couponCode ||');
        expect(service).toContain('couponDiscountAmount = Number((order as any).couponDiscountAmount || 0)');
        expect(service).toContain('couponDiscountAmount: Number(couponDiscountAmount.toFixed(2))');
    });
});
