import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('order idempotency scope contract', () => {
    it('binds create-order idempotency to actor and effective branch', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'server/controllers/orderController.ts'), 'utf8');
        expect(source).toContain('const rawOrderIdempotencyScope = `${ORDER_CREATE_SCOPE}:${String(req.effectiveBranchId || \'UNSCOPED\')}:${String(actorId)}`;');
        expect(source).toContain('rawOrderIdempotencyScope.length <= 100');
        expect(source).toContain("crypto.createHash('sha256').update(rawOrderIdempotencyScope)");
        expect(source).toContain('eq(idempotencyKeys.scope, orderIdempotencyScope)');
        expect(source).toContain('scope: orderIdempotencyScope');
    });
});
