import { and, desc, eq, gte, lte, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { attendancePolicies, employees, leaveRequests, shiftPlanEntries, shiftPlans, shiftTemplates } from '../../src/db/schema';
import { findShiftConflict, hasPartialShiftTime } from '../utils/schedulingPolicy';
import { buildAutoSchedulePreview } from '../utils/autoSchedulePolicy';
import laborForecastService from './laborForecastService';

const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const toSqlDate = (date: string | Date) => {
    const datePart = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
    return new Date(`${datePart}T00:00:00.000Z`);
};

const getMinimumRestMinutes = async (branchId: string, shiftTemplateId?: string | null) => {
    let policyId: string | null | undefined;
    if (shiftTemplateId) {
        const [template] = await db.select({ attendancePolicyId: shiftTemplates.attendancePolicyId })
            .from(shiftTemplates).where(eq(shiftTemplates.id, shiftTemplateId)).top(1);
        policyId = template?.attendancePolicyId;
    }
    const [policy] = policyId
        ? await db.select({ minimumRestMinutes: attendancePolicies.minimumRestMinutes }).from(attendancePolicies).where(eq(attendancePolicies.id, policyId)).top(1)
        : await db.select({ minimumRestMinutes: attendancePolicies.minimumRestMinutes }).from(attendancePolicies)
            .where(and(eq(attendancePolicies.branchId, branchId), eq(attendancePolicies.isDefault, true), eq(attendancePolicies.isActive, true))).top(1);
    // 11h is the safe floor; policy can only extend it up to 24h.
    return Math.max(660, Math.min(1440, Number(policy?.minimumRestMinutes || 660)));
};

export const schedulingService = {
    async previewAutoSchedule(input: { planId: string; branchId: string }) {
        const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, input.planId)).top(1);
        if (!plan) throw new Error('SHIFT_PLAN_NOT_FOUND');
        if (plan.branchId !== input.branchId) throw new Error('SHIFT_PLAN_BRANCH_MISMATCH');
        const [template] = await db.select().from(shiftTemplates)
            .where(and(eq(shiftTemplates.branchId, input.branchId), eq(shiftTemplates.isActive, true))).top(1);
        if (!template) throw new Error('ACTIVE_SHIFT_TEMPLATE_REQUIRED');
        const [employeesForBranch, existingEntries, forecast] = await Promise.all([
            db.select({ id: employees.id, name: employees.name }).from(employees)
                .where(and(eq(employees.branchId, input.branchId), eq(employees.isActive, true))),
            db.select().from(shiftPlanEntries).where(and(eq(shiftPlanEntries.planId, input.planId), eq(shiftPlanEntries.branchId, input.branchId))),
            laborForecastService.getLaborForecast(input.branchId),
        ]);
        const planStart = new Date(plan.weekStart).toISOString().slice(0, 10);
        const planEnd = new Date(plan.weekEnd).toISOString().slice(0, 10);
        const days = forecast.forecast
            .filter(point => point.date >= planStart && point.date <= planEnd)
            .map(point => ({ date: point.date, requiredHeadcount: point.requiredHeadcount }));
        const preview = buildAutoSchedulePreview({
            days,
            employees: employeesForBranch,
            template: { id: template.id, startTime: template.startTime, endTime: template.endTime, workDays: template.workDays },
            existingEntries,
        });
        return {
            planId: input.planId,
            branchId: input.branchId,
            dataQuality: forecast.dataQuality,
            confidence: forecast.confidence,
            source: forecast.source,
            template: { id: template.id, name: template.name, startTime: template.startTime, endTime: template.endTime },
            ...preview,
        };
    },

    async applyAutoSchedule(input: { planId: string; branchId: string; actorId: string }) {
        const preview = await this.previewAutoSchedule(input);
        if (!preview.readyToPublish) throw new Error('AUTO_SCHEDULE_PREVIEW_BLOCKED');
        return db.transaction(async (tx) => {
            const [claimed] = await tx.update(shiftPlans)
                .set({ status: 'AUTO_GENERATING', updatedAt: new Date() })
                .output()
                .where(and(
                    eq(shiftPlans.id, input.planId),
                    eq(shiftPlans.branchId, input.branchId),
                    eq(shiftPlans.status, 'DRAFT'),
                ));
            if (!claimed) throw new Error('SHIFT_PLAN_NOT_DRAFT_OR_ALREADY_GENERATING');
            const existing = await tx.select({ id: shiftPlanEntries.id })
                .from(shiftPlanEntries)
                .where(and(eq(shiftPlanEntries.planId, input.planId), eq(shiftPlanEntries.branchId, input.branchId)));
            if (existing.length > 0) throw new Error('AUTO_SCHEDULE_REQUIRES_EMPTY_PLAN');
            const inserted = await tx.insert(shiftPlanEntries).output().values(preview.entries.map(entry => ({
                planId: input.planId,
                branchId: input.branchId,
                employeeId: entry.employeeId,
                shiftTemplateId: entry.shiftTemplateId,
                date: toSqlDate(entry.date),
                startTime: entry.startTime,
                endTime: entry.endTime,
                status: entry.status,
                notes: `AUTO_SCHEDULED_BY:${input.actorId}`,
            })));
            const [restored] = await tx.update(shiftPlans)
                .set({ status: 'DRAFT', updatedAt: new Date() })
                .output()
                .where(eq(shiftPlans.id, input.planId));
            return { plan: restored, entries: inserted, preview };
        });
    },
    async listPlans(branchId?: string) {
        return db.select().from(shiftPlans)
            .where(branchId ? eq(shiftPlans.branchId, branchId) : undefined)
            .orderBy(desc(shiftPlans.weekStart));
    },

    async createPlan(input: { branchId: string; name: string; weekStart: string; weekEnd?: string; createdBy?: string }) {
        const start = new Date(input.weekStart);
        const end = input.weekEnd ? new Date(input.weekEnd) : new Date(start.getTime() + (6 * 24 * 60 * 60 * 1000));

        const [created] = await db.insert(shiftPlans).output().values({
            id: makeId('SPL'),
            branchId: input.branchId,
            name: input.name,
            weekStart: toSqlDate(start),
            weekEnd: toSqlDate(end),
            createdBy: input.createdBy,
            status: 'DRAFT',
        });
        return created;
    },

    async updatePlan(input: { id: string; branchId?: string; name?: string; status?: string; approvedBy?: string }) {
        const [current] = await db.select().top(1).from(shiftPlans).where(eq(shiftPlans.id, input.id));
        if (!current) throw new Error('SHIFT_PLAN_NOT_FOUND');
        if (input.branchId && current.branchId !== input.branchId) throw new Error('SHIFT_PLAN_BRANCH_MISMATCH');
        const updates: Record<string, any> = { updatedAt: new Date() };
        if (input.name) updates.name = input.name;
        if (input.status) {
            updates.status = input.status;
            if (input.status === 'PUBLISHED') {
                updates.postedAt = new Date();
                updates.approvedBy = input.approvedBy;
            }
            if (input.status === 'ARCHIVED') {
                updates.frozenAt = new Date();
            }
        }
        const [updated] = await db.update(shiftPlans)
            .set(updates)
            .output()
            .where(eq(shiftPlans.id, input.id));
        return updated;
    },

    async listEntries(filters?: { planId?: string; branchId?: string; employeeId?: string; dateFrom?: string; dateTo?: string }) {
        return db.select().from(shiftPlanEntries)
            .where(and(
                filters?.planId ? eq(shiftPlanEntries.planId, filters.planId) : undefined,
                filters?.branchId ? eq(shiftPlanEntries.branchId, filters.branchId) : undefined,
                filters?.employeeId ? eq(shiftPlanEntries.employeeId, filters.employeeId) : undefined,
                filters?.dateFrom ? gte(shiftPlanEntries.date, toSqlDate(filters.dateFrom)) : undefined,
                filters?.dateTo ? lte(shiftPlanEntries.date, toSqlDate(filters.dateTo)) : undefined,
            ))
            .orderBy(desc(shiftPlanEntries.date));
    },

    async createEntry(input: {
        planId: string;
        branchId: string;
        employeeId: string;
        shiftTemplateId?: string;
        date: string;
        startTime?: string;
        endTime?: string;
        status?: string;
        notes?: string;
    }) {
        const [plan] = await db.select().top(1).from(shiftPlans).where(eq(shiftPlans.id, input.planId));
        if (!plan) throw new Error('SHIFT_PLAN_NOT_FOUND');
        if (plan.branchId !== input.branchId) throw new Error('SHIFT_PLAN_BRANCH_MISMATCH');
        const [employee] = await db.select({ branchId: employees.branchId }).from(employees).where(eq(employees.id, input.employeeId)).top(1);
        if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');
        if (employee.branchId !== input.branchId) throw new Error('SHIFT_EMPLOYEE_BRANCH_MISMATCH');

        let startTime = input.startTime;
        let endTime = input.endTime;
        if ((!startTime || !endTime) && input.shiftTemplateId) {
            const [template] = await db.select().top(1).from(shiftTemplates)
                .where(eq(shiftTemplates.id, input.shiftTemplateId));
            startTime = startTime || template?.startTime;
            endTime = endTime || template?.endTime;
        }

        if (input.status !== 'OFF' && (hasPartialShiftTime({ startTime, endTime }) || !startTime || !endTime)) {
            throw new Error('SHIFT_START_AND_END_REQUIRED');
        }

        const candidateDate = toSqlDate(input.date);
        const minimumRestMinutes = await getMinimumRestMinutes(input.branchId, input.shiftTemplateId);
        const nearbyEntries = await db.select().from(shiftPlanEntries)
            .where(and(
                eq(shiftPlanEntries.employeeId, input.employeeId),
                gte(shiftPlanEntries.date, new Date(candidateDate.getTime() - 24 * 60 * 60 * 1000)),
                lte(shiftPlanEntries.date, new Date(candidateDate.getTime() + 24 * 60 * 60 * 1000)),
            ));

        const conflict = input.status === 'OFF' ? null : findShiftConflict({ date: input.date, startTime, endTime }, nearbyEntries, minimumRestMinutes);
        if (conflict?.kind === 'OVERLAP') {
            throw new Error(`SHIFT_CONFLICT_WITH_ENTRY_${conflict.entryId}`);
        }
        if (conflict?.kind === 'MIN_REST') {
            throw new Error(`SHIFT_CONFLICT_MIN_REST_${conflict.entryId}`);
        }

        // Approved leave wins over rostering: refuse entries on leave days.
        const dayStart = toSqlDate(input.date);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
        const onLeave = await db.select({ id: leaveRequests.id }).from(leaveRequests)
            .where(and(
                eq(leaveRequests.employeeId, input.employeeId),
                eq(leaveRequests.status, 'APPROVED'),
                lte(leaveRequests.startDate, dayEnd),
                gte(leaveRequests.endDate, dayStart),
            )).top(1);
        if (onLeave.length > 0) {
            throw new Error('SHIFT_CONFLICT_APPROVED_LEAVE');
        }

        const [created] = await db.insert(shiftPlanEntries).output().values({
            planId: input.planId,
            branchId: input.branchId,
            employeeId: input.employeeId,
            shiftTemplateId: input.shiftTemplateId,
            date: toSqlDate(input.date),
            startTime,
            endTime,
            status: input.status || 'PLANNED',
            notes: input.notes,
        });
        return created;
    },

    async updateEntry(input: {
        id: number;
        branchId?: string;
        shiftTemplateId?: string;
        startTime?: string;
        endTime?: string;
        status?: string;
        notes?: string;
    }) {
        const [current] = await db.select().top(1).from(shiftPlanEntries).where(eq(shiftPlanEntries.id, input.id));
        if (!current) throw new Error('SHIFT_ENTRY_NOT_FOUND');
        if (input.branchId && current.branchId !== input.branchId) throw new Error('SHIFT_ENTRY_BRANCH_MISMATCH');

        let startTime = input.startTime ?? current.startTime;
        let endTime = input.endTime ?? current.endTime;
        const shiftTemplateId = input.shiftTemplateId ?? current.shiftTemplateId;

        if ((!startTime || !endTime) && shiftTemplateId) {
            const [template] = await db.select().top(1).from(shiftTemplates)
                .where(eq(shiftTemplates.id, shiftTemplateId));
            startTime = startTime || template?.startTime;
            endTime = endTime || template?.endTime;
        }

        if (input.status !== 'OFF' && (hasPartialShiftTime({ startTime, endTime }) || !startTime || !endTime)) {
            throw new Error('SHIFT_START_AND_END_REQUIRED');
        }

        const minimumRestMinutes = await getMinimumRestMinutes(current.branchId, shiftTemplateId);
        const nearbyEntries = await db.select().from(shiftPlanEntries)
            .where(and(
                eq(shiftPlanEntries.employeeId, current.employeeId),
                gte(shiftPlanEntries.date, new Date(current.date.getTime() - 24 * 60 * 60 * 1000)),
                lte(shiftPlanEntries.date, new Date(current.date.getTime() + 24 * 60 * 60 * 1000)),
                ne(shiftPlanEntries.id, input.id),
            ));

        const conflict = input.status === 'OFF' ? null : findShiftConflict({ date: current.date, startTime, endTime }, nearbyEntries, minimumRestMinutes);
        if (conflict?.kind === 'OVERLAP') {
            throw new Error(`SHIFT_CONFLICT_WITH_ENTRY_${conflict.entryId}`);
        }
        if (conflict?.kind === 'MIN_REST') {
            throw new Error(`SHIFT_CONFLICT_MIN_REST_${conflict.entryId}`);
        }

        const [updated] = await db.update(shiftPlanEntries)
            .set({
                shiftTemplateId,
                startTime,
                endTime,
                status: input.status ?? current.status,
                notes: input.notes ?? current.notes,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(shiftPlanEntries.id, input.id));
        return updated;
    },
};

export default schedulingService;
