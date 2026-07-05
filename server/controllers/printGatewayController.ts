import { Request, Response } from 'express';
import {
    claimNextPrintJob,
    completePrintJob,
    enqueuePrintJob,
    failPrintJob,
    getPrintQueueStats,
    listPrintJobs,
    retryPrintJob,
    cancelPrintJob,
    purgePrintJobs,
} from '../services/printQueueService';

const getGatewayToken = () => {
    const configured = String(process.env.PRINT_GATEWAY_TOKEN || '').trim();
    if (configured) return configured;
    if (process.env.NODE_ENV !== 'production') return 'dev_print_gateway_token';
    return '';
};

const isGatewayAuthorized = (req: Request) => {
    const expected = getGatewayToken();
    if (!expected) return false;
    const token = String(req.headers['x-print-gateway-token'] || '').trim();
    return token.length > 0 && token === expected;
};

const resolveBranchScope = (req: Request): string | null => {
    const requested = String(req.body?.branchId || req.query?.branchId || '').trim();
    if (req.user?.role === 'SUPER_ADMIN') {
        return requested || req.user?.branchId || null;
    }
    return req.user?.branchId || requested || null;
};

export const enqueueJob = async (req: Request, res: Response) => {
    try {
        const branchId = resolveBranchScope(req);
        const type = String(req.body?.type || '').toUpperCase();
        const content = String(req.body?.content || '');
        const contentType = String(req.body?.contentType || 'text').toLowerCase();
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        if (!['RECEIPT', 'KITCHEN'].includes(type)) return res.status(400).json({ error: 'INVALID_PRINT_TYPE' });
        if (!content.trim()) return res.status(400).json({ error: 'PRINT_CONTENT_REQUIRED' });
        if (!['text', 'image'].includes(contentType)) return res.status(400).json({ error: 'INVALID_PRINT_CONTENT_TYPE' });

        const job = await enqueuePrintJob({
            branchId,
            type: type as 'RECEIPT' | 'KITCHEN',
            content,
            contentType: contentType as 'text' | 'image',
            printerId: req.body?.printerId || null,
            printerAddress: req.body?.printerAddress || null,
            printerType: req.body?.printerType || null,
            targetGatewayId: req.body?.targetGatewayId || req.body?.gatewayId || null,
            createdBy: req.user?.id || null,
            maxAttempts: Number(req.body?.maxAttempts || 3),
        });

        return res.status(201).json({ ok: true, job });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_ENQUEUE_FAILED' });
    }
};

export const listJobs = async (req: Request, res: Response) => {
    try {
        const requestedBranch = String(req.query?.branchId || '').trim();
        const branchId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedBranch || undefined)
            : (req.user?.branchId || requestedBranch || undefined);
        const status = String(req.query?.status || '').toUpperCase() || undefined;
        const jobs = await listPrintJobs({
            branchId,
            status: status as any,
            limit: Number(req.query?.limit || 100),
        });
        const stats = await getPrintQueueStats(branchId);
        return res.json({ ok: true, stats, jobs });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_LIST_FAILED' });
    }
};

export const gatewayHealth = async (req: Request, res: Response) => {
    try {
        if (!isGatewayAuthorized(req)) return res.status(401).json({ error: 'GATEWAY_AUTH_REQUIRED' });
        const branchId = String(req.query?.branchId || '').trim() || undefined;
        const stats = await getPrintQueueStats(branchId);
        return res.json({ ok: true, stats, ts: new Date().toISOString() });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_GATEWAY_HEALTH_FAILED' });
    }
};

export const claimJob = async (req: Request, res: Response) => {
    try {
        if (!isGatewayAuthorized(req)) return res.status(401).json({ error: 'GATEWAY_AUTH_REQUIRED' });
        const branchId = String(req.body?.branchId || '').trim();
        const gatewayId = String(req.body?.gatewayId || '').trim();
        const claimUnassigned = req.body?.claimUnassigned === true || req.body?.claimUnassigned === 'true';
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        if (!gatewayId) return res.status(400).json({ error: 'GATEWAY_ID_REQUIRED' });

        const job = await claimNextPrintJob({ branchId, gatewayId, claimUnassigned });
        return res.json({ ok: true, job: job || null });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_CLAIM_FAILED' });
    }
};

export const ackJob = async (req: Request, res: Response) => {
    try {
        if (!isGatewayAuthorized(req)) return res.status(401).json({ error: 'GATEWAY_AUTH_REQUIRED' });
        const jobId = String(req.params?.jobId || '').trim();
        const gatewayId = String(req.body?.gatewayId || '').trim();
        if (!jobId) return res.status(400).json({ error: 'JOB_ID_REQUIRED' });
        if (!gatewayId) return res.status(400).json({ error: 'GATEWAY_ID_REQUIRED' });
        const job = await completePrintJob(jobId, gatewayId);
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND_OR_NOT_CLAIMED' });
        return res.json({ ok: true, job });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_ACK_FAILED' });
    }
};

export const failJob = async (req: Request, res: Response) => {
    try {
        if (!isGatewayAuthorized(req)) return res.status(401).json({ error: 'GATEWAY_AUTH_REQUIRED' });
        const jobId = String(req.params?.jobId || '').trim();
        const gatewayId = String(req.body?.gatewayId || '').trim();
        const message = String(req.body?.error || 'PRINT_FAILED');
        if (!jobId) return res.status(400).json({ error: 'JOB_ID_REQUIRED' });
        if (!gatewayId) return res.status(400).json({ error: 'GATEWAY_ID_REQUIRED' });
        const job = await failPrintJob({ jobId, gatewayId, error: message });
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND_OR_NOT_CLAIMED' });
        return res.json({ ok: true, job });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_FAIL_FAILED' });
    }
};

export const retryJob = async (req: Request, res: Response) => {
    try {
        const branchId = resolveBranchScope(req);
        const jobId = String(req.params?.jobId || '').trim();
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        if (!jobId) return res.status(400).json({ error: 'JOB_ID_REQUIRED' });
        const job = await retryPrintJob(jobId, branchId);
        if (!job) return res.status(404).json({ error: 'FAILED_JOB_NOT_FOUND' });
        return res.json({ ok: true, job });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_RETRY_FAILED' });
    }
};

export const purgeJobs = async (req: Request, res: Response) => {
    try {
        const branchId = resolveBranchScope(req);
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        const count = await purgePrintJobs(branchId);
        return res.json({ ok: true, purged: count });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_PURGE_FAILED' });
    }
};

export const cancelJob = async (req: Request, res: Response) => {
    try {
        const branchId = resolveBranchScope(req);
        const jobId = String(req.params?.jobId || '').trim();
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        if (!jobId) return res.status(400).json({ error: 'JOB_ID_REQUIRED' });
        const job = await cancelPrintJob(jobId, branchId);
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND_OR_PROCESSING' });
        return res.json({ ok: true, job });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_CANCEL_FAILED' });
    }
};
