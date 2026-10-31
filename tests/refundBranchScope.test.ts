import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/controllers/refundController.ts', import.meta.url)),
    'utf8',
);

describe('refund legacy branch scope contract', () => {
    it('fails closed for unscoped legacy refunds except SUPER_ADMIN', () => {
        expect(source).toContain("if (req.user?.role === 'SUPER_ADMIN') return true;");
        expect(source).toContain('if (!branchId) return false;');
    });
});
