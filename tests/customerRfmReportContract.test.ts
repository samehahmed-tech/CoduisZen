import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controller = readFileSync(fileURLToPath(new URL('../server/controllers/report/advancedCrmReports.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/reportRoutes.ts', import.meta.url)), 'utf8');
const exportsSource = readFileSync(fileURLToPath(new URL('../server/controllers/reportController.ts', import.meta.url)), 'utf8');

describe('customer RFM report contract', () => {
    it('exposes latest customer RFM snapshots with branch scope', () => {
        expect(routes).toContain("router.get('/customer-rfm'");
        expect(exportsSource).toContain('getCustomerRfm');
        expect(controller).toContain('export const getCustomerRfm');
        expect(controller).toContain('customerRfmMetrics.branchId');
        expect(controller).toContain('latestByCustomer');
    });
});
