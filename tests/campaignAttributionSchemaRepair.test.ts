import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('campaign attribution schema repair', () => {
    it('normalizes legacy max-length campaign columns before creating indexes', () => {
        const source = fs.readFileSync('server/services/campaignAttributionService.ts', 'utf8');

        expect(source).toContain('sys.columns');
        expect(source).toContain('max_length > 510');
        expect(source).toContain('ALTER TABLE orders ALTER COLUMN campaign_id nvarchar(255) NULL');
        expect(source).toContain('ALTER TABLE coupons ALTER COLUMN campaign_id nvarchar(255) NULL');
        expect(source).toContain('LEFT(CONVERT(nvarchar(max), campaign_id), 255)');
    });
});
