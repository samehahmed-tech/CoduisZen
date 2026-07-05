import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { shiftTaskRuns, shiftTasks } from '../../src/db/schema';

const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export const shiftTaskService = {
    async listTasks(branchId?: string) {
        return db.select().from(shiftTasks)
            .where(branchId ? eq(shiftTasks.branchId, branchId) : undefined)
            .orderBy(shiftTasks.sortOrder, shiftTasks.createdAt);
    },

    async upsertTask(input: {
        id?: string;
        branchId: string;
        name: string;
        type?: string;
        description?: string;
        requiresVerification?: boolean;
        sortOrder?: number;
        isActive?: boolean;
    }) {
        if (input.id) {
            const [updated] = await db.update(shiftTasks)
                .set({
                    name: input.name,
                    type: input.type || 'DAILY',
                    description: input.description,
                    requiresVerification: input.requiresVerification ?? false,
                    sortOrder: input.sortOrder ?? 0,
                    isActive: input.isActive !== false,
                    updatedAt: new Date(),
                })
                .where(eq(shiftTasks.id, input.id))
                .returning();
            return updated;
        }

        const [created] = await db.insert(shiftTasks).values({
            id: makeId('STK'),
            branchId: input.branchId,
            name: input.name,
            type: input.type || 'DAILY',
            description: input.description,
            requiresVerification: input.requiresVerification ?? false,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive !== false,
        }).returning();
        return created;
    },

    async listTaskRuns(shiftId: string) {
        return db.select().from(shiftTaskRuns)
            .where(eq(shiftTaskRuns.shiftId, shiftId))
            .orderBy(desc(shiftTaskRuns.createdAt));
    },

    async createTaskRun(input: { shiftId: string; taskId: string }) {
        const [created] = await db.insert(shiftTaskRuns).values({
            shiftId: input.shiftId,
            taskId: input.taskId,
            status: 'PENDING',
        }).returning();
        return created;
    },

    async completeTaskRun(input: { id: number; completedBy: string; status?: string; notes?: string }) {
        const [updated] = await db.update(shiftTaskRuns)
            .set({
                status: input.status || 'COMPLETED',
                completedBy: input.completedBy,
                completedAt: new Date(),
                notes: input.notes,
                updatedAt: new Date(),
            })
            .where(eq(shiftTaskRuns.id, input.id))
            .returning();
        return updated;
    },
};

export default shiftTaskService;
