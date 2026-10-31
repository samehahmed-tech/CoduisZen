import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('payroll tips posting contract', () => {
    it('carries reconciled tips into payroll lines and payslips before GL posting', () => {
        const closeService = read('server/services/payrollCloseService.ts');
        const schema = read('src/db/schema.ts');

        expect(closeService).toContain('tipAmount: line.tipAmount');
        expect(closeService).toContain('grossPay = Number(calculatedLine?.grossPay');
        expect(closeService).toContain('+ tipAmount');
        expect(closeService).toContain('payrollCycleId: input.cycleId');
        expect(schema).toContain('tipAmount: real("tip_amount")');
        expect(schema).toContain('payrollCycleId: nvarchar(\'payroll_cycle_id\')');
    });

    it('releases the tip pool link on payroll reopen', () => {
        const source = read('server/services/payrollReopenService.ts');
        expect(source).toContain('tx.update(tipPools)');
        expect(source).toContain('payrollCycleId: null');
    });
});
