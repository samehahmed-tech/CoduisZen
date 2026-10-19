import { describe, it, expect } from 'vitest';
import { resolveTalabatBranch, buildTalabatOrderRow } from '../server/modules/talabat/talabatIngestService';

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
});
