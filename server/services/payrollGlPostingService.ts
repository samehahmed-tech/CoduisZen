import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { payrollRunLines, payrollRuns } from '../../src/db/schema';
import { GLService } from './glService';

type PayrollTotals = {
    grossPay: number;
    netPay: number;
    penalties: number;
    loanDeductions: number;
    otherDeductions: number;
};

const sumLines = (lines: Array<typeof payrollRunLines.$inferSelect>): PayrollTotals => {
    return lines.reduce((acc, line) => {
        acc.grossPay += Number(line.grossPay || 0);
        acc.netPay += Number(line.netPay || 0);
        acc.penalties += Number(line.penalties || 0);
        acc.loanDeductions += Number(line.loanDeductions || 0);
        acc.otherDeductions += Number(line.otherDeductions || 0);
        return acc;
    }, { grossPay: 0, netPay: 0, penalties: 0, loanDeductions: 0, otherDeductions: 0 });
};

export const payrollGlPostingService = {
    async postPayrollRun(runId: string, branchId: string, createdBy?: string) {
        const [run] = await db.select().top(1).from(payrollRuns).where(eq(payrollRuns.id, runId));
        if (!run) throw new Error('PAYROLL_RUN_NOT_FOUND');

        const lines = await db.select().from(payrollRunLines).where(eq(payrollRunLines.runId, runId));
        const totals = sumLines(lines);

        const { PostingRuleEngine } = await import('./postingRuleEngine');
        const postingLines = await PostingRuleEngine.generateLines('PAYROLL', {
            GROSS_PAY: totals.grossPay,
            NET_PAY: totals.netPay,
            PENALTIES: totals.penalties,
            LOAN_DEDUCTIONS: totals.loanDeductions,
            OTHER_DEDUCTIONS: totals.otherDeductions,
        }, { branchId });

        if (!postingLines || postingLines.length === 0) {
            return { status: 'SKIPPED', reason: 'NO_POSTING_RULES' };
        }

        const journalLines = postingLines.map((line) => ({
            accountCode: line.accountCode,
            debit: line.debit,
            credit: line.credit,
        }));

        return await GLService.postJournalEntry({
            reference: run.id,
            referenceType: 'PAYROLL',
            description: `Payroll Run ${run.id}`,
            createdBy,
            branchId,
            lines: journalLines,
        });
    },
};

export default payrollGlPostingService;
