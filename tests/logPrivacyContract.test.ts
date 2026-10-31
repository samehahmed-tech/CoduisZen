import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('high-risk log privacy contracts', () => {
    it('does not log payment error objects or request bodies wholesale', () => {
        const paymentRoutes = read('server/routes/paymentRoutes.ts');
        const tableController = read('server/controllers/tableController.ts');
        expect(paymentRoutes).not.toContain('logger.error({ error },');
        expect(tableController).not.toContain('body: req.body');
    });

    it('does not log raw ledger entries', () => {
        const ledger = read('server/services/ledgerEngine.ts');
        expect(ledger).not.toContain('entries }, errorMsg');
        expect(ledger).not.toContain('{ error, orderId, paymentSessionId }');
    });
});
