import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controller = readFileSync(fileURLToPath(new URL('../server/controllers/customerController.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/customerRoutes.ts', import.meta.url)), 'utf8');

describe('customer duplicate review contract', () => {
    it('exposes a read-only duplicate report before dynamic id routes', () => {
        expect(routes).toContain("router.get('/identity-duplicates'");
        expect(controller).toContain('export const getCustomerDuplicateReport');
        expect(controller).toContain('duplicateGroups');
        expect(controller).toContain('truncated: rows.length >= 10000');
        expect(controller).not.toContain('db.delete(customers)');
    });
});
