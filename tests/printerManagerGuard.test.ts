import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'components/PrinterManager.tsx'), 'utf8');

describe('printer manager operational guards', () => {
    it('does not delete printers without confirmation', () => {
        expect(source).toContain('const ok = await confirm({');
        expect(source).toContain('await deletePrinterFromDB(id)');
        expect(source.indexOf('const ok = await confirm({')).toBeLessThan(source.indexOf('await deletePrinterFromDB(id)'));
    });

    it('persists the primary cashier printer explicitly', () => {
        expect(source).toContain('primaryCashierPrinterId: printerId');
        expect(source).toContain('await updatePrinterInDB({ ...selected, isPrimaryCashier: true })');
        expect(source).toContain('autoPrintReceiptOnSubmit: Boolean(printerId)');
    });

    it('exposes and persists cashier receipt copy count', () => {
        expect(source).toContain('cashierReceiptCopies');
        expect(source).toContain('settingsApi.updateBulk({ cashierReceiptCopies: copies })');
    });
});
