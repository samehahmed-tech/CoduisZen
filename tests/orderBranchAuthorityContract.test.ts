import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('order branch authority contract', () => {
    it('uses the server-resolved branch before client payload values', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'server/controllers/orderController.ts'), 'utf8');
        expect(source).toContain('branchId: cleanOptionalReference(req.effectiveBranchId || bodyData.branch_id || bodyData.branchId)');
    });
});
