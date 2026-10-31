import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('head-office master data distribution contract', () => {
    it('exposes preview and explicit-confirm apply routes', () => {
        const routes = fs.readFileSync('server/routes/menuRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/menuController.ts', 'utf8');
        expect(routes).toContain("router.post('/master-data/distribution/preview'");
        expect(routes).toContain("router.post('/master-data/distribution/request'");
        expect(routes).toContain("router.get('/master-data/distribution/approvals'");
        expect(routes).toContain("router.post('/master-data/distribution/:approvalId/approve'");
        expect(routes).toContain("router.post('/master-data/distribution/:approvalId/reject'");
        expect(routes).toContain("router.post('/master-data/distribution'");
        expect(controller).toContain('DISTRIBUTION_CONFIRMATION_REQUIRED');
        expect(controller).toContain('DISTRIBUTION_APPROVAL_REQUIRED');
        expect(controller).toContain('export const previewMasterDataDistribution');
        expect(controller).toContain('export const applyMasterDataDistribution');
        expect(controller).toContain('export const requestMasterDataDistribution');
        expect(controller).toContain('export const getMasterDataDistributionApprovals');
        expect(controller).toContain('export const approveMasterDataDistribution');
    });

    it('requires head-office roles and validates every target branch', () => {
        const controller = fs.readFileSync('server/controllers/menuController.ts', 'utf8');
        expect(controller).toContain('HEAD_OFFICE_SCOPE_REQUIRED');
        expect(controller).toContain('BRANCH_NOT_FOUND');
        expect(controller).toContain('normalizeDistributionTargets');
        expect(controller).toContain('inArray(branches.id, ids)');
    });

    it('applies all targets atomically and signs the distribution audit', () => {
        const controller = fs.readFileSync('server/controllers/menuController.ts', 'utf8');
        expect(controller).toContain('applyBranchPricingDistributionInTransaction');
        expect(controller).toContain('db.transaction((tx) =>');
        expect(controller).toContain("eventType: 'MASTER_DATA_DISTRIBUTION_APPLIED'");
        expect(controller).toContain('dbCacheService.invalidatePattern(\'menu:\')');
    });

    it('persists a pending request and resolves it only through the approval path', () => {
        const controller = fs.readFileSync('server/controllers/menuController.ts', 'utf8');
        expect(controller).toContain("actionType: 'MASTER_DATA_DISTRIBUTION'");
        expect(controller).toContain("status: 'PENDING'");
        expect(controller).toContain("status: 'APPROVED'");
        expect(controller).toContain("eventType: 'MASTER_DATA_DISTRIBUTION_REQUESTED'");
        expect(controller).toContain("eventType: 'MASTER_DATA_DISTRIBUTION_APPROVED'");
        expect(controller).toContain("eventType: 'MASTER_DATA_DISTRIBUTION_REJECTED'");
        expect(controller).toContain('applyBranchPricingDistributionInTransaction(tx, sourceBranchId, targetBranchIds, overwrite)');
        expect(controller).toContain('APPROVAL_SEPARATION_REQUIRED');
        expect(controller).toContain('DISTRIBUTION_APPROVAL_PROCESSING_REASON');
        expect(controller).toContain('DISTRIBUTION_APPROVAL_ALREADY_CLAIMED');
        expect(controller).toContain('eq(managerApprovals.reason, DISTRIBUTION_APPROVAL_REQUEST_REASON)');
        expect(controller).toContain("MASTER_DATA_DISTRIBUTION_REQUEST");
        expect(controller).toContain('IDEMPOTENCY_KEY_PAYLOAD_CONFLICT');
        expect(controller).toContain('IDEMPOTENCY_KEY_IN_PROGRESS');
        expect(controller).toContain("status: 'COMPLETED'");
        expect(controller).toContain('responseBodyForIdempotency');
        expect(controller).toContain('not leave the client permanently stuck');
    });
});
