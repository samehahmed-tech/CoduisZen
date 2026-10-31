import { describe, it, expect } from 'vitest';
import { resolveTalabatBranch, buildTalabatOrderRow } from '../server/modules/talabat/talabatIngestService';
import { buildTalabatPayloadFingerprint } from '../server/modules/talabat/talabatMapper';

describe('talabat ingest', () => {
    it('resolves branch via external_partner_config_id then store_id then default', () => {
        const cfg: any = { storeBranchMap: { EXT1: 'B1' }, defaultBranchId: 'B9' };
        expect(resolveTalabatBranch({ store_id: 'S1', external_partner_config_id: 'EXT1' } as any, cfg)).toBe('B1');
        expect(resolveTalabatBranch({ store_id: 'S1' } as any, { storeBranchMap: { S1: 'B2' }, defaultBranchId: 'B9' } as any)).toBe('B2');
        expect(resolveTalabatBranch({ store_id: 'SX' } as any, cfg)).toBe('B9');
    });

    it('builds order row with platform ids and totals', () => {
        const row = buildTalabatOrderRow(
            { order_id: 'oid', order_code: '123', external_order_id: 'EXT-9', store_id: 'S1', status: 'RECEIVED', order_type: 'DELIVERY', sub_total: 100, order_total: 115, delivery_fee: 15 } as any,
            'B1',
        );
        expect(row.branchId).toBe('B1');
        expect(row.platformOrderId).toBe('oid');
        expect(row.deliverySource).toBe('talabat');
        expect(row.source).toBe('talabat');
        expect(row.total).toBe(115);
    });

    it('keeps the payload fingerprint across status transitions and changes it for financial mutations', () => {
        const base: any = {
            order_id: 'oid-fingerprint', status: 'RECEIVED', store_id: 'S1', order_type: 'DELIVERY',
            sub_total: 100, order_total: 115, delivery_fee: 15,
            customer: { name: 'Guest', phone: '0100', address: 'Cairo' },
            items: [{ sku: 'SKU-1', pricing: { quantity: 1, unit_price: 100, total_price: 100 }, status: 'IN_CART' }],
        };
        expect(buildTalabatPayloadFingerprint(base)).toBe(buildTalabatPayloadFingerprint({ ...base, status: 'DISPATCHED' }));
        expect(buildTalabatPayloadFingerprint(base)).not.toBe(buildTalabatPayloadFingerprint({ ...base, order_total: 999 }));
    });
});
