import { and, desc, eq, gte, lte, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { leaveRequests, shiftPlanEntries, shiftPlans, shiftTemplates } from '../../src/db/schema';

const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const toSqlDate = (date: string | Date) => {
    const datePart = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
    return new Date(`${datePart}T00:00:00.000Z`);
};

const parseTimeToMinutes = (value?: string | null) => {
    if (!value) return null;
    const [h, m] = value.split(':').map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h * 60) + m;
};

const hasOverlap = (aStart?: string | null, aEnd?: string | null, bStart?: string | null, bEnd?: string | null) => {
    const aS = parseTimeToMinutes(aStart);
    const aE = parseTimeToMinutes(aEnd);
    const bS = parseTimeToMinutes(bStart);
    const bE = parseTimeToMinutes(bEnd);
    if (aS === null || aE === null || bS === null || bE === null) return false;
    return aS < bE && bS < aE;
};

export const schedulingService = {
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

    async updatePlan(input: { id: string; name?: string; status?: string; approvedBy?: string }) {
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
        let startTime = input.startTime;
        let endTime = input.endTime;
        if ((!startTime || !endTime) && input.shiftTemplateId) {
        const [template] = await db.select().top(1).from(shiftTemplates)
            .where(eq(shiftTemplates.id, input.shiftTemplateId));
            startTime = startTime || template?.startTime;
            endTime = endTime || template?.endTime;
        }

        const sameDay = await db.select().from(shiftPlanEntries)
            .where(and(
                eq(shiftPlanEntries.employeeId, input.employeeId),
                eq(shiftPlanEntries.date, toSqlDate(input.date)),
            ));

        const conflict = sameDay.find((entry) => hasOverlap(startTime, endTime, entry.startTime, entry.endTime));
        if (conflict) {
            throw new Error(`SHIFT_CONFLICT_WITH_ENTRY_${conflict.id}`);
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
        shiftTemplateId?: string;
        startTime?: string;
        endTime?: string;
        status?: string;
        notes?: string;
    }) {
        const [current] = await db.select().top(1).from(shiftPlanEntries).where(eq(shiftPlanEntries.id, input.id));
        if (!current) throw new Error('SHIFT_ENTRY_NOT_FOUND');

        let startTime = input.startTime ?? current.startTime;
        let endTime = input.endTime ?? current.endTime;
        const shiftTemplateId = input.shiftTemplateId ?? current.shiftTemplateId;

        if ((!startTime || !endTime) && shiftTemplateId) {
            const [template] = await db.select().top(1).from(shiftTemplates)
                .where(eq(shiftTemplates.id, shiftTemplateId));
            startTime = startTime || template?.startTime;
            endTime = endTime || template?.endTime;
        }

        const sameDay = await db.select().from(shiftPlanEntries)
            .where(and(
                eq(shiftPlanEntries.employeeId, current.employeeId),
                eq(shiftPlanEntries.date, current.date),
                ne(shiftPlanEntries.id, input.id),
            ));

        const conflict = sameDay.find((entry) => hasOverlap(startTime, endTime, entry.startTime, entry.endTime));
        if (conflict) {
            throw new Error(`SHIFT_CONFLICT_WITH_ENTRY_${conflict.id}`);
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
