import { Request, Response } from 'express';
import { markBridgePoll, registerBridge, getBridgeRegistry } from '../services/printerBridgeService.js';
import {
    enqueuePrintJob,
    completePrintJob,
    failPrintJob,
    listPrintJobs,
    retryPrintJob,
    cancelPrintJob,
    purgePrintJobs,
    getPrintQueueStats,
    claimNextPrintJob,
} from '../services/printQueueService.js';

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

        const result = await enqueuePrintJob({
            branchId,
            type: type as 'RECEIPT' | 'KITCHEN',
            content,
            contentType: contentType as 'text' | 'image',
            printerId: req.body?.printerId || null,
            printerAddress: req.body?.printerAddress || null,
            printerType: String(req.body?.printerType || '').toUpperCase() as any || null,
            targetGatewayId: req.body?.targetGatewayId || null,
            createdBy: req.user?.id || null,
        });

        return res.status(201).json({ ok: true, jobId: result.id, pushed: result.pushed });
    } catch (error: any) {
        console.error('[printGateway] enqueueJob error:', error?.stack || error?.message || error);
        return res.status(500).json({ error: error.message || 'PRINT_JOB_ENQUEUE_FAILED' });
    }
};

export const completeJob = async (req: Request, res: Response) => {
    try {
        const jobId = String(req.params?.jobId || '').trim();
        const gatewayId = String(req.body?.gatewayId || req.headers['x-gateway-id'] || '').trim();
        const branchId = String(req.body?.branchId || req.query?.branchId || req.headers['x-branch-id'] || '').trim();
        if (!jobId) return res.status(400).json({ error: 'JOB_ID_REQUIRED' });
        const job = await completePrintJob(jobId, gatewayId, branchId);
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
        return res.json({ ok: true, job });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_COMPLETE_FAILED' });
    }
};

export const failJob = async (req: Request, res: Response) => {
    try {
        const jobId = String(req.params?.jobId || '').trim();
        const message = String(req.body?.error || 'PRINT_FAILED');
        const gatewayId = String(req.body?.gatewayId || req.headers['x-gateway-id'] || '').trim();
        const branchId = String(req.body?.branchId || req.query?.branchId || req.headers['x-branch-id'] || '').trim();
        if (!jobId) return res.status(400).json({ error: 'JOB_ID_REQUIRED' });
        const job = await failPrintJob(jobId, message, gatewayId, branchId);
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
        return res.json({ ok: true, job });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_FAIL_FAILED' });
    }
};

export const listJobs = async (req: Request, res: Response) => {
    try {
        const requestedBranch = String(req.query?.branchId || '').trim();
        const gatewayId = String(req.query?.gatewayId || req.headers['x-gateway-id'] || '').trim() || undefined;
        const branchId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedBranch || undefined)
            : (req.user?.branchId || requestedBranch || undefined);
        const status = String(req.query?.status || '').toUpperCase() || undefined;
        const jobs = await listPrintJobs({ branchId, status, gatewayId, limit: Number(req.query?.limit || 100) });
        const stats = await getPrintQueueStats(branchId);
        return res.json({ ok: true, stats, jobs });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_LIST_FAILED' });
    }
};

export const claimBridgeJob = async (req: Request, res: Response) => {
    try {
        const branchId = String(req.query?.branchId || req.headers['x-branch-id'] || '').trim();
        const gatewayId = String(req.query?.gatewayId || req.headers['x-gateway-id'] || '').trim();
        const claimUnassigned = String(req.query?.claimUnassigned || '').toLowerCase() === 'true';
        const globalClaim = String(req.query?.global || '').toLowerCase() === 'true' || !branchId;
        if (!gatewayId) return res.status(400).json({ error: 'GATEWAY_ID_REQUIRED' });
        // Capability list: Windows printer names visible to this bridge —
        // enables printer-aware job claiming (USB jobs go to the owning machine).
        const printers = String(req.query?.printers || '')
            .split('|')
            .map(name => name.trim())
            .filter(Boolean)
            .slice(0, 100);
        await markBridgePoll(gatewayId, branchId || undefined, printers);
        const job = await claimNextPrintJob({ branchId: branchId || undefined, gatewayId, claimUnassigned, globalClaim, printers });
        return res.json({ ok: true, jobs: job ? [job] : [] });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'PRINT_JOB_CLAIM_FAILED' });
    }
};

/** Registry for the Printers UI: which gateways are online and what they can print. */
export const getBridges = async (req: Request, res: Response) => {
    try {
        const registry = await getBridgeRegistry();
        return res.json(registry);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'BRIDGE_REGISTRY_FAILED' });
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

// SSE endpoint — bridge connects here
export const bridgeConnect = async (req: Request, res: Response) => {
    const gatewayId = String(req.query?.gatewayId || req.headers['x-gateway-id'] || '').trim();
    const branchId = String(req.query?.branchId || req.headers['x-branch-id'] || '').trim();
    if (!gatewayId) return res.status(400).json({ error: 'GATEWAY_ID_REQUIRED' });
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    registerBridge(gatewayId, branchId, res);
};
