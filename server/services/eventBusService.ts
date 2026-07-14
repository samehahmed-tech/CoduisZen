import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { domainEvents } from '../../src/db/schema';

const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export const eventBusService = {
    async emitEvent(input: {
        type: string;
        entityType?: string;
        entityId?: string;
        branchId?: string;
        payload?: Record<string, any>;
    }) {
        const [created] = await db.insert(domainEvents).output().values({
            id: makeId('EVT'),
            type: input.type,
            entityType: input.entityType,
            entityId: input.entityId,
            branchId: input.branchId,
            payload: input.payload || {},
        });
        return created;
    },

    async listEvents(filters?: { branchId?: string; status?: string; type?: string; limit?: number }) {
        const limit = Math.min(Number(filters?.limit || 200), 500);
        return db.select().from(domainEvents)
            .where(and(
                filters?.branchId ? eq(domainEvents.branchId, filters.branchId) : undefined,
                filters?.status ? eq(domainEvents.status, filters.status) : undefined,
                filters?.type ? eq(domainEvents.type, filters.type) : undefined,
            ))
            .orderBy(desc(domainEvents.createdAt))
            .offset(0).fetch(limit);
    },

    async markProcessed(id: string) {
        const [updated] = await db.update(domainEvents)
            .set({ status: 'PROCESSED', processedAt: new Date() })
            .output()
            .where(eq(domainEvents.id, id));
        return updated;
    },
};

export default eventBusService;
