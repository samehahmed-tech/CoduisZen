import { Request, Response } from 'express';
import { postFranchiseRoyalties, previewFranchiseRoyalties } from '../services/franchiseRoyaltyService';
import { createSignedAuditLog } from '../services/auditService';

const auditFranchiseMutation = (req: Request, eventType: string, payload: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    userRole: req.user?.role,
    branchId: req.effectiveBranchId || null,
    requestId: req.requestId,
    sourceDevice: req.headers['user-agent'],
    payload,
    after,
    reason: `Franchise mutation: ${eventType}`,
});

export const previewRoyalties = async (req: Request, res: Response) => {
    try {
        const from = String(req.query.from || '').trim();
        const to = String(req.query.to || '').trim();
        const rawBranchIds = String(req.query.branchIds || '').split(',').map((id) => id.trim()).filter(Boolean);
        const result = await previewFranchiseRoyalties({ from, to, branchIds: rawBranchIds });
        return res.json({ preview: true, ...result });
    } catch (error: any) {
        const code = String(error?.message || 'ROYALTY_PREVIEW_FAILED');
        const status = code.startsWith('INVALID_') || code.endsWith('_TOO_LARGE') || code === 'ROYALTY_BRANCH_NOT_FOUND' ? 400 : 500;
        return res.status(status).json({ error: code, code });
    }
};

export const postRoyalties = async (req: Request, res: Response) => {
    try {
        if (req.body?.confirm !== true) return res.status(400).json({ error: 'ROYALTY_CONFIRMATION_REQUIRED', code: 'ROYALTY_CONFIRMATION_REQUIRED' });
        const from = String(req.body?.from || '').trim();
        const to = String(req.body?.to || '').trim();
        const branchIds = Array.isArray(req.body?.branchIds) ? req.body.branchIds.map(String) : undefined;
        const result = await postFranchiseRoyalties({ from, to, branchIds, actorId: req.user?.id || 'system' });
        await auditFranchiseMutation(req, 'FRANCHISE_ROYALTY_POSTED', {
            from,
            to,
            branchCount: branchIds?.length || result.preview.branches.length,
            entryCount: result.entries.length,
        }, {
            posted: result.posted,
            duplicateEntryCount: result.entries.filter((entry) => entry.duplicate).length,
        });
        return res.json(result);
    } catch (error: any) {
        const code = String(error?.message || 'ROYALTY_POSTING_FAILED');
        const status = code.includes('REQUIRED') || code.startsWith('INVALID_') || code.endsWith('_TOO_LARGE') ? 400 : 500;
        return res.status(status).json({ error: code, code });
    }
};
