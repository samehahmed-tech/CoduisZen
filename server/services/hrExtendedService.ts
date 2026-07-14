import { db } from '../db';
import { attendancePolicies, bonusPenaltyRecords, departments, employeeCompensationItems, employeeDocuments, employeeLoans, employeePayrollAssignments, employeeShiftAssignments, employees, jobTitles, leaveBalances, leaveRequests, leaveTypes, loanInstallments, overtimeEntries, payrollComponents, payrollProfiles, payrollRules, shiftTemplates } from '../../src/db/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const ensureEmployeeDocumentsTable = async () => {
    await db.execute(sql`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='employee_documents' AND xtype='U')
        CREATE TABLE employee_documents (
            id nvarchar(100) PRIMARY KEY,
            employee_id nvarchar(100) NOT NULL,
            branch_id nvarchar(50) NOT NULL,
            document_type nvarchar(50) NOT NULL,
            title nvarchar(255) NOT NULL,
            document_number nvarchar(100),
            issue_date datetime2,
            expiry_date datetime2,
            file_url nvarchar(1000),
            status nvarchar(20) DEFAULT 'ACTIVE' NOT NULL,
            notes nvarchar(max),
            metadata nvarchar(max) DEFAULT '{}',
            created_at datetime2 DEFAULT getdate(),
            updated_at datetime2 DEFAULT getdate()
        )
    `);
    await db.execute(sql`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'employee_documents_employee_idx' AND object_id = OBJECT_ID(N'employee_documents')) CREATE INDEX employee_documents_employee_idx ON employee_documents (employee_id)`);
    await db.execute(sql`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'employee_documents_branch_expiry_idx' AND object_id = OBJECT_ID(N'employee_documents')) CREATE INDEX employee_documents_branch_expiry_idx ON employee_documents (branch_id, expiry_date, status)`);
};

// =============================================================================
// Service
// =============================================================================

