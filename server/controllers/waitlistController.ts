import { Request, Response } from 'express';
import { db, pool } from '../db';
import { waitlists, tables } from '../../src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getNumberParam, getStringParam } from '../utils/request';
import { getIO } from '../socket';

let waitlistSchemaInflight: Promise<void> | null = null;

/**
 * Self-heal for DBs created before `seated_at` existed (schema-doctor may
 * never have run on them). Idempotent; concurrent callers share one run.
 */
const ensureWaitlistSchema = async () => {
    if (!waitlistSchemaInflight) {
        waitlistSchemaInflight = pool.query(`
            IF COL_LENGTH('dbo.waitlists', 'seated_at') IS NULL
                ALTER TABLE dbo.waitlists ADD seated_at datetime2 NULL;
        `).then(() => undefined).catch((err: any) => {
            waitlistSchemaInflight = null;
            throw err;
        });
    }
    await waitlistSchemaInflight;
};

export const waitlistController = {
    // Get active waitlist for a branch
    async getWaitlist(req: Request, res: Response) {
        try {
            const branchId = getStringParam(req.query.branchId);
            if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

            await ensureWaitlistSchema();
            const list = await db.select().from(waitlists)
                .where(and(
                    eq(waitlists.branchId, branchId),
                    inArray(waitlists.status, ['WAITING']) // By default only show waiting
                ))
                .orderBy(waitlists.createdAt);

            res.json(list);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    // Add customer to waitlist
    async addToWaitlist(req: Request, res: Response) {
        try {
            const { branchId, customerName, customerPhone, partySize, quotedTimeMinutes, notes } = req.body;
            if (!branchId || !customerName || !partySize) {
                return res.status(400).json({ error: 'BranchId, customerName, and partySize are required' });
            }

            const [entry] = await db.insert(waitlists).output().values({
                branchId,
                customerName,
                customerPhone,
                partySize: Number(partySize),
                quotedTimeMinutes: Number(quotedTimeMinutes || 15),
                status: 'WAITING',
                notes,
            });

            try {
                getIO().to(`branch:${branchId}`).emit('waitlist:updated', entry);
            } catch { /* Socket optional */ }

            res.status(201).json(entry);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    // Update status (Seat / No-Show / Cancel)
    async updateWaitlistStatus(req: Request, res: Response) {
        try {
            const id = getNumberParam(req.params.id);
            const { status, tableId } = req.body;
            
            if (id === undefined || !status) return res.status(400).json({ error: 'Valid ID and Status required' });

            await ensureWaitlistSchema();
            const [updated] = await db.update(waitlists)
                .set({
                    status,
                    tableId: tableId || null,
                    seatedAt: status === 'SEATED' ? new Date() : null,
                })
                .output()
                .where(eq(waitlists.id, id));

            if (!updated) return res.status(404).json({ error: 'Waitlist entry not found' });

            try {
                getIO().to(`branch:${updated.branchId}`).emit('waitlist:updated', updated);
            } catch { /* Socket optional */ }

            res.json(updated);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
};

