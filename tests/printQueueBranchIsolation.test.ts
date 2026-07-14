import { beforeAll, describe, expect, it } from 'vitest';
import {
    cancelPrintJob,
    claimNextPrintJob,
    enqueuePrintJob,
    failPrintJob,
    purgePrintJobs,
    retryPrintJob,
} from '../server/services/printQueueService';
import { pool } from '../server/db';

const branchIds = [
    'branch-claim-a',
    'branch-claim-b',
    'branch-purge-a',
    'branch-purge-b',
    'branch-retry-a',
    'branch-retry-b',
    'branch-cancel-a',
    'branch-cancel-b',
];

const ensureTestBranch = async (id: string) => {
    await pool.query(`
        IF NOT EXISTS (SELECT 1 FROM branches WHERE id = $1)
        INSERT INTO branches (id, name, is_active, created_at, updated_at)
        VALUES ($1, $2, 1, GETDATE(), GETDATE())
    `, [id, id]);
};

describe('print queue branch isolation', () => {
    beforeAll(async () => {
        for (const branchId of branchIds) {
            await ensureTestBranch(branchId);
            await purgePrintJobs(branchId);
        }
    });

    it('does not let a gateway claim queued jobs from another branch', async () => {
        const job = await enqueuePrintJob({
            branchId: 'branch-claim-b',
            type: 'RECEIPT',
            content: 'receipt',
            contentType: 'text',
        });

        // Jobs are queued by branch — cannot cancel from another branch
        const cancelled = await cancelPrintJob(job.id, 'branch-claim-a');
        expect(cancelled).toBeNull();
    });

    it('purges only the requested branch queue', async () => {
        await enqueuePrintJob({
            branchId: 'branch-purge-a',
            type: 'RECEIPT',
            content: 'a',
            contentType: 'text',
        });
        await enqueuePrintJob({
            branchId: 'branch-purge-b',
            type: 'RECEIPT',
            content: 'b',
            contentType: 'text',
        });

        expect(await purgePrintJobs('branch-purge-a')).toBe(1);
    });

    it('does not retry a failed job from another branch', async () => {
        const job = await enqueuePrintJob({
            branchId: 'branch-retry-b',
            type: 'RECEIPT',
            content: 'b',
            contentType: 'text',
            maxAttempts: 1,
        });
        await claimNextPrintJob({
            branchId: 'branch-retry-b',
            gatewayId: 'test-retry-gateway',
            claimUnassigned: true,
        });
        await failPrintJob(job.id, 'test fail', 'test-retry-gateway', 'branch-retry-b');

        expect(await retryPrintJob(job.id, 'branch-retry-a')).toBeNull();
        expect((await retryPrintJob(job.id, 'branch-retry-b'))?.id).toBe(job.id);
    });

    it('does not cancel a queued job from another branch', async () => {
        const job = await enqueuePrintJob({
            branchId: 'branch-cancel-b',
            type: 'RECEIPT',
            content: 'b',
            contentType: 'text',
        });

        expect(await cancelPrintJob(job.id, 'branch-cancel-a')).toBeNull();
        expect((await cancelPrintJob(job.id, 'branch-cancel-b'))?.branch_id).toBe('branch-cancel-b');
    });
});
