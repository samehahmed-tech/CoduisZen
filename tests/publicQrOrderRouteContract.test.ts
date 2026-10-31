import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('public QR table order route contract', () => {
    it('binds menu and order creation to a signed branch/table capability', () => {
        const routes = readFileSync(resolve(process.cwd(), 'server/routes/publicApiRoutes.ts'), 'utf8');
        const auth = readFileSync(resolve(process.cwd(), 'server/middleware/publicQrAuth.ts'), 'utf8');
        const controller = readFileSync(resolve(process.cwd(), 'server/controllers/publicApiController.ts'), 'utf8');
        expect(routes).toContain("router.get('/qr/branches/:branchId/tables/:tableId/menu'");
        expect(routes).toContain("router.post('/qr/branches/:branchId/tables/:tableId/orders'");
        expect(auth).toContain('verifyPublicQrToken(branchId, tableId, token)');
        expect(auth).toContain('req.publicQrTableId = tableId');
        expect(controller).toContain("type === 'DINE_IN' && !qrTableId");
        expect(controller).toContain('eq(tables.id, qrTableId), eq(tables.branchId, branchId)');
    });
});
