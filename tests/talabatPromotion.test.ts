import { describe, it, expect } from 'vitest';
import { buildStrikethroughBody } from '../server/modules/talabat/talabatPromotionService';

const base = {
    vendors: ['urd8'],
    name: 'Energy drinks sale',
    skus: ['3671', '3672'],
    discountValue: 10,
    startTime: '2024-03-05T15:59:59Z',
    endTime: '2024-03-05T16:59:59Z',
};

describe('talabat promotion', () => {
    it('builds strikethrough body matching spec sample', () => {
        const r = buildStrikethroughBody(base as any);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.body).toMatchObject({
            vendors: ['urd8'],
            type: 'STRIKETHROUGH',
            active: true,
            reason: 'COMPETITIVENESS',
            display_name: { en_GB: 'Energy drinks sale' },
            conditions: { start_time: '2024-03-05T15:59:59.000Z', end_time: '2024-03-05T16:59:59.000Z' },
        });
        expect(r.body.discount).toEqual([{ discount_subtype: 'PERCENTAGE', discount_value: 10, active: true, sku: ['3671', '3672'] }]);
    });

    it('rejects empty vendors/skus and bad dates', () => {
        expect(buildStrikethroughBody({ ...base, vendors: [] } as any)).toEqual({ ok: false, code: 'PROMO_VENDORS_REQUIRED' });
        expect(buildStrikethroughBody({ ...base, skus: [] } as any)).toEqual({ ok: false, code: 'PROMO_SKUS_REQUIRED' });
        expect(buildStrikethroughBody({ ...base, startTime: '2024-03-06T00:00:00Z' } as any)).toEqual({ ok: false, code: 'PROMO_DATES_INVALID' });
    });

    it('rejects percentage over 100', () => {
        expect(buildStrikethroughBody({ ...base, discountValue: 150 } as any)).toEqual({ ok: false, code: 'PROMO_VALUE_INVALID' });
    });

    it('supports deactivate by active=false', () => {
        const r = buildStrikethroughBody({ ...base, active: false } as any);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.body.active).toBe(false);
    });
});
