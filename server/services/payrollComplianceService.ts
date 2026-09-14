import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import payrollCalculationService from './payrollCalculationService';
import payrollCloseService from './payrollCloseService';
import { branches, employees, payrollCycles } from '../../src/db/schema';
import { generatePayrollCompliancePDF } from './pdfService';
import { generateHrTabularXlsx } from './hrReportExportService';

type TaxBracket = {
    upTo: number | null;
    rate: number;
};

type ComplianceConfig = {
    annualPersonalExemption: number;
    employeeInsuranceRate: number;
    employerInsuranceRate: number;
    insuranceMinMonthly: number;
    insuranceMaxMonthly: number;
    martyrsContributionRate: number;
    annualTaxBrackets: TaxBracket[];
};

const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
    annualPersonalExemption: 60000,
    employeeInsuranceRate: 0.11,
    employerInsuranceRate: 0.1875,
    insuranceMinMonthly: 2700,
    insuranceMaxMonthly: 16700,
    martyrsContributionRate: 0,
    annualTaxBrackets: [
        { upTo: 40000, rate: 0 },
        { upTo: 55000, rate: 0.1 },
        { upTo: 70000, rate: 0.15 },
        { upTo: 270000, rate: 0.2 },
        { upTo: 400000, rate: 0.225 },
        { upTo: null, rate: 0.25 },
    ],
};

const money = (value: number) => Number(value || 0).toFixed(2);

const clamp = (value: number, min: number, max: number) => {
    if (value <= 0) return 0;
    return Math.max(min, Math.min(max, value));
};

const calculateAnnualTax = (taxableAnnualIncome: number, brackets: TaxBracket[]) => {
    let tax = 0;
    let lowerBound = 0;
    for (const bracket of brackets) {
        const ceiling = bracket.upTo ?? taxableAnnualIncome;
        const taxableSlice = Math.max(0, Math.min(taxableAnnualIncome, ceiling) - lowerBound);
        if (taxableSlice > 0) tax += taxableSlice * bracket.rate;
        lowerBound = ceiling;
        if (bracket.upTo === null || taxableAnnualIncome <= ceiling) break;
    }
    return tax;
};

const getConfigFromQuery = (query: any): ComplianceConfig => {
    const minMonthly = Number(query?.insuranceMinMonthly || DEFAULT_COMPLIANCE_CONFIG.insuranceMinMonthly);
    const maxMonthly = Number(query?.insuranceMaxMonthly || DEFAULT_COMPLIANCE_CONFIG.insuranceMaxMonthly);
    return {
        annualPersonalExemption: Number(query?.annualPersonalExemption || DEFAULT_COMPLIANCE_CONFIG.annualPersonalExemption),
        employeeInsuranceRate: Number(query?.employeeInsuranceRate || DEFAULT_COMPLIANCE_CONFIG.employeeInsuranceRate),
        employerInsuranceRate: Number(query?.employerInsuranceRate || DEFAULT_COMPLIANCE_CONFIG.employerInsuranceRate),
        insuranceMinMonthly: Number.isFinite(minMonthly) ? minMonthly : DEFAULT_COMPLIANCE_CONFIG.insuranceMinMonthly,
        insuranceMaxMonthly: Number.isFinite(maxMonthly) ? maxMonthly : DEFAULT_COMPLIANCE_CONFIG.insuranceMaxMonthly,
        martyrsContributionRate: Number(query?.martyrsContributionRate || DEFAULT_COMPLIANCE_CONFIG.martyrsContributionRate),
        annualTaxBrackets: DEFAULT_COMPLIANCE_CONFIG.annualTaxBrackets,
    };
};

const csvEscape = (value: unknown) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const buildCsv = (headers: string[], rows: Array<Record<string, unknown>>) => {
    const headerLine = headers.join(',');
    const lines = rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','));
    return [headerLine, ...lines].join('\n');
};

const filterRowsByTemplate = async (template: string, cycle: typeof payrollCycles.$inferSelect, employeeMap: Map<string, typeof employees.$inferSelect>, rows: any[]) => {
    if (template === 'insurance_form_1') {
        return rows.filter((row) => {
            const employee = employeeMap.get(row.employeeId);
            if (!employee?.joinedAt) return false;
            return new Date(employee.joinedAt) >= new Date(cycle.periodStart) && new Date(employee.joinedAt) <= new Date(cycle.periodEnd);
        });
    }

    if (template === 'insurance_form_6') {
        const branchEmployees = await db.select().from(employees)
            .where(and(
                eq(employees.branchId, cycle.branchId),
                eq(employees.isActive, false),
                gte(employees.updatedAt, cycle.periodStart),
                lte(employees.updatedAt, cycle.periodEnd),
            ))
            .orderBy(desc(employees.updatedAt));
        const inactiveIds = new Set(branchEmployees.map((item) => item.id));
        return rows.filter((row) => inactiveIds.has(String(row.employeeId)));
    }

    return rows;
};