export const hrExtendedService = {
    async bootstrapHrDefaults(branchId: string) {
        if (!branchId) throw new Error('BRANCH_ID_REQUIRED');

        const leaveTypesRows = await this.getLeaveTypes();

        const policies = await this.getAttendancePolicies(branchId);
        let attendancePolicy = policies.find((policy) => policy.isDefault);
        if (!attendancePolicy) {
            attendancePolicy = await this.upsertAttendancePolicy({
                branchId,
                name: 'Default Attendance Policy',
                code: 'DEFAULT',
                graceLateMinutes: 15,
                earlyLeaveToleranceMinutes: 10,
                overtimeThresholdMinutes: 30,
                minHoursForPresent: 4,
                autoCloseOpenSessions: true,
                autoResolveMissingOut: false,
                isDefault: true,
                isActive: true,
            });
        }

        const shiftTemplatesRows = await this.getShiftTemplates(branchId);
        let defaultShiftTemplate = shiftTemplatesRows.find((template) => template.code === 'DEFAULT' && template.isActive !== false);
        if (!defaultShiftTemplate) {
            defaultShiftTemplate = await this.upsertShiftTemplate({
                branchId,
                name: 'Default Day Shift',
                code: 'DEFAULT',
                attendancePolicyId: attendancePolicy.id,
                startTime: '09:00',
                endTime: '17:00',
                breakMinutes: 0,
                graceLateMinutes: attendancePolicy.graceLateMinutes,
                earlyLeaveToleranceMinutes: attendancePolicy.earlyLeaveToleranceMinutes,
                overtimeThresholdMinutes: attendancePolicy.overtimeThresholdMinutes,
                workDays: ['sun', 'mon', 'tue', 'wed', 'thu'],
                isOvernight: false,
                isActive: true,
            });
        }

        const profiles = await this.getPayrollProfiles(branchId);
        let payrollProfile = profiles.find((profile) => profile.isDefault);
        if (!payrollProfile) {
            payrollProfile = await this.upsertPayrollProfile({
                branchId,
                name: 'Default Monthly Payroll',
                code: 'DEFAULT',
                payFrequency: 'MONTHLY',
                salaryMode: 'MONTHLY',
                currency: 'EGP',
                defaultAttendancePolicyId: attendancePolicy?.id,
                defaultOvertimeRate: 1.5,
                lateDeductionMode: 'HOURLY_RATE',
                absenceDeductionMode: 'DAILY_RATE',
                autoPostToGl: true,
                isDefault: true,
                isActive: true,
            });
        }

        const components = await this.getPayrollComponents(branchId);
        let lateComponent = components.find((component) => component.code === 'LATE_DEDUCTION');
        if (!lateComponent) {
            lateComponent = await this.upsertPayrollComponent({
                branchId,
                code: 'LATE_DEDUCTION',
                name: 'Late Deduction',
                nameAr: 'خصم التأخير',
                type: 'DEDUCTION',
                amountType: 'FIXED',
                calculationBasis: 'HOURLY_RATE',
                defaultValue: 0,
                affectsNetPay: true,
                sortOrder: 10,
                isActive: true,
            });
        }

        let absenceComponent = components.find((component) => component.code === 'ABSENCE_DEDUCTION');
        if (!absenceComponent) {
            absenceComponent = await this.upsertPayrollComponent({
                branchId,
                code: 'ABSENCE_DEDUCTION',
                name: 'Absence Deduction',
                nameAr: 'خصم الغياب',
                type: 'DEDUCTION',
                amountType: 'PERCENTAGE',
                calculationBasis: 'BASE_SALARY',
                defaultValue: 3.3333,
                affectsNetPay: true,
                sortOrder: 20,
                isActive: true,
            });
        }

        const rules = await this.getPayrollRules(payrollProfile.id, branchId);
        let lateRule = rules.find((rule) => rule.code === 'LATE_DEDUCTION_RULE');
        if (!lateRule) {
            lateRule = await this.upsertPayrollRule({
                payrollProfileId: payrollProfile.id,
                branchId,
                code: 'LATE_DEDUCTION_RULE',
                name: 'Deduct late minutes after grace period',
                triggerType: 'LATE_MINUTES',
                operation: 'DEDUCT',
                componentId: lateComponent.id,
                thresholdValue: 15,
                rateValue: 1,
                priority: 10,
                isActive: true,
            });
        }

        let absenceRule = rules.find((rule) => rule.code === 'ABSENCE_DEDUCTION_RULE');
        if (!absenceRule) {
            absenceRule = await this.upsertPayrollRule({
                payrollProfileId: payrollProfile.id,
                branchId,
                code: 'ABSENCE_DEDUCTION_RULE',
                name: 'Deduct absent working days',
                triggerType: 'ABSENCE_DAYS',
                operation: 'DEDUCT',
                componentId: absenceComponent.id,
                thresholdValue: 0,
                rateValue: 3.3333,
                priority: 20,
                isActive: true,
            });
        }

        return {
            branchId,
            leaveTypes: leaveTypesRows.length,
            attendancePolicy,
            shiftTemplate: defaultShiftTemplate,
            payrollProfile,
            components: [lateComponent, absenceComponent],
            rules: [lateRule, absenceRule],
        };
    },

    // =========================================================================
    // Employee Document Vault
    // =========================================================================
    async getEmployeeDocuments(input: { employeeId?: string; branchId?: string; expiringWithinDays?: number; status?: string }) {
        await ensureEmployeeDocumentsTable();
        const now = new Date();
        const expiryCutoff = input.expiringWithinDays !== undefined
            ? new Date(now.getTime() + Math.max(0, Number(input.expiringWithinDays || 0)) * 86400000)
            : null;

        const rows = await db.select({
            id: employeeDocuments.id,
            employeeId: employeeDocuments.employeeId,
            branchId: employeeDocuments.branchId,
            documentType: employeeDocuments.documentType,
            title: employeeDocuments.title,
            documentNumber: employeeDocuments.documentNumber,
            issueDate: employeeDocuments.issueDate,
            expiryDate: employeeDocuments.expiryDate,
            fileUrl: employeeDocuments.fileUrl,
            status: employeeDocuments.status,
            notes: employeeDocuments.notes,
            metadata: employeeDocuments.metadata,
            createdAt: employeeDocuments.createdAt,
            updatedAt: employeeDocuments.updatedAt,
            employeeName: employees.name,
            employeeNameAr: employees.nameAr,
            employeeCode: employees.employeeCode,
        }).from(employeeDocuments)
            .leftJoin(employees, eq(employeeDocuments.employeeId, employees.id))
            .where(and(
                input.employeeId ? eq(employeeDocuments.employeeId, input.employeeId) : undefined,
                input.branchId ? eq(employeeDocuments.branchId, input.branchId) : undefined,
                input.status ? eq(employeeDocuments.status, input.status) : undefined,
                expiryCutoff ? lte(employeeDocuments.expiryDate, expiryCutoff) : undefined,
            ))
            .orderBy(employeeDocuments.expiryDate, desc(employeeDocuments.createdAt));

        return rows.map((row) => {
            const expiryDate = row.expiryDate ? new Date(row.expiryDate) : null;
            const daysToExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000) : null;
            const computedStatus = row.status === 'ARCHIVED'
                ? 'ARCHIVED'
                : daysToExpiry === null
                    ? 'ACTIVE'
                    : daysToExpiry < 0
                        ? 'EXPIRED'
                        : daysToExpiry <= 30
                            ? 'EXPIRING_SOON'
                            : 'ACTIVE';
            return { ...row, daysToExpiry, computedStatus };
        });
    },

    async upsertEmployeeDocument(input: {
        id?: string;
        employeeId: string;
        branchId?: string;
        documentType: string;
        title: string;
        documentNumber?: string;
        issueDate?: string | Date | null;
        expiryDate?: string | Date | null;
        fileUrl?: string;
        status?: string;
        notes?: string;
        metadata?: Record<string, any>;
    }) {
        await ensureEmployeeDocumentsTable();
        if (!input.employeeId || !input.documentType || !input.title) {
            throw new Error('EMPLOYEE_DOCUMENT_TYPE_AND_TITLE_REQUIRED');
        }
        const [employee] = await db.select().top(1).from(employees).where(eq(employees.id, input.employeeId));
        if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

        const payload = {
            employeeId: input.employeeId,
            branchId: input.branchId || employee.branchId,
            documentType: input.documentType,
            title: input.title,
            documentNumber: input.documentNumber,
            issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
            expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
            fileUrl: input.fileUrl,
            status: input.status || 'ACTIVE',
            notes: input.notes,
            metadata: input.metadata || {},
            updatedAt: new Date(),
        } as any;

        if (input.id) {
            const [updated] = await db.update(employeeDocuments)
                .set(payload)
                .output()
                .where(eq(employeeDocuments.id, input.id));
            return updated;
        }

        const [created] = await db.insert(employeeDocuments).output().values({
            id: `EDOC-${randomUUID().slice(0, 8)}`,
            ...payload,
        });
        return created;
    },

    async archiveEmployeeDocument(id: string) {
        await ensureEmployeeDocumentsTable();
        const [updated] = await db.update(employeeDocuments)
            .set({ status: 'ARCHIVED', updatedAt: new Date() })
            .output()
            .where(eq(employeeDocuments.id, id));
        if (!updated) throw new Error('EMPLOYEE_DOCUMENT_NOT_FOUND');
        return updated;
    },

    // =========================================================================
    // Attendance Policies
    // =========================================================================
    async getAttendancePolicies(branchId?: string) {
        return await db.select().from(attendancePolicies)
            .where(branchId ? eq(attendancePolicies.branchId, branchId) : undefined)
            .orderBy(desc(attendancePolicies.createdAt));
    },

    async upsertAttendancePolicy(policy: {
        id?: string;
        branchId: string;
        name: string;
        code?: string;
        graceLateMinutes?: number;
        earlyLeaveToleranceMinutes?: number;
        overtimeThresholdMinutes?: number;
        minHoursForPresent?: number;
        attendanceProcessingMode?: string;
        operationalDayStartHour?: number;
        operationalDayEndHour?: number;
        maxSmartSessionHours?: number;
        geofenceStrict?: boolean;
        faceRecognitionRequired?: boolean;
        autoCloseOpenSessions?: boolean;
        autoResolveMissingOut?: boolean;
        isDefault?: boolean;
        isActive?: boolean;
    }) {
        if (policy.isDefault) {
            await db.update(attendancePolicies)
                .set({ isDefault: false, updatedAt: new Date() })
                .where(eq(attendancePolicies.branchId, policy.branchId));
        }

        if (policy.id) {
            const [updated] = await db.update(attendancePolicies)
                .set({
                    name: policy.name,
                    code: policy.code,
                    graceLateMinutes: policy.graceLateMinutes ?? 15,
                    earlyLeaveToleranceMinutes: policy.earlyLeaveToleranceMinutes ?? 10,
                    overtimeThresholdMinutes: policy.overtimeThresholdMinutes ?? 30,
                    minHoursForPresent: policy.minHoursForPresent ?? 4,
                    attendanceProcessingMode: policy.attendanceProcessingMode || 'AUTO',
                    operationalDayStartHour: policy.operationalDayStartHour ?? 8,
                    operationalDayEndHour: policy.operationalDayEndHour ?? 5,
                    maxSmartSessionHours: policy.maxSmartSessionHours ?? 22,
                    geofenceStrict: policy.geofenceStrict ?? false,
                    faceRecognitionRequired: policy.faceRecognitionRequired ?? false,
                    autoCloseOpenSessions: policy.autoCloseOpenSessions ?? false,
                    autoResolveMissingOut: policy.autoResolveMissingOut ?? false,
                    isDefault: policy.isDefault ?? false,
                    isActive: policy.isActive !== false,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(attendancePolicies.id, policy.id));
            return updated;
        }

        const id = `ATP-${randomUUID().slice(0,8)}`;
        const [created] = await db.insert(attendancePolicies).output().values({
            id,
            branchId: policy.branchId,
            name: policy.name,
            code: policy.code,
            graceLateMinutes: policy.graceLateMinutes ?? 15,
            earlyLeaveToleranceMinutes: policy.earlyLeaveToleranceMinutes ?? 10,
            overtimeThresholdMinutes: policy.overtimeThresholdMinutes ?? 30,
            minHoursForPresent: policy.minHoursForPresent ?? 4,
            attendanceProcessingMode: policy.attendanceProcessingMode || 'AUTO',
            operationalDayStartHour: policy.operationalDayStartHour ?? 8,
            operationalDayEndHour: policy.operationalDayEndHour ?? 5,
            maxSmartSessionHours: policy.maxSmartSessionHours ?? 22,
            geofenceStrict: policy.geofenceStrict ?? false,
            faceRecognitionRequired: policy.faceRecognitionRequired ?? false,
            autoCloseOpenSessions: policy.autoCloseOpenSessions ?? false,
            autoResolveMissingOut: policy.autoResolveMissingOut ?? false,
            isDefault: policy.isDefault ?? false,
            isActive: policy.isActive !== false,
        });
        return created;
    },

    // =========================================================================
    // Shift Templates
    // =========================================================================
    async getShiftTemplates(branchId?: string) {
        return await db.select().from(shiftTemplates)
            .where(branchId ? eq(shiftTemplates.branchId, branchId) : undefined)
            .orderBy(desc(shiftTemplates.createdAt));
    },

    async upsertShiftTemplate(template: {
        id?: string;
        branchId: string;
        name: string;
        code?: string;
        attendancePolicyId?: string;
        startTime: string;
        endTime: string;
        breakMinutes?: number;
        graceLateMinutes?: number;
        earlyLeaveToleranceMinutes?: number;
        overtimeThresholdMinutes?: number;
        workDays?: string[];
        isOvernight?: boolean;
        isActive?: boolean;
    }) {
        if (template.id) {
            const [updated] = await db.update(shiftTemplates)
                .set({
                    name: template.name,
                    code: template.code,
                    attendancePolicyId: template.attendancePolicyId,
                    startTime: template.startTime,
                    endTime: template.endTime,
                    breakMinutes: template.breakMinutes ?? 0,
                    graceLateMinutes: template.graceLateMinutes,
                    earlyLeaveToleranceMinutes: template.earlyLeaveToleranceMinutes,
                    overtimeThresholdMinutes: template.overtimeThresholdMinutes,
                    workDays: template.workDays || ['sun', 'mon', 'tue', 'wed', 'thu'],
                    isOvernight: template.isOvernight ?? false,
                    isActive: template.isActive !== false,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(shiftTemplates.id, template.id));
            return updated;
        }

        const id = `SFT-${randomUUID().slice(0,8)}`;
        const [created] = await db.insert(shiftTemplates).output().values({
            id,
            branchId: template.branchId,
            name: template.name,
            code: template.code,
            attendancePolicyId: template.attendancePolicyId,
            startTime: template.startTime,
            endTime: template.endTime,
            breakMinutes: template.breakMinutes ?? 0,
            graceLateMinutes: template.graceLateMinutes,
            earlyLeaveToleranceMinutes: template.earlyLeaveToleranceMinutes,
            overtimeThresholdMinutes: template.overtimeThresholdMinutes,
            workDays: template.workDays || ['sun', 'mon', 'tue', 'wed', 'thu'],
            isOvernight: template.isOvernight ?? false,
            isActive: template.isActive !== false,
        });
        return created;
    },

    async getEmployeeShiftAssignments(employeeId?: string, branchId?: string) {
        return await db.select().from(employeeShiftAssignments)
            .where(and(
                employeeId ? eq(employeeShiftAssignments.employeeId, employeeId) : undefined,
                branchId ? eq(employeeShiftAssignments.branchId, branchId) : undefined,
            ))
            .orderBy(desc(employeeShiftAssignments.createdAt));
    },

    async assignShiftTemplate(input: {
        employeeId: string;
        branchId: string;
        shiftTemplateId: string;
        effectiveFrom: string;
        effectiveTo?: string;
        isPrimary?: boolean;
    }) {
        const [created] = await db.insert(employeeShiftAssignments).output().values({
            employeeId: input.employeeId,
            branchId: input.branchId,
            shiftTemplateId: input.shiftTemplateId,
            effectiveFrom: new Date(input.effectiveFrom),
            effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
            isPrimary: input.isPrimary !== false,
        });
        return created;
    },

    // =========================================================================
    // Payroll Profiles / Components / Rules
    // =========================================================================
    async getPayrollProfiles(branchId?: string) {
        return await db.select().from(payrollProfiles)
            .where(branchId ? eq(payrollProfiles.branchId, branchId) : undefined)
            .orderBy(desc(payrollProfiles.createdAt));
    },

    async upsertPayrollProfile(profile: {
        id?: string;
        branchId: string;
        name: string;
        code?: string;
        payFrequency?: string;
        salaryMode?: string;
        currency?: string;
        defaultAttendancePolicyId?: string;
        defaultOvertimeRate?: number;
        lateDeductionMode?: string;
        absenceDeductionMode?: string;
        autoPostToGl?: boolean;
        isDefault?: boolean;
        isActive?: boolean;
    }) {
        if (profile.isDefault) {
            await db.update(payrollProfiles)
                .set({ isDefault: false, updatedAt: new Date() })
                .where(eq(payrollProfiles.branchId, profile.branchId));
        }

        if (profile.id) {
            const [updated] = await db.update(payrollProfiles)
                .set({
                    name: profile.name,
                    code: profile.code,
                    payFrequency: profile.payFrequency || 'MONTHLY',
                    salaryMode: profile.salaryMode || 'MONTHLY',
                    currency: profile.currency || 'EGP',
                    defaultAttendancePolicyId: profile.defaultAttendancePolicyId,
                    defaultOvertimeRate: profile.defaultOvertimeRate ?? 1.5,
                    lateDeductionMode: profile.lateDeductionMode || 'NONE',
                    absenceDeductionMode: profile.absenceDeductionMode || 'DAILY_RATE',
                    autoPostToGl: profile.autoPostToGl ?? true,
                    isDefault: profile.isDefault ?? false,
                    isActive: profile.isActive !== false,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(payrollProfiles.id, profile.id));
            return updated;
        }

        const id = `PPR-${randomUUID().slice(0,8)}`;
        const [created] = await db.insert(payrollProfiles).output().values({
            id,
            branchId: profile.branchId,
            name: profile.name,
            code: profile.code,
            payFrequency: profile.payFrequency || 'MONTHLY',
            salaryMode: profile.salaryMode || 'MONTHLY',
            currency: profile.currency || 'EGP',
            defaultAttendancePolicyId: profile.defaultAttendancePolicyId,
            defaultOvertimeRate: profile.defaultOvertimeRate ?? 1.5,
            lateDeductionMode: profile.lateDeductionMode || 'NONE',
            absenceDeductionMode: profile.absenceDeductionMode || 'DAILY_RATE',
            autoPostToGl: profile.autoPostToGl ?? true,
            isDefault: profile.isDefault ?? false,
            isActive: profile.isActive !== false,
        });
        return created;
    },

    async assignPayrollProfile(input: {
        employeeId: string;
        payrollProfileId: string;
        effectiveFrom: string;
        effectiveTo?: string;
        isPrimary?: boolean;
    }) {
        const [created] = await db.insert(employeePayrollAssignments).output().values({
            employeeId: input.employeeId,
            payrollProfileId: input.payrollProfileId,
            effectiveFrom: new Date(input.effectiveFrom),
            effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
            isPrimary: input.isPrimary !== false,
        });
        return created;
    },

    async getEmployeePayrollAssignments(employeeId?: string) {
        return await db.select().from(employeePayrollAssignments)
            .where(employeeId ? eq(employeePayrollAssignments.employeeId, employeeId) : undefined)
            .orderBy(desc(employeePayrollAssignments.createdAt));
    },

    async getPayrollComponents(branchId?: string) {
        return await db.select().from(payrollComponents)
            .where(branchId ? eq(payrollComponents.branchId, branchId) : undefined)
            .orderBy(payrollComponents.sortOrder, payrollComponents.createdAt);
    },

    async upsertPayrollComponent(component: {
        id?: string;
        branchId: string;
        code: string;
        name: string;
        nameAr?: string;
        type: string;
        amountType?: string;
        calculationBasis?: string;
        defaultValue?: number;
        taxable?: boolean;
        pensionable?: boolean;
        affectsNetPay?: boolean;
        sortOrder?: number;
        isActive?: boolean;
    }) {
        if (component.id) {
            const [updated] = await db.update(payrollComponents)
                .set({
                    code: component.code,
                    name: component.name,
                    nameAr: component.nameAr,
                    type: component.type,
                    amountType: component.amountType || 'FIXED',
                    calculationBasis: component.calculationBasis || 'BASE_SALARY',
                    defaultValue: component.defaultValue ?? 0,
                    taxable: component.taxable ?? false,
                    pensionable: component.pensionable ?? false,
                    affectsNetPay: component.affectsNetPay ?? true,
                    sortOrder: component.sortOrder ?? 0,
                    isActive: component.isActive !== false,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(payrollComponents.id, component.id));
            return updated;
        }

        const id = `PCM-${randomUUID().slice(0,8)}`;
        const [created] = await db.insert(payrollComponents).output().values({
            id,
            branchId: component.branchId,
            code: component.code,
            name: component.name,
            nameAr: component.nameAr,
            type: component.type,
            amountType: component.amountType || 'FIXED',
            calculationBasis: component.calculationBasis || 'BASE_SALARY',
            defaultValue: component.defaultValue ?? 0,
            taxable: component.taxable ?? false,
            pensionable: component.pensionable ?? false,
            affectsNetPay: component.affectsNetPay ?? true,
            sortOrder: component.sortOrder ?? 0,
            isActive: component.isActive !== false,
        });
        return created;
    },

    async getPayrollRules(payrollProfileId?: string, branchId?: string) {
        return await db.select().from(payrollRules)
            .where(and(
                payrollProfileId ? eq(payrollRules.payrollProfileId, payrollProfileId) : undefined,
                branchId ? eq(payrollRules.branchId, branchId) : undefined,
            ))
            .orderBy(payrollRules.priority, payrollRules.createdAt);
    },

    async upsertPayrollRule(rule: {
        id?: string;
        payrollProfileId: string;
        branchId: string;
        code: string;
        name: string;
        triggerType: string;
        operation: string;
        componentId?: string;
        thresholdValue?: number;
        rateValue?: number;
        capValue?: number;
        formula?: string;
        priority?: number;
        isActive?: boolean;
    }) {
        if (rule.id) {
            const [updated] = await db.update(payrollRules)
                .set({
                    code: rule.code,
                    name: rule.name,
                    triggerType: rule.triggerType,
                    operation: rule.operation,
                    componentId: rule.componentId,
                    thresholdValue: rule.thresholdValue ?? 0,
                    rateValue: rule.rateValue ?? 0,
                    capValue: rule.capValue,
                    formula: rule.formula,
                    priority: rule.priority ?? 0,
                    isActive: rule.isActive !== false,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(payrollRules.id, rule.id));
            return updated;
        }

        const id = `PRL-${randomUUID().slice(0,8)}`;
        const [created] = await db.insert(payrollRules).output().values({
            id,
            payrollProfileId: rule.payrollProfileId,
            branchId: rule.branchId,
            code: rule.code,
            name: rule.name,
            triggerType: rule.triggerType,
            operation: rule.operation,
            componentId: rule.componentId,
            thresholdValue: rule.thresholdValue ?? 0,
            rateValue: rule.rateValue ?? 0,
            capValue: rule.capValue,
            formula: rule.formula,
            priority: rule.priority ?? 0,
            isActive: rule.isActive !== false,
        });
        return created;
    },

    async getEmployeeCompensationItems(filters?: { employeeId?: string; branchId?: string; activeOnly?: boolean }) {
        return await db.select().from(employeeCompensationItems)
            .where(and(
                filters?.employeeId ? eq(employeeCompensationItems.employeeId, filters.employeeId) : undefined,
                filters?.branchId ? eq(employeeCompensationItems.branchId, filters.branchId) : undefined,
                filters?.activeOnly === false ? undefined : eq(employeeCompensationItems.isActive, true),
            ))
            .orderBy(desc(employeeCompensationItems.isActive), employeeCompensationItems.type, employeeCompensationItems.createdAt);
    },

    async upsertEmployeeCompensationItem(input: {
        id?: string;
        employeeId: string;
        branchId?: string;
        code?: string;
        name: string;
        nameAr?: string;
        category?: string;
        type: 'ALLOWANCE' | 'DEDUCTION';
        amount: number;
        currency?: string;
        isRecurring?: boolean;
        isActive?: boolean;
        effectiveFrom?: string | Date | null;
        effectiveTo?: string | Date | null;
        notes?: string;
        metadata?: Record<string, any>;
    }) {
        if (!input.employeeId || !String(input.name || '').trim()) {
            throw new Error('EMPLOYEE_AND_ITEM_NAME_REQUIRED');
        }

        const [employee] = await db.select().top(1).from(employees).where(eq(employees.id, input.employeeId));
        if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

        const payload = {
            employeeId: input.employeeId,
            branchId: input.branchId || employee.branchId,
            code: input.code,
            name: String(input.name).trim(),
            nameAr: input.nameAr?.trim() || null,
            category: input.category || 'GENERAL',
            type: input.type || 'ALLOWANCE',
            amount: Number(input.amount || 0),
            currency: input.currency || 'EGP',
            isRecurring: input.isRecurring !== false,
            isActive: input.isActive !== false,
            effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
            effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
            notes: input.notes?.trim() || null,
            metadata: input.metadata || {},
            updatedAt: new Date(),
        } as const;

        if (input.id) {
            const [updated] = await db.update(employeeCompensationItems)
                .set(payload)
                .output()
                .where(eq(employeeCompensationItems.id, input.id));
            if (!updated) throw new Error('EMPLOYEE_COMPENSATION_ITEM_NOT_FOUND');
            return updated;
        }

        const [created] = await db.insert(employeeCompensationItems).output().values({
            id: `ECI-${randomUUID().slice(0, 8)}`,
            ...payload,
        });
        return created;
    },

    async archiveEmployeeCompensationItem(id: string) {
        const [updated] = await db.update(employeeCompensationItems)
            .set({
                isActive: false,
                effectiveTo: new Date(),
                updatedAt: new Date(),
            })
            .output()
            .where(eq(employeeCompensationItems.id, id));
        if (!updated) throw new Error('EMPLOYEE_COMPENSATION_ITEM_NOT_FOUND');
        return updated;
    },

    // =========================================================================
    // Loans / Advances
    // =========================================================================
    async getEmployeeLoans(filters?: { employeeId?: string; branchId?: string; status?: string }) {
        return await db.select().from(employeeLoans)
            .where(and(
                filters?.employeeId ? eq(employeeLoans.employeeId, filters.employeeId) : undefined,
                filters?.branchId ? eq(employeeLoans.branchId, filters.branchId) : undefined,
                filters?.status ? eq(employeeLoans.status, filters.status) : undefined,
            ))
            .orderBy(desc(employeeLoans.createdAt));
    },

    async createEmployeeLoan(input: {
        employeeId: string;
        branchId: string;
        type?: string;
        principalAmount: number;
        installmentAmount?: number;
        installmentsCount?: number;
        effectiveFrom?: string;
        notes?: string;
        requestedBy?: string;
    }) {
        const installmentsCount = Math.max(1, Number(input.installmentsCount || 1));
        const installmentAmount = Number(input.installmentAmount || (Number(input.principalAmount) / installmentsCount));
        const id = `LOAN-${randomUUID().slice(0,8)}`;

        const [loan] = await db.insert(employeeLoans).values({
            id,
            employeeId: input.employeeId,
            branchId: input.branchId,
            type: input.type || 'ADVANCE',
            principalAmount: Number(input.principalAmount),
            installmentAmount,
            installmentsCount,
            outstandingAmount: Number(input.principalAmount),
            effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
            notes: input.notes,
            requestedBy: input.requestedBy,
        });

        if (input.effectiveFrom) {
            const baseDate = new Date(input.effectiveFrom);
            const installments = Array.from({ length: installmentsCount }).map((_, index) => {
                const due = new Date(baseDate);
                due.setMonth(due.getMonth() + index);
                return {
                    loanId: id,
                    dueDate: due,
                    amount: installmentAmount,
                    status: 'PENDING' as const,
                };
            });
            await db.insert(loanInstallments).values(installments);
        }

        return loan;
    },

    async approveEmployeeLoan(loanId: string, approvedBy: string, status: 'APPROVED' | 'DISBURSED' = 'APPROVED') {
        const now = new Date();
        const [updated] = await db.update(employeeLoans)
            .set({
                status,
                approvedBy,
                approvedAt: now,
                disbursedAt: status === 'DISBURSED' ? now : undefined,
                updatedAt: now,
            })
            .output()
            .where(eq(employeeLoans.id, loanId));
        if (!updated) throw new Error('Loan not found');
        return updated;
    },

    async getLoanInstallments(loanId: string) {
        return await db.select().from(loanInstallments)
            .where(eq(loanInstallments.loanId, loanId))
            .orderBy(loanInstallments.dueDate);
    },

    // =========================================================================
    // Leave Balances
    // =========================================================================
    async upsertLeaveBalance(input: {
        employeeId: string;
        leaveTypeId: string;
        year: number;
        entitledDays?: number;
        carriedForwardDays?: number;
        usedDays?: number;
        pendingDays?: number;
        adjustmentDays?: number;
    }) {
        const existing = await db.select().top(1).from(leaveBalances)
            .where(and(
                eq(leaveBalances.employeeId, input.employeeId),
                eq(leaveBalances.leaveTypeId, input.leaveTypeId),
                eq(leaveBalances.year, input.year),
            ));

        if (existing[0]) {
            const [updated] = await db.update(leaveBalances)
                .set({
                    entitledDays: input.entitledDays ?? existing[0].entitledDays,
                    carriedForwardDays: input.carriedForwardDays ?? existing[0].carriedForwardDays,
                    usedDays: input.usedDays ?? existing[0].usedDays,
                    pendingDays: input.pendingDays ?? existing[0].pendingDays,
                    adjustmentDays: input.adjustmentDays ?? existing[0].adjustmentDays,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(leaveBalances.id, existing[0].id));
            return updated;
        }

        const [created] = await db.insert(leaveBalances).output().values({
            employeeId: input.employeeId,
            leaveTypeId: input.leaveTypeId,
            year: input.year,
            entitledDays: input.entitledDays ?? 0,
            carriedForwardDays: input.carriedForwardDays ?? 0,
            usedDays: input.usedDays ?? 0,
            pendingDays: input.pendingDays ?? 0,
            adjustmentDays: input.adjustmentDays ?? 0,
            updatedAt: new Date(),
        });
        return created;
    },

    async getPersistedLeaveBalances(employeeId?: string, year?: number) {
        return await db.select().from(leaveBalances)
            .where(and(
                employeeId ? eq(leaveBalances.employeeId, employeeId) : undefined,
                year ? eq(leaveBalances.year, year) : undefined,
            ))
            .orderBy(desc(leaveBalances.year));
    },

    // =========================================================================
    // Bonuses / Penalties
    // =========================================================================
    async getBonusPenaltyRecords(filters?: { employeeId?: string; branchId?: string; status?: string; type?: string }) {
        return await db.select().from(bonusPenaltyRecords)
            .where(and(
                filters?.employeeId ? eq(bonusPenaltyRecords.employeeId, filters.employeeId) : undefined,
                filters?.branchId ? eq(bonusPenaltyRecords.branchId, filters.branchId) : undefined,
                filters?.status ? eq(bonusPenaltyRecords.status, filters.status) : undefined,
                filters?.type ? eq(bonusPenaltyRecords.type, filters.type) : undefined,
            ))
            .orderBy(desc(bonusPenaltyRecords.effectiveDate), desc(bonusPenaltyRecords.createdAt));
    },

    async createBonusPenaltyRecord(input: {
        employeeId: string;
        branchId: string;
        type: 'BONUS' | 'PENALTY';
        category?: string;
        amount: number;
        effectiveDate: string;
        reason: string;
        notes?: string;
        requestedBy?: string;
    }) {
        const [created] = await db.insert(bonusPenaltyRecords).values({
            id: `BPR-${randomUUID().slice(0,8)}`,
            employeeId: input.employeeId,
            branchId: input.branchId,
            type: input.type,
            category: input.category,
            amount: Number(input.amount),
            effectiveDate: new Date(input.effectiveDate),
            reason: input.reason,
            notes: input.notes,
            requestedBy: input.requestedBy,
            status: 'PENDING',
        });
        return created;
    },

    async approveBonusPenaltyRecord(id: string, approvedBy: string, status: 'APPROVED' | 'REJECTED' = 'APPROVED') {
        const [updated] = await db.update(bonusPenaltyRecords)
            .set({
                status,
                approvedBy,
                approvedAt: new Date(),
                updatedAt: new Date(),
            })
            .output()
            .where(eq(bonusPenaltyRecords.id, id));
        if (!updated) throw new Error('Bonus/Penalty record not found');
        return updated;
    },

    // =========================================================================
    // Departments
    // =========================================================================
    async getDepartments() {
        return await db.select().from(departments);
    },

    async upsertDepartment(dept: { id?: string; name: string; nameAr?: string; parentId?: string; managerId?: string; branchId?: string | null; isActive?: boolean }, updatedBy?: string) {
        if (dept.id) {
            const [existing] = await db.update(departments)
                .set({
                    branchId: dept.branchId || null,
                    name: dept.name,
                    nameAr: dept.nameAr,
                    managerId: dept.managerId,
                    parentId: dept.parentId,
                    isActive: dept.isActive !== false,
                })
                .output()
                .where(eq(departments.id, dept.id));
            return existing;
        }

        const id = `DEPT-${randomUUID().slice(0,8)}`;
        const newDeptRows = await db.insert(departments).output().values({
            id,
            branchId: dept.branchId || null,
            name: dept.name,
            nameAr: dept.nameAr,
            managerId: dept.managerId,
            parentId: dept.parentId,
            isActive: dept.isActive !== false,
        }) as any[];
        const newDept = newDeptRows[0];
        return newDept;
    },

    async deleteDepartment(id: string) {
        const childDepartments = await db.select({ id: departments.id })
            .top(1)
            .from(departments)
            .where(eq(departments.parentId, id));
        if (childDepartments.length > 0) {
            throw new Error('DEPARTMENT_HAS_CHILDREN');
        }

        const deletedRows = await db.delete(departments)
            .output()
            .where(eq(departments.id, id)) as any[];
        const deleted = deletedRows[0];
        if (!deleted) throw new Error('Department not found');
        return deleted;
    },

    // =========================================================================
    // Job Titles
    // =========================================================================
    async getJobTitles() {
        return await db.select().from(jobTitles).orderBy(jobTitles.title);
    },

    async upsertJobTitle(title: { id?: string; name: string; nameAr?: string; departmentId?: string; isActive?: boolean }, updatedBy?: string) {
        const titleName = String(title.name || '').trim();
        if (!titleName) throw new Error('JOB_TITLE_NAME_REQUIRED');

        if (title.id) {
            const existingRows = await db.update(jobTitles)
                .set({
                    title: titleName,
                    nameAr: title.nameAr,
                    departmentId: null,
                    isActive: title.isActive !== false,
                })
                .output()
                .where(eq(jobTitles.id, title.id)) as any[];
            const existing = existingRows[0];
            return existing;
        }

        const id = `JOB-${randomUUID().slice(0,8)}`;
        const newTitleRows = await db.insert(jobTitles).output().values({
            id,
            title: titleName,
            nameAr: title.nameAr,
            departmentId: null,
            isActive: title.isActive !== false,
        }) as any[];
        const newTitle = newTitleRows[0];
        return newTitle;
    },

    async deleteJobTitle(id: string) {
        const deletedRows = await db.delete(jobTitles)
            .output()
            .where(eq(jobTitles.id, id)) as any[];
        const deleted = deletedRows[0];
        if (!deleted) throw new Error('Job title not found');
        return deleted;
    },

    // =========================================================================
    // Leave Types
    // =========================================================================
    async getLeaveTypes() {
        const types = await db.select().from(leaveTypes);
        if (types.length === 0) {
            const defaults = [
                { id: 'LT-ANNUAL', name: 'Annual Leave', nameAr: 'إجازة سنوية', daysPerYear: 21, isPaid: true, requiresApproval: true },
                { id: 'LT-SICK', name: 'Sick Leave', nameAr: 'إجازة مرضية', daysPerYear: 30, isPaid: true, requiresApproval: true },
                { id: 'LT-CASUAL', name: 'Casual Leave', nameAr: 'إجازة عارضة', daysPerYear: 6, isPaid: true, requiresApproval: true },
                { id: 'LT-MATERNITY', name: 'Maternity Leave', nameAr: 'إجازة أمومة', daysPerYear: 90, isPaid: true, requiresApproval: true },
                { id: 'LT-UNPAID', name: 'Unpaid Leave', nameAr: 'إجازة بدون مرتب', daysPerYear: 365, isPaid: false, requiresApproval: true },
            ];
            await db.insert(leaveTypes).values(defaults);
            return defaults;
        }
        return types;
    },

    // =========================================================================
    // Leave Requests
    // =========================================================================
    async getLeaveRequests(filters?: { employeeId?: string; status?: string; branchId?: string; startDate?: string; endDate?: string; limit?: number }) {
        const conditions = [];
        const overlapStart = filters?.startDate ? new Date(filters.startDate) : undefined;
        const overlapEnd = filters?.endDate ? new Date(filters.endDate) : undefined;

        if (overlapStart && !Number.isNaN(overlapStart.getTime())) overlapStart.setHours(0, 0, 0, 0);
        if (overlapEnd && !Number.isNaN(overlapEnd.getTime())) overlapEnd.setHours(23, 59, 59, 999);

        if (filters?.employeeId) conditions.push(eq(leaveRequests.employeeId, filters.employeeId));
        if (filters?.status) conditions.push(eq(leaveRequests.status, filters.status));
        if (filters?.branchId) conditions.push(eq(employees.branchId, filters.branchId));
        if (overlapStart) conditions.push(lte(leaveRequests.startDate, overlapEnd || overlapStart));
        if (overlapEnd) conditions.push(gte(leaveRequests.endDate, overlapStart || overlapEnd));

        const baseQuery = db.select({
            id: leaveRequests.id,
            employeeId: leaveRequests.employeeId,
            leaveTypeId: leaveRequests.leaveTypeId,
            startDate: leaveRequests.startDate,
            endDate: leaveRequests.endDate,
            totalDays: leaveRequests.totalDays,
            reason: leaveRequests.reason,
            status: leaveRequests.status,
            approvedBy: leaveRequests.approvedBy,
            rejectionReason: leaveRequests.rejectionReason,
            createdAt: leaveRequests.createdAt,
            updatedAt: leaveRequests.updatedAt,
            leaveTypeName: leaveTypes.name,
            leaveTypeNameAr: leaveTypes.nameAr,
            isPaid: leaveTypes.isPaid,
        }).from(leaveRequests)
            .leftJoin(employees, eq(leaveRequests.employeeId, employees.id))
            .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(leaveRequests.createdAt));

        if (filters?.limit && filters.limit > 0) {
            return await baseQuery.offset(0).fetch(filters.limit);
        }
        return await baseQuery;
    },

    async createLeaveRequest(data: {
        employeeId: string;
        employeeName: string;
        leaveTypeId: string;
        startDate: string;
        endDate: string;
        reason: string;
    }) {
        const type = await db._query.leaveTypes.findFirst({ where: eq(leaveTypes.id, data.leaveTypeId) });
        if (!type) throw new Error('Invalid leave type');

        // Calculate working days
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        let totalDays = 0;
        const current = new Date(start);
        while (current <= end) {
            const day = current.getDay();
            if (day !== 5) { // Friday is weekend in Egypt
                totalDays++;
            }
            current.setDate(current.getDate() + 1);
        }
        const balance = await this.getLeaveBalance(data.employeeId, data.leaveTypeId);
        if (type.isPaid !== false && Number(type.daysPerYear || 0) < 365 && totalDays > Number(balance.remaining || 0)) {
            throw new Error('LEAVE_BALANCE_EXCEEDED');
        }

        const id = `LR-${randomUUID().slice(0,8)}`;
        const [request] = await db.insert(leaveRequests).values({
            id,
            employeeId: data.employeeId,
            leaveTypeId: data.leaveTypeId,
            startDate: new Date(data.startDate),
            endDate: new Date(data.endDate),
            totalDays,
            reason: data.reason,
            status: 'PENDING',
        });

        return request;
    },

    async approveLeaveRequest(requestId: string, approvedBy: string) {
        const [updated] = await db.update(leaveRequests)
            .set({ status: 'APPROVED', approvedBy, updatedAt: new Date() })
            .output()
            .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.status, 'PENDING')));
            
        if (!updated) throw new Error('Leave request not found or not pending');
        return updated;
    },

    async rejectLeaveRequest(requestId: string, rejectedBy: string, reason: string) {
        const [updated] = await db.update(leaveRequests)
            .set({ status: 'REJECTED', approvedBy: rejectedBy, rejectionReason: reason, updatedAt: new Date() })
            .output()
            .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.status, 'PENDING')));

        if (!updated) throw new Error('Leave request not found or not pending');
        return updated;
    },

    // =========================================================================
    // Leave Balance
    // =========================================================================
    async getLeaveBalance(employeeId: string, leaveTypeId?: string) {
        let typeId = leaveTypeId || 'LT-ANNUAL';
        const type = await db._query.leaveTypes.findFirst({ where: eq(leaveTypes.id, typeId) });
        if (!type) throw new Error('Leave type not found');

        const yearStart = new Date(new Date().getFullYear(), 0, 1);

        const yearEnd = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999);

        const requests = await db._query.leaveRequests.findMany({
            where: and(
                eq(leaveRequests.employeeId, employeeId),
                eq(leaveRequests.leaveTypeId, type.id),
                gte(leaveRequests.endDate, yearStart),
                lte(leaveRequests.startDate, yearEnd)
            )
        });

        const used = requests.filter(r => r.status === 'APPROVED').reduce((sum, r) => sum + r.totalDays, 0);
        const pending = requests.filter(r => r.status === 'PENDING').reduce((sum, r) => sum + r.totalDays, 0);

        return {
            employeeId,
            leaveTypeId: type.id,
            leaveTypeName: type.name,
            entitled: type.daysPerYear,
            used,
            pending,
            remaining: type.daysPerYear - used,
            carriedOver: 0,
        };
    },

    async getAllBalances(employeeId: string) {
        const types = await this.getLeaveTypes();
        return Promise.all(types.map(t => this.getLeaveBalance(employeeId, t.id)));
    },

    // =========================================================================
    // Overtime
    // =========================================================================
    async getOvertimeEntries(filters?: { employeeId?: string; status?: string; month?: string }) {
        let conditions = [];
        if (filters?.employeeId) conditions.push(eq(overtimeEntries.employeeId, filters.employeeId));
        if (filters?.status) conditions.push(eq(overtimeEntries.status, filters.status));
        // For month filtering we would need a SQL expression or fetch and filter
        
        const entries = await db._query.overtimeEntries.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            orderBy: [desc(overtimeEntries.date)]
        });

        if (filters?.month) {
            return entries.filter(e => e.date.toISOString().startsWith(filters.month!));
        }

        return entries;
    },

    async recordOvertime(data: {
        employeeId: string;
        date: string;
        regularHours: number;
        overtimeHours: number;
        overtimeRate?: number;
        baseSalaryPerHour?: number;
    }) {
        const rate = data.overtimeRate || 1.5;
        const hourlyRate = data.baseSalaryPerHour || 0;
        const amount = data.overtimeHours * hourlyRate * rate;

        const id = `OT-${randomUUID().slice(0,8)}`;
        const [entry] = await db.insert(overtimeEntries).values({
            id,
            employeeId: data.employeeId,
            date: new Date(data.date),
            regularHours: data.regularHours,
            overtimeHours: data.overtimeHours,
            overtimeRate: rate,
            overtimeAmount: Math.round(amount * 100) / 100,
            status: 'PENDING',
        });

        return entry;
    },

    async approveOvertime(entryId: string, approvedBy: string) {
        const [updated] = await db.update(overtimeEntries)
            .set({ status: 'APPROVED', approvedBy })
            .output()
            .where(and(eq(overtimeEntries.id, entryId), eq(overtimeEntries.status, 'PENDING')));

        if (!updated) throw new Error('Overtime entry not found or not pending');
        return updated;
    },
};

export default hrExtendedService;
