import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { employees, payrollRunLines, payrollRuns, payslips } from '../../src/db/schema';
import { generatePayslipPDF } from './pdfService';

const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export const payslipService = {
    async generatePayslips(input: { runId: string; generatedBy?: string }) {
        const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, input.runId)).limit(1);
        if (!run) throw new Error('PAYROLL_RUN_NOT_FOUND');

        const runLines = await db.select().from(payrollRunLines).where(eq(payrollRunLines.runId, input.runId));
        const employeeIds = runLines.map((line) => line.employeeId);
        const employeesList = await db.select().from(employees).where(employeeIds.length > 0 ? eq(employees.branchId, run.branchId) : undefined);
        const employeeMap = new Map(employeesList.map((emp) => [emp.id, emp]));

        const results = [];

        for (const line of runLines) {
            const employee = employeeMap.get(line.employeeId);
            const existing = await db.select().from(payslips)
                .where(and(
                    eq(payslips.runId, run.id),
                    eq(payslips.employeeId, line.employeeId),
                ))
                .orderBy(desc(payslips.version))
                .limit(1);

            const version = existing[0] ? Number(existing[0].version || 1) + 1 : 1;

            const payload = {
                employeeId: line.employeeId,
                employeeName: employee?.name,
                branchId: run.branchId,
                baseSalary: line.baseSalary,
                fixedAllowances: Number((line.components as any)?.fixedAllowances || 0),
                fixedDeductions: Number((line.components as any)?.fixedDeductions || 0),
                attendanceDeductions: Number((line.components as any)?.attendanceDeductions || 0),
                overtime: line.overtime,
                bonuses: line.bonuses,
                penalties: line.penalties,
                loanDeductions: line.loanDeductions,
                otherDeductions: line.otherDeductions,
                components: line.components || {},
                grossPay: line.grossPay,
                netPay: line.netPay,
                generatedAt: new Date().toISOString(),
            };

            const pdfBuffer = await generatePayslipPDF({ cycleId: run.cycleId, employeeId: line.employeeId, payload });
            const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

            const [created] = await db.insert(payslips).values({
                id: makeId('PSL'),
                runId: run.id,
                cycleId: run.cycleId,
                employeeId: line.employeeId,
                payload,
                version,
                pdfHash,
                generatedAt: new Date(),
                generatedBy: input.generatedBy,
            }).returning();

            results.push({
                payslip: created,
                pdfHash,
            });
        }

        return {
            runId: run.id,
            generated: results.length,
            items: results,
        };
    },

    async getPayslipPdf(payslipId: string) {
        const [payslip] = await db.select().from(payslips).where(eq(payslips.id, payslipId)).limit(1);
        if (!payslip) throw new Error('PAYSLIP_NOT_FOUND');

        const buffer = await generatePayslipPDF({
            cycleId: payslip.cycleId,
            employeeId: payslip.employeeId,
            payload: payslip.payload || {},
        });

        return {
            payslip,
            buffer,
            filename: `payslip-${payslip.employeeId}-${payslip.cycleId}-v${payslip.version || 1}.pdf`,
        };
    },
};

export default payslipService;