export const payrollComplianceService = {
    async getCycleSummary(cycleId: string, query: any = {}) {
        const config = getConfigFromQuery(query);
        const reportingCurrency = String(query?.reportingCurrency || 'EGP').toUpperCase();
        const exchangeRate = Math.max(0.000001, Number(query?.exchangeRate || 1));

        const preview = await payrollCalculationService.previewCycle(cycleId);
        const review = await payrollCloseService.previewCycle(cycleId);
        const [cycle] = await db.select().top(1).from(payrollCycles).where(eq(payrollCycles.id, cycleId));
        if (!cycle) throw new Error('PAYROLL_CYCLE_NOT_FOUND');

        const [branch] = await db.select().top(1).from(branches).where(eq(branches.id, cycle.branchId));
        const employeeRows = await db.select().from(employees).where(eq(employees.branchId, cycle.branchId));
        const employeeMap = new Map(employeeRows.map((employee) => [employee.id, employee]));

        const lines = preview.lines.map((line) => {
            const employee = employeeMap.get(line.employeeId);
            const reviewLine = review.lines.find((item) => item.employeeId === line.employeeId);
            const grossPay = Number(line.grossPay || 0);
            const attendanceDeductions = Number(line.adjustments.attendanceDeductions || 0);
            const fixedAllowances = Number(line.adjustments.fixedAllowances || 0);
            const fixedDeductions = Number(line.adjustments.fixedDeductions || 0);
            const bonuses = Number(line.adjustments.bonuses || 0);
            const penalties = Number(line.adjustments.penalties || 0);
            const loanDeductions = Number(line.adjustments.loanDeductions || 0);
            const pensionableWage = clamp(grossPay, config.insuranceMinMonthly, config.insuranceMaxMonthly);
            const employeeInsurance = pensionableWage * config.employeeInsuranceRate;
            const employerInsurance = pensionableWage * config.employerInsuranceRate;
            const martyrsContribution = grossPay * config.martyrsContributionRate;
            const taxableMonthlyIncome = Math.max(0, grossPay - employeeInsurance);
            const taxableAnnualIncome = Math.max(0, taxableMonthlyIncome * 12 - config.annualPersonalExemption);
            const annualSalaryTax = calculateAnnualTax(taxableAnnualIncome, config.annualTaxBrackets);
            const monthlySalaryTax = annualSalaryTax / 12;
            const employeeStatutoryDeductions = employeeInsurance + monthlySalaryTax + martyrsContribution;
            // Core netPay already folds statutory deductions (see
            // payrollCalculationService) — this stays as the payable figure
            // so ledger, payslip and bank file agree.
            const netAfterStatutory = Number(line.netPay || 0);
            const baseCurrencyNet = Number(line.netPay || 0);
            const convertedNet = reportingCurrency === String(branch?.currency || 'EGP').toUpperCase()
                ? baseCurrencyNet
                : baseCurrencyNet / exchangeRate;

            return {
                employeeId: line.employeeId,
                employeeCode: employee?.employeeCode || employee?.attendanceCode || '',
                employeeName: employee?.name || line.employeeId,
                branchId: cycle.branchId,
                branchName: branch?.name || cycle.branchId,
                role: employee?.role || '',
                nationalId: employee?.nationalId || '',
                joinedAt: employee?.joinedAt ? new Date(employee.joinedAt).toISOString().slice(0, 10) : '',
                grossPay,
                baseSalary: Number(line.baseSalary || 0),
                fixedAllowances,
                fixedDeductions,
                overtime: Number(line.overtime || 0),
                bonuses,
                penalties,
                loanDeductions,
                attendanceDeductions,
                payrollNet: baseCurrencyNet,
                insuredWage: pensionableWage,
                employeeInsurance,
                employerInsurance,
                taxableMonthlyIncome,
                taxableAnnualIncome,
                monthlySalaryTax,
                annualSalaryTax,
                martyrsContribution,
                statutoryEmployeeDeductions: employeeStatutoryDeductions,
                netAfterStatutory,
                netInReportingCurrency: convertedNet,
                reportingCurrency,
                exchangeRate,
                missingNationalId: !employee?.nationalId,
                missingEmployeeCode: !(employee?.employeeCode || employee?.attendanceCode),
                attendanceWarnings: reviewLine?.warnings || [],
                readinessBlockers: reviewLine?.blockers || [],
            };
        });

        const totals = lines.reduce((acc, line) => {
            acc.employees += 1;
            acc.grossPay += line.grossPay;
            acc.baseSalary += line.baseSalary;
            acc.fixedAllowances += line.fixedAllowances;
            acc.fixedDeductions += line.fixedDeductions;
            acc.overtime += line.overtime;
            acc.bonuses += line.bonuses;
            acc.penalties += line.penalties;
            acc.loanDeductions += line.loanDeductions;
            acc.attendanceDeductions += line.attendanceDeductions;
            acc.payrollNet += line.payrollNet;
            acc.employeeInsurance += line.employeeInsurance;
            acc.employerInsurance += line.employerInsurance;
            acc.salaryTax += line.monthlySalaryTax;
            acc.martyrsContribution += line.martyrsContribution;
            acc.netAfterStatutory += line.netAfterStatutory;
            acc.employerCost += (line.grossPay + line.employerInsurance);
            acc.missingNationalIds += line.missingNationalId ? 1 : 0;
            acc.missingEmployeeCodes += line.missingEmployeeCode ? 1 : 0;
            acc.blockers += line.readinessBlockers.length;
            acc.warnings += line.attendanceWarnings.length;
            return acc;
        }, {
            employees: 0,
            grossPay: 0,
            baseSalary: 0,
            fixedAllowances: 0,
            fixedDeductions: 0,
            overtime: 0,
            bonuses: 0,
            penalties: 0,
            loanDeductions: 0,
            attendanceDeductions: 0,
            payrollNet: 0,
            employeeInsurance: 0,
            employerInsurance: 0,
            salaryTax: 0,
            martyrsContribution: 0,
            netAfterStatutory: 0,
            employerCost: 0,
            missingNationalIds: 0,
            missingEmployeeCodes: 0,
            blockers: 0,
            warnings: 0,
        });

        return {
            cycle: {
                id: cycle.id,
                branchId: cycle.branchId,
                branchName: branch?.name || cycle.branchId,
                periodStart: new Date(cycle.periodStart).toISOString().slice(0, 10),
                periodEnd: new Date(cycle.periodEnd).toISOString().slice(0, 10),
                status: cycle.status,
                baseCurrency: String(branch?.currency || 'EGP').toUpperCase(),
                reportingCurrency,
                exchangeRate,
            },
            config,
            totals,
            readiness: review.totals,
            lines,
            templates: [
                { key: 'payroll_sheet', label: 'All-in-one payroll sheet' },
                { key: 'eta_monthly_private', label: 'ETA monthly payroll' },
                { key: 'insurance_form_1', label: 'Insurance Form 1 - new hires' },
                { key: 'insurance_form_2', label: 'Insurance Form 2 - wage update' },
                { key: 'insurance_form_6', label: 'Insurance Form 6 - separation' },
                { key: 'bank_transfer', label: 'Bank transfer payroll file' },
            ],
        };
    },

    async exportCycle(cycleId: string, template: string, format: string, query: any = {}) {
        const summary = await this.getCycleSummary(cycleId, query);
        const [cycle] = await db.select().top(1).from(payrollCycles).where(eq(payrollCycles.id, cycleId));
        if (!cycle) throw new Error('PAYROLL_CYCLE_NOT_FOUND');
        const employeeMap = new Map(
            (await db.select().from(employees).where(eq(employees.branchId, cycle.branchId)))
                .map((employee) => [employee.id, employee]),
        );
        const filteredLines = await filterRowsByTemplate(template, cycle, employeeMap, summary.lines);

        const templateRows = filteredLines.map((line) => {
            if (template === 'insurance_form_1') {
                return {
                    employeeCode: line.employeeCode,
                    employeeName: line.employeeName,
                    nationalId: line.nationalId,
                    joinedAt: line.joinedAt,
                    insuredWage: money(line.insuredWage),
                    branchName: line.branchName,
                };
            }
            if (template === 'insurance_form_6') {
                return {
                    employeeCode: line.employeeCode,
                    employeeName: line.employeeName,
                    nationalId: line.nationalId,
                    separationDate: summary.cycle.periodEnd,
                    branchName: line.branchName,
                    notes: 'Generated from payroll cycle',
                };
            }
            if (template === 'payroll_sheet') {
                return {
                    employeeCode: line.employeeCode,
                    employeeName: line.employeeName,
                    role: line.role,
                    nationalId: line.nationalId,
                    branchName: line.branchName,
                    baseSalary: money(line.baseSalary),
                    fixedAllowances: money(line.fixedAllowances),
                    fixedDeductions: money(line.fixedDeductions),
                    overtime: money(line.overtime),
                    bonuses: money(line.bonuses),
                    penalties: money(line.penalties),
                    loanDeductions: money(line.loanDeductions),
                    attendanceDeductions: money(line.attendanceDeductions),
                    grossPay: money(line.grossPay),
                    payrollNet: money(line.payrollNet),
                    insuredWage: money(line.insuredWage),
                    employeeInsurance: money(line.employeeInsurance),
                    employerInsurance: money(line.employerInsurance),
                    salaryTax: money(line.monthlySalaryTax),
                    martyrsContribution: money(line.martyrsContribution),
                    statutoryEmployeeDeductions: money(line.statutoryEmployeeDeductions),
                    netAfterStatutory: money(line.netAfterStatutory),
                    employerCost: money(line.grossPay + line.employerInsurance),
                    reportingCurrency: line.reportingCurrency,
                    netInReportingCurrency: money(line.netInReportingCurrency),
                    missingNationalId: line.missingNationalId ? 'YES' : 'NO',
                    missingEmployeeCode: line.missingEmployeeCode ? 'YES' : 'NO',
                    readinessBlockers: line.readinessBlockers.join(' | '),
                    attendanceWarnings: line.attendanceWarnings.join(' | '),
                };
            }
            if (template === 'bank_transfer') {
                return {
                    employeeCode: line.employeeCode,
                    employeeName: line.employeeName,
                    netPay: money(line.netAfterStatutory),
                    currency: summary.cycle.reportingCurrency,
                    branchName: line.branchName,
                };
            }
            if (template === 'insurance_form_2') {
                return {
                    employeeCode: line.employeeCode,
                    employeeName: line.employeeName,
                    nationalId: line.nationalId,
                    insuredWage: money(line.insuredWage),
                    employeeInsurance: money(line.employeeInsurance),
                    employerInsurance: money(line.employerInsurance),
                    effectiveMonth: `${summary.cycle.periodStart} -> ${summary.cycle.periodEnd}`,
                };
            }
            return {
                employeeCode: line.employeeCode,
                employeeName: line.employeeName,
                nationalId: line.nationalId,
                grossPay: money(line.grossPay),
                employeeInsurance: money(line.employeeInsurance),
                salaryTax: money(line.monthlySalaryTax),
                martyrsContribution: money(line.martyrsContribution),
                netAfterStatutory: money(line.netAfterStatutory),
                branchName: line.branchName,
            };
        });

        if (format === 'json') {
            return {
                filename: `${template}-${summary.cycle.id}.json`,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    meta: {
                        template,
                        cycle: summary.cycle,
                        config: summary.config,
                        generatedAt: new Date().toISOString(),
                    },
                    totals: summary.totals,
                    rows: templateRows,
                }, null, 2),
            };
        }

        if (format === 'pdf') {
            const pdfBuffer = await generatePayrollCompliancePDF({
                lang: String(query?.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar',
                template,
                cycle: summary.cycle,
                config: summary.config,
                totals: summary.totals,
                rows: templateRows,
            });
            return {
                filename: `${template}-${summary.cycle.id}.pdf`,
                contentType: 'application/pdf',
                body: pdfBuffer,
            };
        }

        if (format === 'xlsx') {
            const lang = String(query?.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';
            const xlsxBuffer = await generateHrTabularXlsx({
                title: lang === 'ar' ? 'تقرير الرواتب والامتثال' : 'Payroll Compliance Report',
                subtitle: `${summary.cycle.branchName || summary.cycle.branchId} | ${summary.cycle.periodStart} -> ${summary.cycle.periodEnd}`,
                sheetName: template,
                lang,
                totals: lang === 'ar'
                    ? {
                        الموظفون: summary.totals.employees,
                        الإجمالي: money(summary.totals.grossPay),
                        التأمينات: money(summary.totals.employeeInsurance),
                        الضريبة: money(summary.totals.salaryTax),
                        الصافي: money(summary.totals.netAfterStatutory),
                    }
                    : {
                        Employees: summary.totals.employees,
                        Gross: money(summary.totals.grossPay),
                        Insurance: money(summary.totals.employeeInsurance),
                        Tax: money(summary.totals.salaryTax),
                        Net: money(summary.totals.netAfterStatutory),
                    },
                rows: templateRows,
            });
            return {
                filename: `${template}-${summary.cycle.id}.xlsx`,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                body: xlsxBuffer,
            };
        }

        const headers = Object.keys(templateRows[0] || {
            employeeCode: '',
            employeeName: '',
            nationalId: '',
            grossPay: '',
            netAfterStatutory: '',
        });
        return {
            filename: `${template}-${summary.cycle.id}.csv`,
            contentType: 'text/csv; charset=utf-8',
            body: buildCsv(headers, templateRows),
        };
    },
};

export default payrollComplianceService;
