import { describe, expect, it } from 'vitest';
import {
    cancelPrintJob,
    claimNextPrintJob,
    enqueuePrintJob,
    failPrintJob,
    purgePrintJobs,
    retryPrintJob,
} from '../server/services/printQueueService';

describe('print queue branch isolation', () => {
    it('does not let a gateway claim queued jobs from another branch', async () => {
        await enqueuePrintJob({
            branchId: 'branch-claim-b',
            type: 'RECEIPT',
            content: 'receipt',
            contentType: 'text',
        });

        const claimed = await claimNextPrintJob({
            branchId: 'branch-claim-a',
            gatewayId: 'gateway-a',
            claimUnassigned: true,
        });

        expect(claimed).toBeNull();
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

        const claimed = await claimNextPrintJob({
            branchId: 'branch-purge-b',
            gatewayId: 'gateway-b',
            claimUnassigned: true,
        });

        expect(claimed?.branch_id).toBe('branch-purge-b');
    });

    it('does not retry a failed job from another branch', async () => {
        await enqueuePrintJob({
            branchId: 'branch-retry-b',
            type: 'RECEIPT',
            content: 'b',
            contentType: 'text',
            maxAttempts: 1,
        });
        const claimed = await claimNextPrintJob({
            branchId: 'branch-retry-b',
            gatewayId: 'gateway-b',
            claimUnassigned: true,
        });
        await failPrintJob({ jobId: claimed.id, gatewayId: 'gateway-b', error: 'fail' });

        expect(await retryPrintJob(claimed.id, 'branch-retry-a')).toBeNull();
        expect((await retryPrintJob(claimed.id, 'branch-retry-b'))?.id).toBe(claimed.id);
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
