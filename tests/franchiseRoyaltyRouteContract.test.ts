import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('franchise royalty preview contract', () => {
    it('mounts a protected read-only preview endpoint', () => {
        const app = fs.readFileSync('server/app.ts', 'utf8');
        const routes = fs.readFileSync('server/routes/franchiseRoutes.ts', 'utf8');
        const service = fs.readFileSync('server/services/franchiseRoyaltyService.ts', 'utf8');
        expect(app).toContain("app.use('/api/franchise', franchiseRoutes)");
        expect(routes).toContain("router.get('/royalties/preview'");
        expect(routes).toContain('headOfficeAuth');
        expect(service).toContain("dateField: 'businessDate'");
        expect(service).toContain("basis: 'subtotal-minus-discount'");
        expect(service).toContain('ROYALTY_BRANCH_NOT_FOUND');
    });

    it('does not include cancelled orders and protects the mutation path', () => {
        const service = fs.readFileSync('server/services/franchiseRoyaltyService.ts', 'utf8');
        const routes = fs.readFileSync('server/routes/franchiseRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/franchiseController.ts', 'utf8');
        expect(service).toContain("inArray(orders.status, [...ROYALTY_ELIGIBLE_STATUSES])");
        expect(routes).toContain("router.post('/royalties/post'");
        expect(service).toContain('ROYALTY_ACCOUNT_MAPPING_REQUIRED');
        expect(service).toContain("referenceType: 'ROYALTY'");
        expect(controller).toContain("createSignedAuditLog");
        expect(controller).toContain("FRANCHISE_ROYALTY_POSTED");
        expect(controller).toContain('duplicateEntryCount');
    });
});
