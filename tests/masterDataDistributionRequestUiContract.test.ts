import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('master data distribution request UI contract', () => {
    it('offers an HQ-only request flow with source, targets, and overwrite disclosure', () => {
        const source = fs.readFileSync('components/MenuManager.tsx', 'utf8');
        expect(source).toContain('const isHeadOffice');
        expect(source).toContain('setShowDistribution(true)');
        expect(source).toContain('distributionSourceBranchId');
        expect(source).toContain('distributionTargetBranchIds');
        expect(source).toContain('distributionOverwrite');
        expect(source).toContain('يتطلب اعتمادًا منفصلًا ولا يُطبق مباشرة');
        expect(source).toContain('previewDistribution');
        expect(source).toContain('distributionPreview');
        expect(source).toContain('معاينة قبل الإرسال');
    });

    it('submits a pending request rather than applying distribution from the menu UI', () => {
        const source = fs.readFileSync('components/MenuManager.tsx', 'utf8');
        const api = fs.readFileSync('services/api/menu.ts', 'utf8');
        expect(source).toContain('menuApi.requestMasterDataDistribution(');
        expect(source).toContain('تم إرسال طلب التوزيع للموافقة المركزية');
        expect(api).toContain("'/menu/master-data/distribution/request'");
        expect(source).toContain('distributionIdempotencyKey');
        expect(api).toContain("'Idempotency-Key'");
        expect(source).toContain('menuApi.previewMasterDataDistribution(');
        expect(api).toContain("'/menu/master-data/distribution/preview'");
    });
});
